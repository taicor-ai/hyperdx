#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: smoke-prod.sh <image-ref>}"
name="hdx-prod-smoke-$$"
cleanup() {
  docker rm -f "$name" "$name-mongo" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$name" >/dev/null
docker run -d --name "$name-mongo" --network "$name" --network-alias mongo mongo:5.0.32-focal >/dev/null
docker run -d --name "$name" --network "$name" -p 127.0.0.1::8080 \
  -e MONGO_URI=mongodb://mongo/hyperdx-smoke "$image" >/dev/null
port="$(docker port "$name" 8080/tcp | cut -d: -f2)"
for attempt in $(seq 1 90); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then
    echo '::error::Production image exited during startup'; exit 1
  fi
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then break; fi
  if [ "$attempt" = 90 ]; then echo '::error::Production image did not become healthy'; exit 1; fi
  sleep 2
done
curl -fsS "http://127.0.0.1:$port/login" >/dev/null
status="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/me")"
[ "$status" = 401 ] || { echo "::error::Unauthenticated API returned $status"; exit 1; }

# Check both copies after Yarn production focus and Next standalone tracing.
docker exec -i "$name" node <<'JS'
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
for (const root of ['/app/packages/api/build/index.js', '/app/packages/app/packages/app/server.js']) {
  const requireFrom = createRequire(root);
  for (const entry of ['zod', 'zod/v4']) {
    const { z } = requireFrom(entry);
    assert.equal(z.array(z.string()).max(1).safeParse([null, null]).error.issues.length, 1);
  }
}
JS
docker exec "$name" sh -c 'test ! -e /usr/local/include/node && test -z "$(find /app -path "*/@esbuild/*/bin/esbuild" -print -quit)"'
echo 'Production image health, frontend, authentication, patched validation and runtime contents passed.'
