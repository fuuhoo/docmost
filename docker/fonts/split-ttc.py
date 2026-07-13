#!/usr/bin/env python3
"""Split TTC font collections into standalone OTF files.

pdfkit/fontkit cannot embed TrueType Collections (TTC) directly, so we split
bundled Noto CJK TTC files into single-font OTF files. Only Simplified Chinese
(SC) variants are kept to keep the repository size reasonable.
"""
import os
from fontTools.ttLib import TTCollection

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, "otf")

TTC_FILES = [
    "NotoSansCJK-Regular.ttc",
    "NotoSansCJK-Bold.ttc",
    "NotoSerifCJK-Regular.ttc",
    "NotoSerifCJK-Bold.ttc",
]


def get_font_name(font) -> str | None:
    """Return the preferred font name from the name table."""
    name_table = font.get("name")
    if not name_table:
        return None
    # Try common name IDs: 4 (Full name), 1 (Family), 6 (PostScript)
    for name_id in (4, 1, 6):
        try:
            record = name_table.getName(name_id, 3, 1, 0x804)
            if record:
                return str(record)
        except Exception:
            pass
    return None


def is_simplified_chinese(name: str) -> bool:
    """Heuristic to keep only Simplified Chinese variants."""
    upper = name.upper()
    # Keep SC / SimplifiedChinese / CN variants; exclude TC, JP, KR, HK
    if "TC" in upper or "JP" in upper or "KR" in upper or "HK" in upper:
        return False
    return "SC" in upper or "SIMPLIFIED" in upper or "CN" in upper


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for ttc_name in TTC_FILES:
        ttc_path = os.path.join(SCRIPT_DIR, ttc_name)
        if not os.path.exists(ttc_path):
            print(f"Skipping {ttc_name}: not found")
            continue

        collection = TTCollection(ttc_path)
        for i, font in enumerate(collection):
            name = get_font_name(font) or f"{os.path.splitext(ttc_name)[0]}_{i}"
            if not is_simplified_chinese(name):
                print(f"Skipping {name} (not SC)")
                continue

            safe_name = name.replace(" ", "")
            out_path = os.path.join(OUT_DIR, f"{safe_name}.otf")
            font.save(out_path)
            print(f"Saved {out_path}")


if __name__ == "__main__":
    main()
