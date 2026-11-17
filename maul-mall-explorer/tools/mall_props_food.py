"""Food-court and mall-life props (SPEC 14, 16 Nov 2026). Registers into mall_props.PROPS on import."""
from pixcore import hx, mix
from mall_props import PROPS, WHITE, IRON, IRON2, BRASS, BRASS2, BRASS_HI, WOOD, WOOD2, WOOD_HI, NEON

STEEL, STEEL2, STEEL_HI = hx('#b8c2cc'), hx('#8a96a2'), hx('#e8eef2')
FIRE, FIRE2, FIRE_HI = hx('#ff7a20'), hx('#e0401a'), hx('#ffd040')
BRICK, BRICK2 = hx('#b8583a'), hx('#8a3e2a')
LEAF, LEAF2, LEAF_HI = hx('#4caa48'), hx('#2e7a34'), hx('#8ad860')
POT, POT2 = hx('#c86a3a'), hx('#9a4a2a')
DARK = hx('#202428')
ACC = [hx(x) for x in ('#e04848', '#3a7ae0', '#f0b030', '#a060e0', '#3ab05a', '#f07ab0')]


def _oven(c, s):
    c.r(1, 2, 14, 13, STEEL); c.r(1, 2, 14, 3, STEEL2); c.r(1, 2, 14, 1, STEEL_HI)
    for i in (3, 6, 9, 12):
        c.p(i, 3, DARK)
    c.r(3, 6, 10, 7, hx('#2a2024')); c.r(4, 7, 8, 5, FIRE2); c.r(5, 9, 6, 2, FIRE); c.r(6, 10, 4, 1, FIRE_HI)
    c.r(4, 6, 8, 1, STEEL_HI); c.r(3, 14, 10, 1, STEEL2)


def _pizza_oven(c, s):
    c.disc(8, 8, 6, BRICK); c.r(2, 8, 13, 6, BRICK)
    for (x, y) in ((4, 4), (9, 3), (12, 6), (3, 9), (12, 11), (6, 12)):
        c.r(x, y, 2, 1, BRICK2)
    c.r(5, 8, 6, 5, hx('#2a1410')); c.r(6, 7, 4, 1, hx('#2a1410'))
    c.r(6, 10, 4, 3, FIRE); c.r(7, 11, 2, 2, FIRE_HI)
    c.r(7, 0, 2, 3, hx('#6a5a5a')); c.r(1, 14, 14, 1, hx('#6a5a5a'))


def _grill(c, s):
    c.r(1, 4, 14, 6, hx('#2a2a30'))
    for i in range(2, 14, 2):
        c.r(i, 4, 1, 6, hx('#5a5a66'))
    c.r(3, 5, 4, 2, hx('#a0583a')); c.r(9, 6, 4, 2, hx('#c87a4a')); c.p(4, 5, hx('#e8a070'))
    c.r(1, 10, 14, 2, STEEL2); c.r(1, 10, 14, 1, STEEL)
    c.r(2, 12, 1, 3, STEEL2); c.r(13, 12, 1, 3, STEEL2)
    c.p(5, 3, FIRE); c.p(11, 2, FIRE_HI); c.p(8, 3, FIRE2)


def _fryer(c, s):
    c.r(1, 5, 14, 10, STEEL); c.r(1, 5, 14, 1, STEEL_HI)
    c.r(2, 6, 12, 3, hx('#d8a020')); c.r(2, 6, 12, 1, hx('#f8d060'))
    c.r(3, 3, 4, 4, STEEL2); c.r(9, 3, 4, 4, STEEL2)
    c.r(4, 4, 2, 2, hx('#f0c040')); c.r(10, 4, 2, 2, hx('#f0c040'))
    c.r(4, 1, 1, 3, DARK); c.r(11, 1, 1, 3, DARK)
    c.r(3, 11, 2, 2, hx('#e04848')); c.r(11, 11, 2, 2, hx('#40e070'))


def _stove(c, s):
    c.r(1, 4, 14, 11, hx('#f0ece4')); c.r(1, 4, 14, 1, WHITE)
    c.r(2, 5, 12, 5, hx('#2a2a30'))
    for (x, y, hot) in ((3, 6, True), (9, 6, False), (3, 8, False), (9, 8, True)):
        c.r(x, y, 4, 1, FIRE if hot else hx('#5a5a66'))
    c.r(9, 1, 5, 5, STEEL2); c.r(9, 1, 5, 1, STEEL_HI); c.p(11, 0, WHITE)
    c.r(3, 11, 10, 3, hx('#c8c4bc')); c.r(5, 12, 6, 1, STEEL)


