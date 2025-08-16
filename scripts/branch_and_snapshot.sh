# --- filename: scripts/branch_and_snapshot.sh
#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-feat/options-ep-el}"
SNAP_TAG="pre-ep-el-$(date +%Y%m%d-%H%M%S)"
SNAP_ENV=".env.snapshot.local"

echo "🔎 Checking git status…"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Working tree not clean. Commit or stash changes first."
  exit 1
fi

echo "🌿 Creating branch: $BRANCH"
git checkout -b "$BRANCH"

echo "🏷️  Tagging snapshot on previous main HEAD as: $SNAP_TAG"
BASE_REF=$(git rev-parse @{-1} || echo "")
[ -n "$BASE_REF" ] && git tag -a "$SNAP_TAG" -m "Snapshot before EP/EL work" "$BASE_REF" || true

echo "🗂️  Snapshotting env -> $SNAP_ENV (ignored by git)"
if [ -f ".env.local" ]; then
  cp .env.local "$SNAP_ENV"
elif [ -f ".env" ]; then
  cp .env "$SNAP_ENV"
else
  echo "# Place preview env here (not committed)" > "$SNAP_ENV"
fi

echo "✅ Done.
Next:
  1) Push branch:     git push -u origin \"$BRANCH\"
  2) Vercel preview:  vercel link (once) && push to trigger preview
"
