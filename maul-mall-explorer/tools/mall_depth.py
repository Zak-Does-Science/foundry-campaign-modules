"""Cheap depth tier for the mall maps (17 Nov 2026, Zak: "more of a 3D feel ... depth ... I don't want to start having
uncanny thoughts about it"). Keeps the 16 px art; only light and shade change:

- faces():     wall front faces and counter fronts get a top-to-bottom darkening (a 3/4 view: the face is in shade).
- contact():   furniture casts a short soft shadow onto the floor cell south of it (walls already do).
- tint():      a slight per-level floor tint: upper levels a touch warmer, sub-levels cooler and dimmer.
- tree_overlays(): big trees (2x2+) are also exported as overlay pieces with a sort line, so the runtime can draw a
               canopy over anyone standing behind it (y-sorting, scripts/live.js).
- prop_shadow(): soft ellipse under free-standing baked props.
- LIGHTS:      lamps and crystals become Foundry ambient lights (layout `lights`, scene-builder.js).

`DEPTH = False` (render_mall.py --no-depth) turns all of it off, which is also how the "before" pictures are made.
"""
from PIL import Image
from pixcore import dk

DEPTH = True

WALLISH = set('#wDE')
CASTERS = set('=Skxrf')               # furniture that drops a contact shadow on the floor south of it
FLOORISH = set('.,:"o+c^v')           # cells a prop shadow may fall on


def level_of(fid):
    """'L1' -> 0, 'L2' -> 1, 'S1' -> -1, 'S2' -> -2; anything else 0."""
    s = str(fid or '').upper()
    try:
        n = int(s[1:])
    except ValueError:
        return 0
    if s[:1] == 'L':
        return n - 1
    if s[:1] in 'SB':
        return -n
    return 0


def tint_for(level):
    """RGB multipliers: up = warmer and a little brighter, down = cooler and dimmer. Deliberately slight."""
    if level > 0:
        k = min(level, 3)
        return (1 + 0.02 * k, 1 + 0.01 * k, 1 - 0.015 * k)
    if level < 0:
        k = min(-level, 3)
        return (1 - 0.025 * k, 1 - 0.018 * k, 1.0)
    return (1.0, 1.0, 1.0)


def _mul(px, X, Y, w, h, f):
    for j in range(h):
        for i in range(w):
            px.darken(X + i, Y + j, f)


def faces(art, region):
    """Shade wall front faces and counter fronts, darker toward the floor (ambient occlusion at the foot)."""
    if not DEPTH:
        return
    x0, y0, x1, y1 = region
    px = art.px
    for y in range(y0, y1):
        for x in range(x0, x1):
            c = art.at(x, y)
            X, Y = art.org(x, y)
            if c in WALLISH and not art.wallish(x, y + 1):
                glass = c == 'w'
                cap = 3 if c == 'E' else 4
                rows = range(cap + 1, 16)
                n = len(rows)
                for k, j in enumerate(rows):
                    t = k / max(1, n - 1)
                    f = (0.97 - 0.09 * t) if glass else (0.94 - 0.16 * t)
                    _mul(px, X, Y + j, 16, 1, f)
            elif c == '=' and art.at(x, y + 1) != '=':
                for k, j in enumerate(range(10, 15)):
                    _mul(px, X, Y + j, 16, 1, 0.90 - 0.03 * k)


def contact(art, X, Y, x, y):
    """Short soft shadow on a floor cell from the furniture north of it."""
    if not DEPTH:
        return
    if art.at(x, y) not in FLOORISH or art.at(x, y - 1) not in CASTERS:
        return
    for j, f in enumerate((0.76, 0.87, 0.95)):
        for i in range(16):
            edge = i in (0, 15) and art.at(x + (-1 if i == 0 else 1), y - 1) not in CASTERS
            art.px.darken(X + i, Y + j, min(0.97, f + 0.08) if edge else f)


def tint(art, region, level):
    """Multiply every non-void cell of the region by the level tint."""
    if not DEPTH or level == 0:
        return
    mr, mg, mb = tint_for(level)
    x0, y0, x1, y1 = region
    p = art.px.p
    W, H = art.px.w, art.px.h
    for y in range(y0, y1):
        for x in range(x0, x1):
            if art.at(x, y) == ' ':
                continue
            X, Y = art.org(x, y)
            for j in range(16):
                for i in range(16):
                    xx, yy = X + i, Y + j
                    if 0 <= xx < W and 0 <= yy < H:
                        o = p[xx, yy]
                        if o[3]:
                            p[xx, yy] = (min(255, int(o[0] * mr)), min(255, int(o[1] * mg)), min(255, int(o[2] * mb)), o[3])


def tint_image(img, level):
    if not DEPTH or level == 0:
        return img
    mr, mg, mb = tint_for(level)
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * mr)))
    g = g.point(lambda v: min(255, int(v * mg)))
    b = b.point(lambda v: min(255, int(v * mb)))
    return Image.merge('RGBA', (r, g, b, a))


