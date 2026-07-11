#!/bin/sh
# Download Noto Sans CJK SC OTF fonts for PDF CJK rendering.
# pdfkit cannot embed TTC (TrueType Collections), so we use the OTF single fonts.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_URL="https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese"

mkdir -p "$SCRIPT_DIR"

echo "Downloading NotoSansCJKsc-Regular.otf..."
wget -qO "$SCRIPT_DIR/NotoSansCJKsc-Regular.otf" \
    "$BASE_URL/NotoSansCJKsc-Regular.otf"

echo "Downloading NotoSansCJKsc-Bold.otf..."
wget -qO "$SCRIPT_DIR/NotoSansCJKsc-Bold.otf" \
    "$BASE_URL/NotoSansCJKsc-Bold.otf"

echo "Fonts downloaded to $SCRIPT_DIR"
