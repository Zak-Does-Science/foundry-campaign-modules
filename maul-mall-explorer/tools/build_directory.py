#!/usr/bin/env python3
"""Build the players' Mall Directory (the in-game map, M key / directory signs) for each mall.

Usage:
    python tools/build_directory.py            # both malls
    python tools/build_directory.py galleria

Reads   assets/maps/<mall>_preview.png  (16 px/tile render; secret rooms and hidden doors are already masked)
        assets/maps/<mall>_layout.json  (floor offsets + map labels with their door/sign spots)
        data/malls/<mall>.json          (floor names)
        data/directory.json             ({mall: {"<label text>": {name, category, sells, src}}}; edit blurbs here)
Writes  assets/maps/directory/<mall>_<floor>.webp  (one image per floor)
        data/directory/<mall>.json                  (floors + pins the Foundry app draws)

Labels inside a secret area are left out. Rerun after render_mall.py or after editing data/directory.json.

Shop signs (17 Nov 2026): every store pin also gets `sign: {icon, x, y}` (floor-local wall cell beside its door) and
the sign sheets assets/sprites/signs/<theme>.png are rewritten; see tools/shop_signs.py for the rules and the
per-store overrides (`"sign": "<icon>"`, `"sign": false`, `"signAt": [x, y]` on a data/directory.json entry).
"""
import json
import os
import sys

from PIL import Image, ImageEnhance

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shop_signs  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TILE = 16
MALLS = ("galleria", "cogskill", "immia")
CATEGORY_ORDER = ["Clothing & Style", "Gear & Weapons", "Magic & Curios", "Food & Drink", "Mounts & Travel",
                  "Home & Gifts", "Fun & Games", "Services", "Arena", "Facilities"]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build(mid, blurbs, warn):
    layout = load(os.path.join(ROOT, "assets", "maps", f"{mid}_layout.json"))
    mall = load(os.path.join(ROOT, "data", "malls", f"{mid}.json"))
    names = {f["id"]: f.get("name", f["id"]) for f in mall["floors"]}
    src = Image.open(os.path.join(ROOT, "assets", "maps", f"{mid}_preview.png")).convert("RGB")
    out_img = os.path.join(ROOT, "assets", "maps", "directory")
    os.makedirs(out_img, exist_ok=True)
    texts = blurbs.get(mid, {})

    floors = []
    for fid, L in layout["floors"].items():
        if fid not in names:
            continue
        box = (L["ox"] * TILE, L["oy"] * TILE, (L["ox"] + L["w"]) * TILE, (L["oy"] + L["h"]) * TILE)
        img = src.crop(box)
        img = ImageEnhance.Brightness(ImageEnhance.Color(img).enhance(0.75)).enhance(0.8)   # pins pop on a muted map
        rel = f"assets/maps/directory/{mid}_{fid}.webp"
        img.save(os.path.join(ROOT, rel), "WEBP", quality=88, method=6)
        floors.append({"id": fid, "name": names[fid], "img": rel, "w": L["w"], "h": L["h"]})
    order = [f["id"] for f in mall["floors"]]
    floors.sort(key=lambda f: order.index(f["id"]))

    signs = shop_signs.signs_for_mall(mall, layout, texts, warn)
    pins = []
    taken = set()
    for lab in layout.get("labels", []):
        if lab.get("area"):
            continue                                   # inside a secret area: not on the public directory
        text = lab["text"]
        info = texts.get(text)
        if not info:
            warn.append(f"{mid}: no directory entry for label {text!r} ({lab['floor']})")
            info = {}
        x, y = lab["x"], lab["y"]                      # where the store's name sits: inside its room
        if (x, y) in taken:                            # two labels on one spot: fall back to the door / sign
            x, y = (lab["door"] if lab.get("door") else (lab.get("signX", x), lab.get("signY", y)))
        taken.add((x, y))
        cat = info.get("category") or "Facilities"
        if cat not in CATEGORY_ORDER:
            warn.append(f"{mid}: {text!r} has unknown category {cat!r}")
        pin = {
            "floor": lab["floor"], "x": x, "y": y, "label": text, "unit": lab.get("unit"),
            "name": info.get("name") or text.title(), "category": cat, "sells": info.get("sells", ""),
        }
        if (lab["floor"], text) in signs:
            pin["sign"] = signs[(lab["floor"], text)]
        pins.append(pin)
    out = {"mall": mid, "name": mall.get("name", mid), "tilePx": TILE, "categories": CATEGORY_ORDER,
           "floors": floors, "pins": pins}
    os.makedirs(os.path.join(ROOT, "data", "directory"), exist_ok=True)
    with open(os.path.join(ROOT, "data", "directory", f"{mid}.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{mid}: {len(floors)} floors, {len(pins)} pins, {len(signs)} shop signs")
    return mall.get("theme", mid)


def main(argv):
    mids = argv or MALLS
    blurbs = load(os.path.join(ROOT, "data", "directory.json"))
    warn = []
    themes = []
    for mid in mids:
        themes.append(build(mid, blurbs, warn))
    for mid in MALLS:                                  # sheets for every mall's theme, even when building one
        if mid not in mids:
            try:
                themes.append(load(os.path.join(ROOT, "data", "malls", f"{mid}.json")).get("theme", mid))
            except OSError:
                pass
    shop_signs.write_sheets(themes)
    for w in warn:
        print("WARN", w)


if __name__ == "__main__":
    main(sys.argv[1:])
