#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REPO_PATH="${CALLCASE_REPO_PATH:-}"

if [[ "${1:-}" == "--repo" ]]; then
  shift
  REPO_PATH="${1:-$REPO_PATH}"
  shift || true
fi

if [[ -z "${REPO_PATH}" ]]; then
  CANDIDATE="$(cd "${PLUGIN_ROOT}/../.." && pwd || true)"
  if [[ -f "${CANDIDATE}/package.json" ]]; then
    REPO_PATH="${CANDIDATE}"
  fi
fi

if [[ -z "${REPO_PATH}" ]]; then
  echo "CALLCASE_REPO_PATH is not set and repo path could not be inferred." >&2
  exit 1
fi

if [[ ! -f "${REPO_PATH}/package.json" ]]; then
  echo "Invalid CALLCASE_REPO_PATH: ${REPO_PATH} (package.json not found)." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found on PATH." >&2
  exit 1
fi

exec npm run --silent mcp --prefix "${REPO_PATH}" "$@"
