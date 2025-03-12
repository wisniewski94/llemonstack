"use strict";

// Enable proper async context propagation globally.
const { AsyncHooksContextManager } = require("@opentelemetry/context-async-hooks");
const { context } = require("@opentelemetry/api");
const contextManager = new AsyncHooksContextManager();
context.setGlobalContextManager(contextManager.enable());

const opentelemetry = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { registerInstrumentations } = require("@opentelemetry/instrumentation");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");
// const setupN8nOpenTelemetry = require("./n8n-otel-instrumentation");
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const autoInstrumentations = getNodeAutoInstrumentations({
  "@opentelemetry/instrumentation-dns": { enabled: false },
  "@opentelemetry/instrumentation-net": { enabled: false },
  "@opentelemetry/instrumentation-tls": { enabled: false },
  "@opentelemetry/instrumentation-fs": { enabled: false },
  "@opentelemetry/instrumentation-pg": {
    enhancedDatabaseReporting: true,
  }
});

registerInstrumentations({
  instrumentations: [autoInstrumentations],
});

////////////////////////////////////////////////////////////
// n8n workflow execution tracing
////////////////////////////////////////////////////////////

const {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} = require("@opentelemetry/api")
const flat = require("flat") // flattens objects into a single level
const tracer = trace.getTracer("n8n-instrumentation", "1.0.0")

/**
 * Patches n8n workflow execution to wrap the entire run in a workflow-level span.
 *
 * - Span name: "n8n.workflow.execute"
 * - Attributes prefixed with "n8n." to follow semantic conventions.
 */
function setupN8nOpenTelemetry() {
  try {
    const { WorkflowExecute } = require("n8n-core")

    /**
     * Patch the workflow execution to wrap the entire run in a workflow-level span.
     *
     * - Span name: "n8n.workflow.execute"
     * - Attributes prefixed with "n8n." to follow semantic conventions.
     */
    const originalProcessRun = WorkflowExecute.prototype.processRunExecutionData
    /** @param {import('n8n-workflow').Workflow} workflow */
    WorkflowExecute.prototype.processRunExecutionData = function (workflow) {
      const wfData = workflow || {}
      const workflowId = wfData?.id ?? ""
      const workflowName = wfData?.name ?? ""

      const workflowAttributes = {
        "n8n.workflow.id": workflowId,
        "n8n.workflow.name": workflowName,
        ...flat(wfData?.settings ?? {}, {
          delimiter: ".",
          transformKey: (key) => `n8n.workflow.settings.${key}`,
        }),
      }

      const span = tracer.startSpan("n8n.workflow.execute", {
        attributes: workflowAttributes,
        kind: SpanKind.INTERNAL,
      })

      // Set the span as active
      const activeContext = trace.setSpan(context.active(), span)
      return context.with(activeContext, () => {
        const cancelable = originalProcessRun.apply(this, arguments)

        cancelable
          .then(
            (result) => {
              if (result?.data?.resultData?.error) {
                const err = result.data.resultData.error
                span.recordException(err)
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: String(err.message || err),
                })
              }
            },
            (error) => {
              span.recordException(error)
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(error.message || error),
              })
            }
          )
          .finally(() => {
            span.end()
          })

        return cancelable
      })
    }

    /**
     * Patch the node execution to wrap each node's run in a child span.
     *
     * - Span name: "n8n.node.execute"
     * - Captures node-specific details as attributes.
     */
    const originalRunNode = WorkflowExecute.prototype.runNode
    /**
     * @param {import('n8n-workflow').Workflow} workflow
     * @param {import('n8n-workflow').IExecuteData} executionData
     * @param {import('n8n-workflow').IRunExecutionData} runExecutionData
     * @param {number} runIndex
     * @param {import('n8n-workflow').IWorkflowExecuteAdditionalData} additionalData
     * @param {import('n8n-workflow').WorkflowExecuteMode} mode
     * @param {AbortSignal} [abortSignal]
     * @returns {Promise<import('n8n-workflow').IRunNodeResponse>}
     */
    WorkflowExecute.prototype.runNode = async function (
      workflow,
      executionData,
      runExecutionData,
      runIndex,
      additionalData,
      mode,
      abortSignal
    ) {
      // Safeguard against undefined this context
      if (!this) {
        console.warn("WorkflowExecute context is undefined")
        return originalRunNode.apply(this, arguments)
      }

      const executionId = additionalData?.executionId ?? "unknown"
      const userId = additionalData?.userId ?? "unknown"

      const node = executionData?.node ?? "unknown"
      let credInfo = "none"
      if (node?.credentials && typeof node.credentials === "object") {
        const credTypes = Object.keys(node.credentials)
        if (credTypes.length) {
          credInfo = credTypes
            .map((type) => {
              const cred = node.credentials?.[type]
              return cred && typeof cred === "object"
                ? cred.name ?? `${type} (id:${cred?.id ?? "unknown"})`
                : type
            })
            .join(", ")
        }
      }

      const nodeAttributes = {
        "n8n.workflow.id": workflow?.id ?? "unknown",
        "n8n.execution.id": executionId,
      }

      const flattenedNode = flat(node ?? {}, { delimiter: "." })
      for (const [key, value] of Object.entries(flattenedNode)) {
        nodeAttributes[`n8n.node.${key}`] = value
      }

      return tracer.startActiveSpan(
        `n8n.node.execute`,
        { attributes: nodeAttributes, kind: SpanKind.INTERNAL },
        async (nodeSpan) => {
          try {
            const result = await originalRunNode.apply(this, [
              workflow,
              executionData,
              runExecutionData,
              runIndex,
              additionalData,
              mode,
              abortSignal,
            ])
            try {
              const outputData = result?.data?.[runIndex]
              const finalJson = outputData?.map((item) => item.json)
              nodeSpan.setAttribute(
                "n8n.node.output_json",
                JSON.stringify(finalJson)
              )
            } catch (error) {
              console.warn("Failed to set node output attributes: ", error)
            }
            return result
          } catch (error) {
            nodeSpan.recordException(error)
            nodeSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(error.message || error),
            })
            nodeSpan.setAttribute("n8n.node.status", "error")
            throw error
          } finally {
            nodeSpan.end()
          }
        }
      )
    }
  } catch (e) {
    console.error("Failed to set up n8n OpenTelemetry instrumentation:", e)
  }
}

setupN8nOpenTelemetry();
////////////////////////////////////////////////////////////


const sdk = new opentelemetry.NodeSDK({
  logRecordProcessors: [
    new opentelemetry.logs.SimpleLogRecordProcessor(new OTLPLogExporter()),
  ],
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "n8n",
  }),
  traceExporter: new OTLPTraceExporter({
    headers: {
      "x-honeycomb-team": process.env.HONEYCOMB_API_KEY,
    },
  }),
});

process.on("uncaughtException", async (err) => {
  logger.error("Uncaught Exception", { error: err });
  const span = opentelemetry.trace.getActiveSpan();
  if (span) {
    span.recordException(err);
    span.setStatus({ code: 2, message: err.message });
  }
  try {
    await sdk.forceFlush();
  } catch (flushErr) {
    logger.error("Error flushing telemetry data", { error: flushErr });
  }
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { error: reason });
});

sdk.start();