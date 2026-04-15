#!/bin/sh
set -e

echo "Pushing database schema..."
npx drizzle-kit push --force
echo "Database schema up to date."

exec node .output/server/index.mjs
