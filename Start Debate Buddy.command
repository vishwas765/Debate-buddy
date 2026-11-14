#!/bin/sh
# Debate Buddy starter. Double-click, or run: sh "Start Debate Buddy.command"
ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
exec sh "$ROOT/bootstrap-unix.sh" "$@"
