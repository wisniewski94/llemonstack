# Build stage
FROM rust:1.76-slim AS builder

WORKDIR /app

# Create a new empty project
RUN USER=root cargo new --bin dummy
WORKDIR /app/dummy

# Copy manifests
COPY Cargo.toml ./

# Build dependencies (this is cached if dependencies don't change)
RUN cargo build --release
RUN rm src/*.rs

# Copy source code
COPY src ./src

# Build the application
RUN touch src/main.rs
RUN cargo build --release

# Runtime stage
FROM debian:bullseye-slim

WORKDIR /app

# Install minimal runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates wget && \
    rm -rf /var/lib/apt/lists/*

# Copy the binary from builder stage
COPY --from=builder /app/dummy/target/release/dummy .

# Environment variables
ENV PORT=4000
ENV RUST_LOG=info

# Expose the port
EXPOSE ${PORT}

# Run as non-root user
RUN useradd -m appuser
USER appuser

# Run the binary
CMD ["./dummy"]
