# Dockerfile
FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Install required packages
RUN echo "Installing required packages..." && \
    apk add --no-cache \
    ffmpeg \
    # Added for Puppeteer
    chromium \
    nss \
    glib \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    ttf-liberation \
    font-noto-emoji && \
    rm -rf /var/cache/apk/* && \
    echo "FFmpeg installed: $(ffmpeg -version | head -n 1)" && \
    echo "Chromium installed: $(chromium-browser --version)"

# Create machine-id
# This fixes OTEL log error messages
RUN echo "Creating machine-id..." && \
    apk add dbus --no-cache && \
    dbus-uuidgen > /var/lib/dbus/machine-id


# Install OpenTelemetry dependencies required by tracing.js
RUN mkdir -p /opt/opentelemetry
WORKDIR /opt/opentelemetry
COPY ./tracing/package.json package.json
COPY ./tracing/package-lock.json package-lock.json
COPY ./tracing/tracing.js tracing.js
RUN chown node:node ./*.js
RUN npm install

# Create a symlink to n8n-core in the OpenTelemetry node_modules directory
# tracing.js patches n8n-core to trace workflow executions
RUN mkdir -p /opt/opentelemetry/node_modules/n8n-core
RUN ln -sf /usr/local/lib/node_modules/n8n/node_modules/n8n-core/* /opt/opentelemetry/node_modules/n8n-core/

# Tell Puppeteer to use installed Chrome instead of downloading it
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install n8n-nodes-puppeteer in a permanent location
RUN mkdir -p /opt/n8n-custom-nodes && \
    cd /opt/n8n-custom-nodes && \
    npm install n8n-nodes-puppeteer && \
    chown -R node:node /opt/n8n-custom-nodes

# Switch to n8n's installation directory
WORKDIR /usr/local/lib/node_modules/n8n

# Install langfuse dependencies in n8n directory to use langfuse in n8n code nodes
# RUN npm install \
#     langfuse \
#     langfuse-langchain

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN echo "Setting entrypoint permissions..." && \
    chmod +x /docker-entrypoint.sh && \
    chown node:node /docker-entrypoint.sh

USER node

ENTRYPOINT ["tini", "--", "/docker-entrypoint.sh"]