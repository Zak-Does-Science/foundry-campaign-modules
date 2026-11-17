#!/usr/bin/env python3
"""Shop signs: little 8-bit hanging boards beside store doors showing what's sold inside (17 Nov 2026).

Used by tools/build_directory.py, which adds a `sign` ({icon, x, y}, floor-local) to every store pin in
data/directory/<mall>.json and writes the sign sheets. scripts/signs.js draws them in Foundry.

Which pins get a sign: category not Facilities / Arena, label not "WC", and `"sign": false` not set on the
store's entry in data/directory.json. Icon: the entry's `"sign": "<icon>"`, else a keyword guess from the store's
name + blurb, else the category default. Position: `"signAt": [x, y]` (floor-local) on the entry, else a wall or
window cell beside the store's door (never the door, never the unit plaque, never a walkable cell).

Writes  assets/sprites/signs/<theme>.png   one 16x16 frame per icon, side by side, board colours from the theme
        assets/sprites/signs/index.json    {"icons": [...], "frame": 16}

Usage:  python tools/shop_signs.py                 sign sheets only (build_directory.py also writes them)
        python tools/shop_signs.py --preview OUT   also an icon contact sheet + every mall's preview map with its
                                                   signs painted on, into OUT/ (to check placement by eye)
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from pixcore import hx  # noqa: E402
from mall_tiles import PALETTES  # noqa: E402

FRAME = 16
SIGN_DIR = os.path.join(ROOT, "assets", "sprites", "signs")

# ------------------------------------------------------------------ icon art (10x10, '.' = board shows through)
COL = {
    "K": "#1a1420", "W": "#ffffff", "s": "#d8e0ea", "S": "#8a9aae", "d": "#4a5468",
    "b": "#9a6230", "B": "#5a3418", "g": "#f0c040", "G": "#b07818", "r": "#e04040", "R": "#8a1e2a",
    "o": "#f08a2a", "y": "#ffe066", "l": "#7ad860", "e": "#2f8a3a", "c": "#5ad8f0", "C": "#3a6ad8",
    "p": "#ff8ac8", "P": "#c04a8a", "v": "#9a5ad8", "V": "#5a2a8a", "n": "#fff4d8", "m": "#d8a868",
}

ICONS = {
    "sword": [
        "....KK....",
        "...KWsK...",
        "...KsSK...",
        "...KsSK...",
        "...KsSK...",
        "...KsSK...",
        ".KKKsSKKK.",
        ".KggggggK.",
        ".KKKbbKKK.",
        "...KggK...",
    ],
    "sword-shield": [
        "....KK....",
        "KKKKWsKKKK",
        "KcCKsSKCCK",
        "KcCKsSKCCK",
        "KcKggggKCK",
        "KcCKbbKCCK",
        ".KcKbbKCK.",
        ".KcCKKCCK.",
        "..KCCCCK..",
        "...KKKK...",
    ],
    "armour": [
        ".KKK..KKK.",
        "KSsSKKSsSK",
        "KSssssssSK",
        ".KSsWsssK.",
        ".KSsWssSK.",
        ".KSsssSSK.",
        ".KbbbgbbK.",
        ".KSsssSSK.",
        ".KSsssSSK.",
        "..KKKKKK..",
    ],
    "arrows": [
        "KK......KK",
        "KrK....KrK",
        ".KbK..KbK.",
        "..KbKKbK..",
        "...KbbK...",
        "...KbbK...",
        "..KbKKbK..",
        ".KsK..KsK.",
        "KsSK..KSsK",
        "KKK....KKK",
    ],
    "target": [
        "..KKKKKK..",
        ".KWWWWWWK.",
        "KWrrrrrrWK",
        "KWrWWWWrWK",
        "KWrWrrWrWK",
        "KWrWrrWrWK",
        "KWrWWWWrWK",
        "KWrrrrrrWK",
        ".KWWWWWWK.",
        "..KKKKKK..",
    ],
    "potion": [
        "...KKKK...",
        "...KbbK...",
        "...KWcK...",
        "..KWcccK..",
        ".KcWccccK.",
        "KrWrrrrrRK",
        "KrWrrrrrRK",
        "KrrrrrrRRK",
        ".KRRRRRRK.",
        "..KKKKKK..",
    ],
    "mug": [
        ".KKKKKKK..",
        ".KWWWWWK..",
        ".KgggggKKK",
        ".KgyggyK.K",
        ".KgggygK.K",
        ".KgyggyK.K",
        ".KgggggKKK",
        ".KgygggK..",
        ".KGGGGGK..",
        ".KKKKKKK..",
    ],
    "bowl": [
        "...s..s...",
        "..s..s....",
        "...s..s...",
        "KKKKKKKKKK",
        "KoyoloyoyK",
        "KCCCCCCCCK",
        ".KCcCCCCK.",
        ".KCCCCCCK.",
        "..KKKKKK..",
        "...KKKK...",
    ],
    "meat": [
        "....KKKK..",
        "...KobbbK.",
        "..KobbbbbK",
        "..KbbbbbBK",
        "..KbbbbBK.",
        ".KKbBBBK..",
        ".KWKKKK...",
        "KWWK......",
        "KWK.......",
        ".K........",
    ],
    "banana": [
        "........KK",
        ".......KbK",
        "......KyK.",
        "K....KyyK.",
        "KK..KyyyK.",
        "KyKKyyyGK.",
        ".KyyyyGK..",
        "..KyyGGK..",
        "...KKKK...",
        "..........",
    ],
    "pie": [
        "..........",
        "...KKKK...",
        ".KKmmmmKK.",
        "KmRmRmRmmK",
        "KmmmmmmmmK",
        "KmRmRmRmmK",
        "KGGGGGGGGK",
        ".KbbbbbbK.",
        "..KKKKKK..",
        "..........",
    ],
    "chili": [
        ".......KK.",
        "......KeK.",
        "....KKeeK.",
        "...KrrKK..",
        "..KrWrrK..",
        ".KrWrrRK..",
        ".KrrrRK...",
        "KrrrRK....",
        "KrRRK.....",
        ".KKK......",
    ],
    "cake": [
        "....KK....",
        "...KrrK...",
        "..KKKKKK..",
        ".KWWpWWWK.",
        "KWpWWWpWWK",
        "KKKKKKKKKK",
        ".KmbmbmbK.",
        ".KmbmbmbK.",
        "..KmbmbK..",
        "..KKKKKK..",
    ],
    "skewer": [
        "....KK....",
        "...KrrK...",
        "...KrRK...",
        "...KllK...",
        "...KeeK...",
        "...KooK...",
        "...KbbK...",
        "...KrRK...",
        "....KbK...",
        ".....K....",
    ],
    "fish": [
        "..........",
        "..........",
        "..KKKKK...",
        ".KCCCCCK.K",
        "KCWKCCCKCK",
        "KCCCCCCCCK",
        ".KcccccK.K",
        "..KKKKK...",
        "..........",
        "..........",
    ],
    "leaf": [
        ".....KKKKK",
        "...KKllllK",
        "..KlllleeK",
        ".KlllleleK",
        ".KllleleK.",
        "KlllelleK.",
        "KlleellK..",
        "KleelKK...",
        "KeKKK.....",
        "K.........",
    ],
    "shirt": [
        "..KK..KK..",
        ".KrrKKrrK.",
        "KrrrrrrrrK",
        "KrrrrrrrRK",
        "KKKrrrrKKK",
        "..KrrrrK..",
        "..KrrrrK..",
        "..KrrrRK..",
        "..KrrRRK..",
        "..KKKKKK..",
    ],
    "boot": [
        "..KKKK....",
        "..KbbK....",
        "..KbbK....",
        "..KbbK....",
        "..KbbK....",
        "..KbbbK...",
        "..KbbbbKK.",
        "..KbbbbbbK",
        "..KBBBBBBK",
        "..KKKKKKKK",
    ],
    "soap": [
        ".......KK.",
        "...KK.KWcK",
        "..KWcK.KK.",
        "...KK.....",
        ".KKKKKKKK.",
        "KWWWsWWWWK",
        "KppWpppppK",
        "KppppppppK",
        "KPPPPPPPPK",
        ".KKKKKKKK.",
    ],
    "gem": [
        "..........",
        "..KKKKKK..",
        ".KWcccCcK.",
        "KKKKKKKKKK",
        "KcWcccCCCK",
        ".KcWccCCK.",
        "..KcccCK..",
        "...KcCK...",
        "....KK....",
        "..........",
    ],
    "gear": [
        "KK.KggK.KK",
        "KgKggggKgK",
        ".KggGGggK.",
        "KggGKKGggK",
        "KggK..KggK",
        "KggK..KggK",
        "KggGKKGggK",
        ".KggGGggK.",
        "KgKggggKgK",
        "KK.KggK.KK",
    ],
    "horse": [
        "....K.K...",
        "...KbKbK..",
        "..KbbbbBK.",
        ".KbKbbbBBK",
        "KbbbbbbBBK",
        "KbbbbbbBBK",
        ".KKKKbbBBK",
        "....KbbbBK",
        "....KbbbbK",
        "....KKKKKK",
    ],
    "compass": [
        "..KKKKKK..",
        ".KgggggGK.",
        "KgWWWWWrGK",
        "KgWWWWrrGK",
        "KgWWKKrWGK",
        "KgWsKKWWGK",
        "KgssWWWWGK",
        "KgsWWWWWGK",
        ".KgggggGK.",
        "..KKKKKK..",
    ],
    "masks": [
        ".KKKKKKKK.",
        "KyyyyyyyyK",
        "KyKKyyKKyK",
        "KyyyyyyyyK",
        "KyKyyyyKyK",
        "KyyKKKKyyK",
        ".KyyyyyyK.",
        "..KyyyyK..",
        "...KKKK...",
        "..........",
    ],
    "dice": [
        ".KKKKKKKK.",
        "KrrrrrrrrK",
        "KrWWrrrrrK",
        "KrWWrrrrrK",
        "KrrrWWrrrK",
        "KrrrWWrrrK",
        "KrrrrrWWrK",
        "KrrrrrWWrK",
        "KRrrrrrrRK",
        ".KKKKKKKK.",
    ],
    "scroll": [
        ".KKKKKKK..",
        "KmnnnnnnK.",
        ".KnKKKKnK.",
        ".KnnnnnnK.",
        ".KnKKKnnK.",
        ".KnnnnnnK.",
        ".KnKKKKnK.",
        ".KnnnnnnK.",
        "..KnnnnnmK",
        "..KKKKKKK.",
    ],
    "anvil": [
        "..y....y..",
        "...y..y...",
        "KKKKKKKKKK",
        "KsssssssSK",
        "..KKSSSSK.",
        "....KSSK..",
        "....KSSK..",
        "...KSSSSK.",
        "..KSSSSSSK",
        "..KKKKKKKK",
    ],
    "candle": [
        "....KK....",
        "...KyyK...",
        "...KyoK...",
        "...KKKK...",
        "..KWWWnK..",
        "..KWnWnK..",
        "..KWWWnK..",
        "..KWWWnK..",
        "KKKKKKKKKK",
        "KGggggggGK",
    ],
    "skull": [
        "..KKKKKK..",
        ".KWWWWWWK.",
        "KWWWWWWWWK",
        "KWKKWWKKWK",
        "KWKKWWKKWK",
        "KWWWKKWWWK",
        ".KWWWWWWK.",
        "..KWKWKWK.",
        "...KKKKK..",
        "..........",
    ],
    "star": [
        "....KK....",
        "...KyyK...",
        "KKKKyyKKKK",
        "KyyyyyyyyK",
        ".KyyyyyyK.",
        "..KyyyyK..",
        ".KyyyyyyK.",
        ".KyyKKyyK.",
        "KyyK..KyyK",
        "KK......KK",
    ],
    "mortar": [
        ".......KK.",
        "......KbbK",
        ".....KbbK.",
        "....KbbK..",
        "KKKKKKKKKK",
        "KSllelleSK",
        ".KSssssSK.",
        ".KSSSSSSK.",
        "..KSSSSK..",
        "..KKKKKK..",
    ],
    "gift": [
        "..KK..KK..",
        ".KrrKKrrK.",
        "..KKrrKK..",
        "KKKKrrKKKK",
        "KCCCrrCCCK",
        "KKKKrrKKKK",
        ".KCCrrCCK.",
        ".KCCrrCCK.",
        ".KCCrrCCK.",
        ".KKKKKKKK.",
    ],
    "kettle": [
        "..KKKKK...",
        ".K.....K..",
        ".K.KsK.K..",
        "..KKKKK...",
        ".KrWrrrKKK",
        "KrWrrrrrrK",
        "KrrrrrrrK.",
        "KRrrrrrRK.",
        ".KRRRRRK..",
        "..KKKKK...",
    ],
}

# Category defaults (data/directory.json categories)
CATEGORY_ICON = {
    "Clothing & Style": "shirt", "Gear & Weapons": "sword-shield", "Magic & Curios": "potion",
    "Food & Drink": "bowl", "Mounts & Travel": "horse", "Home & Gifts": "gift", "Fun & Games": "dice",
    "Services": "scroll",
}
NON_STORE = {"Facilities", "Arena"}

# Keyword guesses for stores without an explicit icon (first match wins; checked against name + blurb)
KEYWORDS = [
    (r"\bammo|arrow|bolts?\b|bullet|sling", "arrows"),
    (r"target|range\b|archery", "target"),
    (r"sword|blade|axe|melee|weapon", "sword"),
    (r"armou?r|shield|leather", "armour"),
    (r"potion|alchem|elixir|poison", "potion"),
    (r"reagent|herbal|apothec", "mortar"),
    (r"\bale\b|brew|grog|coffee|tea\b|smoothie|shake|drink|tavern|\bbar\b", "mug"),
    (r"bana[nñ]on", "banana"),
    (r"spicy|chil[il]|pepper", "chili"),
    (r"cake|bakery|sweets", "cake"),
    (r"\bpies?\b|tart|bread", "pie"),
    (r"skewer|on a stick", "skewer"),
    (r"roast|ribs|meat|grill|bbq", "meat"),
    (r"\bsea cuisine|fish(?!ing)|sushi|seafood", "fish"),
    (r"salad|herbivor|veg|grass", "leaf"),
    (r"boot|shoe|footwear|footlocker", "boot"),
    (r"\bsoap|suds|bath", "soap"),
    (r"crystal|gem|jewel", "gem"),
    (r"gadget|gizmo|clockwork|motor|machin|tech", "gear"),
    (r"mount|stable|saddle|steed", "horse"),
    (r"chart|compass|navigat|map", "compass"),
    (r"fishing|bait|hook|lure|surf", "fish"),
    (r"theatre|theater|stage|show", "masks"),
    (r"arcade|game|toy", "dice"),
    (r"smith|repair|forge|sharpen", "anvil"),
    (r"faith|candle|shrine|prayer", "candle"),
    (r"dark arts|skull|cursed|necro", "skull"),
    (r"star|astrolog|fae", "star"),
    (r"kettle|home|hearth", "kettle"),
    (r"gift|perfume", "gift"),
]

WALLISH = set("#w")                      # cells a sign can hang on beside a door
SIGNABLE = set("#wS=kx")                 # cells a door-less department sign can stand on
WALKABLE = set(".,:\"c+^vo")             # scripts/grid.js WALKABLE


def is_store(label, info):
    if info.get("sign") is False:
        return False
    if (info.get("category") or "Facilities") in NON_STORE:
        return False
    return str(label.get("unit") or "").upper() != "WC"


def choose_icon(info):
    s = info.get("sign")
    if isinstance(s, str) and s in ICONS:
        return s
    text = f"{info.get('name', '')} {info.get('sells', '')}".lower()
    for pat, icon in KEYWORDS:
        if re.search(pat, text):
            return icon
    return CATEGORY_ICON.get(info.get("category"), "gift")


class FloorCells:
    """Floor-local grid plus cells a sign must never use (interactables, props, reveals, secret areas)."""

    def __init__(self, mall, fid):
        f = next(fl for fl in mall["floors"] if fl["id"] == fid)
        self.grid = f.get("grid", [])
        self.busy = set()
        for ia in mall.get("interactables", []):
            if ia.get("floor") == fid:
                self.busy.add((ia.get("x"), ia.get("y")))
                for r in (ia.get("hidden") or {}).get("reveal", []) or []:
                    self.busy.add((r.get("x"), r.get("y")))
        for p in mall.get("props", []):
            if p.get("floor") == fid:
                self.busy.add((p.get("x"), p.get("y")))
        for a in mall.get("secretAreas", []):
            if a.get("floor") != fid:
                continue
            for r in a.get("rects", []):
                for yy in range(r["y"] - 1, r["y"] + r["h"] + 1):          # and a 1-cell margin round it
                    for xx in range(r["x"] - 1, r["x"] + r["w"] + 1):
                        self.busy.add((xx, yy))

    def at(self, x, y):
        if y < 0 or y >= len(self.grid) or x < 0 or x >= len(self.grid[y]):
            return " "
        return self.grid[y][x]

    def walk(self, x, y):
        return self.at(x, y) in WALKABLE


def _ok(cells, x, y, used, chars, outside=None):
    if (x, y) in used or (x, y) in cells.busy or cells.at(x, y) not in chars:
        return False
    if outside:                                     # must face the corridor side of the door
        return cells.walk(x + outside[0], y + outside[1])
    return any(cells.walk(x + dx, y + dy) for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)))


def place(label, cells, used):
    """Floor-local (x, y) for a store's sign, or None."""
    lx, ly = label["x"], label["y"]
    door = label.get("door")
    if door:
        dx0, dy0 = door
        ns = cells.walk(dx0, dy0 - 1) and cells.walk(dx0, dy0 + 1)
        ew = cells.walk(dx0 - 1, dy0) and cells.walk(dx0 + 1, dy0)
        if ns and not ew:        # wall runs east-west: signs go left/right of the door
            axis, inside = (1, 0), (0, -1 if ly < dy0 else 1)
            toward = -1 if lx < dx0 else (1 if lx > dx0 else 0)
        elif ew and not ns:      # wall runs north-south
            axis, inside = (0, 1), (-1 if lx < dx0 else 1, 0)
            toward = -1 if ly < dy0 else (1 if ly > dy0 else 0)
        else:
            axis, inside, toward = None, None, 0
        if axis:
            outside = (-inside[0], -inside[1])
            if toward == 0 and label.get("plaque"):          # go the other way from the unit plaque
                px_, py_ = label["signX"] - dx0, label["signY"] - dy0
                toward = -1 if (px_ * axis[0] + py_ * axis[1]) > 0 else 1
            toward = toward or 1
            for d in (1, 2):
                for side in (toward, -toward):
                    x, y = dx0 + axis[0] * d * side, dy0 + axis[1] * d * side
                    if _ok(cells, x, y, used, WALLISH, outside):
                        return x, y
        # odd door (corner, double door): any wall cell next to it that touches the floor
        for r in (1, 2):
            for y in range(dy0 - r, dy0 + r + 1):
                for x in range(dx0 - r, dx0 + r + 1):
                    if (x == dx0 or y == dy0) and _ok(cells, x, y, used, WALLISH):
                        return x, y
    # no door: beside the plaque, else the nearest wall / shelf / counter near the label point
    ax, ay = (label["signX"], label["signY"]) if label.get("plaque") else (lx, ly)
    best = None
    for r in range(1, 4):
        for y in range(ay - r, ay + r + 1):
            for x in range(ax - r, ax + r + 1):
                if max(abs(x - ax), abs(y - ay)) != r or not _ok(cells, x, y, used, SIGNABLE):
                    continue
                score = (abs(x - ax) + abs(y - ay), 0 if cells.at(x, y) in WALLISH else 1)
                if best is None or score < best[0]:
                    best = (score, (x, y))
        if best:
            return best[1]
    return None


