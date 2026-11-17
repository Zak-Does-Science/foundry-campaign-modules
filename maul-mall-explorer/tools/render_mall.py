#!/usr/bin/env python3
"""Render a MAUL mall JSON (see SPEC.md) into an 8-bit, GBC-Pokemon-town style map for Foundry.

Usage:
    python tools/render_mall.py data/malls/galleria.json [--out assets/maps] [--booths assets/sprites/booths]
    python tools/render_mall.py --booths-only

Outputs  <out>/<mall>.png (x4, 64 px grid), <out>/<mall>_preview.png (x1, 16 px), <out>/<mall>_layout.json,
<out>/<mall>_reveals/<id>.png (hidden things' true tiles), <out>/<mall>_areas/<id>.png (secret areas' real art),
live sprite sheets in assets/sprites/live/ (+ index.json), and (unless --no-booths) the booth sprites.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image  # noqa: E402
from pixcore import PX, hx, mix, dk, hsh  # noqa: E402
from mall_tiles import FloorArt, PALETTES, LEGEND, THEME_STYLE  # noqa: E402
from mall_sprites import build_npc, build_obj, parse_sprite, build_booth, BOOTH_COLS, norm_tags, build_spirit, special_frame2, seated  # noqa: E402
import pixfont  # noqa: E402
import mall_pcs  # noqa: E402
from mall_trees import tree_type, ALL_TYPES as TREE_TYPES  # noqa: E402
from mall_props_wc_light import GLOWS, crystal_tint  # noqa: E402
import mall_depth  # noqa: E402

TILE = 16
SCALE = 4
GAP = 4
MAX_SIDE = 16384
MAX_W_PX = 7936
ROOT = os.path.dirname(HERE)
BLOCKING = set(' #wDE~TprS=tbfkx_')
WALLS = set('#wDEH')
LIVE_OBJS = ('cat', 'pikpik')     # animals: drawn live with a breathing frame, never baked


def load_floors(mall, warn):
    floors = []
    for f in mall.get('floors', []):
        grid = list(f.get('grid', []))
        if not grid:
            warn.append(f"floor {f.get('id')}: empty grid")
            grid = [' ']
        w = max(len(r) for r in grid)
        if any(len(r) != w for r in grid):
            warn.append(f"floor {f.get('id')}: rows have different lengths (padded with void to {w})")
        if w > 80 or len(grid) > 60:
            warn.append(f"floor {f.get('id')}: {w}x{len(grid)} exceeds the 80x60 limit")
        clean = []
        bad = {}
        for y, r in enumerate(grid):
            r = r.ljust(w)
            row = []
            for x, ch in enumerate(r):
                if ch not in LEGEND:
                    bad.setdefault(ch, []).append((x, y))
                    ch = '.'
                if ch == 'H':          # hidden passage: pixel-identical to a wall
                    ch = '#'
                row.append(ch)
            clean.append(''.join(row))
        for ch, pos in bad.items():
            warn.append(f"floor {f.get('id')}: unknown tile char {ch!r} x{len(pos)} (first at {pos[0]}) -> drawn as '.'")
        floors.append({'id': f.get('id'), 'name': f.get('name', ''), 'grid': clean, 'raw': [r.ljust(w) for r in grid],
                       'w': w, 'h': len(clean), 'labels': f.get('labels', [])})
    return floors


# ---------------------------------------------------------------- signs
def unit_of(text):
    """'105 SUDS & BEYOND' -> '105', 'S101 ...' -> 'S101', 'A XILLIFORTH' -> 'A', 'WC' -> 'WC', 'ROOT STAIR' -> None."""
    t = str(text).strip().upper().split()
    if not t:
        return None
    first = t[0]
    if re.fullmatch(r'[A-Z]?\d{1,4}[A-Z]?', first) or first == 'WC':
        return first
    if len(first) == 1 and first.isalpha() and len(t) > 1:
        return first
    return None


def _at(g, x, y):
    return g[y][x] if 0 <= y < len(g) and 0 <= x < len(g[y]) else ' '


def room_doors(f, lx, ly, reach=10, cap=500):
    """Fallback when no door is within 4 tiles: flood the room(s) touching the label point (stores are
    enclosed, so this finds the store's own doors) and return their doors within `reach` tiles."""
    g = f['raw']
    found = set()
    seen = set()
    walk = lambda ch: ch not in BLOCKING and ch not in 'H+'
    starts = [(lx + i, ly + j) for j in range(-2, 3) for i in range(-2, 3) if walk(_at(g, lx + i, ly + j))]
    starts.sort(key=lambda c: (abs(c[0] - lx) + abs(c[1] - ly), _at(g, *c) != ','))
    for s in starts[:6]:
        if s in seen:
            continue
        room, stack, doors = {s}, [s], set()
        while stack and len(room) < cap:
            x, y = stack.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                ch = _at(g, *n)
                if ch == '+':
                    doors.add(n)
                elif walk(ch) and n not in room:
                    room.add(n); stack.append(n)
        seen |= room
        if len(room) < cap:          # enclosed room, not the open concourse
            found |= {d for d in doors if ((d[0] - lx) ** 2 + (d[1] - ly) ** 2) ** 0.5 <= reach}
        if found:
            break
    return list(found)


def find_sign_spot(f, lx, ly, used):
    """Nearest '+' within 4 tiles of the label point, then a wall cell beside it. Returns (sx, sy, door) or None."""
    g = f['raw']
    doors = [(x, y) for y, r in enumerate(g) for x, ch in enumerate(r)
             if ch == '+' and max(abs(x - lx), abs(y - ly)) <= 4]
    if not doors:
        doors = room_doors(f, lx, ly)
    doors.sort(key=lambda d: ((d[0] - lx) ** 2 + (d[1] - ly) ** 2, d[1], d[0]))
    for dx_, dy_ in doors:
        horiz = _at(g, dx_ - 1, dy_) in WALLS or _at(g, dx_ + 1, dy_) in WALLS
        if horiz:
            cand = [(dx_ - 1, dy_), (dx_ + 1, dy_), (dx_ - 2, dy_), (dx_ + 2, dy_)]
        else:
            cand = [(dx_, dy_ - 1), (dx_, dy_ + 1), (dx_, dy_ - 2), (dx_, dy_ + 2)]
        best = None
        for k, (sx, sy) in enumerate(cand):
            ch = _at(g, sx, sy)
            if ch not in WALLS or (sx, sy) in used or (sx, sy) in f['secret_cells']:
                continue
            front = _at(g, sx, sy + 1) not in WALLS
            score = (0 if ch in '#H' else 10 if ch == 'w' else 30) + (20 if k >= 2 else 0) + (0 if front else 4) \
                + ((sx - lx) ** 2 + (sy - ly) ** 2) ** 0.5 * 0.5
            if best is None or score < best[0]:
                best = (score, sx, sy)
        if best:
            return best[1], best[2], (dx_, dy_)
    return None


def draw_plaque(px, theme, f, sx, sy, unit, door):
    """Small unit-number plaque painted on wall cell (sx, sy) of floor f."""
    P = PALETTES[theme]
    g = f['raw']
    tw = pixfont.tiny_width(unit)
    w, h = tw + 6, 9
    CX, CY = (f['ox'] + sx) * TILE, (f['oy'] + sy) * TILE
    x0 = CX + (TILE - w) // 2
    # spill away from the door; never over a non-wall neighbour
    if door and door[0] > sx:
        x0 = min(x0, CX + TILE - 1 - w)
    elif door and door[0] < sx:
        x0 = max(x0, CX + 1)
    if _at(g, sx - 1, sy) not in WALLS:
        x0 = max(x0, CX + 1)
    if _at(g, sx + 1, sy) not in WALLS:
        x0 = min(x0, CX + TILE - 1 - w)
    front = _at(g, sx, sy) in WALLS and _at(g, sx, sy + 1) not in WALLS
    y0 = CY + (5 if front else (TILE - h) // 2)
    px.drect(x0 + 1, y0 + h, w, 1, 0.55)
    px.drect(x0 + w, y0 + 1, 1, h, 0.7)
    px.rect(x0, y0, w, h, P['sign_b1'])
    px.rect(x0 + 1, y0 + 1, w - 2, h - 2, P['sign_b2'])
    px.rect(x0 + 2, y0 + 2, w - 4, h - 4, P['sign_fill'])
    if THEME_STYLE.get(theme, theme) == 'galleria':
        px.rect(x0 + 2, y0 + 2, w - 4, 1, mix(P['sign_fill'], hx('#ffffff'), 0.6))
        txt = P['sign_text']
        for i in (1, w - 2):
            px.set(x0 + i, y0 + 1, P['lantern'])
    else:
        txt = P['sign_text'] if hsh(sum(map(ord, unit))) % 2 == 0 else P['sign_text2']
        for (i, j) in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)):
            px.set(x0 + i, y0 + j, P['wall_hi'])
    pixfont.draw_tiny(px, x0 + 3, y0 + 2, unit, txt)


