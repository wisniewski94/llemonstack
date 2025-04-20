#!/usr/bin/env python3
import json
import sys

import requests


def check_health():
    """
    Query LightRAG's /health endpoint and verify if the service is healthy.
    Raises an exception if the service is not healthy.
    """
    url = "http://localhost:9621/health"

    try:
        # Send GET request to the health endpoint
        response = requests.get(url, timeout=10)

        # Check if the request was successful
        if response.status_code != 200:
            raise Exception(f"Error: Received status code {response.status_code}")

        # Parse the JSON response
        data = response.json()

        # Check if the status is healthy and raise an exception if not
        if data.get("status") != "healthy":
            raise Exception(
                f"Service is not healthy. Status: {data.get('status', 'unknown')}"
            )

        # If we get here, the service is healthy
        print("Service is healthy!")
        print(f"Core version: {data.get('core_version', 'unknown')}")
        print(f"API version: {data.get('api_version', 'unknown')}")

    except requests.exceptions.RequestException as e:
        raise Exception(f"Error connecting to service: {e}")
    except json.JSONDecodeError:
        raise Exception("Error: Invalid JSON response")


if __name__ == "__main__":
    try:
        check_health()
        sys.exit(0)
    except Exception as e:
        print(str(e))
        sys.exit(1)
