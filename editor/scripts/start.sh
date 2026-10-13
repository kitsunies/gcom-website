#!/bin/sh
set -eu
./pocketbase serve --http=127.0.0.1:8090 --dir=/data/pb_data --hooksDir=/app/pb_hooks --migrationsDir=/app/pb_migrations &
pb_pid=$!
node server/index.mjs &
node_pid=$!
trap 'kill "$node_pid" "$pb_pid" 2>/dev/null || true; wait || true' INT TERM EXIT
# Terminate the container when either essential process exits.
while kill -0 "$pb_pid" 2>/dev/null && kill -0 "$node_pid" 2>/dev/null; do sleep 2; done
exit 1
