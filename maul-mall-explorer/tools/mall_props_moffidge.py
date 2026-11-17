"""Venue pack: Moffidge's venue (mountain, monastic, holy; crossbows, silver, holy water).
Registers into mall_props.PROPS on import. Theme stub: "theme": "moffidge"."""
from pixcore import hx, mix
from mall_props import PROPS, WHITE, IRON, IRON2, BRASS, BRASS2, BRASS_HI, WOOD, WOOD2, WOOD_HI

STONE, STONE2, STONE_HI = hx('#9a9aa8'), hx('#6c6c7a'), hx('#c8c8d4')
SILVER, SILVER_HI = hx('#c8d0dc'), hx('#f4f8ff')
HOLY = hx('#a8e0ff')
GOLD = hx('#e8c040')
ACC = [hx(x) for x in ('#c83a3a', '#3a5ac8', '#e8c040', '#5a3a8a', '#3a8a5a', '#f0f0f0')]


def _holy_font(c, s):
    c.r(6, 9, 4, 4, STONE); c.r(4, 13, 8, 2, STONE2)
    c.r(2, 4, 12, 5, STONE); c.r(2, 4, 12, 1, STONE_HI); c.r(3, 5, 10, 2, HOLY); c.p(5, 5, WHITE)
    c.p(8, 2, HOLY); c.p(6, 1, WHITE); c.p(10, 2, WHITE)


def _prayer_bell(c, s):
    c.r(1, 0, 14, 2, WOOD2); c.r(2, 2, 1, 13, WOOD2); c.r(13, 2, 1, 13, WOOD2)
    c.disc(8, 7, 4, BRASS); c.r(4, 7, 9, 4, BRASS); c.r(3, 10, 11, 1, BRASS2)
    c.r(6, 4, 1, 5, BRASS_HI); c.r(7, 2, 2, 2, IRON2); c.disc(8, 12, 1, IRON2)


def _crossbow_rack(c, s):
    c.r(1, 1, 14, 13, WOOD2); c.r(1, 1, 14, 1, WOOD_HI)
    for y in (4, 9):
        c.r(3, y, 10, 1, IRON); c.r(7, y - 2, 2, 5, WOOD)
        c.r(3, y, 1, 2, IRON2); c.r(12, y, 1, 2, IRON2); c.r(4, y + 1, 8, 1, hx('#e8e0c8'))
    c.r(2, 12, 12, 1, SILVER)


def _silver_case(c, s):
    c.r(1, 2, 14, 12, WOOD); c.r(2, 3, 12, 8, hx('#2a2a40')); c.r(1, 2, 14, 1, WOOD_HI)
    c.r(3, 5, 1, 5, SILVER); c.r(3, 4, 1, 1, SILVER_HI)            # dagger
    c.disc(7, 6, 1, SILVER); c.r(7, 7, 1, 3, SILVER)                # spoon
    c.r(10, 4, 3, 1, SILVER); c.r(11, 5, 1, 5, SILVER)              # holy symbol
    c.r(1, 11, 14, 1, mix(WOOD, WHITE, 0.2))


def _candle_stand(c, s):
    c.r(7, 6, 2, 8, IRON); c.r(4, 14, 8, 1, IRON2); c.r(2, 6, 12, 1, IRON)
    for x in (2, 7, 12):
        c.r(x, 2, 2, 4, hx('#f4ecd8')); c.p(x, 1, hx('#ffd040')); c.p(x + 1, 0, hx('#ff8a20'))


def _altar(c, s):
    cl = ACC[s % 5]
    c.r(1, 6, 14, 8, STONE); c.r(1, 6, 14, 1, STONE_HI); c.r(1, 13, 14, 1, STONE2)
    c.r(5, 6, 6, 8, cl); c.r(6, 9, 4, 1, GOLD); c.r(7, 8, 2, 3, GOLD)
    c.r(3, 3, 1, 3, hx('#f4ecd8')); c.p(3, 2, hx('#ffd040')); c.r(12, 3, 1, 3, hx('#f4ecd8')); c.p(12, 2, hx('#ffd040'))
    c.r(7, 2, 2, 4, SILVER)


