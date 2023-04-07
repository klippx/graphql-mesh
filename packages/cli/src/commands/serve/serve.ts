/* eslint-disable import/no-nodejs-modules */

/* eslint-disable dot-notation */
import cluster from 'cluster';
import { createServer as createHTTPServer, Server } from 'http';
import { createServer as createHTTPSServer } from 'https';
import { Socket } from 'net';
import { cpus, platform, release } from 'os';
import dnscache from 'dnscache';
import { useServer } from 'graphql-ws/lib/use/ws';
import 'json-bigint-patch';
import open from 'open';
import ws from 'ws';
import { fs, process } from '@graphql-mesh/cross-helpers';
import { createMeshHTTPHandler } from '@graphql-mesh/http';
import { MeshInstance, ServeMeshOptions } from '@graphql-mesh/runtime';
import type { Logger } from '@graphql-mesh/types';
import { handleFatalError } from '../../handleFatalError.js';
import { GraphQLMeshCLIParams } from '../../index.js';

const terminateEvents = ['SIGINT', 'SIGTERM'];

function registerTerminateHandler(callback: (eventName: string) => void) {
  for (const eventName of terminateEvents) {
    process.once(eventName, () => callback(eventName));
  }
}

function portSelectorFn(sources: [number, number, number], logger: Logger) {
  const port = sources.find(source => Boolean(source)) || 4000;
  if (sources.filter(source => Boolean(source)).length > 1) {
    const activeSources: Array<string> = [];
    if (sources[0]) {
      activeSources.push('CLI');
    }
    if (sources[1]) {
      activeSources.push('serve configuration');
    }
    if (sources[2]) {
      activeSources.push('environment variable');
    }
    logger.warn(`Multiple ports specified (${activeSources.join(', ')}), using ${port}`);
  }

  return port;
}

