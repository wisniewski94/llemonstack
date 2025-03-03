# Dockerfile for n8n with ffmpeg installed
#
# Build the image:
# > docker build -t n8n-custom-ffmpeg -f Dockerfile.ffmpeg.yml .
#
# Then update docker-compose.yml to use the new image:
#   x-n8n:
#     image: n8n-custom-ffmpeg
#
# Update to latest n8n image:
# > docker pull docker.n8n.io/n8nio/n8n:latest
# Then rebuild the image using build command above.
#

# Use the official n8n image as base
FROM docker.n8n.io/n8nio/n8n:latest

# Install ffmpeg
USER root
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Switch back to n8n user
USER node