# ---------------------------------------------------------------- live sprites
def sheet_from(img, frames):
    """Frame 1 = art; frame 2 = breath (upper body squashed down 1 px, feet fixed)."""
    sh = Image.new('RGBA', (16 * frames, 16), (0, 0, 0, 0))
    sh.paste(img, (0, 0))
    if frames > 1:
        f2 = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        f2.paste(img.crop((0, 0, 16, 12)), (0, 1))
        f2.paste(img.crop((0, 12, 16, 16)), (0, 12))
        sh.paste(f2, (16, 0))
    return sh


def live_key(spr):
    """Normalised index key + file name for a sprite string, or (None, None)."""
    kind, name, var = parse_sprite(spr)
    if kind == 'npc':
        tags = norm_tags([p for p in spr.split(':')[2:] if not p.strip().isdigit()])
        key = ':'.join(['npc', name, str(var % 32)] + tags)
        return key, '_'.join(['npc', name, str(var % 32)] + tags) + '.png'
    if kind == 'obj':
        parts = spr.split(':')
        if len(parts) > 2 and parts[2].strip().isdigit():
            seed = int(parts[2])
            return f"obj:{name}:{seed}", f"obj_{name}_{seed}.png"
        return f"obj:{name}", f"obj_{name}.png"
    return None, None


_FRESH = set()


POSES = ('sit',)
SEATS = set('bc')                  # pose "sit" belongs on a bench or a chair


