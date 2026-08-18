#!/usr/bin/env bash
# Serve dist on PORT, replacing any previous instance.
# `vite preview` forks a child, so killing the npx wrapper alone leaves the
# real server holding the port. Kill by the resolved binary path.
set -euo pipefail
PORT="${PORT:-4173}"
BASE="${BASE:-/}"
cd "$(dirname "$0")/.."
pkill -9 -f 'node_modules/.bin/vite' 2>/dev/null || true
sleep 2
LOG="/tmp/ccc-preview-$PORT.log"
nohup npx vite preview --port "$PORT" --strictPort --base "$BASE" >"$LOG" 2>&1 &
for i in $(seq 1 20); do
  sleep 1
  if curl -fsS -o /dev/null "http://localhost:$PORT$BASE" 2>/dev/null; then
    echo "serving http://localhost:$PORT$BASE"
    exit 0
  fi
done
echo "FAILED to start; log:"; tail -5 "$LOG"; exit 1
