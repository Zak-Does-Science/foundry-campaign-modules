"""Extra 16 px prop sprites (SPEC 10, 16 Nov 2026), usable as obj:<thing> and in a mall's `props` list.

Each prop is drawn as flat colour shapes; `build_prop` then adds the dark outline and a soft ground shadow
automatically, so every prop matches the chunky GBC look of the other sprites.
"""
from PIL import Image
from pixcore import hx, mix, dk, PX

OUT = hx('#1e1428')
WHITE = hx('#fbf8f0')
IRON, IRON2, IRON_HI = hx('#6c7684'), hx('#4a5260'), hx('#a8b4c0')
BRASS, BRASS2, BRASS_HI = hx('#d0a040'), hx('#9a7028'), hx('#f4d488')
WOOD, WOOD2, WOOD_HI = hx('#b8743e'), hx('#8a5228'), hx('#dc9c5c')
GLOW = [(hx('#c890ff'), hx('#8a50d8')), (hx('#80e0ff'), hx('#3a98d0')),
        (hx('#ff90c8'), hx('#d04a8a')), (hx('#90ffb8'), hx('#3ab070'))]
NEON = [hx('#5ff4ff'), hx('#ff6ac0'), hx('#ffe066'), hx('#5aff8a')]


class _C:
    def __init__(self):
        self.img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        self.px = PX(self.img)

    def r(self, x, y, w, h, c):
        self.px.rect(x, y, w, h, c)

    def p(self, x, y, c):
        self.px.set(x, y, c)

    def disc(self, cx, cy, rad, c):
        for j in range(-rad, rad + 1):
            for i in range(-rad, rad + 1):
                if i * i + j * j <= rad * rad + rad * 0.6:
                    self.px.set(cx + i, cy + j, c)


def _anvil(c, s):
    c.r(2, 4, 12, 3, IRON); c.r(2, 4, 12, 1, IRON_HI); c.r(0, 5, 2, 1, IRON)
    c.r(5, 7, 6, 3, IRON2); c.r(3, 10, 10, 3, IRON); c.r(3, 12, 10, 1, IRON2)
    c.r(4, 13, 8, 1, WOOD2)


def _forge(c, s):
    c.r(1, 3, 14, 11, hx('#7a5a4a')); c.r(1, 3, 14, 1, hx('#a07a64'))
    for j in range(4, 14, 3):
        c.r(1, j, 14, 1, hx('#5a3e32'))
    c.r(4, 7, 8, 5, hx('#2a1410'))
    c.r(5, 9, 6, 3, hx('#ff7a20')); c.r(6, 10, 4, 2, hx('#ffd040')); c.p(7, 8, hx('#ff5020'))
    c.r(6, 0, 4, 3, IRON2); c.p(7, 0, hx('#c8c0c8'))


