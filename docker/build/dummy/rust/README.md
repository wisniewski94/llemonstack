# Lightweight Logflare Sink

A super lightweight replacement for the Supabase Analytics container that accepts and discards Logflare-type requests. Built with Rust for minimal resource usage.

## Features

- **Ultra-lightweight**: Built with Rust for minimal memory and CPU usage
- **Tiny footprint**: Container runs in under 20MB of RAM
- **API compatible**: Drop-in replacement for Logflare endpoints
- **Simple monitoring**: Includes a `/health` endpoint

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Setup and Run

1. Clone this repository
2. Make sure your project structure looks like:

   ```
   .
   ├── Cargo.toml
   ├── Dockerfile
   ├── docker-compose.yml
   └── src
       └── main.rs
   ```

3. Build and start the container:

   ```bash
   docker-compose up -d
   ```

## Usage

The server accepts requests on the following endpoints:

- `/api/*`: Accepts and acknowledges any Logflare API requests
- `/logs`: Accepts and acknowledges any log submission requests
- `/health`: Returns server status and request statistics

## Resource Usage

The container is configured to use:

- Maximum 20MB of memory
- 0.05 CPU cores

This is significantly lighter than the full Supabase Analytics container.

## Integration with Supabase

Replace your existing Supabase Analytics container with this lightweight version by:

1. Stopping the current analytics container
2. Running this container on the same network
3. Ensuring your Supabase services point to this container for log collection

## License

MIT
