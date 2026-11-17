"""Washroom fittings and crystal lighting (round 5, 16 Nov 2026). Registers into mall_props.PROPS on import.

GLOWS lists the light pool each crystal light casts; render_mall.bake_obj paints it under the sprite as a soft,
tinted brightening of the floor (low alpha, smooth falloff), so it reads as light, not a blob.
"""
from pixcore import hx, mix
from mall_props import PROPS, WHITE, IRON, IRON2, BRASS, BRASS2, BRASS_HI

PORC, PORC2, PORC_SH = hx('#f8f8fc'), hx('#dfe4ec'), hx('#b8c0cc')
STEEL, STEEL2 = hx('#c8d0d8'), hx('#8a96a2')
MIRROR, MIRROR_HI = hx('#a8d8ec'), hx('#e8f8ff')
# crystal tints: (core, light, dark); glow colour = light
CRYSTAL = [(hx('#c890ff'), hx('#f0e0ff'), hx('#8a50d8')), (hx('#80e0ff'), hx('#e0faff'), hx('#3a98d0')),
           (hx('#ff90c8'), hx('#ffe0f0'), hx('#d04a8a')), (hx('#90ffb8'), hx('#e0fff0'), hx('#3ab070'))]


def crystal_tint(seed):
    return CRYSTAL[seed % 4]


def _toilet(c, s):
    c.r(4, 1, 8, 5, PORC2); c.r(4, 1, 8, 1, PORC); c.r(10, 2, 1, 1, STEEL2)          # cistern + flush button
    c.disc(8, 10, 4, PORC); c.r(4, 6, 8, 4, PORC)                                    # bowl
    c.disc(8, 10, 2, hx('#a8d8ec')); c.p(7, 9, WHITE)                               # water
    c.r(4, 6, 8, 1, PORC_SH); c.r(6, 14, 4, 1, PORC_SH)


def _toilet_stall(c, s):
    door = [hx('#5a9aa8'), hx('#c87a8a'), hx('#8a9a5a'), hx('#7a7aa8')][s % 4]
    c.r(0, 0, 2, 15, STEEL2); c.r(14, 0, 2, 15, STEEL2); c.r(0, 0, 16, 1, STEEL)    # partitions + top rail
    c.r(2, 1, 12, 13, door); c.r(2, 1, 12, 1, mix(door, WHITE, 0.4))
    c.r(3, 3, 10, 4, mix(door, WHITE, 0.15)); c.r(3, 8, 10, 5, mix(door, WHITE, 0.15))
    c.r(11, 7, 2, 1, BRASS); c.r(6, 2, 4, 1, hx('#40c070') if s % 2 else hx('#e04848'))   # handle + vacant/occupied
    c.r(2, 14, 12, 1, hx('#30343c'))                                                # gap under the door


def _wash_basin(c, s):
    c.r(3, 0, 10, 7, STEEL2); c.r(4, 1, 8, 5, MIRROR); c.r(5, 1, 2, 2, MIRROR_HI); c.p(10, 4, MIRROR_HI)
    c.r(2, 8, 12, 4, PORC); c.r(2, 8, 12, 1, PORC2); c.r(4, 9, 8, 2, hx('#c8dce8'))   # basin
    c.r(7, 7, 2, 2, STEEL); c.p(8, 9, MIRROR_HI)                                    # tap + drip
    c.r(5, 12, 6, 2, PORC_SH)


def _hand_dryer(c, s):
    c.r(3, 3, 10, 7, PORC2); c.r(3, 3, 10, 1, PORC); c.r(4, 5, 8, 1, STEEL)
    c.r(6, 10, 4, 2, STEEL2); c.p(11, 4, hx('#40c070'))
    for x in (5, 8, 11):
        c.p(x - 1, 13, hx('#c8e0f0')); c.p(x, 14, hx('#c8e0f0'))


