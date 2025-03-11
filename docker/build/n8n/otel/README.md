# Custom n8n Docker Image with Open Telemetry

Adds automatic tracing of n8n workflows to the otel provider configured in env variables.

```bash
# Build the image
docker build -t n8n-otel -f Dockerfile.yml .

# Or build and run with docker compose
docker compose up
```
