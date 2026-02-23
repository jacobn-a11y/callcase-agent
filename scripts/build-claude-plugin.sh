#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${REPO_ROOT}/plugins/callcase-agent-local"
ZIP_PATH="${REPO_ROOT}/plugins/callcase-agent-local-plugin.zip"

if [[ ! -d "${PLUGIN_DIR}" ]]; then
  echo "Plugin directory not found: ${PLUGIN_DIR}" >&2
  exit 1
fi

rm -f "${ZIP_PATH}"

(
  cd "${PLUGIN_DIR}"
  zip -r "${ZIP_PATH}" . \
    -x "*.DS_Store"
)

echo "Built ${ZIP_PATH}"
