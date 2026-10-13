#!/bin/sh
set -eu
umask 077
# Restores to a new empty directory; switch EDITOR_DATA_DIR only after verification.
exec python3 "$(dirname "$0")/archive.py" restore "$1" "$2"
