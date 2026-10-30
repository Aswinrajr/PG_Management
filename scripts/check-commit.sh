#!/usr/bin/env bash
# Commits only when typecheck and tests pass. Usage: scripts/check-commit.sh "feat(api): message"
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @roomora/types build >/dev/null
pnpm -r typecheck
pnpm -r test
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1
