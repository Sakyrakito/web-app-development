#!/usr/bin/env bash
# Usage: ./run-lighthouse.sh <slug> <url>
# Runs Lighthouse 3x mobile + 3x desktop and saves HTML+JSON reports to <slug>/evidence/lighthouse/.
# Three runs per form factor because Lighthouse scores vary between runs; the report uses the median.
set -euo pipefail

slug=$1 url=$2
out="$(dirname "$0")/$slug/evidence/lighthouse"
mkdir -p "$out"

{
  date --iso-8601=seconds
  google-chrome --version
  echo "DNS: Chrome secure DNS (DoH) via https://cloudflare-dns.com/dns-query"
} > "$out/conditions.txt"

# Each run gets a fresh profile whose only setting is DoH, so results don't depend on
# the system resolver (some resolvers filter analytics domains). chrome-launcher appends
# --chrome-flags after its own --user-data-dir, and Chrome honours the last occurrence.
run() {
  local name=$1; shift
  local profile attempt
  # Ad-heavy pages open and close iframes fast enough that Lighthouse occasionally loses a
  # target mid-run ("Session with given id not found"); a retry gets a clean run.
  for attempt in 1 2 3; do
    profile=$(mktemp -d)
    echo '{"dns_over_https":{"mode":"secure","templates":"https://cloudflare-dns.com/dns-query"}}' > "$profile/Local State"
    if npx -y lighthouse@13.5.0 "$url" --quiet \
      --chrome-flags="--headless=new --user-data-dir=$profile" \
      --output=json --output=html --output-path="$out/$name" "$@"; then
      rm -rf "$profile"
      return 0
    fi
    rm -rf "$profile"
    echo "$name: attempt $attempt failed" >&2
  done
  return 1
}

for n in 1 2 3; do
  run "mobile-$n" --form-factor=mobile
  run "desktop-$n" --preset=desktop
done
ls "$out"
