#!/usr/bin/env bash
set -euo pipefail

MSG=${1:-"chore: test, commit, sync"}
npm run build
grep -n "Current Price" components/Strategy/StatsRail.jsx

git add -A
if ! git diff --cached --quiet; then
  git commit -m "$MSG"
else
  echo "No changes to commit."
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin "$BRANCH" || true
git pull --rebase --autostash origin "$BRANCH" || true

if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  git push origin "$BRANCH"
else
  git push -u origin "$BRANCH"
fi