def export_live(spr, live_dir, index, warn, iid, pose=None):
    key, fname = live_key(spr)
    if key is None:
        warn.append(f"{iid}: bad sprite string {spr!r}")
        return None
    if pose == 'sit' and key.startswith('npc:'):
        export_live(spr, live_dir, index, warn, iid)        # the standing sheet too (fallback, coworker re-skins)
        return export_seated(spr, key, fname, live_dir, index, warn, iid)
    if key not in _FRESH:          # always redraw sheets used in this run (art may have changed)
        _FRESH.add(key)
        kind, name, var = parse_sprite(spr)
        if kind == 'npc':
            img, known = build_npc(name, var, *key.split(':')[3:])
            frames = 2
            if not known:
                warn.append(f"{iid}: unknown species {name!r} (live sprite drawn as grey human)")
        else:
            seed = int(key.split(':')[2]) if key.count(':') == 2 else 0
            img, known = build_obj(name, seed)
            frames = 2 if name in LIVE_OBJS else 1
            if not known:
                warn.append(f"{iid}: unknown object {name!r} (drawn as ? block)")
        os.makedirs(live_dir, exist_ok=True)
        sheet = sheet_from(img, frames)
        if kind == 'npc':                            # spirit pulses, goo jiggles, plantlings sway, cruds drip
            f2 = special_frame2(name, var, key.split(':')[3:])
            if f2 is not None:
                sheet.paste(Image.new('RGBA', (16, 16), (0, 0, 0, 0)), (16, 0))
                sheet.paste(f2, (16, 0))
        sheet.save(os.path.join(live_dir, fname), optimize=True)
        index[key] = {'file': fname, 'fw': 16, 'fh': 16, 'frames': frames, 'footY': 15}
    if spr != key and spr not in index:
        index[spr] = dict(index[key])          # alias for the exact string used in the JSON
    return key


def export_seated(spr, key, fname, live_dir, index, warn, iid):
    """Seated sheet for pose "sit": index key `<key>|sit`, file `<name>_sit.png`. Both frames are the seated pose
    (frame 2 = the usual breath, or the species' own idle frame, folded the same way)."""
    skey = key + '|sit'
    if skey not in _FRESH:
        _FRESH.add(skey)
        _, name, var = parse_sprite(spr)
        tags = key.split(':')[3:]
        img, _known = build_npc(name, var, *tags)
        sheet = sheet_from(seated(img, name), 2)
        f2 = special_frame2(name, var, tags)
        if f2 is not None:
            sheet.paste(Image.new('RGBA', (16, 16), (0, 0, 0, 0)), (16, 0))
            sheet.paste(seated(f2, name), (16, 0))
        os.makedirs(live_dir, exist_ok=True)
        sname = fname[:-4] + '_sit.png'
        sheet.save(os.path.join(live_dir, sname), optimize=True)
        index[skey] = {'file': sname, 'fw': 16, 'fh': 16, 'frames': 2, 'footY': 15, 'pose': 'sit'}
    return skey


def bake_obj(img, px, name, X, Y, seed, cell=None, lights=None):
    simg, known = build_obj(name, seed)
    mall_depth.prop_shadow(px, simg, X, Y, cell)
    if lights is not None:
        lt = mall_depth.light_for(name, X, Y, seed, GLOWS, crystal_tint)
        if lt:
            lights.append(lt)
    if name in GLOWS:
        # soft light pool: tinted, low alpha, smooth falloff (reads as light on the floor, not a blob)
        dx, dy, rx, ry, peak = GLOWS[name]
        tint = crystal_tint(seed)[0][:3]
        for j in range(-ry, ry + 1):
            for i in range(-rx, rx + 1):
                d2 = (i / rx) ** 2 + (j / ry) ** 2
                if d2 < 1:
                    px.set(X + dx + i, Y + dy + j, tint + (int(peak * 1.5 * (1 - d2) ** 1.6),))
    elif name == 'lamp':
        glow = (255, 220, 110)
        for j in range(-6, 8):
            for i in range(-6, 8):
                d = ((i - 0.5) ** 2 + (j - 0.5) ** 2) ** 0.5
                if d < 7:
                    px.set(X + 7 + i, Y + 2 + j, glow + (int(70 * (1 - d / 7)),))
    img.alpha_composite(simg, (X, Y))
    return known


# ---------------------------------------------------------------- overlays (reveals, secret areas)
def _overlay_png(canvas, fl, cells, path):
    bx0 = min(c[0] for c in cells); by0 = min(c[1] for c in cells)
    bx1 = max(c[0] for c in cells) + 1; by1 = max(c[1] for c in cells) + 1
    out = Image.new('RGBA', ((bx1 - bx0) * TILE, (by1 - by0) * TILE), (0, 0, 0, 0))
    for (x, y) in cells:
        X, Y = (fl['ox'] + x) * TILE, (fl['oy'] + y) * TILE
        out.paste(canvas.crop((X, Y, X + TILE, Y + TILE)), ((x - bx0) * TILE, (y - by0) * TILE))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.resize((out.width * SCALE, out.height * SCALE), Image.NEAREST).save(path, optimize=True)
    return bx0, by0, bx1 - bx0, by1 - by0


def _prune(d, keep):
    if os.path.isdir(d):
        for fn in os.listdir(d):
            if fn.endswith('.png') and fn not in keep:
                os.remove(os.path.join(d, fn))


