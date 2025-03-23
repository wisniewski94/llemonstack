# Custom n8n Docker Image with FFmpeg, Langfuse & Open Telemetry

Adds automatic tracing of n8n workflows to the otel provider configured in env variables.

The OTEL example was originally shared by Stuart Johnson in this
[n8n community forum post](https://community.n8n.io/t/n8n-successfully-instrumented-with-opentelemetry/78468).

The code has been modified to fix some minor bugs and consolidate the tracing code into one file.

FFmpeg is installed and useable from run command nodes in n8n.

Langfuse is installed and usesable from LangChain Code nodes in n8n.

```bash
# Set Honeycomb API key in local env
export HONEYCOMB_API_KEY=your-api-key

# Build and start the image
docker compose build

# Start the image
docker compose up

# Or rebuild and start the image
docker compose up --build
```

n8n workflows are then automatically logged to the OTEL backend (e.g. Honeycomb).

View traces in Honeycomb to see the full workflow session.

Here's an example screenshot showing an n8n workflow execution being traced in Honeycomb. The
example workflow threw an error.

![n8n workflow with OpenTelemetry tracing in Honeycomb](../../../../docs/assets/screenshot_otel-n8n-trace1.png)
