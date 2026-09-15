#!/usr/bin/env bash
#
# SynTask rollback (Topic 14).
#
# Convenience wrapper around `deploy.sh --rollback`: restores the previous
# known-good release recorded in the deployment marker file, rebuilds, and
# re-runs the health gate.
#
# Usage:
#   scripts/deployment/rollback.sh --env production --yes
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec bash "$SCRIPT_DIR/deploy.sh" --rollback "$@"
