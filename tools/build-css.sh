#!/usr/bin/env bash
# Tailwind utilitalarini build qiladi va qo'lda yozilgan stillarni (css/account.css,
# css/pwa.css) oxiriga qo'shadi. Natija: css/app.css
#
# Ishlatish:  bash tools/build-css.sh
set -euo pipefail

cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Tailwind build..."
npx tailwindcss -i input.css -o "$TMP/tw.css" --minify

echo "→ Qo'lda yozilgan stillarni qo'shish..."
{
  cat "$TMP/tw.css"
  echo
  cat css/account.css
  echo
  cat css/pwa.css
} > "$TMP/app.css"

mv "$TMP/app.css" css/app.css
echo "✓ css/app.css yangilandi ($(wc -c < css/app.css) bayt)"
