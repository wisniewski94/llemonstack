# Simple dummy server
#
# ccepts tcp connections and discards all data.
#
# Useful for replacing Subabase Analytics (Logflare) and other services that
# normally consume resources but are not needed by most users.
#
FROM denoland/deno:alpine

# Create app directory
WORKDIR /app

# Copy source
COPY server.ts .

# Cache the dependencies
RUN deno cache server.ts

# Set environment variables
ENV PORT=4000

# Expose the port
EXPOSE ${PORT}

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z 0.0.0.0 ${PORT} || exit 1

# Start the application with minimal permissions
CMD ["deno", "run", "--allow-net", "server.ts"]
