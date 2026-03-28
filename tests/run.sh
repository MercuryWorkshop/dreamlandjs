#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
cd "$SCRIPT_DIR/.." || exit 1

LOCALSTORAGE=$(mktemp)
node --localstorage-file="${LOCALSTORAGE}" --expose-gc --experimental-transform-types tests/harness.ts "$@"
rm "$LOCALSTORAGE"
