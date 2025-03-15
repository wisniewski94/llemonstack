#!/usr/bin/env python3
# Healthcheck for LiteLLM
# Add this via docerk volume and run it as a healthcheck in docker compose.
import http.client
import os
import sys


def check_health():
    try:
        # Configure these variables as needed
        host = "0.0.0.0"
        port = 4000
        path = "/health"
        token = os.environ.get(
            "LITELLM_MASTER_KEY", ""
        )  # Get token from environment variable
        timeout = 3

        if not token:
            print("Warning: API_KEY environment variable not set")
            # You can decide whether to fail or continue when API_KEY is missing
            # return 1  # Uncomment to make healthcheck fail when API_KEY is missing

        # Create connection with timeout
        conn = http.client.HTTPConnection(host, port, timeout=timeout)

        # Set headers
        headers = {"Authorization": f"Bearer {token}"}

        # Make the request
        conn.request("GET", path, headers=headers)

        # Get response
        response = conn.getresponse()

        # Check status code
        if response.status == 200:
            print(f"Health check successful: {response.status} {response.reason}")
            return 0
        else:
            print(f"Health check failed: {response.status} {response.reason}")
            return 1

    except Exception as e:
        print(f"Health check error: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(check_health())
