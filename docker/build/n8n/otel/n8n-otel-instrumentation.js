/**
 * Patches n8n workflow execution to wrap the entire run in a workflow-level span.
 *
 * - Span name: "n8n.workflow.execute"
 * - Attributes prefixed with "n8n." to follow semantic conventions.
 */

// const opentelemetry = require('@opentelemetry/api');

// function checkOpenTelemetryConfiguration() {
//   console.log('Checking OpenTelemetry configuration in n8n-otel-instrumentation.js...');
//   // Check if a tracer provider is registered
//   const tracerProvider = opentelemetry.trace.getTracerProvider();

//   // If it's not the NoopTracerProvider, then OpenTelemetry is configured
//   const isConfigured = tracerProvider.constructor.name !== 'NoopTracerProvider';

//   if (isConfigured) {
//     // Try to identify who configured it
//     // This is trickier since OpenTelemetry doesn't explicitly store this info

//     // One approach: check the module name in the tracer
//     const tracer = tracerProvider.getTracer('detection');

//     console.log('OpenTelemetry is configured');
//     console.log('Tracer provider type:', tracerProvider.constructor.name);

//     // Examine loaded modules for OpenTelemetry SDKs
//     const loadedModules = Object.keys(require.cache).filter(path =>
//       path.includes('@opentelemetry') &&
//       !path.includes('@opentelemetry/api')
//     );

//     if (loadedModules.length) {
//       console.log('Potential configuring modules:');
//       loadedModules.forEach(module => console.log(`- ${module}`));
//     } else {
//       console.log('Could not determine which module configured OpenTelemetry');
//     }
//   } else {
//     console.log('OpenTelemetry is not configured');
//   }

//   return isConfigured;
// }

// checkOpenTelemetryConfiguration();

const {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} = require("@opentelemetry/api")
const flat = require("flat") // flattens objects into a single level
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