export async function serveMesh(
  {
    baseDir,
    argsPort,
    getBuiltMesh,
    logger,
    rawServeConfig = {},
    playgroundTitle,
  }: ServeMeshOptions,
  cliParams: GraphQLMeshCLIParams,
) {
  const {
    fork: configFork,
    port: configPort,
    hostname = platform() === 'win32' ||
    // is WSL?
    release().toLowerCase().includes('microsoft')
      ? '127.0.0.1'
      : '0.0.0.0',
    sslCredentials,
    endpoint: graphqlPath = '/graphql',
    browser,
    // TODO
    // trustProxy = 'loopback',
  } = rawServeConfig;

  const port = portSelectorFn(
    [argsPort, parseInt(configPort?.toString()), parseInt(process.env.PORT)],
    logger,
  );

  let forkNum: number;

  const envFork = process.env.FORK;

  if (envFork != null) {
    if (envFork === 'false' || envFork === '0') {
      forkNum = 0;
    } else if (envFork === 'true') {
      forkNum = cpus().length;
    } else {
      forkNum = parseInt(envFork);
    }
  } else if (configFork != null) {
    if (typeof configFork === 'boolean') {
      forkNum = configFork ? cpus().length : 0;
    } else {
      forkNum = configFork;
    }
  }

  const protocol = sslCredentials ? 'https' : 'http';
  const serverUrl = `${protocol}://${hostname}:${port}`;
  if (!playgroundTitle) {
    playgroundTitle = rawServeConfig?.playgroundTitle || cliParams.playgroundTitle;
  }
  if (!cluster.isWorker && forkNum > 0) {
    for (let i = 0; i < forkNum; i++) {
      const worker = cluster.fork();
      registerTerminateHandler(eventName => worker.kill(eventName));
    }
    logger.info(`${cliParams.serveMessage}: ${serverUrl} in ${forkNum} forks`);
  } else {
    logger.info(`Starting GraphQL Mesh...`);

    const mesh$: Promise<MeshInstance> = getBuiltMesh()
      .then(mesh => {
        dnscache({
          enable: true,
          cache: function CacheCtor({ ttl }: { ttl: number }) {
            return {
              get: (key: string, callback: CallableFunction) =>
                mesh.cache
                  .get(key)
                  .then(value => callback(null, value))
                  .catch(e => callback(e)),
              set: (key: string, value: string, callback: CallableFunction) =>
                mesh.cache
                  .set(key, value, { ttl })
                  .then(() => callback())
                  .catch(e => callback(e)),
            };
          },
        });
        logger.info(`${cliParams.serveMessage}: ${serverUrl}`);
        registerTerminateHandler(eventName => {
          const eventLogger = logger.child(`${eventName}  💀`);
          eventLogger.info(`Destroying GraphQL Mesh...`);
          mesh.destroy();
        });
        return mesh;
      })
      .catch(e => handleFatalError(e, logger));

    let httpServer: Server;

    const requestHandler = createMeshHTTPHandler({
      baseDir,
      getBuiltMesh: () => mesh$,
      rawServeConfig,
      playgroundTitle,
    });

    if (sslCredentials) {
      const [key, cert] = await Promise.all([
        fs.promises.readFile(sslCredentials.key, 'utf-8'),
        fs.promises.readFile(sslCredentials.cert, 'utf-8'),
      ]);
      httpServer = createHTTPSServer({ key, cert }, requestHandler);
    } else {
      httpServer = createHTTPServer(requestHandler);
    }

    useServer(
      {
        onSubscribe: async ({ connectionParams, extra: { request } }, msg) => {
          // spread connectionParams.headers to upgrade request headers.
          // we completely ignore the root connectionParams because
          // [@graphql-tools/url-loader adds the headers inside the "headers" field](https://github.com/ardatan/graphql-tools/blob/9a13357c4be98038c645f6efb26f0584828177cf/packages/loaders/url/src/index.ts#L597)
          for (const [key, value] of Object.entries(connectionParams?.headers ?? {})) {
            // dont overwrite existing upgrade headers due to security reasons
            if (!(key.toLowerCase() in request.headers)) {
              request.headers[key.toLowerCase()] = value;
            }
          }
          const { getEnveloped } = await mesh$;
          const { schema, execute, subscribe, contextFactory, parse, validate } = getEnveloped({
            // req object holds the Node request used for extracting the headers (see packages/runtime/src/get-mesh.ts)
            req: request,
          });

          const args = {
            schema,
            operationName: msg.payload.operationName,
            document: parse(msg.payload.query),
            variableValues: msg.payload.variables,
            contextValue: await contextFactory(),
            execute,
            subscribe,
          };

          const errors = validate(args.schema, args.document);
          if (errors.length) return errors;

          return args;
        },
        execute: (args: any) => args.execute(args),
        subscribe: (args: any) => args.subscribe(args),
      },
      new ws.Server({
        path: graphqlPath,
        server: httpServer,
      }),
    );

    const sockets = new Set<Socket>();

    httpServer
      .listen(port, hostname, () => {
        const shouldntOpenBrowser =
          process.env.NODE_ENV?.toLowerCase() === 'production' || browser === false;
        if (!shouldntOpenBrowser) {
          open(
            serverUrl.replace('0.0.0.0', 'localhost'),
            typeof browser === 'string' ? { app: browser } : undefined,
          ).catch(() => {});
        }
      })
      .on('error', handleFatalError)
      .on('connection', socket => {
        sockets.add(socket);
        socket.once('close', () => {
          sockets.delete(socket);
        });
      });

    registerTerminateHandler(eventName => {
      const eventLogger = logger.child(`${eventName}  💀`);
      if (sockets.size > 0) {
        eventLogger.debug(`Open sockets found: ${sockets.size}`);
        for (const socket of sockets) {
          eventLogger.debug(`Destroying socket: ${socket.remoteAddress}`);
          socket.destroy();
          sockets.delete(socket);
        }
      }
      eventLogger.debug(`Stopping HTTP Server`);
      httpServer.close(error => {
        if (error) {
          eventLogger.error(`HTTP Server couldn't be stopped: `, error);
        } else {
          eventLogger.debug(`HTTP Server has been stopped`);
        }
      });
    });

    return mesh$.then(mesh => ({
      mesh,
      httpServer,
      logger,
    }));
  }
  return null;
}