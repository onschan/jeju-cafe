#!/usr/bin/env bash
# Galmuri (OFL-1.1) https://github.com/quiple/galmuri — v2.40.4 릴리스에서 Galmuri11 woff2와 라이선스만 추출
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
VERSION="${GALMURI_VERSION:-2.40.4}"
curl -fsSL -o "$TMP/galmuri.zip" "https://github.com/quiple/galmuri/releases/download/v${VERSION}/Galmuri-v${VERSION}.zip"
mkdir -p "$ROOT/public/fonts"
unzip -q -o "$TMP/galmuri.zip" -d "$TMP/g"
find "$TMP/g" -iname 'Galmuri11.woff2' -exec cp {} "$ROOT/public/fonts/Galmuri11.woff2" \;
find "$TMP/g" -iname 'Galmuri11-Bold.woff2' -exec cp {} "$ROOT/public/fonts/Galmuri11-Bold.woff2" \;
find "$TMP/g" \( -iname 'LICENSE*' -o -iname 'OFL*' \) -print -quit | xargs -I{} cp {} "$ROOT/public/fonts/LICENSE-Galmuri.txt"
[ -f "$ROOT/public/fonts/Galmuri11.woff2" ] || { echo "Galmuri11.woff2 not found in zip" >&2; unzip -l "$TMP/galmuri.zip" >&2; exit 1; }
ls -la "$ROOT/public/fonts"
