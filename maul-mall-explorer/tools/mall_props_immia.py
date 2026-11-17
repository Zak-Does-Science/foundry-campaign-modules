"""Venue pack: Immia Beach Mega Mall (Joz, Lor'Fida). A palace turned mall, river through the throne hall, beach life.
Registers into mall_props.PROPS on import. Theme stub: "theme": "immia"."""
from pixcore import hx, mix
from mall_props import PROPS, WHITE, IRON2, BRASS, BRASS2, BRASS_HI, WOOD, WOOD2, WOOD_HI

GOLD, GOLD2, GOLD_HI = hx('#e8b830'), hx('#b08420'), hx('#fff0a0')
SAND, SAND2 = hx('#f0d898'), hx('#d0b070')
SEA, SEA2 = hx('#3ab0d0'), hx('#2080a8')
TEAL = hx('#1e8a8a')
ACC = [hx(x) for x in ('#ff5a8a', '#3ac0e0', '#ffd040', '#a060e0', '#40c070', '#ff8a3a')]


def _beach_umbrella(c, s):
    a = ACC[s % 6]
    for i in range(1, 15):
        c.r(i, 2 + abs(i - 7) // 3, 1, 3, a if (i // 2) % 2 == 0 else WHITE)
    c.r(6, 0, 4, 2, a); c.r(7, 5, 1, 9, WOOD2)
    c.r(3, 13, 10, 2, SAND); c.r(4, 13, 3, 1, SAND2)


def _surf_board(c, s):
    a = ACC[(s + 1) % 6]
    c.disc(8, 3, 3, a); c.r(5, 3, 7, 10, a); c.disc(8, 12, 3, a)
    c.r(8, 1, 1, 14, WHITE); c.r(6, 6, 1, 4, mix(a, WHITE, 0.4))
    c.r(3, 14, 10, 1, SAND2)


def _lifeguard_chair(c, s):
    c.r(3, 6, 1, 9, WOOD); c.r(12, 6, 1, 9, WOOD)
    for y in (9, 12):
        c.r(3, y, 10, 1, WOOD2)
    c.r(4, 5, 8, 2, hx('#e04848')); c.r(4, 1, 8, 4, hx('#f8f0e0')); c.r(4, 1, 8, 1, hx('#e04848'))
    c.r(6, 2, 4, 2, hx('#e04848')); c.r(7, 2, 2, 2, WHITE)


def _sandcastle(c, s):
    c.r(2, 9, 12, 5, SAND); c.r(2, 13, 12, 1, SAND2)
    c.r(3, 5, 3, 4, SAND); c.r(10, 5, 3, 4, SAND); c.r(6, 3, 4, 6, SAND)
    for x in (3, 5, 10, 12, 6, 9):
        c.p(x, 4 if x in (3, 5, 10, 12) else 2, SAND)
    c.r(7, 10, 2, 3, SAND2); c.r(8, 0, 1, 3, IRON2); c.r(9, 0, 3, 2, ACC[s % 6])
    c.p(4, 11, hx('#f8a0b0')); c.p(12, 12, WHITE)


def _throne(c, s):
    v = [hx('#1e8a8a'), hx('#8a2a6a'), hx('#2a4aa0')][s % 3]
    c.r(3, 0, 10, 10, GOLD); c.r(4, 1, 8, 8, v); c.r(3, 0, 10, 1, GOLD_HI)
    for x in (3, 7, 12):
        c.p(x, 0, GOLD_HI)
    c.r(2, 8, 12, 4, GOLD); c.r(4, 9, 8, 2, v); c.r(2, 8, 12, 1, GOLD_HI)
    c.r(3, 12, 2, 3, GOLD2); c.r(11, 12, 2, 3, GOLD2)
    c.disc(8, 4, 1, hx('#ff5a8a'))


def _gilded_dais(c, s):
    c.r(1, 8, 14, 7, GOLD2); c.r(2, 9, 12, 2, GOLD); c.r(1, 8, 14, 1, GOLD_HI)
    c.r(3, 4, 10, 4, hx('#f4ece0')); c.r(3, 4, 10, 1, WHITE)
    for x in (4, 7, 10):
        c.r(x, 11, 2, 3, GOLD)
    c.r(5, 2, 6, 2, TEAL)


def _gondola(c, s):
    c.r(1, 9, 14, 3, hx('#2a2030')); c.r(0, 7, 2, 3, hx('#2a2030')); c.r(14, 6, 2, 4, hx('#2a2030'))
    c.r(2, 9, 12, 1, GOLD); c.r(5, 6, 6, 3, hx('#a02a3a')); c.r(5, 6, 6, 1, hx('#d04a5a'))
    c.r(12, 1, 1, 9, WOOD); c.r(2, 13, 12, 2, SEA); c.r(3, 13, 3, 1, hx('#a0e0f0'))


def _seashell_display(c, s):
    c.r(1, 10, 14, 5, WOOD2); c.r(1, 10, 14, 1, WOOD_HI)
    c.disc(4, 7, 2, hx('#f8c8b0')); c.r(3, 7, 3, 1, hx('#d89880'))
    c.disc(8, 6, 3, hx('#f8e8d8')); c.r(7, 4, 1, 4, hx('#d8b8a0')); c.r(9, 4, 1, 4, hx('#d8b8a0'))
    c.disc(12, 8, 2, hx('#ff9ab0')); c.p(12, 7, WHITE)


def _beach_ball(c, s):
    c.disc(8, 8, 6, WHITE)
    for (x0, col) in ((3, hx('#e04848')), (7, hx('#3a7ae0')), (11, hx('#f0c030'))):
        c.r(x0, 3, 2, 11, col)
    c.disc(8, 8, 1, WHITE); c.p(5, 4, WHITE)


def _drag_mirror(c, s):
    c.r(2, 1, 12, 10, hx('#f0e0f0')); c.r(4, 3, 8, 6, hx('#c0e8f8')); c.p(5, 4, WHITE)
    for (x, y) in ((2, 1), (6, 1), (10, 1), (13, 1), (2, 5), (13, 5), (2, 10), (13, 10)):
        c.disc(x, y, 1, hx('#fff6a0'))
    c.r(1, 11, 14, 3, hx('#e070b0')); c.r(1, 11, 14, 1, hx('#f8a0d0'))
    c.p(4, 12, GOLD); c.p(9, 12, hx('#5ff4ff')); c.p(11, 12, WHITE)


def _sequin_rack(c, s):
    c.r(1, 1, 14, 1, IRON2); c.r(1, 1, 1, 14, IRON2); c.r(14, 1, 1, 14, IRON2)
    for k, x in enumerate((3, 7, 11)):
        col = ACC[(k + s) % 6]
        c.r(x - 1, 3, 3, 8, col); c.r(x - 2, 9, 5, 3, col)
        for j in range(4, 12, 2):
            c.p(x - 1 + (j // 2) % 3, j, WHITE)
    c.r(1, 14, 14, 1, IRON2)


def _cocktail_cart(c, s):
    c.r(1, 7, 14, 5, hx('#f8f0e0')); c.r(1, 7, 14, 1, GOLD)
    for k, x in enumerate((2, 6, 10)):
        col = ACC[(k + s + 2) % 6]
        c.r(x + 1, 3, 2, 4, col); c.p(x + 1, 3, WHITE); c.p(x + 3, 2, hx('#40c070'))
    c.disc(3, 13, 1, IRON2); c.disc(12, 13, 1, IRON2); c.r(1, 11, 14, 1, GOLD2)


def _deckchair(c, s):
    a = ACC[(s + 3) % 6]
    c.r(3, 3, 1, 12, WOOD); c.r(12, 3, 1, 12, WOOD)
    for j in range(3, 12):
        c.r(4, j, 8, 1, a if (j // 2) % 2 else WHITE)
    c.r(2, 12, 12, 1, WOOD2)


def _fish_tank(c, s):
    c.r(1, 2, 14, 10, SEA); c.r(1, 2, 14, 1, hx('#a0e0f0')); c.r(1, 11, 14, 1, SAND)
    c.r(3, 5, 3, 2, hx('#ff8a3a')); c.p(2, 5, hx('#ff8a3a')); c.p(4, 5, WHITE)
    c.r(9, 7, 3, 2, hx('#ffd040')); c.p(12, 7, hx('#ffd040'))
    c.r(6, 8, 1, 3, hx('#40c070')); c.r(13, 7, 1, 4, hx('#40c070'))
    c.r(1, 12, 14, 3, WOOD2)


PACK = {
    'beach-umbrella': _beach_umbrella, 'surf-board': _surf_board, 'lifeguard-chair': _lifeguard_chair,
    'sandcastle': _sandcastle, 'throne': _throne, 'gilded-dais': _gilded_dais, 'gondola': _gondola,
    'seashell-display': _seashell_display, 'beach-ball': _beach_ball, 'drag-mirror': _drag_mirror,
    'sequin-rack': _sequin_rack, 'cocktail-cart': _cocktail_cart, 'deckchair': _deckchair, 'fish-tank': _fish_tank,
}
PROPS.update(PACK)