def signs_for_mall(mall, layout, blurbs, warn):
    """{(floor, label text): {icon, x, y}} for every store label in the layout."""
    out = {}
    used_by_floor = {}
    for lab in layout.get("labels", []):            # unit plaques are taken first
        if lab.get("plaque"):
            used_by_floor.setdefault(lab["floor"], set()).add((lab["signX"], lab["signY"]))
    cells_by_floor = {}
    for lab in layout.get("labels", []):
        if lab.get("area"):
            continue
        info = blurbs.get(lab["text"], {})
        if not is_store(lab, info):
            continue
        fid = lab["floor"]
        if fid not in cells_by_floor:
            cells_by_floor[fid] = FloorCells(mall, fid)
        cells = cells_by_floor[fid]
        used = used_by_floor.setdefault(fid, set())
        icon = choose_icon(info)
        at = info.get("signAt")
        if isinstance(at, dict):
            at = at.get(fid)
        if isinstance(at, list) and len(at) == 2:
            pos = tuple(at)
            if cells.walk(*pos):
                warn.append(f"{mall['id']}: signAt {pos} for {lab['text']!r} is a walkable cell")
        else:
            pos = place(lab, cells, used)
        if not pos:
            warn.append(f"{mall['id']}: no wall beside {lab['text']!r} ({fid} {lab['x']},{lab['y']}) for its sign")
            continue
        used.add(pos)
        out[(fid, lab["text"])] = {"icon": icon, "x": pos[0], "y": pos[1]}
    return out


