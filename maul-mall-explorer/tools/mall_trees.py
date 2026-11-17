"""Big trees (SPEC 15, 16 Nov 2026).

Contiguous `T` cells are covered greedily by squares (largest first, up to 4x4); each square is ONE tree:
1x1 small, 2x2 big, 3x3+ giant with a canopy overhanging the neighbouring cells and the trunk at the bottom-centre.
Tree type: pinned via the mall JSON `trees` list, else a stable hash over the theme's list.
"""
import math
from PIL import Image
from pixcore import hx, mix, dk, hsh

TYPES = {
    'galleria': ['mushroom', 'palm', 'banana', 'fern', 'jungle', 'flowering', 'bamboo'],
    'cogskill': ['topiary', 'crystal', 'bamboo', 'flowering', 'palm', 'fern'],
    'immia': ['palm', 'banana', 'flowering', 'palm'],
    'slooper': ['jungle', 'fern', 'flowering', 'bamboo'],
    'panto': ['topiary', 'flowering', 'crystal'],
    'moffidge': ['topiary', 'flowering', 'fern'],
}
ALL_TYPES = sorted(set(TYPES['galleria']) | set(TYPES['cogskill']))
ALIASES = {'banana-plant': 'banana', 'jungle-vine-tree': 'jungle', 'jungle-vine': 'jungle', 'giant-fern': 'fern', 'mushroom-tree': 'mushroom', 'vine': 'jungle',
           'jungle-tree': 'jungle', 'vines': 'jungle', 'bamboo-clump': 'bamboo', 'crystal-tree': 'crystal',
           'glowing-crystal': 'crystal', 'flower': 'flowering', 'flowering-tree': 'flowering', 'blossom': 'flowering',
           'palm-tree': 'palm', 'topiary-tree': 'topiary'}


def tree_type(name):
    """Normalise a pinned type name; None if unknown."""
    n = str(name or '').strip().lower().replace('_', '-').replace(' ', '-')
    n = ALIASES.get(n, n)
    return n if n in ALL_TYPES else None
OUT = hx('#1a1424')
WHITE = hx('#fff8ee')


def cover_squares(cells):
    """Greedy cover of a set of (x, y) cells by squares: [(x, y, size)], biggest first, row-major."""
    left = set(cells)
    out = []
    for size in (4, 3, 2, 1):
        for (x, y) in sorted(cells, key=lambda c: (c[1], c[0])):
            if all((x + i, y + j) in left for i in range(size) for j in range(size)):
                for i in range(size):
                    for j in range(size):
                        left.discard((x + i, y + j))
                out.append((x, y, size))
    return out


