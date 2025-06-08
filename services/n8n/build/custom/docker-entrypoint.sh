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

# Add custom nodes to the NODE_PATH for Puppeteer
if [ -n "$N8N_CUSTOM_EXTENSIONS" ]; then
    export N8N_CUSTOM_EXTENSIONS="/opt/n8n-custom-nodes:${N8N_CUSTOM_EXTENSIONS}"
else
    export N8N_CUSTOM_EXTENSIONS="/opt/n8n-custom-nodes"
fi

# Print banner for Puppeteer (optional, but helpful for debugging)
print_banner() {
    echo "----------------------------------------"
    echo "n8n Puppeteer Node - Environment Details"
    echo "----------------------------------------"
    echo "Node.js version: $(node -v)"
    echo "n8n version: $(n8n --version)"
    CHROME_VERSION=$("$PUPPETEER_EXECUTABLE_PATH" --version 2>/dev/null || echo "Chromium not found")
    echo "Chromium version: $CHROME_VERSION"
    PUPPETEER_PATH="/opt/n8n-custom-nodes/node_modules/n8n-nodes-puppeteer"
    if [ -f "$PUPPETEER_PATH/package.json" ]; then
        PUPPETEER_VERSION=$(node -p "require('$PUPPETEER_PATH/package.json').version")
        echo "n8n-nodes-puppeteer version: $PUPPETEER_VERSION"
        CORE_PUPPETEER_VERSION=$(cd "$PUPPETEER_PATH" && node -e "try { const version = require('puppeteer/package.json').version; console.log(version); } catch(e) { console.log('not found'); }")
        echo "Puppeteer core version: $CORE_PUPPETEER_VERSION"
    else
        echo "n8n-nodes-puppeteer: not installed"
    fi
    echo "Puppeteer executable path: $PUPPETEER_EXECUTABLE_PATH"
    echo "N8N_CUSTOM_EXTENSIONS: $N8N_CUSTOM_EXTENSIONS"
    echo "----------------------------------------"
}
print_banner

if [ "${OTEL_SDK_DISABLED}" = "false" ]; then
  echo "Starting n8n with OpenTelemetry instrumentation..."
  export NODE_PATH="/opt/opentelemetry/node_modules:/usr/local/lib/node_modules:${NODE_PATH}"
  exec node --require /opt/opentelemetry/tracing.js /usr/local/bin/n8n "$@"
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
