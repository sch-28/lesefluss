#!/bin/sh
set -e

echo "Applying database migrations..."
npx drizzle-kit migrate
echo "Database migrations up to date."

exec node .output/server/index.mjs