def render_reveals(mall, by_id, theme, img_size, out_dir, mid, warn):
    rdir = os.path.join(out_dir, f"{mid}_reveals")
    reveals, written = {}, set()
    for it in mall.get('interactables', []):
        hid = it.get('hidden')
        if not isinstance(hid, dict) or not hid.get('reveal'):
            continue
        iid = it.get('id')
        fl = by_id.get(it.get('floor'))
        if fl is None:
            continue
        cells = []
        for c in hid['reveal']:
            try:
                x, y, ch = int(c.get('x', -1)), int(c.get('y', -1)), str(c.get('ch', ''))[:1]
            except (TypeError, ValueError, AttributeError):
                warn.append(f"{iid}: bad reveal cell {c!r}")
                continue
            if not (0 <= x < fl['w'] and 0 <= y < fl['h']):
                warn.append(f"{iid}: reveal cell {x},{y} outside floor {fl['id']}")
                continue
            if ch not in LEGEND:
                warn.append(f"{iid}: reveal cell {x},{y} has unknown tile {ch!r}")
                continue
            ch = '#' if ch == 'H' else ch
            if fl['grid'][y][x] == ch:
                warn.append(f"{iid}: reveal cell {x},{y} {ch!r} equals the grid tile (nothing to reveal)")
            cells.append((x, y, ch))
        if not cells:
            continue
        g2 = [list(r) for r in fl['grid']]
        for x, y, ch in cells:
            g2[y][x] = ch
        g2 = [''.join(r) for r in g2]
        xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
        reg = (min(xs) - 1, min(ys) - 1, max(xs) + 2, max(ys) + 2)
        canv = []
        for grid in (fl['grid'], g2):
            im = Image.new('RGBA', img_size, (0, 0, 0, 0))
            floor_art(PX(im), grid, theme, fl).draw(region=reg)
            canv.append(im)
        # the true tiles plus any neighbour whose look changes (wall faces, shadows, frames)
        mask = set((x, y) for x, y, _ in cells)
        for y in range(max(0, reg[1]), min(fl['h'], reg[3])):
            for x in range(max(0, reg[0]), min(fl['w'], reg[2])):
                X, Y = (fl['ox'] + x) * TILE, (fl['oy'] + y) * TILE
                box = (X, Y, X + TILE, Y + TILE)
                if canv[0].crop(box).tobytes() != canv[1].crop(box).tobytes():
                    mask.add((x, y))
        fname = f"{iid}.png"
        bx, by, bw, bh = _overlay_png(canv[1], fl, mask, os.path.join(rdir, fname))
        written.add(fname)
        reveals[iid] = {'floor': fl['id'], 'x': bx, 'y': by, 'w': bw, 'h': bh, 'file': f"{mid}_reveals/{fname}"}
    _prune(rdir, written)
    return reveals


def secret_areas(mall, by_id, warn):
    """Validate `secretAreas`; returns [(area, floor, set(cells))] and fills floor['secret_cells']."""
    out = []
    seen = set()
    for f in by_id.values():
        f['secret_cells'] = {}
    for a in mall.get('secretAreas', []) or []:
        aid = a.get('id')
        if not aid or aid in seen:
            warn.append(f"secret area {aid!r}: missing or duplicate id")
            continue
        seen.add(aid)
        fl = by_id.get(a.get('floor'))
        if fl is None:
            warn.append(f"secret area {aid}: unknown floor {a.get('floor')!r}")
            continue
        look = a.get('look', 'void')
        if look not in ('void', 'rock', 'wall'):
            warn.append(f"secret area {aid}: unknown look {look!r} (using 'void')")
            look = 'void'
        cells = set()
        for r in a.get('rects', []) or []:
            try:
                x0, y0, w, h = int(r['x']), int(r['y']), int(r.get('w', 1)), int(r.get('h', 1))
            except (KeyError, TypeError, ValueError):
                warn.append(f"secret area {aid}: bad rect {r!r}")
                continue
            for y in range(y0, y0 + h):
                for x in range(x0, x0 + w):
                    if 0 <= x < fl['w'] and 0 <= y < fl['h']:
                        cells.add((x, y))
                    else:
                        warn.append(f"secret area {aid}: rect {r} leaves floor {fl['id']}")
                        break
        if not cells:
            warn.append(f"secret area {aid}: no cells")
            continue
        for c in cells:
            if c in fl['secret_cells']:
                warn.append(f"secret area {aid}: cell {c} also in {fl['secret_cells'][c]}")
            fl['secret_cells'][c] = aid
        out.append((dict(a, look=look), fl, cells))
    return out