def _gear(c, gx, gy, rad, col):
    for (dx, dy) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        c.r(gx + dx * (rad + 1) - (1 if dx == 0 else 0), gy + dy * (rad + 1) - (1 if dy == 0 else 0),
            2 if dx == 0 else 1, 2 if dy == 0 else 1, col)
    for (dx, dy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        c.p(gx + dx * rad, gy + dy * rad, col)
    c.disc(gx, gy, rad, col)
    c.disc(gx, gy, max(1, rad - 2), dk(col, 0.7))
    c.p(gx, gy, OUT)
    c.p(gx - rad + 1, gy - 1, mix(col, WHITE, 0.55))


def _gearpile(c, s):
    _gear(c, 5, 10, 4, BRASS)
    _gear(c, 11, 5, 3, IRON_HI)
    c.r(9, 12, 5, 3, BRASS2); c.r(9, 12, 5, 1, BRASS)


def _crystal_cluster(c, s):
    a, b = GLOW[s % 4]
    for (x0, h, w) in ((3, 8, 3), (6, 12, 4), (10, 9, 3)):
        top = 14 - h
        c.r(x0, top + 1, w, h - 1, a); c.p(x0 + w // 2, top, a)
        c.r(x0 + w - 1, top + 1, 1, h - 1, b); c.p(x0, top + 2, WHITE)
    c.r(2, 13, 12, 2, hx('#6a5a7a'))


def _crystal_lamp(c, s):
    a, b = GLOW[s % 4]
    c.r(7, 6, 2, 7, BRASS2); c.r(5, 13, 6, 2, BRASS); c.r(5, 13, 6, 1, BRASS_HI)
    c.r(6, 1, 4, 5, a); c.r(9, 1, 1, 5, b); c.p(7, 2, WHITE); c.r(5, 3, 1, 2, a); c.r(10, 3, 1, 2, b)


def _tech_console(c, s):
    n = NEON[s % 4]
    c.r(1, 6, 14, 8, hx('#3a3f5a')); c.r(1, 6, 14, 1, hx('#5a6080'))
    c.r(2, 1, 12, 6, hx('#2a2e44')); c.r(3, 2, 10, 4, hx('#0c2a3a'))
    for i in range(3, 13, 2):
        c.p(i, 3 + (i // 2) % 2, n)
    c.r(3, 8, 3, 2, hx('#ff4040')); c.r(7, 8, 2, 2, hx('#ffe040')); c.r(10, 8, 3, 2, hx('#40e070'))
    c.r(3, 11, 10, 1, n)


def _robot_arm(c, s):
    c.r(3, 12, 8, 3, IRON2); c.r(3, 12, 8, 1, IRON)
    c.r(6, 7, 3, 5, hx('#e8a030')); c.r(6, 7, 1, 5, hx('#ffd070'))
    c.disc(7, 7, 1, IRON); c.r(8, 3, 4, 3, hx('#e8a030')); c.disc(8, 5, 1, IRON)
    c.r(12, 2, 2, 1, IRON_HI); c.r(12, 5, 2, 1, IRON_HI); c.r(11, 3, 1, 2, IRON)


def _cog_display(c, s):
    c.r(2, 12, 12, 3, WOOD); c.r(2, 12, 12, 1, WOOD_HI)
    c.disc(8, 7, 5, BRASS); c.disc(8, 7, 3, BRASS2); c.disc(8, 7, 1, BRASS_HI)
    for (dx, dy) in ((0, -6), (0, 6), (-6, 0), (6, 0), (-4, -4), (4, -4), (-4, 4), (4, 4)):
        c.p(8 + dx, 7 + dy, BRASS)


def _tesla_coil(c, s):
    n = NEON[0] if s % 2 == 0 else hx('#c890ff')
    c.r(4, 12, 8, 3, IRON2); c.r(4, 12, 8, 1, IRON)
    c.r(6, 5, 4, 7, BRASS2)
    for j in range(5, 12, 2):
        c.r(6, j, 4, 1, BRASS)
    c.disc(8, 3, 2, IRON_HI); c.p(7, 2, WHITE)
    for (x, y) in ((4, 1), (3, 2), (12, 1), (13, 3), (11, 0)):
        c.p(x, y, n)


def _screen(c, s):
    n = NEON[s % 4]
    c.r(1, 2, 14, 10, hx('#2a2e44')); c.r(2, 3, 12, 8, hx('#10283a'))
    c.r(3, 4, 6, 2, n); c.r(3, 7, 9, 1, mix(n, hx('#10283a'), 0.4)); c.r(3, 9, 5, 1, mix(n, hx('#10283a'), 0.4))
    c.p(12, 4, WHITE); c.r(7, 12, 2, 2, IRON2); c.r(5, 14, 6, 1, IRON)


def _toolrack(c, s):
    c.r(1, 1, 14, 13, WOOD2); c.r(1, 1, 14, 1, WOOD_HI)
    for i in range(3, 14, 3):
        c.p(i, 3, IRON_HI)
    c.r(3, 4, 1, 6, IRON); c.r(2, 4, 3, 2, IRON_HI)               # hammer
    c.r(6, 4, 1, 7, IRON_HI); c.r(6, 10, 1, 2, WOOD)              # chisel
    c.r(9, 4, 1, 8, IRON); c.r(8, 4, 3, 1, IRON)                   # wrench
    c.r(12, 4, 1, 5, hx('#e04848')); c.r(11, 9, 3, 2, IRON_HI)    # screwdriver


def _barrel(c, s):
    c.r(3, 2, 10, 12, WOOD); c.r(2, 4, 12, 8, WOOD)
    c.r(3, 2, 10, 2, WOOD_HI); c.r(5, 2, 6, 1, WOOD2)
    for j in (5, 10):
        c.r(2, j, 12, 1, IRON)
    for i in (5, 9):
        c.r(i, 4, 1, 10, WOOD2)


def _mannequin(c, s):
    cl = [hx('#d84848'), hx('#4870d8'), hx('#9858c8'), hx('#38b0b0')][s % 4]
    c.disc(8, 2, 2, hx('#e8dcc8'))
    c.r(5, 5, 6, 6, cl); c.r(4, 5, 1, 4, cl); c.r(11, 5, 1, 4, cl); c.r(5, 5, 6, 1, mix(cl, WHITE, 0.4))
    c.r(7, 11, 2, 2, WOOD2); c.r(5, 13, 6, 1, WOOD)


def _cauldron(c, s):
    a, b = GLOW[(s + 3) % 4]
    c.r(2, 6, 12, 7, hx('#3a3a44')); c.r(3, 13, 10, 1, hx('#3a3a44'))
    c.r(2, 5, 12, 2, hx('#5a5a68')); c.r(3, 5, 10, 1, a); c.p(6, 4, a); c.p(10, 3, b); c.p(8, 2, a)
    c.r(3, 7, 1, 4, hx('#6a6a78')); c.r(3, 14, 2, 1, hx('#ff7a20')); c.r(11, 14, 2, 1, hx('#ff7a20'))


def _bookshelf(c, s):
    c.r(1, 0, 14, 15, WOOD2); c.r(1, 0, 14, 1, WOOD_HI)
    cols = [hx(x) for x in ('#d84848', '#4870d8', '#48a848', '#e8c040', '#9858c8', '#e88838')]
    for row, yb in enumerate((6, 13)):
        i = 2
        k = 0
        while i < 14:
            w = 1 + (s + row + k) % 2
            h = 4 + (k + row) % 2
            c.r(i, yb - h, w, h, cols[(s + k + row * 2) % len(cols)])
            i += w
            k += 1
        c.r(2, yb, 12, 1, WOOD)


def _register(c, s):
    c.r(2, 8, 12, 6, hx('#c8a040')); c.r(2, 8, 12, 1, hx('#f0d488'))
    c.r(3, 4, 10, 4, hx('#9a7028')); c.r(4, 5, 8, 2, hx('#20402a')); c.r(5, 5, 4, 1, hx('#5aff8a'))
    for i in range(4, 12, 2):
        c.p(i, 10, WHITE); c.p(i + 1, 12, WHITE)
    c.r(3, 14, 10, 1, hx('#9a7028'))


def _jukebox(c, s):
    n = NEON[(s + 1) % 4]
    c.r(2, 4, 12, 11, hx('#8a3a5a')); c.disc(8, 5, 5, hx('#8a3a5a'))
    c.r(3, 4, 10, 1, n); c.disc(8, 5, 3, hx('#f4d488')); c.disc(8, 5, 1, n)
    c.r(4, 9, 8, 3, hx('#2a1830'))
    for i in range(4, 12, 2):
        c.p(i, 10, NEON[(i // 2) % 4])
    c.r(3, 13, 10, 1, BRASS)


def _arcade(c, s):
    n = NEON[s % 4]
    c.r(3, 0, 10, 15, hx('#3a3f5a')); c.r(3, 0, 10, 2, n)
    c.r(4, 3, 8, 5, hx('#10283a')); c.r(5, 4, 2, 2, n); c.p(9, 5, WHITE)
    c.r(2, 9, 12, 2, hx('#2a2e44')); c.p(5, 9, hx('#ff4040')); c.p(9, 9, hx('#ffe040')); c.p(10, 10, hx('#40e070'))
    c.r(4, 12, 8, 1, hx('#2a2e44'))


def _clock(c, s):
    c.r(5, 9, 6, 6, WOOD2); c.r(5, 9, 6, 1, WOOD)
    c.disc(8, 5, 4, BRASS); c.disc(8, 5, 3, WHITE)
    c.r(8, 3, 1, 3, OUT); c.r(8, 5, 2, 1, OUT)
    c.r(7, 11, 2, 3, BRASS_HI)


def _potion_rack(c, s):
    c.r(1, 2, 14, 12, WOOD2); c.r(1, 2, 14, 1, WOOD_HI)
    cols = [hx(x) for x in ('#ff5a7a', '#5ad0f0', '#90ff70', '#c890ff', '#ffd040')]
    for row, yb in enumerate((7, 13)):
        for k, i in enumerate(range(2, 14, 3)):
            col = cols[(s + k + row * 2) % len(cols)]
            c.r(i, yb - 3, 2, 3, col); c.p(i, yb - 4, hx('#e8dcc8')); c.p(i, yb - 3, mix(col, WHITE, 0.6))
        c.r(2, yb, 12, 1, WOOD)


PROPS = {
    'anvil': _anvil, 'forge': _forge, 'gearpile': _gearpile, 'crystal-cluster': _crystal_cluster,
    'crystal-lamp': _crystal_lamp, 'tech-console': _tech_console, 'robot-arm': _robot_arm,
    'cog-display': _cog_display, 'tesla-coil': _tesla_coil, 'screen': _screen, 'toolrack': _toolrack,
    'barrel': _barrel, 'mannequin': _mannequin, 'cauldron': _cauldron, 'bookshelf': _bookshelf,
    'register': _register, 'jukebox': _jukebox, 'arcade': _arcade, 'clock': _clock, 'potion-rack': _potion_rack,
}


def build_prop(thing, seed=0):
    c = _C()
    PROPS[thing](c, seed)
    img = c.img
    src = img.copy()
    sp, dp = src.load(), img.load()
    # auto outline: transparent pixels touching art become outline
    for y in range(16):
        for x in range(16):
            if sp[x, y][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < 16 and 0 <= yy < 16 and sp[xx, yy][3]:
                    dp[x, y] = OUT
                    break
    # soft ground shadow in the bottom row(s) under the footprint
    cols = [x for x in range(16) if any(dp[x, y][3] for y in range(10, 16))]
    if cols:
        for x in range(max(0, min(cols) + 1), min(16, max(cols))):
            if not dp[x, 15][3]:
                dp[x, 15] = (10, 6, 20, 90)
    return img
