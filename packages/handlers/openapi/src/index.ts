import {
  buildSchema,
  execute,
  ExecutionArgs,
  GraphQLSchema,
  OperationTypeNode,
  subscribe,
} from 'graphql';
import { PredefinedProxyOptions, StoreProxy } from '@graphql-mesh/store';
import { stringInterpolator } from '@graphql-mesh/string-interpolation';
import {
  GetMeshSourcePayload,
  ImportFn,
  Logger,
  MeshFetch,
  MeshHandler,
  MeshHandlerOptions,
  MeshPubSub,
  MeshSource,
  YamlConfig,
} from '@graphql-mesh/types';
import { readFileOrUrl } from '@graphql-mesh/utils';
import { getOperationASTFromRequest } from '@graphql-tools/utils';
import { loadNonExecutableGraphQLSchemaFromOpenAPI, processDirectives } from '@omnigraph/openapi';

export default class OpenAPIHandler implements MeshHandler {
  private name: string;
  private config: YamlConfig.OpenapiHandler;
  private schemaWithAnnotationsProxy: StoreProxy<GraphQLSchema>;
  private bundleProxy: StoreProxy<any>;
  private baseDir: string;
  private logger: Logger;
  private fetchFn: MeshFetch;
  private pubsub: MeshPubSub;
  private importFn: ImportFn;
  constructor({
    name,
    config,
    baseDir,
    store,
    pubsub,
    logger,
    importFn,
  }: MeshHandlerOptions<YamlConfig.OpenapiHandler>) {
    this.name = name;
    this.config = config;
    this.baseDir = baseDir;
    this.schemaWithAnnotationsProxy = store.proxy(
      'schemaWithAnnotations',
      PredefinedProxyOptions.GraphQLSchemaWithDiffing,
    );
    this.bundleProxy = store.proxy(
      'jsonSchemaBundle',
      PredefinedProxyOptions.JsonWithoutValidation,
    );
    this.pubsub = pubsub;
    this.importFn = importFn;
    this.logger = logger;
  }

  async getNonExecutableSchema({ interpolatedSource }: { interpolatedSource: string }) {
    if (interpolatedSource.endsWith('.graphql')) {
      this.logger.info(`Fetching GraphQL Schema with annotations`);
      const sdl = await readFileOrUrl<string>(interpolatedSource, {
        allowUnknownExtensions: true,
        cwd: this.baseDir,
        fetch: this.fetchFn,
        importFn: this.importFn,
        logger: this.logger,
        headers: this.config.schemaHeaders,
      });
      return buildSchema(sdl, {
        assumeValidSDL: true,
        assumeValid: true,
      });
    }
    return this.schemaWithAnnotationsProxy.getWithSet(async () => {
      this.logger.info(`Generating GraphQL schema from OpenAPI schema`);
      const schema = await loadNonExecutableGraphQLSchemaFromOpenAPI(this.name, {
        ...this.config,
        source: interpolatedSource,
        cwd: this.baseDir,
        fetch: this.fetchFn,
        logger: this.logger,
        selectQueryOrMutationField: this.config.selectQueryOrMutationField?.map(
          ({ type, fieldName }) => ({
            type: type.toLowerCase() as any,
            fieldName,
          }),
        ),
        pubsub: this.pubsub,
        bundle: this.config.bundle,
      });
      if (this.config.bundle) {
        await this.bundleProxy.set(schema.extensions!.bundle);
      }
      return schema;
    });
  }

  async getMeshSource({ fetchFn }: GetMeshSourcePayload): Promise<MeshSource> {
    const interpolatedSource = stringInterpolator.parse(this.config.source, {
      env: process.env,
    });
    this.fetchFn = fetchFn;
    this.logger.debug('Getting the schema with annotations');
    const nonExecutableSchema = await this.getNonExecutableSchema({
      interpolatedSource,
    });
    const schemaWithDirectives$ = Promise.resolve().then(() => {
      this.logger.info(`Processing annotations for the execution layer`);
      return processDirectives({
        ...this.config,
        schema: nonExecutableSchema,
        pubsub: this.pubsub,
        logger: this.logger,
        globalFetch: fetchFn,
      });
    });
    return {
      schema: nonExecutableSchema,
      executor: async executionRequest => {
        const args: ExecutionArgs = {
          schema: await schemaWithDirectives$,
          document: executionRequest.document,
          variableValues: executionRequest.variables,
          operationName: executionRequest.operationName,
          contextValue: executionRequest.context,
          rootValue: executionRequest.rootValue,
        };
        const operationAST = getOperationASTFromRequest(executionRequest);
        if (operationAST.operation === OperationTypeNode.SUBSCRIPTION) {
          return subscribe(args) as any;
        }
        return execute(args) as any;
      },
    };
  }
}