def _towel_rack(c, s):
    cols = [hx('#f8f8fc'), hx('#a8d8ec'), hx('#f8c0d0'), hx('#c8f0c8')]
    c.r(1, 3, 14, 1, STEEL); c.r(1, 2, 1, 3, STEEL2); c.r(14, 2, 1, 3, STEEL2)
    for k, x in enumerate((2, 9)):
        col = cols[(k + s) % 4]
        c.r(x, 3, 5, 9, col); c.r(x, 10, 5, 1, mix(col, hx('#000000'), 0.15)); c.r(x, 4, 5, 1, mix(col, WHITE, 0.5))


def _crystal_sconce(c, s):
    a, l, d = crystal_tint(s)
    c.r(6, 9, 4, 2, BRASS2); c.r(7, 11, 2, 2, BRASS2); c.r(5, 8, 6, 1, BRASS)     # bracket on the wall face
    c.r(7, 3, 2, 5, a); c.p(8, 2, a); c.r(6, 5, 1, 3, d); c.r(9, 5, 1, 3, d); c.p(7, 4, l)
    c.p(5, 3, l); c.p(10, 2, l)


def _crystal_lamp_floor(c, s):
    a, l, d = crystal_tint(s)
    c.r(7, 6, 2, 8, IRON2); c.r(5, 14, 6, 1, IRON); c.r(4, 13, 8, 1, IRON2)
    c.r(5, 1, 2, 5, a); c.r(7, 0, 2, 6, a); c.r(9, 2, 2, 4, a)                       # three-point crystal head
    c.r(8, 0, 1, 6, d); c.r(10, 2, 1, 4, d); c.p(7, 1, l); c.p(5, 2, l)
    c.r(5, 6, 6, 1, BRASS)


def _crystal_chandelier(c, s):
    a, l, d = crystal_tint(s)
    c.r(7, 0, 2, 3, BRASS2)                                                         # chain from the ceiling
    c.r(3, 3, 10, 2, BRASS); c.r(3, 3, 10, 1, BRASS_HI)                             # ring
    for k, x in enumerate((3, 6, 9, 12)):
        c.r(x, 5, 2, 3 + (k % 2), a); c.p(x, 5, l); c.p(x + 1, 7 + (k % 2), d)      # hanging crystals
    c.r(7, 5, 2, 4, a); c.p(7, 5, l); c.p(8, 9, d)


def _crystal_string(c, s):
    a, l, d = crystal_tint(s)
    pts = [(0, 3), (3, 5), (6, 6), (9, 6), (12, 5), (15, 3)]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for x in range(x0, x1 + 1):
            c.p(x, y0 + (y1 - y0) * (x - x0) // max(1, x1 - x0), hx('#5a5048'))
    for k, (x, y) in enumerate(((2, 5), (6, 7), (10, 7), (13, 5))):
        col = crystal_tint(s + k)
        c.r(x, y, 2, 2, col[0]); c.p(x, y, col[1])


PACK = {
    'toilet': _toilet, 'toilet-stall': _toilet_stall, 'wash-basin': _wash_basin, 'hand-dryer': _hand_dryer,
    'towel-rack': _towel_rack, 'crystal-sconce': _crystal_sconce, 'crystal-lamp-floor': _crystal_lamp_floor,
    'crystal-chandelier': _crystal_chandelier, 'crystal-string': _crystal_string,
}
PROPS.update(PACK)

# light pools: (centre dx, centre dy from the tile's top-left pixel, radius x, radius y, peak alpha)
GLOWS = {
    'crystal-sconce': (8, 22, 11, 7, 46),         # on the floor in front of (south of) the wall
    'crystal-lamp-floor': (8, 13, 12, 7, 44),
    'crystal-chandelier': (8, 13, 14, 9, 50),     # pool directly beneath the overhead fixture
    'crystal-string': (8, 12, 14, 6, 32),
    'crystal-lamp': (8, 12, 11, 7, 40),
}