class _L:
    """Scratch RGBA layer with a mask, so outlines and shading can be added after the shapes."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        self.p = self.img.load()

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[x, y] = c

    def get(self, x, y):
        return self.p[x, y] if 0 <= x < self.w and 0 <= y < self.h else (0, 0, 0, 0)

    def disc(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / max(rx, 0.5)) ** 2 + ((y + 0.5 - cy) / max(ry, 0.5)) ** 2 <= 1:
                    self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n + 1):
            t = k / max(n, 1)
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for i in range(w):
                for j in range(w):
                    self.set(x + i - w // 2, y + j - w // 2, c)

    def rect(self, x, y, w, h, c):
        for j in range(int(y), int(y + h)):
            for i in range(int(x), int(x + w)):
                self.set(i, j, c)

    def outline(self, col=OUT):
        src = self.img.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < self.w and 0 <= yy < self.h and src[xx, yy][3]:
                        self.p[x, y] = col
                        break


def _shade_blob(L, cx, cy, r, base, light, dark):
    """Recolour the blob at (cx, cy) radius r: lit upper-left, dark lower-right."""
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            c = L.get(x, y)
            if c[3] == 0 or c[:3] != base[:3]:
                continue
            d = ((x - cx) + (y - cy)) / max(r, 1)
            if d < -0.75:
                L.set(x, y, light)
            elif d > 0.7:
                L.set(x, y, dark)


def _canopy(L, cx, cy, r, cols, seed, lumps=6):
    base, light, dark = cols
    pts = [(cx, cy, r)]
    for k in range(lumps):
        a = (hsh(seed, k) % 360) * math.pi / 180
        rr = r * (0.45 + (hsh(seed, k, 3) % 30) / 100)
        pts.append((cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r * 0.5, rr))
    for (x, y, rr) in pts:
        L.disc(x, y, rr, rr * 0.9, base)
    for (x, y, rr) in pts:
        _shade_blob(L, x, y, rr, base, light, dark)
    # leaf texture
    for k in range(int(r * r / 3)):
        hv = hsh(seed, k, 9)
        x, y = cx - r + hv % int(2 * r + 1), cy - r + (hv >> 8) % int(2 * r + 1)
        c = L.get(x, y)
        if c[3] and c[:3] == base[:3]:
            L.set(x, y, dark if k % 3 else light)


def _trunk(L, cx, top, bottom, w, col, col2):
    L.rect(cx - w // 2, top, w, bottom - top, col)
    L.rect(cx - w // 2, top, max(1, w // 3), bottom - top, col2)
    L.rect(cx - w // 2 - 1, bottom - 2, w + 2, 2, col)        # root flare


def draw_tree(img, X, Y, s, ttype, seed, theme, shadow=True):
    """Draw one tree covering the s x s cells whose top-left pixel is (X, Y) on img (RGBA)."""
    S = 16 * s
    ov = 0 if s == 1 else (4 if s == 2 else 9)
    W = S + 2 * ov
    L = _L(W, W)
    ox = oy = ov
    cx = ox + S // 2
    ground = oy + S - 2
    G = (hx('#4caa48'), hx('#8ad860'), hx('#2e7a34'))
    if ttype == 'mushroom':
        caps = ['#d8463a', '#e8862a', '#8a5ad0', '#3aa8a0', '#d84a8a']
        cap = hx(caps[seed % len(caps)])
        stem_w = max(4, S // 4)
        _trunk(L, cx, oy + S * 0.45, ground, stem_w, hx('#f2e6ca'), hx('#cdb894'))
        L.rect(cx - stem_w // 2 - 1, oy + S * 0.5, stem_w + 2, 2, hx('#e8dcc0'))          # gill ring
        r = S * 0.5 + ov * 0.6
        L.disc(cx, oy + S * 0.42, r, r * 0.62, cap)
        L.rect(cx - r, oy + S * 0.42, 2 * r, r * 0.12 + 1, dk(cap, 0.7))
        _shade_blob(L, cx, oy + S * 0.3, r * 0.8, cap, mix(cap, WHITE, 0.3), dk(cap, 0.8))
        for k in range(3 + 2 * s):
            hv = hsh(seed, k, 17)
            sx = cx - r * 0.7 + hv % int(1.4 * r + 1)
            sy = oy + S * 0.42 - r * 0.5 + (hv >> 7) % int(r * 0.45 + 1)
            if L.get(sx, sy)[3]:
                L.disc(sx, sy, 1 + s // 2, 1 + s // 3, WHITE)
    elif ttype == 'topiary':
        _trunk(L, cx, oy + S * 0.55, ground - S * 0.15, max(2, S // 8), hx('#5a3e12'), hx('#7a5a30'))
        L.rect(cx - S * 0.28, ground - S * 0.18, S * 0.56, S * 0.18 + 1, hx('#c99a3e'))
        L.rect(cx - S * 0.28, ground - S * 0.18, S * 0.56, 1, hx('#ecc674'))
        g = (hx('#3eb87a'), hx('#8af0b0'), hx('#24804e'))
        L.disc(cx, oy + S * 0.36, S * 0.36 + ov * 0.4, S * 0.34 + ov * 0.4, g[0])
        _shade_blob(L, cx, oy + S * 0.36, S * 0.36 + ov * 0.4, *g)
        if s >= 2:
            L.disc(cx, oy + S * 0.05, S * 0.16, S * 0.14, g[0])
            _shade_blob(L, cx, oy + S * 0.05, S * 0.16, *g)
    elif ttype == 'crystal':
        _trunk(L, cx, oy + S * 0.5, ground, max(3, S // 6), hx('#3a4050'), hx('#5a6070'))
        cc = [('#78e0e0', '#dafcff', '#2e9aa8'), ('#c890ff', '#f0e0ff', '#7a48c0'), ('#ff90c8', '#ffe0f0', '#c04a8a')]
        a, b, c = (hx(x) for x in cc[seed % 3])
        n = 3 + 2 * s
        for k in range(n):
            ang = math.pi * (0.1 + 0.8 * k / max(1, n - 1))
            ln = S * (0.35 + (hsh(seed, k) % 25) / 100) + ov * 0.5
            x0, y0 = cx, oy + S * 0.5
            x1, y1 = x0 - math.cos(ang) * ln, y0 - math.sin(ang) * ln
            L.line(x0, y0, x1, y1, a, w=2 + s // 2)
            L.line(x0 + 1, y0, x1 + 1, y1, c, w=1)
            L.disc(x1, y1, 1 + s // 2, 2 + s // 2, b)
    elif ttype == 'palm':
        lean = (seed % 3 - 1) * S * 0.12
        top = (cx + lean, oy + S * 0.25)
        for k in range(10):
            t = k / 9
            x = cx + lean * t * t
            y = ground - (ground - top[1]) * t
            L.rect(x - (1 + s // 2), y, 2 + s, (ground - top[1]) / 9 + 1, hx('#a07040') if k % 2 else hx('#c8904e'))
        r = S * 0.42 + ov * 0.8
        for k in range(6):
            ang = math.pi * (1.05 + k * 0.18) if k < 6 else 0
            ang = [-0.2, 0.35, 1.0, 2.15, 2.8, 3.35][k]
            x1, y1 = top[0] + math.cos(ang) * r, top[1] + math.sin(ang) * r * 0.55 + r * 0.25
            mx, my = (top[0] + x1) / 2, min(top[1], y1) - r * 0.12
            L.line(top[0], top[1], mx, my, G[0], w=2 + s // 2)
            L.line(mx, my, x1, y1, G[0], w=1 + s // 2)
            L.line(top[0], top[1] - 1, mx, my - 1, G[1], w=1)
        L.disc(top[0], top[1] + 2, 1 + s // 2, 1 + s // 2, hx('#7a4a20'))
    elif ttype == 'banana':
        _trunk(L, cx, oy + S * 0.45, ground, max(3, S // 6), hx('#7a8a3a'), hx('#a0b050'))
        r = S * 0.5 + ov * 0.7
        for k, ang in enumerate((-2.6, -2.0, -1.2, -0.5, 0.1, -1.6)):
            x1, y1 = cx + math.cos(ang) * r, oy + S * 0.45 + math.sin(ang) * r * 0.8
            mx, my = (cx + x1) / 2, (oy + S * 0.45 + y1) / 2
            L.disc(mx, my, abs(x1 - cx) / 2 + 2, max(2, S * 0.08 + s), G[0] if k % 2 else hx('#5ab84a'))
            L.line(cx, oy + S * 0.45, x1, y1, G[2], w=1)
        L.rect(cx + 1, oy + S * 0.5, 2 + s, 3 + s, hx('#f0d040'))
    elif ttype == 'fern':
        base_y = ground - 1
        r = S * 0.55 + ov * 0.6
        for k in range(7):
            ang = math.pi * (0.08 + 0.84 * k / 6)
            x1, y1 = cx - math.cos(ang) * r, base_y - math.sin(ang) * r * 0.95
            cxm, cym = (cx + x1) / 2, (base_y + y1) / 2 - r * 0.15
            for t in range(12):
                tt = t / 11
                x = (1 - tt) ** 2 * cx + 2 * (1 - tt) * tt * cxm + tt * tt * x1
                y = (1 - tt) ** 2 * base_y + 2 * (1 - tt) * tt * cym + tt * tt * y1
                L.set(x, y, G[2])
                lw = int((1 - tt) * (2 + s))
                for q in range(1, lw + 1):
                    L.set(x - q * 0.6, y - q * 0.5, G[0]); L.set(x + q * 0.6, y - q * 0.5, G[1] if q == lw else G[0])
    elif ttype == 'bamboo':
        n = 2 + 2 * s
        for k in range(n):
            x = ox + 2 + (S - 4) * (k + 0.5) / n + (hsh(seed, k) % 3) - 1
            h = S * (0.7 + (hsh(seed, k, 2) % 30) / 100) + ov * 0.5
            col = hx('#6ab04a') if k % 2 else hx('#88c858')
            L.rect(x, ground - h, 2, h, col)
            for j in range(int(ground - h) + 3, int(ground), 5 + s):
                L.rect(x - 1, j, 4, 1, hx('#3e7a2c'))
            for q in range(3):
                ly = ground - h + 2 + q * 3
                L.line(x, ly, x + (4 + s) * (1 if (k + q) % 2 else -1), ly - 2, G[0], w=1)
    else:   # jungle / flowering: round canopy on a trunk
        flowering = ttype == 'flowering'
        _trunk(L, cx, oy + S * 0.5, ground, max(3, S // 5), hx('#6a4428'), hx('#8a6040'))
        if s >= 3:
            L.line(cx, oy + S * 0.6, cx - S * 0.25, oy + S * 0.45, hx('#6a4428'), w=2)
            L.line(cx, oy + S * 0.65, cx + S * 0.25, oy + S * 0.48, hx('#6a4428'), w=2)
        cols = (hx('#3a9a48'), hx('#6ac860'), hx('#24683a')) if flowering else (hx('#2e8a3e'), hx('#5ab85a'), hx('#1e5a2c'))
        r = (S * 0.42 + ov * 0.75) * (0.8 if s == 1 else 1)
        ccy = oy + S * (0.32 if s == 1 else 0.38)
        _canopy(L, cx, ccy, r, cols, seed)
        if flowering:
            pinks = [('#f478a8', '#ffd0e4'), ('#ffffff', '#f8d8e8'), ('#b880f0', '#ecd8ff'), ('#ffb040', '#fff0b0')]
            pa, pb = (hx(x) for x in pinks[seed % 4])
            for k in range(int(r * r * 0.45)):
                hv = hsh(seed, k, 23)
                x, y = cx - r + hv % int(2 * r + 1), ccy - r + (hv >> 8) % int(2 * r + 1)
                if L.get(x, y)[3] and L.get(x + 1, y)[3] and L.get(x, y + 1)[3]:
                    L.set(x, y, pa); L.set(x + 1, y, pa); L.set(x, y + 1, pa); L.set(x + 1, y + 1, pb if k % 2 else pa)
        else:
            # hanging vines + a few jungle flowers
            for k in range(2 + 2 * s):
                hv = hsh(seed, k, 29)
                x = cx - r * 0.8 + hv % int(1.6 * r)
                y0 = oy + S * 0.38 + r * 0.3
                ln = 3 + (hv >> 6) % (4 + 3 * s)
                for j in range(ln):
                    if L.get(x, y0 + j)[3] == 0 or True:
                        L.set(x + (j // 4) % 2, y0 + j, hx('#4a9a3a'))
                if k % 3 == 0:
                    L.set(x, y0 + ln, hx('#f05a7a'))
    L.outline()
    # ground shadow under the tree, then the tree itself
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sp = sh.load()
    rx, ry = S * 0.42, max(2, S * 0.12)
    for y in range(W):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - ground) / ry) ** 2 <= 1:
                sp[x, y] = (10, 6, 20, 70)
    if shadow:                   # False = the tree alone (depth overlays, mall_depth.py)
        _paste(img, sh, X - ov, Y - ov)
    _paste(img, L.img, X - ov, Y - ov)


def _paste(img, layer, x, y):
    cx0, cy0 = max(0, -x), max(0, -y)
    cx1, cy1 = min(layer.width, img.width - x), min(layer.height, img.height - y)
    if cx1 <= cx0 or cy1 <= cy0:
        return
    img.alpha_composite(layer.crop((cx0, cy0, cx1, cy1)), (x + cx0, y + cy0))