# ------------------------------------------------------------------ drawing
def draw_sign(theme, icon):
    P = PALETTES.get(theme) or PALETTES["galleria"]
    img = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    p = img.load()

    def rect(x0, y0, w, h, c):
        for yy in range(y0, y0 + h):
            for xx in range(x0, x0 + w):
                p[xx, yy] = c

    dark = hx(COL["K"])
    rect(4, 0, 1, 2, dark)                          # little hanging bracket
    rect(11, 0, 1, 2, dark)
    rect(2, 2, 13, 14, (0, 0, 0, 90))               # soft drop shadow (right / bottom)
    rect(1, 1, 14, 14, P["sign_b1"])                # board: dark rim, frame, fill
    rect(2, 2, 12, 12, P["sign_b2"])
    rect(3, 3, 10, 10, P["sign_fill"])
    for j, row in enumerate(ICONS[icon]):
        for i, ch in enumerate(row):
            if ch != ".":
                p[3 + i, 3 + j] = hx(COL[ch])
    return img


def write_sheets(themes):
    os.makedirs(SIGN_DIR, exist_ok=True)
    names = list(ICONS)
    for theme in sorted(set(themes)):
        sheet = Image.new("RGBA", (FRAME * len(names), FRAME), (0, 0, 0, 0))
        for i, n in enumerate(names):
            sheet.paste(draw_sign(theme, n), (i * FRAME, 0))
        sheet.save(os.path.join(SIGN_DIR, f"{theme}.png"))
    with open(os.path.join(SIGN_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"frame": FRAME, "icons": names, "themes": sorted(set(themes))}, f, indent=1)
    return names


