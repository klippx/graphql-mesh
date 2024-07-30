import { constantCase } from 'change-case';
import { print, type DocumentNode, type ExecutionResult, type GraphQLSchema } from 'graphql';
import type { GraphQLResolveInfo } from 'graphql/type';
import type {
  Transport,
  TransportContext,
  TransportEntry,
  TransportExecutorFactoryGetter,
  TransportGetSubgraphExecutor,
  TransportGetSubgraphExecutorOptions,
} from '@graphql-mesh/transport-common';
import type { Logger } from '@graphql-mesh/types';
import {
  isDisposable,
  iterateAsync,
  loggerForExecutionRequest,
  mapMaybePromise,
  requestIdByRequest,
} from '@graphql-mesh/utils';
import {
  isAsyncIterable,
  isDocumentNode,
  mapAsyncIterator,
  printSchemaWithDirectives,
  type ExecutionRequest,
  type Executor,
  type Maybe,
  type MaybePromise,
} from '@graphql-tools/utils';

export type { TransportEntry, TransportGetSubgraphExecutor, TransportGetSubgraphExecutorOptions };

export type Transports =
  | {
      [Kind in string]: MaybePromise<
        | Transport<Kind> // named export
        | {
            default: Transport<Kind>; // property on default export
          }
      >;
    }
  | (<Kind extends string>(
      kind: Kind,
    ) => MaybePromise<
      | Transport<Kind> // named export
      | {
          default: Transport<Kind>; // property on default export
        }
    >);

function createTransportExecutorFactoryGetter(
  transports: Transports,
  logger: Logger,
): TransportExecutorFactoryGetter {
  return async function getTransport(kind) {
    let transportGetSubgraphExecutor: TransportGetSubgraphExecutor;
    let transport =
      typeof transports === 'function' ? await transports(kind) : await transports?.[kind];
    if (transport) {
      transportGetSubgraphExecutor =
        'default' in transport
          ? transport.default.getSubgraphExecutor
          : transport.getSubgraphExecutor;
    } else {
      const childLogger = logger.child?.(kind);
      try {
        transport = await import(`@graphql-mesh/transport-${kind}`);
      } catch (err) {
        childLogger.error(err);
        throw new Error(
          `No transport found for ${kind}. Please make sure you have installed @graphql-mesh/transport-${kind} or defined the transport config in "mesh.config.ts"`,
        );
      }
      transportGetSubgraphExecutor =
        'default' in transport
          ? transport.default.getSubgraphExecutor
          : transport.getSubgraphExecutor;
      if (!transportGetSubgraphExecutor) {
        throw new Error(
          `@graphql-mesh/transport-${kind} module does not export "getSubgraphExecutor"`,
        );
      }
      if (typeof transportGetSubgraphExecutor !== 'function') {
        throw new Error(
          `@graphql-mesh/transport-${kind} module's export "getSubgraphExecutor" is not a function`,
        );
      }
    }
    return transportGetSubgraphExecutor;
  };
}

function getTransportExecutor(
  transportExecutorFactoryGetter: TransportExecutorFactoryGetter,
  transportContext: TransportGetSubgraphExecutorOptions,
  transportExecutorStack: AsyncDisposableStack,
): MaybePromise<Executor> {
  const kind = transportContext.transportEntry?.kind || '';
  const subgraphName = transportContext.subgraphName || '';
  transportContext?.logger?.info(`Loading transport ${kind} for subgraph ${subgraphName}`);
  return mapMaybePromise(transportExecutorFactoryGetter(kind), executor =>
    mapMaybePromise(executor(transportContext), executor => {
      if (isDisposable(executor)) {
        transportExecutorStack.use(executor);
      }
      return executor;
    }),
  );
}

/**
 * This function creates a executor factory that uses the transport packages,
 * and wraps them with the hooks
 */