def _lectern(c, s):
    c.r(7, 7, 2, 7, WOOD2); c.r(4, 14, 8, 1, WOOD2)
    c.r(2, 3, 12, 4, WOOD); c.r(3, 3, 10, 3, hx('#f4ecd8')); c.r(8, 3, 1, 3, hx('#c8b898'))
    c.r(4, 4, 3, 1, hx('#8a8070')); c.r(9, 4, 3, 1, hx('#8a8070')); c.r(7, 6, 1, 3, hx('#c83a3a'))


def _prayer_flags(c, s):
    c.r(0, 2, 16, 1, hx('#d8c8a0')); c.r(0, 1, 1, 14, WOOD2); c.r(15, 1, 1, 14, WOOD2)
    cols = [hx('#3a7ae0'), WHITE, hx('#e04848'), hx('#40a060'), hx('#f0c030')]
    for k, x in enumerate(range(1, 15, 3)):
        c.r(x, 3, 2, 4, cols[(k + s) % 5])


def _tapestry(c, s):
    cl = ACC[s % 5]
    c.r(1, 0, 14, 1, WOOD2); c.r(2, 1, 12, 13, cl); c.r(2, 1, 12, 1, GOLD); c.r(2, 13, 12, 1, GOLD)
    c.disc(8, 6, 3, GOLD); c.disc(8, 6, 2, cl); c.r(8, 3, 1, 7, GOLD); c.r(5, 6, 7, 1, GOLD)
    for x in range(2, 14, 2):
        c.p(x, 14, GOLD)


def _stone_shrine(c, s):
    c.r(3, 4, 10, 10, STONE); c.r(2, 2, 12, 2, STONE2); c.r(5, 0, 6, 2, STONE2)
    c.r(5, 6, 6, 6, hx('#2a2a34')); c.r(7, 8, 2, 3, hx('#ffd040')); c.p(7, 7, hx('#fff6c0'))
    c.r(3, 13, 10, 1, STONE2); c.p(4, 5, hx('#60a060')); c.p(12, 10, hx('#60a060'))


def _incense_burner(c, s):
    c.r(4, 9, 8, 4, BRASS); c.r(4, 9, 8, 1, BRASS_HI); c.r(5, 13, 2, 2, BRASS2); c.r(9, 13, 2, 2, BRASS2)
    c.r(6, 7, 4, 2, BRASS2)
    for (x, y) in ((8, 5), (7, 4), (8, 3), (9, 2), (8, 1), (7, 0)):
        c.p(x, y, hx('#d8d8e4'))


def _snow_pine(c, s):
    g, gd = hx('#2e6a4a'), hx('#1e4a34')
    for k, (y, w) in enumerate(((1, 2), (3, 6), (6, 10), (9, 14))):
        c.r(8 - w // 2, y, w, 3, g if k % 2 else gd)
        c.r(8 - w // 2, y, w, 1, WHITE)
    c.r(7, 12, 2, 3, hx('#6a4428'))


def _stained_glass(c, s):
    c.r(3, 0, 10, 15, STONE2); c.disc(8, 4, 4, STONE2)
    cols = [hx('#e04848'), hx('#3a7ae0'), hx('#f0c030'), hx('#40a060'), hx('#a060e0')]
    for j in range(2, 13, 3):
        for i in range(4, 12, 3):
            c.r(i, j, 2, 2, cols[(i + j + s) % 5])
    c.r(3, 14, 10, 1, STONE)


def _holy_water_cask(c, s):
    c.r(3, 3, 10, 11, WOOD); c.r(2, 5, 12, 7, WOOD); c.r(3, 3, 10, 1, WOOD_HI)
    for y in (5, 10):
        c.r(2, y, 12, 1, SILVER)
    c.r(6, 6, 4, 3, HOLY); c.r(7, 6, 1, 3, WHITE); c.r(6, 7, 4, 1, WHITE)
    c.r(12, 9, 3, 1, BRASS); c.p(14, 10, HOLY)


PACK = {
    'holy-font': _holy_font, 'prayer-bell': _prayer_bell, 'crossbow-rack': _crossbow_rack, 'silver-case': _silver_case,
    'candle-stand': _candle_stand, 'altar': _altar, 'lectern': _lectern, 'prayer-flags': _prayer_flags,
    'tapestry': _tapestry, 'stone-shrine': _stone_shrine, 'incense-burner': _incense_burner, 'snow-pine': _snow_pine,
    'stained-glass': _stained_glass, 'holy-water-cask': _holy_water_cask,
}
PROPS.update(PACK)
