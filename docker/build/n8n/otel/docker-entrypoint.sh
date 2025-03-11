#!/bin/sh
# docker-entrypoint.sh
# Original: https://github.com/n8n-io/n8n/blob/master/docker/images/n8n/docker-entrypoint.sh

# Start n8n with OpenTelemetry instrumentation
echo "Starting n8n with OpenTelemetry instrumentation..."
exec node --require /usr/local/lib/node_modules/n8n/tracing.js /usr/local/bin/n8n "$@"