export function getOnSubgraphExecute({
  onSubgraphExecuteHooks,
  transportContext,
  transportEntryMap,
  getSubgraphSchema,
  transportExecutorStack,
  transports,
}: {
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  transports?: Transports;
  transportContext?: TransportContext;
  transportEntryMap?: Record<string, TransportEntry>;
  getSubgraphSchema(subgraphName: string): GraphQLSchema;
  transportExecutorStack: AsyncDisposableStack;
}) {
  const subgraphExecutorMap = new Map<string, Executor>();
  const transportExecutorFactoryGetter = createTransportExecutorFactoryGetter(
    transports,
    transportContext?.logger,
  );
  return function onSubgraphExecute(subgraphName: string, executionRequest: ExecutionRequest) {
    let executor: Executor = subgraphExecutorMap.get(subgraphName);
    // If the executor is not initialized yet, initialize it
    if (executor == null) {
      transportContext?.logger?.info(`Initializing executor for subgraph ${subgraphName}`);
      // Lazy executor that loads transport executor on demand
      executor = function lazyExecutor(subgraphExecReq: ExecutionRequest) {
        return mapMaybePromise(
          // Gets the transport executor for the given subgraph
          getTransportExecutor(
            transportExecutorFactoryGetter,
            transportContext
              ? {
                  ...transportContext,
                  subgraphName,
                  get subgraph() {
                    return getSubgraphSchema(subgraphName);
                  },
                  get transportEntry() {
                    return transportEntryMap?.[subgraphName];
                  },
                  transportExecutorFactoryGetter,
                }
              : {
                  get subgraph() {
                    return getSubgraphSchema(subgraphName);
                  },
                  get transportEntry() {
                    return transportEntryMap?.[subgraphName];
                  },
                  subgraphName,
                  transportExecutorFactoryGetter,
                },
            transportExecutorStack,
          ),
          executor_ => {
            // Wraps the transport executor with hooks
            executor = wrapExecutorWithHooks({
              executor: executor_,
              onSubgraphExecuteHooks,
              subgraphName,
              transportEntryMap,
              transportContext,
              getSubgraphSchema,
            });
            // Caches the executor for future use
            subgraphExecutorMap.set(subgraphName, executor);
            return executor(subgraphExecReq);
          },
        );
      };
      // Caches the lazy executor to prevent race conditions
      subgraphExecutorMap.set(subgraphName, executor);
    }
    return executor(executionRequest);
  };
}

export interface WrapExecuteWithHooksOptions {
  executor: Executor;
  onSubgraphExecuteHooks: OnSubgraphExecuteHook[];
  subgraphName: string;
  transportEntryMap?: Record<string, TransportEntry>;
  getSubgraphSchema: (subgraphName: string) => GraphQLSchema;
  transportContext?: TransportContext;
}

declare module 'graphql' {
  interface GraphQLResolveInfo {
    executionRequest?: ExecutionRequest;
  }
}

/**
 * This function wraps the executor created by the transport package
 * with `onSubgraphExecuteHooks` to hook into the execution phase of subgraphs
 */
export function wrapExecutorWithHooks({
  executor,
  onSubgraphExecuteHooks,
  subgraphName,
  transportEntryMap,
  getSubgraphSchema,
  transportContext,
}: WrapExecuteWithHooksOptions): Executor {
  return function executorWithHooks(executionRequest: ExecutionRequest) {
    executionRequest.info = executionRequest.info || ({} as GraphQLResolveInfo);
    executionRequest.info.executionRequest = executionRequest;
    const requestId =
      executionRequest.context?.request && requestIdByRequest.get(executionRequest.context.request);
    let execReqLogger = transportContext?.logger?.child?.(subgraphName);
    if (execReqLogger) {
      if (requestId) {
        execReqLogger = execReqLogger.child(requestId);
      }
      loggerForExecutionRequest.set(executionRequest, execReqLogger);
    }
    if (onSubgraphExecuteHooks.length === 0) {
      return executor(executionRequest);
    }
    const onSubgraphExecuteDoneHooks: OnSubgraphExecuteDoneHook[] = [];
    return mapMaybePromise(
      iterateAsync(
        onSubgraphExecuteHooks,
        onSubgraphExecuteHook =>
          onSubgraphExecuteHook({
            get subgraph() {
              return getSubgraphSchema(subgraphName);
            },
            subgraphName,
            get transportEntry() {
              return transportEntryMap?.[subgraphName];
            },
            executionRequest,
            setExecutionRequest(newExecutionRequest) {
              execReqLogger.debug('Updating execution request to: ', newExecutionRequest);
              executionRequest = newExecutionRequest;
            },
            executor,
            setExecutor(newExecutor) {
              execReqLogger.debug('executor has been updated');
              executor = newExecutor;
            },
            requestId,
            logger: execReqLogger,
          }),
        onSubgraphExecuteDoneHooks,
      ),
      () => {
        if (onSubgraphExecuteDoneHooks.length === 0) {
          return executor(executionRequest);
        }
        return mapMaybePromise(executor(executionRequest), currentResult => {
          const executeDoneResults: OnSubgraphExecuteDoneResult[] = [];
          return mapMaybePromise(
            iterateAsync(
              onSubgraphExecuteDoneHooks,
              onSubgraphExecuteDoneHook =>
                onSubgraphExecuteDoneHook({
                  result: currentResult,
                  setResult(newResult: ExecutionResult) {
                    execReqLogger.debug('overriding result with: ', newResult);
                    currentResult = newResult;
                  },
                }),
              executeDoneResults,
            ),
            () => {
              if (!isAsyncIterable(currentResult)) {
                return currentResult;
              }

              if (executeDoneResults.length === 0) {
                return currentResult;
              }

              const onNextHooks: OnSubgraphExecuteDoneResultOnNext[] = [];
              const onEndHooks: OnSubgraphExecuteDoneResultOnEnd[] = [];

              for (const executeDoneResult of executeDoneResults) {
                if (executeDoneResult.onNext) {
                  onNextHooks.push(executeDoneResult.onNext);
                }
                if (executeDoneResult.onEnd) {
                  onEndHooks.push(executeDoneResult.onEnd);
                }
              }

              if (onNextHooks.length === 0 && onEndHooks.length === 0) {
                return currentResult;
              }

              const asyncIterator = currentResult[Symbol.asyncIterator]();
              return mapAsyncIterator(
                asyncIterator,
                currentResult =>
                  mapMaybePromise(
                    iterateAsync(onNextHooks, onNext =>
                      onNext({
                        result: currentResult,
                        setResult: res => {
                          execReqLogger.debug('overriding result with: ', res);

                          currentResult = res;
                        },
                      }),
                    ),
                    () => currentResult,
                  ),
                undefined,
                () =>
                  onEndHooks.length === 0 ? undefined : iterateAsync(onEndHooks, onEnd => onEnd()),
              );
            },
          );
        });
      },
    );
  };
}

