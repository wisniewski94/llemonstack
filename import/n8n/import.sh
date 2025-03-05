#!/bin/sh

# Exit immediately if a command fails (-e),
# treat unset variables as an error (-u),
# and catch failures in pipelines (-o pipefail).
set -e

# Directories
CREDENTIALS_DIR="/import/credentials"
WORKFLOWS_DIR="/import/workflows"

echo "🚀  Starting import process..."

# Import credentials from the root credentials directory
echo "🔑  Importing credentials from ${CREDENTIALS_DIR}..."
n8n import:credentials --separate --input="${CREDENTIALS_DIR}"

# Import credentials from subdirectories
echo "📂  Importing credentials from subdirectories..."
for dir in "${CREDENTIALS_DIR}"/*; do
  # Check if the directory exists to avoid errors
  if [[ -d "${dir}" ]]; then
    echo "➡️  Importing credentials from ${dir}..."
    n8n import:credentials --separate --input="${dir}"
  else
    echo "⚠️  No subdirectories found in ${CREDENTIALS_DIR}."
  fi
done

# Import workflows
echo "⭐ Importing workflows from ${WORKFLOWS_DIR}..."
n8n import:workflow --separate --input="${WORKFLOWS_DIR}"

# Import workflows from subdirectories
echo "📂  Importing workflows from subdirectories..."
for dir in "${WORKFLOWS_DIR}"/*; do
  # Check if the directory exists to avoid errors
  if [[ -d "${dir}" ]]; then
    echo "➡️  Importing workflows from ${dir}..."
    n8n import:workflow --separate --input="${dir}"
  else
    echo "⚠️  No subdirectories found in ${WORKFLOWS_DIR}."
  fi
done

echo "✅  Import process completed successfully!"

# Delay to ensure n8n properly finished importing
# TODO: Remove this delay after debugging
#       Better to run docker exec instead of this janky script
echo "⏱️  Waiting for 3 seconds..."
sleep 3
