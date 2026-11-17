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
dependencies="$(node -p 'JSON.stringify(Object.keys(require("./packages/common-utils/package.json").dependencies))')"
docker exec -i -e COMMON_RUNTIME_DEPENDENCIES="$dependencies" "$name" node <<'JS'
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
for (const root of ['/app/packages/api/build/index.js', '/app/packages/app/packages/app/server.js']) {
  const requireFrom = createRequire(root);
  for (const dependency of JSON.parse(process.env.COMMON_RUNTIME_DEPENDENCIES)) {
    requireFrom.resolve(dependency);
  }
  for (const entry of ['zod', 'zod/v4']) {
    const { z } = requireFrom(entry);
    assert.equal(z.array(z.string()).max(1).safeParse([null, null]).error.issues.length, 1);
  }
}
JS

# Exercise the Jaeger security exception through each shipped SDK, with no exporters or network.
for root in /app/packages/api/build/index.js /app/packages/app/packages/app/server.js; do
  for mode in jaeger default; do
    docker run --rm -i --network none --entrypoint node \
      -e OTEL_TRACES_EXPORTER=none -e OTEL_METRICS_EXPORTER=none -e OTEL_LOGS_EXPORTER=none \
      "$image" - "$root" "$mode" <<'JS'
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
require('node:net').Socket.prototype.connect = () => { throw new Error('Unexpected network attempt'); };
const [root, mode] = process.argv.slice(2);
if (mode === 'jaeger') process.env.OTEL_PROPAGATORS = 'jaeger';
else delete process.env.OTEL_PROPAGATORS;
const app = createRequire(root);
const hyperdx = createRequire(app.resolve('@hyperdx/node-opentelemetry'));
const sdkRequire = createRequire(hyperdx.resolve('@opentelemetry/sdk-node'));
const api = sdkRequire('@opentelemetry/api');
const { NodeSDK } = hyperdx('@opentelemetry/sdk-node');
const sdk = new NodeSDK({ autoDetectResources: false, instrumentations: [] });
const traceId = '0123456789abcdef0123456789abcdef';
const spanId = '0123456789abcdef';
const validJaeger = `${traceId}:${spanId}:0:01`;
const extract = carrier => api.propagation.extract(api.ROOT_CONTEXT, carrier);
async function check() {
  sdk.start();
  if (mode === 'jaeger') {
    const valid = extract({ 'uber-trace-id': validJaeger, 'uberctx-tenant': 'synthetic%20tenant' });
    assert.equal(api.trace.getSpanContext(valid)?.traceId, traceId);
    assert.equal(api.propagation.getBaggage(valid)?.getEntry('tenant')?.value, 'synthetic tenant');
    const carrier = {};
    api.propagation.inject(valid, carrier);
    assert.equal(carrier['uber-trace-id'], validJaeger);
    assert.equal(carrier['uberctx-tenant'], 'synthetic%20tenant');
    const invalidTrace = extract({ 'uber-trace-id': '%', 'uberctx-tenant': 'synthetic' });
    assert.equal(api.trace.getSpanContext(invalidTrace), undefined);
    assert.equal(api.propagation.getBaggage(invalidTrace)?.getEntry('tenant')?.value, 'synthetic');
    for (const trace of [validJaeger, '%']) {
      const invalidBaggage = extract({ 'uber-trace-id': trace, 'uberctx-tenant': '%' });
      assert.equal(api.trace.getSpanContext(invalidBaggage)?.traceId, trace === '%' ? undefined : traceId);
      assert.equal(api.propagation.getBaggage(invalidBaggage)?.getEntry('tenant'), undefined);
    }
  } else {
    const valid = extract({ traceparent: `00-${traceId}-${spanId}-01`, baggage: 'tenant=synthetic',
      'uber-trace-id': '%', 'uberctx-other': '%' });
    assert.equal(api.trace.getSpanContext(valid)?.traceId, traceId);
    assert.equal(api.propagation.getBaggage(valid)?.getEntry('tenant')?.value, 'synthetic');
    assert.equal(api.propagation.getBaggage(valid)?.getEntry('other'), undefined);
    assert.deepEqual(api.propagation.fields().sort(), ['baggage', 'traceparent', 'tracestate']);
  }
  await sdk.shutdown();
  console.log(`Production SDK propagation passed: ${root}, ${mode}`);
}
check().catch(error => { console.error(error); process.exitCode = 1; });
JS
  done
done
docker exec "$name" sh -c 'test ! -e /usr/local/include/node' || { echo '::error::Node build headers remain in the image'; exit 1; }
build_content="$(docker exec "$name" find /app \( \
  -path '*/next/dist/server/lib/router-utils/setup-dev-bundler.js' -o \
  -path '*/@esbuild/*/bin/esbuild' -o \
  -path '*/serialize-javascript/package.json' \) -print -quit)"
[ -z "$build_content" ] || { echo "::error::Build-only content remains at $build_content"; exit 1; }
echo 'Production image health, frontend, authentication, patched validation and runtime contents passed.'
