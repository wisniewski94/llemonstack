# Dockerfile
FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Install required packages
RUN echo "Installing required packages..." && \
    apk add --no-cache \
    ffmpeg && \
    rm -rf /var/cache/apk/* && \
    echo "FFmpeg installed: $(ffmpeg -version | head -n 1)"

# Create machine-id
# This fixes OTEL log error messages
RUN echo "Creating machine-id..." && \
    apk add dbus --no-cache && \
    dbus-uuidgen > /var/lib/dbus/machine-id

# Switch to n8n's installation directory
WORKDIR /usr/local/lib/node_modules/n8n

# TODO: create a package.json to lock the versions of the dependencies

# Install Node.js OpenTelemetry dependencies locally to n8n
RUN npm install --no-fund --no-audit --loglevel=info \
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
    || echo "Warning: One or more OpenTelemetry packages failed to install, but build will continue"

RUN npm install \
    winston \
    flat

RUN npm install \
    langfuse \
    langfuse-langchain

# Copy instrumentation files to n8n directory
# /usr/local/lib/node_modules/n8n/tracing.js
COPY ./tracing.js ./
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