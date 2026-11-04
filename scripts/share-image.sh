#!/bin/sh
# Renders the share image (scripts/share-image.html → site/public/share.png,
# 1200 × 630, headless Chrome; set CHROME for another binary) and the
# home-screen icon (scripts/touch-icon.svg → site/public/touch-icon.png).
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files \
  --window-size=1200,630 --virtual-time-budget=5000 \
  --screenshot="$PWD/site/public/share.png" \
  "file://$PWD/scripts/share-image.html" 2>/dev/null
rsvg-convert scripts/touch-icon.svg -o site/public/touch-icon.png
echo "site/public/share.png site/public/touch-icon.png"