def _sink(c, s):
    c.r(1, 6, 14, 9, STEEL2); c.r(1, 6, 14, 2, STEEL)
    c.r(3, 7, 10, 4, hx('#4a5260')); c.r(4, 8, 8, 2, hx('#78c4f0')); c.p(5, 8, WHITE)
    c.r(7, 1, 2, 6, STEEL_HI); c.r(7, 1, 4, 1, STEEL_HI); c.p(10, 2, hx('#78c4f0')); c.p(10, 4, hx('#78c4f0'))
    c.r(3, 12, 10, 1, STEEL)


def _fridge(c, s):
    c.r(3, 0, 10, 15, hx('#eef2f4')); c.r(3, 0, 10, 1, WHITE)
    c.r(3, 5, 10, 1, STEEL2); c.r(11, 2, 1, 2, STEEL2); c.r(11, 7, 1, 4, STEEL2)
    c.r(12, 0, 1, 15, hx('#c8d0d6'))
    c.p(5, 2, ACC[s % 6]); c.p(6, 8, ACC[(s + 2) % 6]); c.r(5, 10, 2, 2, hx('#f8e080'))


def _soda_fountain(c, s):
    c.r(2, 1, 12, 8, hx('#d84848')); c.r(2, 1, 12, 1, hx('#f08a8a'))
    for k, i in enumerate((3, 7, 11)):
        c.r(i, 3, 2, 3, ACC[(k + s + 1) % 6]); c.p(i, 3, WHITE)
        c.r(i, 8, 2, 2, STEEL2)
    c.r(2, 11, 12, 3, STEEL2); c.r(2, 11, 12, 1, STEEL)
    c.r(7, 10, 2, 2, hx('#f8f0e0'))


def _tap(c, s):
    c.r(1, 8, 14, 6, WOOD); c.r(1, 8, 14, 1, WOOD_HI); c.r(1, 13, 14, 1, WOOD2)
    for k, i in enumerate((3, 7, 11)):
        c.r(i, 2, 2, 5, [BRASS, hx('#e04848'), hx('#3a7ae0')][(k + s) % 3]); c.p(i, 2, WHITE)
        c.r(i, 7, 2, 2, BRASS2); c.p(i, 9, BRASS_HI)
    c.r(2, 11, 12, 1, STEEL2)


def _menu_board(c, s):
    c.r(1, 1, 14, 10, WOOD2); c.r(2, 2, 12, 8, hx('#2a3a30'))
    cols = [WHITE, hx('#f0d040'), hx('#f090a8'), hx('#80d0ff')]
    for k, y in enumerate((3, 5, 7)):
        w = 6 + (k * 3 + s) % 4
        c.r(3, y, w, 1, cols[(k + s) % 4]); c.p(12, y, cols[0])
    c.r(3, 11, 1, 4, WOOD2); c.r(12, 11, 1, 4, WOOD2)


def _cake_stand(c, s):
    icing = [hx('#f8b0c8'), hx('#f8f0e0'), hx('#c8a0f0'), hx('#a0e0c0')][s % 4]
    c.r(3, 11, 10, 1, STEEL_HI); c.r(7, 12, 2, 2, STEEL); c.r(5, 14, 6, 1, STEEL)
    c.r(4, 7, 8, 4, hx('#e8c080')); c.r(4, 8, 8, 1, icing); c.r(4, 10, 8, 1, hx('#c88a4a'))
    c.r(5, 4, 6, 3, icing); c.r(5, 6, 6, 1, hx('#e8c080')); c.p(6, 4, WHITE)
    c.p(8, 2, hx('#e02040')); c.p(8, 3, hx('#e02040')); c.p(9, 1, LEAF)


def _bread_rack(c, s):
    c.r(1, 1, 1, 14, WOOD2); c.r(14, 1, 1, 14, WOOD2)
    for y in (5, 10, 14):
        c.r(1, y, 14, 1, WOOD)
    loaf, crust = hx('#e0a050'), hx('#b8742e')
    for k, x in enumerate((2, 6, 11)):
        c.r(x, 3, 4 if k == 1 else 3, 2, loaf); c.p(x + 1, 3, hx('#f4c880'))
    c.r(2, 8, 12, 2, crust); c.r(2, 8, 12, 1, loaf)
    for x in (4, 7, 10):
        c.p(x, 8, hx('#f4c880'))
    c.r(3, 12, 4, 2, loaf); c.r(9, 12, 4, 2, crust)


