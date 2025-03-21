# How to modify n8n to support OTEL and log streaming

See [docker/build/n8n/custom](../docker/build/n8n/custom/) for a working example.

The example builds a custom n8n docker image and patches in OpenTelemetry support to auto trace n8n
workflow executions.

It currently supports Honeycomb but can be easily modified to connect to any OTEL backend.

**Observability Services:**

- https://github.com/jaegertracing/jaeger - cassandra
- https://github.com/uptrace/uptrace - clickhouse, prometheus
- https://github.com/SigNoz/signoz - clickhouse
- https://github.com/grafana/tempo - probably the lightest weight, but we already have clickhouse
  for langfuse

<br />

## Observability Custom n8n

```bash
# Dockerfile
FROM n8nio/n8n:latest

USER root

# Install required packages
RUN echo "Installing required packages..." && \
    apk add --no-cache \
    curl \
    gettext \
    coreutils \
    openssl \
    ca-certificates \
    musl-dev && \
    echo "Curl installed successfully: $(curl --version | head -n 1)" && \
    echo "Envsubst installed successfully: $(envsubst --version | head -n 1)"

# Switch to n8n's installation directory
WORKDIR /usr/local/lib/node_modules/n8n

# Install Node.js OpenTelemetry dependencies locally to n8n
RUN npm install \
    @opentelemetry/api \
    @opentelemetry/sdk-node \
    @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-http \
    @opentelemetry/exporter-logs-otlp-http \
    @opentelemetry/resources \
    @opentelemetry/semantic-conventions \
    @opentelemetry/instrumentation \
    @opentelemetry/instrumentation-winston \
    @opentelemetry/winston-transport \
    winston \
    flat

# Copy instrumentation files to n8n directory
COPY tracing.js n8n-otel-instrumentation.js ./
RUN chown node:node ./*.js

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN echo "Setting entrypoint permissions..." && \
    chmod +x /docker-entrypoint.sh && \
    chown node:node /docker-entrypoint.sh && \
    echo "Entrypoint script contents:" && \
    cat /docker-entrypoint.sh

USER node

ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]
```

<!-- markdownlint-disable -->

```bash
#!/bin/sh
# docker-entrypoint.sh
# Original: https://github.com/n8n-io/n8n/blob/master/docker/images/n8n/docker-entrypoint.sh

# Set up OpenTelemetry environment variables for Honeycomb
export OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-n8n}"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://api.honeycomb.io"
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=${HONEYCOMB_API_KEY}"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="x-honeycomb-team=${HONEYCOMB_API_KEY}"
export OTEL_LOG_LEVEL=${OTEL_LOG_LEVEL:-info}

# Start n8n with OpenTelemetry instrumentation
echo "Starting n8n with OpenTelemetry instrumentation and Honeycomb export..."
exec node --require /usr/local/lib/node_modules/n8n/tracing.js /usr/local/bin/n8n "$@"
```

<!-- markdownlint-enable -->

```javascript
// n8n-otel-instrumentation.js
const {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} = require("@opentelemetry/api")
const flat = require("flat")
const tracer = trace.getTracer("n8n-instrumentation", "1.0.0")

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

module.exports = setupN8nOpenTelemetry
```

```javascript
// tracing.js
"use strict"

// Enable proper async context propagation globally.
const {
  AsyncHooksContextManager,
} = require("@opentelemetry/context-async-hooks")
const { context } = require("@opentelemetry/api")
const contextManager = new AsyncHooksContextManager()
context.setGlobalContextManager(contextManager.enable())

const opentelemetry = require("@opentelemetry/sdk-node")
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http")
const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-http")
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node")
const { registerInstrumentations } = require("@opentelemetry/instrumentation")
const { Resource } = require("@opentelemetry/resources")
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions")
const setupN8nOpenTelemetry = require("./n8n-otel-instrumentation")
const winston = require("winston")

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
})

const autoInstrumentations = getNodeAutoInstrumentations({
  "@opentelemetry/instrumentation-dns": { enabled: false },
  "@opentelemetry/instrumentation-net": { enabled: false },
  "@opentelemetry/instrumentation-tls": { enabled: false },
  "@opentelemetry/instrumentation-fs": { enabled: false },
  "@opentelemetry/instrumentation-pg": {
    enhancedDatabaseReporting: true,
  },
})

registerInstrumentations({
  instrumentations: [autoInstrumentations],
})

setupN8nOpenTelemetry()

const sdk = new opentelemetry.NodeSDK({
  logRecordProcessors: [
    new opentelemetry.logs.SimpleLogRecordProcessor(new OTLPLogExporter()),
  ],
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME || "n8n",
  }),
  traceExporter: new OTLPTraceExporter({
    headers: {
      "x-honeycomb-team": process.env.HONEYCOMB_API_KEY,
    },
  }),
})

process.on("uncaughtException", async (err) => {
  logger.error("Uncaught Exception", { error: err })
  const span = opentelemetry.trace.getActiveSpan()
  if (span) {
    span.recordException(err)
    span.setStatus({ code: 2, message: err.message })
  }
  try {
    await sdk.forceFlush()
  } catch (flushErr) {
    logger.error("Error flushing telemetry data", { error: flushErr })
  }
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { error: reason })
})

sdk.start()
```

## Langfuse Custom n8n

From
[this n8n community forum post](https://community.n8n.io/t/swap-smith-langchain-for-langfuse/47748/7).

This example shows how to use Langfuse in the LangChain Code node. Langfuse is
used in the example code to send traces and fetch the prompt from Langfuse's
prompt registry.

```bash
FROM n8nio/n8n:1.53.2
USER root
RUN npm install -g \
    langfuse@3.18.0 \
    langfuse-langchain@3.18.0
USER node
```

Then set these env vars in the `services/n8n/docker-compose.yaml` file.

```yaml
environment:
  - NODE_FUNCTION_ALLOW_EXTERNAL=* # or list out the langfuse packages
  # - NODE_FUNCTION_ALLOW_EXTERNAL=langfuse,langfuse-langchain
  - LANGFUSE_PUBLIC_KEY=pk-lf-... # langfuse public key
  - LANGFUSE_SECRET_KEY=sk-lf-... # langfuse secret key
  - LANGFUSE_BASE_URL=http://langfuse:3000
```

```javascript
// Example LangChain Code Node
const { PromptTemplate } = require("@langchain/core/prompts")
const { CallbackHandler } = require("langfuse-langchain")
const { Langfuse } = require("langfuse")

// ID of the prompt in Langfuse prompt registry
const prompt_id = "test-1"

// Langfuse configuration
const langfuseParams = {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
}

// Initialize Langfuse
const langfuse = new Langfuse(langfuseParams)
const langfuseHandler = new CallbackHandler(langfuseParams)

// Main async function
async function executeWithLangfuse() {
  // Get the input from n8n
  const topic = $input.item.json.topic

  // Fetch the prompt from Langfuse prompt registry
  const prompt = await langfuse.getPrompt(prompt_id)

  const promptTemplate = PromptTemplate.fromTemplate(
    prompt.getLangchainPrompt()
  )

  // Get the language model from n8n input
  const llm = await this.getInputConnectionData("ai_languageModel", 0)

  // Create the chain using pipe
  const chain = promptTemplate.pipe(llm)

  // Invoke the chain with Langfuse handler
  const output = await chain.invoke(
    { topic: topic },
    { callbacks: [langfuseHandler] } // Enable Langfuse traces
  )

  return [{ json: { output } }]
}

// Execute the function and return the result
return executeWithLangfuse.call(this)
```