def paint_disguise(art, fl, cells, look):
    """Paint locked secret cells as plain void / rock / wall: no outline, edges or anything room-shaped."""
    P = art.P
    px = art.px
    for (x, y) in cells:
        X, Y = art.org(x, y)
        if look == 'void':
            art.void(X, Y, x, y, False)
        elif look == 'wall':
            px.rect(X, Y, 16, 16, P['wall_top'])
            for j in range(16):
                for i in range(16):
                    gx, gy = X + i, Y + j
                    if art.theme == 'galleria':
                        if (gy % 8 == 0) or ((gx + (8 if (gy // 8) % 2 else 0)) % 16 == 0):
                            px.set(gx, gy, P['wall_top2'])
                    elif gx % 16 == 0 or gy % 16 == 0:
                        px.set(gx, gy, P['wall_top2'])
        else:  # rock
            px.rect(X, Y, 16, 16, P['cliff2'])
            for k in range(7):
                hv = hsh(X, Y, k, 5)
                i, j = hv % 14, (hv >> 4) % 14
                px.rect(X + i, Y + j, 2, 2, P['cliff'] if k % 2 else P['cliff3'])
                if k < 2:
                    px.set(X + i, Y + j, P['cliff_hi'])


def floor_art(px, grid, theme, fl):
    art = FloorArt(px, grid, theme, fl['ox'], fl['oy'])
    art.tree_pins = fl.get('tree_pins', {})
    art.level = mall_depth.level_of(fl.get('id'))
    return art


def tree_pins(mall, by_id, warn):
    for k, t in enumerate(mall.get('trees', []) or []):
        fl = by_id.get(t.get('floor'))
        tt = tree_type(t.get('type'))
        if fl is None or tt is None:
            warn.append(f"trees #{k}: unknown floor {t.get('floor')!r} or type {t.get('type')!r} "
                        f"(types: {', '.join(TREE_TYPES)})")
            continue
        try:
            x, y = int(t['x']), int(t['y'])
        except (KeyError, TypeError, ValueError):
            warn.append(f'trees #{k}: bad x/y')
            continue
        if not (0 <= x < fl['w'] and 0 <= y < fl['h']) or fl['grid'][y][x] != 'T':
            warn.append(f"trees #{k}: {fl['id']} {x},{y} is not a 'T' cell")
        fl.setdefault('tree_pins', {})[(x, y)] = tt


# ---------------------------------------------------------------- main render
def render(mall_path, out_dir, warn, live_dir=None, live_index=None):
    with open(mall_path, encoding='utf-8') as fh:
        mall = json.load(fh)
    mid = mall.get('id') or os.path.splitext(os.path.basename(mall_path))[0]
    theme = mall.get('theme', mid)
    if theme not in PALETTES:
        warn.append(f"unknown theme {theme!r}; using 'galleria'")
        theme = 'galleria'
    live_dir = live_dir or os.path.join(ROOT, 'assets', 'sprites', 'live')
    live_index = {} if live_index is None else live_index
    floors = load_floors(mall, warn)
    # Pack floors left to right, wrapping to a new row so the image stays <= 7936 px wide.
    MAX_W = MAX_W_PX // (TILE * SCALE)
    pos, cx, cy, row_h = {}, 0, 0, 0
    for f in floors:
        if cx and cx + f['w'] > MAX_W:
            cy += row_h + GAP; cx = 0; row_h = 0
        pos[f['id']] = (cx, cy)
        cx += f['w'] + GAP; row_h = max(row_h, f['h'])
    W = max(pos[f['id']][0] + f['w'] for f in floors)
    H = max(pos[f['id']][1] + f['h'] for f in floors)
    img = Image.new('RGBA', (W * TILE, H * TILE), (0, 0, 0, 255))
    px = PX(img)
    void_art = FloorArt(px, [' ' * W] * H, theme, 0, 0)
    for y in range(H):
        for x in range(W):
            void_art.void(x * TILE, y * TILE, x, y, False)
    by_id = {}
    for f in floors:
        f['ox'], f['oy'] = pos[f['id']]
        by_id[f['id']] = f
    areas = secret_areas(mall, by_id, warn)
    tree_pins(mall, by_id, warn)
    # base map: secret cells masked so neighbours treat them as plain void / wall
    layout_floors = {}
    base_arts = []
    for f in floors:
        sc = f['secret_cells']
        grid = f['grid']
        if sc:
            looks = {}
            for a, fl, cells in areas:
                if fl is f:
                    for c in cells:
                        looks[c] = a['look']
            g = [list(r) for r in grid]
            for (x, y), lk in looks.items():
                g[y][x] = ' ' if lk == 'void' else '#'
            grid = [''.join(r) for r in g]
        art = floor_art(px, grid, theme, f)
        art.draw()
        base_arts.append(art)
        for a, fl, cells in areas:
            if fl is f:
                paint_disguise(art, f, cells, a['look'])
        layout_floors[f['id']] = {'ox': f['ox'], 'oy': f['oy'], 'w': f['w'], 'h': f['h']}
    # secret-area overlays: the real art, drawn on their own canvases
    area_canvas = {}
    for a, fl, cells in areas:
        xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
        cv = Image.new('RGBA', img.size, (0, 0, 0, 0))
        floor_art(PX(cv), fl['grid'], theme, fl).draw(region=(min(xs), min(ys), max(xs) + 1, max(ys) + 1))
        area_canvas[a['id']] = cv

    def target(fl, x, y):
        aid = fl['secret_cells'].get((x, y))
        if aid:
            cv = area_canvas[aid]
            return cv, PX(cv)
        return img, px

    # interactable sprites: objects are baked; NPCs, cats and anything hidden become live sheets
    ids = set()
    live_sprites = {}
    lights = []
    for it in mall.get('interactables', []):
        iid = it.get('id')
        if iid in ids:
            warn.append(f"duplicate interactable id {iid!r}")
        ids.add(iid)
        fl = by_id.get(it.get('floor'))
        if fl is None:
            warn.append(f"interactable {iid}: unknown floor {it.get('floor')!r}")
            continue
        x, y = it.get('x', 0), it.get('y', 0)
        if not (0 <= x < fl['w'] and 0 <= y < fl['h']):
            warn.append(f"interactable {iid}: {x},{y} outside floor {fl['id']}")
            continue
        if it.get('kind') == 'warp' and it.get('warp'):
            wp = it['warp']
            tf = by_id.get(wp.get('floor'))
            if tf is None:
                warn.append(f"warp {iid}: target floor {wp.get('floor')!r} unknown")
            else:
                tx, ty = wp.get('x', 0), wp.get('y', 0)
                if not (0 <= tx < tf['w'] and 0 <= ty < tf['h']):
                    warn.append(f"warp {iid}: target {tx},{ty} outside {tf['id']}")
                elif tf['grid'][ty][tx] in BLOCKING and mall_raw_char(mall, tf['id'], tx, ty) != 'H':
                    warn.append(f"warp {iid}: target {tf['id']} {tx},{ty} is a blocking tile "
                                f"{mall_raw_char(mall, tf['id'], tx, ty)!r}")
        for wk in it.get('wander') or []:
            try:
                wx, wy = int(wk[0]), int(wk[1])
            except (TypeError, ValueError, IndexError, KeyError):
                warn.append(f"{iid}: bad wander point {wk!r}")
                continue
            if not (0 <= wx < fl['w'] and 0 <= wy < fl['h']) or fl['grid'][wy][wx] in BLOCKING:
                warn.append(f"{iid}: wander point {wx},{wy} is not a walkable tile")
        spr = it.get('sprite')
        hidden = bool(it.get('hidden'))
        if not spr and it.get('kind') == 'npc':
            spr = f"npc:human:{hsh(sum(map(ord, iid or ''))) % 8}"
        if not spr:
            continue
        kind, name, _ = parse_sprite(spr)
        pose = it.get('pose')
        if pose is not None and pose not in POSES:
            warn.append(f"{iid}: unknown pose {pose!r} (poses: {', '.join(POSES)})")
            pose = None
        if pose == 'sit':
            if fl['grid'][y][x] not in SEATS:
                warn.append(f"{iid}: pose sit on {fl['id']} {x},{y} {fl['grid'][y][x]!r}, not a bench 'b' or chair 'c'")
            if it.get('wander'):
                warn.append(f"{iid}: pose sit ignores wander")
        if kind == 'npc' or (kind == 'obj' and (name in LIVE_OBJS or hidden)):
            key = export_live(spr, live_dir, live_index, warn, iid, pose)
            if key:
                live_sprites[iid] = key
            continue
        if kind != 'obj':
            warn.append(f"{iid}: bad sprite string {spr!r}")
            continue
        timg, tpx = target(fl, x, y)
        lit = None if ((x, y) in fl['secret_cells'] or hidden) else lights
        if not bake_obj(timg, tpx, name, (fl['ox'] + x) * TILE, (fl['oy'] + y) * TILE, hsh(x, y, len(iid or '')),
                        fl['grid'][y][x], lit):
            warn.append(f"{iid}: unknown object {name!r} (drawn as ? block)")
    # bare-tile chat speakers with a `sprite`: exported live (listed in the index under their exact sprite string)
    chat_sprites = {}
    for ch in ((mall.get('ambient') or {}).get('chats') or []):
        for var in ch.get('variants') or []:
            for ln in var.get('lines') or []:
                who = ln.get('who') if isinstance(ln, dict) else None
                if isinstance(who, dict) and who.get('sprite'):
                    key = export_live(str(who['sprite']), live_dir, live_index, warn, f"chat {ch.get('id')}")
                    if key:
                        chat_sprites[str(who['sprite'])] = key
    # theatre-show casts (data/shows/<mall>.json, SPEC 29): actors are drawn live by scripts/show.js
    show_path = os.path.join(ROOT, 'data', 'shows', f"{mall.get('id')}.json")
    if os.path.exists(show_path):
        try:
            with open(show_path, encoding='utf-8') as fh:
                shows = json.load(fh).get('shows') or []
        except (OSError, ValueError) as err:
            warn.append(f"shows file unreadable: {err}")
            shows = []
        for sh in shows:
            for ck, who in (sh.get('cast') or {}).items():
                spr = (who or {}).get('sprite')
                if spr:
                    export_live(str(spr), live_dir, live_index, warn, f"show {sh.get('id')} cast {ck}")
    # decor props (no dialogue): baked
    for k, pr in enumerate(mall.get('props', []) or []):
        fl = by_id.get(pr.get('floor'))
        spr = str(pr.get('sprite', ''))
        tag = f"prop #{k} ({spr})"
        if fl is None:
            warn.append(f"{tag}: unknown floor {pr.get('floor')!r}")
            continue
        try:
            x, y = int(pr.get('x')), int(pr.get('y'))
        except (TypeError, ValueError):
            warn.append(f"{tag}: bad x/y")
            continue
        if not (0 <= x < fl['w'] and 0 <= y < fl['h']):
            warn.append(f"{tag}: {x},{y} outside floor {fl['id']}")
            continue
        kind, name, _ = parse_sprite(spr)
        if kind != 'obj':
            warn.append(f"{tag}: props must be obj:<thing> (NPCs need an interactable)")
            continue
        _, fname = live_key(spr)
        parts = spr.split(':')
        seed = int(parts[2]) if len(parts) > 2 and parts[2].strip().isdigit() else hsh(x, y, k)
        timg, tpx = target(fl, x, y)
        lit = None if (x, y) in fl['secret_cells'] else lights
        if not bake_obj(timg, tpx, name, (fl['ox'] + x) * TILE, (fl['oy'] + y) * TILE, seed, fl['grid'][y][x], lit):
            warn.append(f"{tag}: unknown object {name!r} (drawn as ? block)")
    # signs: unit-number plaques beside the store door; full names go to the layout for the runtime
    labels_out = []
    for f in floors:
        used = set()
        for lab in f['labels']:
            text = str(lab.get('text', ''))
            if len(text) > 22:
                warn.append(f"label {text!r} on {f['id']} is {len(text)} chars (>22)")
            x, y = int(lab.get('x', 0)), int(lab.get('y', 0))
            if not (0 <= x < f['w'] and 0 <= y < f['h']):
                warn.append(f"label {text!r} at {x},{y} is outside floor {f['id']}")
            unit = unit_of(text)
            spot = find_sign_spot(f, x, y, used)
            entry = {'floor': f['id'], 'x': x, 'y': y, 'text': text, 'signX': x, 'signY': y,
                     'unit': unit, 'door': None, 'plaque': False}
            if spot:
                entry.update(signX=spot[0], signY=spot[1], door=[spot[2][0], spot[2][1]])
            secret = f['secret_cells'].get((entry['signX'], entry['signY'])) or f['secret_cells'].get((x, y))
            if secret:
                entry['area'] = secret
            if unit and not secret and not spot:
                # no door found: nearest wall cell (front faces first) within 3 tiles of the label point
                g = f['raw']
                walls = [(abs(i) + abs(j) + (0 if _at(g, x + i, y + j + 1) not in WALLS else 1.5), x + i, y + j)
                         for j in range(-3, 4) for i in range(-3, 4)
                         if _at(g, x + i, y + j) in WALLS and (x + i, y + j) not in used
                         and (x + i, y + j) not in f['secret_cells']]
                if walls:
                    _, wx, wy = min(walls)
                    entry.update(signX=wx, signY=wy)
                    warn.append(f"label {text!r} on {f['id']} ({x},{y}): no door found; plaque on wall {wx},{wy}")
                elif _at(g, x, y) == ' ':
                    warn.append(f"label {text!r} on {f['id']} ({x},{y}): no door or wall nearby; no plaque")
                    unit = None
                else:
                    warn.append(f"label {text!r} on {f['id']} ({x},{y}): no door found; plaque at the label point")
            if unit and not secret:
                used.add((entry['signX'], entry['signY']))
                draw_plaque(px, theme, f, entry['signX'], entry['signY'], unit, spot[2] if spot else None)
                entry['plaque'] = True
            labels_out.append(entry)
    # sanity checks on start / booths
    st = mall.get('start')
    if st:
        fl = by_id.get(st.get('floor'))
        if not fl or not (0 <= st.get('x', -1) < fl['w'] and 0 <= st.get('y', -1) < fl['h']):
            warn.append(f"start {st} is not inside a floor")
        elif fl['grid'][st['y']][st['x']] in BLOCKING:
            warn.append(f"start {st} is on a blocking tile {fl['grid'][st['y']][st['x']]!r}")
    for bth in mall.get('popupBooths', []):
        fl = by_id.get(bth.get('floor'))
        if not fl:
            warn.append(f"popup booth slot {bth.get('slot')}: unknown floor {bth.get('floor')!r}")
            continue
        bx, by_ = bth.get('x', 0), bth.get('y', 0)
        cells = [(bx + i, by_ + j) for i in range(2) for j in range(2)]
        if any(not (0 <= cx < fl['w'] and 0 <= cy < fl['h']) for cx, cy in cells):
            warn.append(f"popup booth slot {bth.get('slot')}: 2x2 footprint at {bx},{by_} leaves floor {fl['id']}")
        elif any(fl['grid'][cy][cx] not in '.,:"o' for cx, cy in cells):
            chars = ''.join(fl['grid'][cy][cx] for cx, cy in cells)
            warn.append(f"popup booth slot {bth.get('slot')}: 2x2 footprint at {fl['id']} {bx},{by_} "
                        f"covers non-floor tiles {chars!r}")
    os.makedirs(out_dir, exist_ok=True)
    # depth: big-tree overlay pieces for runtime y-sorting (one atlas per mall, 16-px art)
    depth_out = None
    pieces = [p for art in base_arts for p in mall_depth.tree_overlays(art, art.level)]
    depth_path = os.path.join(out_dir, f"{mid}_depth.png")
    if pieces:
        atlas, pos = mall_depth.pack([p[0] for p in pieces])
        atlas.save(depth_path, optimize=True)
        depth_out = {'file': f"{mid}_depth.png", 'scale': SCALE,
                     'pieces': [{'x': X, 'y': Y, 'w': im.width, 'h': im.height, 'ax': ax, 'ay': ay, 'base': base}
                                for (im, X, Y, base), (ax, ay) in zip(pieces, pos)]}
    elif os.path.exists(depth_path):
        os.remove(depth_path)
    # overlays
    reveals = render_reveals(mall, by_id, theme, img.size, out_dir, mid, warn)
    adir = os.path.join(out_dir, f"{mid}_areas")
    areas_out, written = {}, set()
    for a, fl, cells in areas:
        fname = f"{a['id']}.png"
        bx, by, bw, bh = _overlay_png(area_canvas[a['id']], fl, cells, os.path.join(adir, fname))
        written.add(fname)
        areas_out[a['id']] = {'floor': fl['id'], 'x': bx, 'y': by, 'w': bw, 'h': bh, 'file': f"{mid}_areas/{fname}"}
    _prune(adir, written)
    preview = img.convert('RGB')
    prev_path = os.path.join(out_dir, f"{mid}_preview.png")
    preview.save(prev_path, optimize=True)
    big = preview.resize((preview.width * SCALE, preview.height * SCALE), Image.NEAREST)
    if big.size[0] > MAX_W_PX:
        warn.append(f"final png is {big.size[0]} px wide (> {MAX_W_PX}); laptop GPUs may refuse it")
    if max(big.size) > MAX_SIDE:
        warn.append(f"final png is {big.size[0]}x{big.size[1]} px (> {MAX_SIDE}); Foundry/WebGL may refuse it")
    big_path = os.path.join(out_dir, f"{mid}.png")
    try:
        if len(preview.getcolors(1 << 20) or []) <= 256:
            big.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(big_path, optimize=True)
        else:
            big.save(big_path, optimize=True)
    except Exception:
        big.save(big_path, optimize=True)
    layout = {'mall': mid, 'tilePx': TILE, 'scale': SCALE, 'gridPx': TILE * SCALE,
              'widthTiles': W, 'heightTiles': H, 'floors': layout_floors,
              'labels': labels_out, 'reveals': reveals, 'areas': areas_out,
              'liveSprites': live_sprites, 'chatSprites': chat_sprites, 'spritesPath': 'assets/sprites/live/',
              'depth': depth_out, 'lights': lights}
    lay_path = os.path.join(out_dir, f"{mid}_layout.json")
    with open(lay_path, 'w', encoding='utf-8') as fh:
        json.dump(layout, fh, indent=2, ensure_ascii=False)
    return {'mall': mid, 'png': big_path, 'size': big.size, 'bytes': os.path.getsize(big_path),
            'preview': prev_path, 'layout': lay_path, 'colors': len(preview.getcolors(1 << 20) or []),
            'live': len(live_sprites), 'reveals': len(reveals), 'areas': len(areas_out),
            'trees': len(pieces), 'lights': len(lights),
            'plaques': sum(1 for l in labels_out if l['plaque'])}


_RAW = {}


def mall_raw_char(mall, fid, x, y):
    key = id(mall)
    if key not in _RAW:
        _RAW[key] = {f.get('id'): f.get('grid', []) for f in mall.get('floors', [])}
    g = _RAW[key].get(fid, [])
    if 0 <= y < len(g) and 0 <= x < len(g[y]):
        return g[y][x]
    return ' '


def write_booths(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i, c in enumerate(BOOTH_COLS, start=1):
        im = build_booth(c).resize((128, 128), Image.NEAREST)
        p = os.path.join(out_dir, f"booth_{i}.png")
        im.save(p, optimize=True)
        paths.append(p)
    im = build_booth(None, locked=True).resize((128, 128), Image.NEAREST)
    p = os.path.join(out_dir, "booth_locked.png")
    im.save(p, optimize=True)
    paths.append(p)
    return paths


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('mall', nargs='*', help='mall JSON file(s)')
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'maps'))
    ap.add_argument('--live', default=os.path.join(ROOT, 'assets', 'sprites', 'live'))
    ap.add_argument('--booths', default=os.path.join(ROOT, 'assets', 'sprites', 'booths'))
    ap.add_argument('--no-booths', action='store_true')
    ap.add_argument('--booths-only', action='store_true')
    ap.add_argument('--no-depth', action='store_true',
                    help='skip the depth tier (face shading, contact/prop shadows, level tint, tree overlays, lights)')
    a = ap.parse_args(argv)
    mall_depth.DEPTH = not a.no_depth
    if not a.booths_only:
        idx_path = os.path.join(a.live, 'index.json')
        index = {}
        fresh = len(a.mall) > 1            # several malls: rebuild the index from scratch (pruned below)
        if not fresh and os.path.exists(idx_path):   # one mall: merge, so the other malls' sprites stay listed
            try:
                with open(idx_path, encoding='utf-8') as fh:
                    index = json.load(fh)
            except (OSError, ValueError):
                index = {}
        for m in a.mall:
            warn = []
            r = render(m, a.out, warn, a.live, index)
            print(f"[{r['mall']}] {r['png']}  {r['size'][0]}x{r['size'][1]} px  {r['bytes'] / 1024:.0f} KB  "
                  f"({r['colors']} colours)  live={r['live']} reveals={r['reveals']} areas={r['areas']} "
                  f"plaques={r['plaques']} depth-trees={r['trees']} lights={r['lights']}")
            if warn:
                print(f"[{r['mall']}] {len(warn)} warning(s):")
                for w in warn:
                    print("   - " + w)
            else:
                print(f"[{r['mall']}] no warnings")
        if a.mall:
            os.makedirs(a.live, exist_ok=True)
            mall_pcs.export(a.live, index)          # player-character sheets (pc:<slug>) always ride along
            with open(idx_path, 'w', encoding='utf-8') as fh:
                json.dump(dict(sorted(index.items())), fh, indent=2)
            if fresh:
                _prune(a.live, {e['file'] for e in index.values()})
    if a.booths_only or not a.no_booths:
        for p in write_booths(a.booths):
            print(f"[booths] {p}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
