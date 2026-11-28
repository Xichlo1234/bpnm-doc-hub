#!/usr/bin/env bash
# Run the actual Workers Static Assets router locally against both built directories.
set -euo pipefail
scratch=$(mktemp -d)
pid=
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" || true; fi
}
trap cleanup EXIT
for tenant in bpnm document-manage; do
  args=()
  if [[ "$tenant" == document-manage ]]; then args=(--env document-manage); fi
  node node_modules/wrangler/bin/wrangler.js dev --local "${args[@]}" --ip 127.0.0.1 --port 8976 \
    --local-upstream "$tenant.tungcv.vn" --persist-to "$scratch/state" >"$scratch/worker.log" 2>&1 &
  pid=$!
  base=http://127.0.0.1:8976
  if ! curl -fsS --retry 20 --retry-delay 1 --retry-connrefused "$base/.well-known/assetlinks.json" -o "$scratch/links"; then
    cat "$scratch/worker.log"; exit 1
  fi
  release="android/$tenant/release.json"
  jq -e --slurpfile r "$release" 'length == 1 and .[0].target.package_name == $r[0].packageName and .[0].target.sha256_cert_fingerprints == [$r[0].certificate]' "$scratch/links"
  curl -fsS -H 'Sec-Fetch-Mode: navigate' "$base/.well-known/assetlinks.json" | cmp - "$scratch/links"
  curl -fsS -D "$scratch/headers" "$base/downloads/android.apk" -o "$scratch/app.apk"
  grep -iq '^content-type: application/vnd.android.package-archive' "$scratch/headers"
  cmp "$scratch/app.apk" "android/$tenant/$tenant.apk"
  cleanup
  pid=
done
