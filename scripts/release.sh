#!/usr/bin/env bash
# Bump the app version in .env.deploy and package.json files.
#
# Usage:
#   scripts/release.sh 1.1.0
#
# What it does:
#   1. Increments VERSION_CODE by 1 in apps/capacitor/.env.deploy (gitignored).
#   2. Sets VERSION_NAME to the provided version in apps/capacitor/.env.deploy.
#   3. Updates "version" in package.json (root) and apps/capacitor/package.json.
#
# It does not commit, tag, or push. The script prints the next steps.

set -euo pipefail

VERSION="${1:-}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Usage: $0 <semver>   e.g. $0 1.1.0"
	exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

ENV_FILE="apps/capacitor/.env.deploy"
ROOT_PKG="package.json"
APP_PKG="apps/capacitor/package.json"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "Missing $ENV_FILE. Run from a checkout that has it."
	exit 1
fi

CURRENT_CODE=$(grep -E '^VERSION_CODE=' "$ENV_FILE" | cut -d= -f2)
if [[ ! "$CURRENT_CODE" =~ ^[0-9]+$ ]]; then
	echo "Could not read current VERSION_CODE from $ENV_FILE (got: '$CURRENT_CODE')"
	exit 1
fi
NEW_CODE=$(( CURRENT_CODE + 1 ))

sed -i "s/^VERSION_NAME=.*/VERSION_NAME=$VERSION/" "$ENV_FILE"
sed -i "s/^VERSION_CODE=.*/VERSION_CODE=$NEW_CODE/" "$ENV_FILE"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT_PKG" "$APP_PKG"

BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo
echo "✓ Bumped to v$VERSION (versionCode $NEW_CODE)"
echo "  $ENV_FILE  (gitignored)"
echo "  $ROOT_PKG"
echo "  $APP_PKG"
echo
echo "Next:"
echo "  git add $ROOT_PKG $APP_PKG"
echo "  git commit -m \"chore: release v$VERSION\""
echo "  git tag v$VERSION"
echo "  git push origin $BRANCH && git push origin v$VERSION"