# ---------------------------------------------------------------- y-sort overlays (big trees)
def tree_overlays(art, level):
    """[(img, X, Y, base)] in 16-px map pixels: each 2x2+ tree drawn alone (no ground shadow), cut off at the bottom
    of its own cells, plus the sort line `base` (middle of its bottom row: anyone whose feet are above it is behind)."""
    import mall_trees
    out = []
    if not DEPTH:
        return out
    for (x, y, s, ttype, seed) in art.tree_specs((0, 0, art.w, art.h)):
        if s < 2:
            continue                                   # a single-cell tree never overhangs its cell
        tmp = Image.new('RGBA', (16 * (s + 2), 16 * (s + 2)), (0, 0, 0, 0))
        mall_trees.draw_tree(tmp, 16, 16, s, ttype, seed, art.theme, shadow=False)
        tmp = tmp.crop((0, 0, tmp.width, 16 * (s + 1)))   # nothing below the tree's own bottom row
        bb = tmp.getbbox()
        if not bb:
            continue
        piece = tint_image(tmp.crop(bb), level)
        X, Y = art.org(x, y)
        out.append((piece, X - 16 + bb[0], Y - 16 + bb[1], Y + 16 * s - 8))
    return out


def pack(pieces, width=1024):
    """Shelf-pack images; returns (atlas, [(ax, ay)])."""
    order = sorted(range(len(pieces)), key=lambda i: -pieces[i].height)
    pos = [None] * len(pieces)
    x = y = row_h = 0
    for i in order:
        im = pieces[i]
        if x + im.width > width:
            x, y, row_h = 0, y + row_h + 1, 0
        pos[i] = (x, y)
        x += im.width + 1
        row_h = max(row_h, im.height)
    atlas = Image.new('RGBA', (width, max(1, y + row_h)), (0, 0, 0, 0))
    for im, (ax, ay) in zip(pieces, pos):
        atlas.paste(im, (ax, ay))
    return atlas, pos


# ---------------------------------------------------------------- baked prop shadows
def prop_shadow(px, simg, X, Y, cell):
    """Soft two-step ellipse under a free-standing prop, before the sprite is composited on top."""
    if not DEPTH or cell not in FLOORISH:
        return
    bb = simg.getbbox()
    if not bb or bb[3] - bb[1] <= 4:
        return                                         # flat things (notes, rugs) cast nothing
    cx = (bb[0] + bb[2]) / 2
    rx = max(3.0, (bb[2] - bb[0]) * 0.42)
    cy = min(15, bb[3]) - 0.5
    for j in range(-2, 2):
        for i in range(-8, 9):
            d = ((i + 0.5 - (cx - int(cx))) / rx) ** 2 + ((j + 0.5) / 1.8) ** 2
            if d <= 0.45:
                px.darken(X + int(cx) + i, Y + int(cy) + j, 0.80)
            elif d <= 1.0:
                px.darken(X + int(cx) + i, Y + int(cy) + j, 0.90)


# ---------------------------------------------------------------- ambient lights (Foundry)
# kind -> (colour or None = crystal tint, dim radius in grid units, bright, alpha, animation)
LIGHTS = {
    'lamp': ('#ffd27a', 2.5, 0.6, 0.35, None),
    'lamp-post': ('#ffd27a', 3.0, 0.8, 0.35, None),
    'candle-stand': ('#ffb050', 1.8, 0.4, 0.40, 'torch'),
    'spotlight': ('#fff4d0', 3.0, 1.0, 0.25, None),
    'neon-sign': ('#ff6ac8', 1.6, 0.3, 0.35, None),
    'crystal': ('#b8f0ff', 1.8, 0.4, 0.40, 'pulse'),
    'crystal-cluster': ('#b8f0ff', 1.8, 0.4, 0.40, 'pulse'),
    'crystal-sconce': (None, 2.2, 0.5, 0.35, 'pulse'),
    'crystal-lamp': (None, 2.2, 0.5, 0.35, 'pulse'),
    'crystal-lamp-floor': (None, 2.4, 0.6, 0.35, 'pulse'),
    'crystal-chandelier': (None, 3.0, 0.8, 0.35, 'pulse'),
    'crystal-string': (None, 2.4, 0.4, 0.30, 'pulse'),
}


def light_for(name, X, Y, seed, glows, crystal_tint):
    """One light record (16-px map pixels) for a baked object, or None."""
    if not DEPTH or name not in LIGHTS:
        return None
    col, dim, bright, alpha, anim = LIGHTS[name]
    if col is None:
        c = crystal_tint(seed)[1]
        col = '#%02x%02x%02x' % c[:3]
    dx, dy = (glows[name][0], glows[name][1]) if name in glows else (8, 8)
    if name == 'lamp':
        dx, dy = 7, 4
    return {'x': X + dx, 'y': Y + dy, 'kind': name, 'color': col, 'dim': dim, 'bright': bright, 'alpha': alpha,
            'anim': anim}
