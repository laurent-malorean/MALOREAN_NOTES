#!/usr/bin/env bash
# Branche les crochets git versionnés (scripts/hooks) sur ce dépôt seulement (jamais de réglage global).
set -euo pipefail
cd "$(dirname "$0")/.."
chmod +x scripts/hooks/*
git config --local core.hooksPath scripts/hooks
printf '✓ crochets git branchés : core.hooksPath = scripts/hooks (test de mutation du diff après chaque commit)\n'
