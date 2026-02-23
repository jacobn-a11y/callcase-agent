#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${REPO_ROOT}/plugins/callcase-agent-local"
ZIP_PATH="${REPO_ROOT}/plugins/callcase-agent-local-plugin.zip"
MCPB_PATH="${REPO_ROOT}/plugins/callcase-agent-local-plugin.mcpb"
DXT_PATH="${REPO_ROOT}/plugins/callcase-agent-local-plugin.dxt"
MANIFEST_PATH="${PLUGIN_DIR}/manifest.json"

if [[ ! -d "${PLUGIN_DIR}" ]]; then
  echo "Plugin directory not found: ${PLUGIN_DIR}" >&2
  exit 1
fi

if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "Manifest not found: ${MANIFEST_PATH}" >&2
  exit 1
fi

rm -f "${ZIP_PATH}" "${MCPB_PATH}" "${DXT_PATH}"

(
  cd "${PLUGIN_DIR}"
  zip -r "${ZIP_PATH}" . \
    -x "*.DS_Store"
)

npx @anthropic-ai/mcpb validate "${MANIFEST_PATH}" >/dev/null
npx @anthropic-ai/mcpb pack "${PLUGIN_DIR}" "${MCPB_PATH}"
cp "${MCPB_PATH}" "${DXT_PATH}"

echo "Built ${ZIP_PATH}"
echo "Built ${MCPB_PATH}"
echo "Built ${DXT_PATH}"
