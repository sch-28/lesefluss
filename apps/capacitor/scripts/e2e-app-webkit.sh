#!/bin/sh
# The e2e-app WebKit project on a host that can't launch Playwright's WebKit:
# the browser runs in Playwright's Docker image (same version as the repo's
# @playwright/test), the tests and the app server on the host. --network host
# lets the container's browser reach the server on localhost.
set -eu
cd "$(dirname "$0")/.."
REPO=$(cd ../.. && pwd)
VERSION=$(node -p "require('@playwright/test/package.json').version")
PORT=${E2E_WEBKIT_PORT:-3419}
NAME="lesefluss-e2e-webkit-$$"

docker run -d --rm --init --name "$NAME" --network host \
	-v "$REPO:$REPO:ro" -w "$REPO/apps/capacitor" \
	"mcr.microsoft.com/playwright:v$VERSION-noble" \
	node node_modules/@playwright/test/cli.js run-server --port "$PORT" --host 127.0.0.1 >/dev/null
trap 'docker stop "$NAME" >/dev/null 2>&1 || true' EXIT
trap 'exit 130' INT TERM

tries=0
until node -e "require('net').connect($PORT, '127.0.0.1').on('connect', () => process.exit(0)).on('error', () => process.exit(1))"; do
	tries=$((tries + 1))
	if [ "$tries" -ge 60 ]; then
		echo "Playwright server in $NAME did not start" >&2
		docker logs "$NAME" >&2 || true
		exit 1
	fi
	sleep 0.5
done

E2E_WEBKIT_WS="ws://127.0.0.1:$PORT/" pnpm exec playwright test -c playwright.app.config.ts --project=webkit "$@"