def _fruit_stand(c, s):
    a = ACC[s % 6]
    for i in range(1, 15):
        c.r(i, 1, 1, 3, a if (i // 2) % 2 == 0 else WHITE)
    c.r(2, 4, 1, 6, WOOD2); c.r(13, 4, 1, 6, WOOD2)
    c.r(1, 10, 14, 4, WOOD); c.r(1, 13, 14, 1, WOOD2)
    fruit = [hx('#e83030'), hx('#f0a020'), hx('#f0e040'), hx('#60c040'), hx('#a050d0')]
    for k, x in enumerate(range(2, 14, 2)):
        c.r(x, 8, 2, 2, fruit[(k + s) % 5]); c.p(x, 8, WHITE)


def _pot_plant_big(c, s):
    for (x, y, w, h) in ((2, 3, 4, 2), (10, 2, 4, 2), (5, 0, 6, 3), (1, 6, 5, 2), (10, 5, 5, 2)):
        c.r(x, y, w, h, LEAF)
    c.r(6, 2, 4, 7, LEAF2); c.p(6, 0, LEAF_HI); c.p(3, 3, LEAF_HI); c.p(12, 2, LEAF_HI); c.p(2, 6, LEAF_HI)
    c.r(7, 4, 2, 5, hx('#7a5a30'))
    c.r(3, 9, 10, 6, POT); c.r(3, 9, 10, 1, hx('#e8946a')); c.r(4, 14, 8, 1, POT2)


def _lamp_post(c, s):
    post = hx('#3a3a48')
    c.r(7, 5, 2, 9, post); c.r(5, 14, 6, 1, post)
    c.r(5, 0, 6, 1, post); c.r(5, 1, 6, 4, hx('#ffe080')); c.r(6, 2, 2, 2, WHITE)
    c.r(6, 5, 4, 1, post)


def _banner(c, s):
    a = ACC[s % 6]
    c.r(7, 0, 1, 15, hx('#5a4a3a')); c.r(3, 1, 10, 1, BRASS)
    c.r(4, 2, 8, 9, a); c.r(4, 11, 3, 2, a); c.r(9, 11, 3, 2, a)
    c.r(4, 2, 8, 1, mix(a, WHITE, 0.4))
    c.disc(8, 6, 2, hx('#f8e060')); c.p(8, 6, a)


def _balloon(c, s):
    for k, (x, y) in enumerate(((5, 3), (10, 2), (8, 6))):
        col = ACC[(k * 2 + s) % 6]
        c.disc(x, y, 2, col); c.p(x - 1, y - 1, WHITE)
    for (x0, y0) in ((5, 6), (10, 5), (8, 9)):
        for y in range(y0, 13):
            c.p(x0 + (8 - x0) * (y - y0) // max(1, 13 - y0), y, hx('#d8d0c0'))
    c.r(6, 13, 4, 2, hx('#5a5a66'))


def _trash_bin(c, s):
    c.r(4, 4, 8, 11, hx('#3a8a4a')); c.r(4, 4, 1, 11, hx('#5ab06a'))
    for i in (6, 8, 10):
        c.r(i, 6, 1, 7, hx('#2a6a38'))
    c.r(3, 2, 10, 2, hx('#2a6a38')); c.r(6, 1, 4, 1, hx('#2a6a38'))
    c.r(6, 8, 4, 3, WHITE); c.p(7, 9, hx('#3a8a4a'))


def _bench_planter(c, s):
    c.r(1, 2, 14, 5, POT); c.r(1, 2, 14, 1, hx('#e8946a'))
    for i in range(2, 14, 2):
        c.r(i, 0, 2, 2, LEAF); c.p(i, 0, ACC[(i + s) % 6])
    c.r(1, 8, 14, 2, WOOD); c.r(1, 8, 14, 1, WOOD_HI)
    c.r(1, 11, 14, 2, WOOD); c.r(1, 11, 14, 1, WOOD_HI)
    c.r(2, 13, 1, 2, IRON2); c.r(13, 13, 1, 2, IRON2)


def _info_screen(c, s):
    c.r(3, 0, 10, 11, hx('#2a2e44')); c.r(4, 1, 8, 8, hx('#2a6ae0')); c.r(4, 1, 8, 1, hx('#6aa0ff'))
    c.r(7, 2, 2, 1, WHITE); c.r(7, 4, 2, 4, WHITE); c.p(6, 4, WHITE)
    c.r(7, 11, 2, 3, IRON); c.r(4, 14, 8, 1, IRON2)


def _gumball(c, s):
    c.disc(8, 5, 4, hx('#d8f0ff'))
    for k, (x, y) in enumerate(((6, 4), (9, 3), (7, 6), (10, 6), (8, 5), (6, 7))):
        c.p(x, y, ACC[(k + s) % 6])
    c.p(6, 2, WHITE)
    c.r(5, 9, 6, 5, hx('#d83838')); c.r(7, 11, 2, 1, BRASS); c.r(4, 14, 8, 1, hx('#a02828'))


def _claw_machine(c, s):
    n = NEON[s % 4]
    c.r(2, 0, 12, 15, hx('#e84a8a')); c.r(2, 0, 12, 2, n)
    c.r(3, 3, 10, 7, hx('#c8f0ff')); c.r(7, 3, 1, 3, IRON); c.r(6, 6, 3, 1, IRON)
    for k, x in enumerate((4, 7, 10)):
        c.r(x, 8, 2, 2, ACC[(k + s) % 6])
    c.r(3, 11, 10, 2, hx('#a02a5a')); c.p(5, 11, hx('#ffe040'))


def _popcorn(c, s):
    c.r(2, 1, 12, 9, hx('#f8f0e0')); c.r(2, 1, 12, 1, hx('#e04848'))
    for (x, y) in ((4, 5), (6, 4), (8, 6), (10, 4), (5, 7), (9, 8), (11, 7), (7, 8), (3, 8), (12, 6)):
        c.r(x, y, 2, 1, hx('#fff6c0')); c.p(x, y + 1, hx('#f0d070'))
    c.r(2, 10, 12, 3, hx('#e04848'))
    for i in range(3, 13, 3):
        c.r(i, 10, 1, 3, WHITE)
    c.disc(4, 14, 1, IRON2); c.disc(11, 14, 1, IRON2)


def _umbrella_table(c, s):
    a = ACC[s % 6]
    for i in range(1, 15):
        c.r(i, 2 + abs(i - 7) // 3, 1, 3, a if (i // 3) % 2 == 0 else WHITE)
    c.r(5, 0, 6, 2, a)
    c.r(7, 5, 1, 6, IRON2)
    c.r(3, 10, 10, 2, WOOD_HI); c.r(3, 12, 10, 1, WOOD2); c.r(4, 13, 1, 2, WOOD2); c.r(11, 13, 1, 2, WOOD2)


def _neon_sign(c, s):
    n = NEON[s % 4]
    bg = hx('#141a24')
    c.r(1, 3, 14, 9, bg)
    for (x, y) in ((3, 5), (3, 6), (3, 7), (3, 8), (4, 5), (5, 6), (6, 7), (7, 8), (7, 5), (7, 6), (7, 7)):
        c.p(x, y, n)
    c.disc(11, 7, 2, NEON[(s + 1) % 4]); c.p(11, 7, bg)
    c.r(3, 10, 10, 1, mix(n, bg, 0.5))


def _fern(c, s):
    g = [LEAF, hx('#3aa070'), hx('#6ab040')][s % 3]
    for (x0, y0, dx) in ((7, 13, -1), (8, 13, 1), (7, 13, 0)):
        for k in range(9):
            x = x0 + dx * k * 2 // 3
            y = y0 - k
            c.p(x, y, g)
            if k % 2 == 0 and k > 1:
                c.p(x - 1, y, g); c.p(x + 1, y, LEAF_HI)
    c.r(5, 13, 6, 2, hx('#5a3e22'))


def _flowers(c, s):
    for k, (x, y) in enumerate(((3, 6), (7, 4), (11, 7), (5, 10), (10, 11), (2, 12), (13, 3))):
        col = ACC[(k + s) % 6]
        c.r(x - 1, y + 1, 1, 3, LEAF2); c.p(x, y + 2, LEAF)
        c.p(x - 1, y, col); c.p(x + 1, y, col); c.p(x, y - 1, col); c.p(x, y + 1, col); c.p(x, y, hx('#fff070'))


def _feather_boa(c, s):
    cols = [hx('#ff6ac0'), hx('#5ff4ff'), hx('#c890ff'), hx('#ffe066')]
    c.r(7, 0, 2, 15, hx('#8a6a4a')); c.r(4, 0, 8, 1, BRASS)
    for k in range(3):
        col = cols[(k + s) % 4]
        x = 3 + k * 4
        for y in range(1, 12):
            c.p(x + (y // 3) % 2, y, col); c.p(x + 1 - (y // 3) % 2, y, mix(col, WHITE, 0.4))
    c.r(5, 14, 6, 1, hx('#8a6a4a'))


PROPS.update({
    'oven': _oven, 'pizza-oven': _pizza_oven, 'grill': _grill, 'fryer': _fryer, 'stove': _stove, 'sink': _sink,
    'fridge': _fridge, 'soda-fountain': _soda_fountain, 'tap': _tap, 'menu-board': _menu_board,
    'cake-stand': _cake_stand, 'bread-rack': _bread_rack, 'fruit-stand': _fruit_stand,
    'pot-plant-big': _pot_plant_big, 'lamp-post': _lamp_post, 'banner': _banner, 'balloon': _balloon,
    'trash-bin': _trash_bin, 'bench-planter': _bench_planter, 'info-screen': _info_screen,
    'gumball': _gumball, 'claw-machine': _claw_machine, 'popcorn': _popcorn, 'umbrella-table': _umbrella_table,
    'neon-sign': _neon_sign, 'fern': _fern, 'flowers': _flowers, 'feather-boa': _feather_boa,
})
