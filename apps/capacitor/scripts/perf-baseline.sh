#!/usr/bin/env bash
# Builds the render-cost baseline (e2e/perf, TASK-205.6 AC8) into .perf/baseline-dist:
# a copy of the working tree with the listed files taken from a git ref instead
# (files absent at the ref are removed from the copy). Read-only on the repo.
#
#   scripts/perf-baseline.sh [ref] [path ...]
#
# ref defaults to HEAD; paths (relative to apps/capacitor) default to the files
# TASK-205.6 changed on the reader's render path. Once the work before 205.6 is
# committed, HEAD is exactly the tree without it.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$APP_DIR/../.." && pwd)"
OUT="$APP_DIR/.perf"
COPY="$OUT/tree"
REF="${1:-HEAD}"
shift || true
PATHS=("$@")
if [ ${#PATHS[@]} -eq 0 ]; then
	PATHS=(
		src/pages/reader/word-gestures.ts
		src/pages/reader/reader-announcer.tsx
		src/pages/reader/paragraph.tsx
		src/pages/reader/goal-divider.tsx
		src/pages/reader/scroll-view.tsx
		src/pages/reader/index.tsx
		src/pages/reader/page-view/index.tsx
		src/pages/reader/page-view/chunk-content.tsx
	)
fi

rm -rf "$COPY" "$OUT/baseline-dist"
mkdir -p "$COPY"
rsync -a \
	--exclude node_modules --exclude dist --exclude android --exclude test-results \
	--exclude .perf --exclude .git \
	"$REPO_DIR/apps/capacitor" "$REPO_DIR/packages" "$REPO_DIR/package.json" "$COPY/"
mkdir -p "$COPY/apps" && mv "$COPY/capacitor" "$COPY/apps/capacitor"

for path in "${PATHS[@]}"; do
	target="$COPY/apps/capacitor/$path"
	if git -C "$REPO_DIR" cat-file -e "$REF:apps/capacitor/$path" 2>/dev/null; then
		git -C "$REPO_DIR" show "$REF:apps/capacitor/$path" >"$target"
	else
		rm -f "$target"
	fi
done

# Dependencies are linked, not copied. Workspace packages link relatively
# (@lesefluss/* -> ../../../../packages/*), so copying the link folders keeps
# them pointing into the copy; the root store is the original one.
ln -s "$REPO_DIR/node_modules" "$COPY/node_modules"
cp -a "$APP_DIR/node_modules" "$COPY/apps/capacitor/node_modules"
for pkg in "$REPO_DIR"/packages/*/; do
	name="$(basename "$pkg")"
	[ -d "$pkg/node_modules" ] && cp -a "$pkg/node_modules" "$COPY/packages/$name/node_modules"
done

(cd "$COPY/apps/capacitor" && npx vite build --outDir "$OUT/baseline-dist" --emptyOutDir)
echo "Baseline built: $OUT/baseline-dist"
