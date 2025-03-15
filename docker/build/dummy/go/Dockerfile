# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy source code
COPY main.go .

# Initialize Go module
RUN go mod init logflare-sink

# Build statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -o logflare-sink .

# Runtime stage - using scratch (smallest possible image)
FROM scratch

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/logflare-sink .

# Copy CA certificates for HTTPS support
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Set environment variables
ENV PORT=4000

# Expose port
EXPOSE ${PORT}

# Run the binary
CMD ["/app/logflare-sink"]