# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy source code
COPY main.go .

# Initialize Go module
RUN go mod init dummy

# Build statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o dummy .

# Runtime stage - using scratch (smallest possible image)
FROM scratch

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/dummy .

# Copy CA certificates for HTTPS requests
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Set environment variables
ENV PORT=4000

# Expose port
EXPOSE ${PORT}

# Define healthcheck using the binary itself
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/app/dummy", "-health-check"]

# Run the binary
CMD ["/app/dummy"]