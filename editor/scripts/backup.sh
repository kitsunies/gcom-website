#!/bin/sh
set -eu
umask 077
: "${EDITOR_DATA_DIR:?Set persistent data directory}" "${EDITOR_BACKUP_DIR:?Set backup directory}"
cd "$(dirname "$0")/.."
mkdir -p "$EDITOR_BACKUP_DIR"
# Historical editor data only: stop any old PocketBase process before archiving.
python3 scripts/archive.py backup "$EDITOR_DATA_DIR" "$EDITOR_BACKUP_DIR/gcom-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
