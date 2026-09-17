#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo '== parser self-test =='
gjs -m parser.js --self-test

if command -v windscribe-cli >/dev/null 2>&1; then
    echo '== live CLI smoke test =='
    gjs -m test-live.js
else
    echo 'windscribe-cli not found, skipping live test'
fi