export interface UnifiedGraphPlugin<TContext> {
  onSubgraphExecute?: OnSubgraphExecuteHook<TContext>;
}

export type OnSubgraphExecuteHook<TContext = any> = (
  payload: OnSubgraphExecutePayload<TContext>,
) => MaybePromise<Maybe<OnSubgraphExecuteDoneHook | void>>;

export interface OnSubgraphExecutePayload<TContext> {
  subgraph: GraphQLSchema;
  subgraphName: string;
  transportEntry?: TransportEntry;
  executionRequest: ExecutionRequest<any, TContext>;
  setExecutionRequest(executionRequest: ExecutionRequest): void;
  executor: Executor;
  setExecutor(executor: Executor): void;
  requestId?: string;
  logger?: Logger;
}

export interface OnSubgraphExecuteDonePayload {
  result: AsyncIterable<ExecutionResult> | ExecutionResult;
  setResult(result: AsyncIterable<ExecutionResult> | ExecutionResult): void;
}

export type OnSubgraphExecuteDoneHook = (
  payload: OnSubgraphExecuteDonePayload,
) => MaybePromise<Maybe<OnSubgraphExecuteDoneResult | void>>;

export type OnSubgraphExecuteDoneResultOnNext = (
  payload: OnSubgraphExecuteDoneOnNextPayload,
) => MaybePromise<void>;

export interface OnSubgraphExecuteDoneOnNextPayload {
  result: ExecutionResult;
  setResult(result: ExecutionResult): void;
}

export type OnSubgraphExecuteDoneResultOnEnd = () => MaybePromise<void>;

export type OnSubgraphExecuteDoneResult = {
  onNext?: OnSubgraphExecuteDoneResultOnNext;
  onEnd?: OnSubgraphExecuteDoneResultOnEnd;
};

export function compareSchemas(
  a: DocumentNode | string | GraphQLSchema,
  b: DocumentNode | string | GraphQLSchema,
) {
  let aStr: string;
  if (typeof a === 'string') {
    aStr = a;
  } else if (isDocumentNode(a)) {
    aStr = print(a);
  } else {
    aStr = printSchemaWithDirectives(a);
  }
  let bStr: string;
  if (typeof b === 'string') {
    bStr = b;
  } else if (isDocumentNode(b)) {
    bStr = print(b);
  } else {
    bStr = printSchemaWithDirectives(b);
  }
  return aStr === bStr;
}

// TODO: Fix this in GraphQL Tools
export function compareSubgraphNames(name1: string, name2: string) {
  return constantCase(name1) === constantCase(name2);
}
