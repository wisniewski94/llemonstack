#!/bin/sh
# docker-entrypoint.sh

echo "Custom n8n image with ffmpeg, Langfuse, and OpenTelemetry"

# Trust custom certificates if they exist
if [ -d /opt/custom-certificates ]; then
  echo "Trusting custom certificates from /opt/custom-certificates."
  export NODE_OPTIONS="--use-openssl-ca $NODE_OPTIONS"
  export SSL_CERT_DIR=/opt/custom-certificates
  c_rehash /opt/custom-certificates
fi

if [ "${OTEL_SDK_DISABLED}" = "false" ]; then
  echo "Starting n8n with OpenTelemetry instrumentation..."
  exec node --require /usr/local/lib/node_modules/n8n/tracing.js /usr/local/bin/n8n "$@"
else
  echo "OpenTelemetry disabled, starting n8n normally..."
  if [ "$#" -gt 0 ]; then
    # Got started with arguments
    exec n8n "$@"
  else
    # Got started without arguments
    exec n8n
  fi
fi