def contact_sheet(themes, path, scale=6):
    names = list(ICONS)
    cols = 8
    rows = (len(names) + cols - 1) // cols
    themes = sorted(set(themes))
    cell = FRAME * scale + 8
    out = Image.new("RGBA", (cols * cell * len(themes) + 16 * (len(themes) - 1), rows * cell), (60, 60, 70, 255))
    for t, theme in enumerate(themes):
        for i, n in enumerate(names):
            im = draw_sign(theme, n).resize((FRAME * scale, FRAME * scale), Image.NEAREST)
            out.alpha_composite(im, (t * (cols * cell + 16) + (i % cols) * cell + 4, (i // cols) * cell + 4))
    out.save(path)


def preview(mid, out_dir, scale=2):
    """The mall's preview map with every sign painted on (to check placement by eye)."""
    layout = json.load(open(os.path.join(ROOT, "assets", "maps", f"{mid}_layout.json"), encoding="utf-8"))
    mall = json.load(open(os.path.join(ROOT, "data", "malls", f"{mid}.json"), encoding="utf-8"))
    d = json.load(open(os.path.join(ROOT, "data", "directory", f"{mid}.json"), encoding="utf-8"))
    img = Image.open(os.path.join(ROOT, "assets", "maps", f"{mid}_preview.png")).convert("RGBA")
    theme = mall.get("theme", "galleria")
    for pin in d["pins"]:
        s = pin.get("sign")
        if not s:
            continue
        L = layout["floors"][pin["floor"]]
        img.alpha_composite(draw_sign(theme, s["icon"]), ((L["ox"] + s["x"]) * FRAME, (L["oy"] + s["y"]) * FRAME))
    img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, f"{mid}_signs.png"))


if __name__ == "__main__":
    themes = []
    for mid in ("galleria", "cogskill"):
        try:
            themes.append(json.load(open(os.path.join(ROOT, "data", "malls", f"{mid}.json"), encoding="utf-8")).get("theme", mid))
        except OSError:
            pass
    write_sheets(themes)
    if "--preview" in sys.argv:
        out = sys.argv[sys.argv.index("--preview") + 1]
        os.makedirs(out, exist_ok=True)
        contact_sheet(themes, os.path.join(out, "sign_icons.png"))
        for mid in ("galleria", "cogskill"):
            preview(mid, out)
    print("signs:", len(ICONS), "icons;", ", ".join(sorted(set(themes))))
