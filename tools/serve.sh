#!/usr/bin/env bash
# Build and serve dist on a fixed port, replacing any previous instance.
# `vite preview` spawns a child process, so killing the npx wrapper alone
# leaves the real server holding the port.
set -euo pipefail
PORT="${PORT:-4173}"
BASE="${BASE:-/}"
cd "$(dirname "$0")/.."
pkill -9 -f "vite preview --port $PORT" 2>/dev/null || true
sleep 1
npm run build -- --base="$BASE"
nohup npx vite preview --port "$PORT" --strictPort --base="$BASE" >"/tmp/preview-$PORT.log" 2>&1 &
sleep 4
tail -2 "/tmp/preview-$PORT.log"
