import { print } from 'graphql';
import { getDocumentString, isAsyncIterable, OnExecuteHookResult, Plugin } from '@envelop/core';
import { useOnResolve } from '@envelop/on-resolve';
import { SpanAttributes, SpanKind, TracerProvider } from '@opentelemetry/api';
import * as opentelemetry from '@opentelemetry/api';
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';

export enum AttributeName {
  EXECUTION_ERROR = 'graphql.execute.error',
  EXECUTION_RESULT = 'graphql.execute.result',
  RESOLVER_EXCEPTION = 'graphql.resolver.exception',
  RESOLVER_FIELD_NAME = 'graphql.resolver.fieldName',
  RESOLVER_TYPE_NAME = 'graphql.resolver.typeName',
  RESOLVER_RESULT_TYPE = 'graphql.resolver.resultType',
  RESOLVER_ARGS = 'graphql.resolver.args',
  EXECUTION_OPERATION_NAME = 'graphql.execute.operationName',
  EXECUTION_OPERATION_DOCUMENT = 'graphql.execute.document',
  EXECUTION_VARIABLES = 'graphql.execute.variables',
}

const tracingSpanSymbol = Symbol('OPEN_TELEMETRY_GRAPHQL');

export type TracingOptions = {
  resolvers: boolean;
  variables: boolean;
  result: boolean;
};

type PluginContext = {
  [tracingSpanSymbol]: opentelemetry.Span;
};

export const useOpenTelemetry = (
  options: TracingOptions,
  tracingProvider?: TracerProvider,
  spanKind: SpanKind = SpanKind.SERVER,
  spanAdditionalAttributes: SpanAttributes = {},
  serviceName = 'graphql',
): Plugin<PluginContext> => {
  if (!tracingProvider) {
    const basicTraceProvider = new BasicTracerProvider();
    basicTraceProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    basicTraceProvider.register();
    tracingProvider = basicTraceProvider;
  }

  const tracer = tracingProvider.getTracer(serviceName);

  return {
    onPluginInit({ addPlugin }) {
      if (options.resolvers) {
        addPlugin(
          useOnResolve(({ info, context, args }) => {
            if (context && typeof context === 'object' && context[tracingSpanSymbol]) {
              const ctx = opentelemetry.trace.setSpan(
                opentelemetry.context.active(),
                context[tracingSpanSymbol],
              );
              const { fieldName, returnType, parentType } = info;

              const resolverSpan = tracer.startSpan(
                `${parentType.name}.${fieldName}`,
                {
                  attributes: {
                    [AttributeName.RESOLVER_FIELD_NAME]: fieldName,
                    [AttributeName.RESOLVER_TYPE_NAME]: parentType.toString(),
                    [AttributeName.RESOLVER_RESULT_TYPE]: returnType.toString(),
                    [AttributeName.RESOLVER_ARGS]: JSON.stringify(args || {}),
                  },
                },
                ctx,
              );

              return ({ result }) => {
                if (result instanceof Error) {
                  resolverSpan.recordException({
                    name: AttributeName.RESOLVER_EXCEPTION,
                    message: JSON.stringify(result),
                  });
                } else {
                  resolverSpan.end();
                }
              };
            }

            return () => {};
          }),
        );
      }
    },
    onExecute({ args, extendContext }) {
      const executionSpan = tracer.startSpan(`${args.operationName || 'Anonymous Operation'}`, {
        kind: spanKind,
        attributes: {
          ...spanAdditionalAttributes,
          [AttributeName.EXECUTION_OPERATION_NAME]: args.operationName ?? undefined,
          [AttributeName.EXECUTION_OPERATION_DOCUMENT]: getDocumentString(args.document, print),
          ...(options.variables
            ? { [AttributeName.EXECUTION_VARIABLES]: JSON.stringify(args.variableValues ?? {}) }
            : {}),
        },
      });

      const resultCbs: OnExecuteHookResult<PluginContext> = {
        onExecuteDone({ result }) {
          if (isAsyncIterable(result)) {
            executionSpan.end();
            // eslint-disable-next-line no-console
            console.warn(
              `Plugin "opentelemetry" encountered an AsyncIterator which is not supported yet, so tracing data is not available for the operation.`,
            );
            return;
          }

          if (result.data && options.result) {
            executionSpan.setAttribute(AttributeName.EXECUTION_RESULT, JSON.stringify(result));
          }

          if (result.errors && result.errors.length > 0) {
            executionSpan.recordException({
              name: AttributeName.EXECUTION_ERROR,
              message: JSON.stringify(result.errors),
            });
          }

          executionSpan.end();
        },
      };

      if (options.resolvers) {
        extendContext({
          [tracingSpanSymbol]: executionSpan,
        });
      }

      return resultCbs;
    },
  };
};