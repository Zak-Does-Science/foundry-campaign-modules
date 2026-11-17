"""Venue pack: The Sloopermarket (Sloppy Bottom Bay). Harbour market + student town.
Registers into mall_props.PROPS on import. Theme stub: "theme": "slooper"."""
from pixcore import hx, mix
from mall_props import PROPS, WHITE, IRON, IRON2, BRASS, WOOD, WOOD2, WOOD_HI

ROPE = hx('#d8b878')
ICE = hx('#d8f0f8')
ACC = [hx(x) for x in ('#e04848', '#3a7ae0', '#f0b030', '#40a060', '#a060e0', '#f07a30')]


def _market_stall(c, s):
    a = ACC[s % 6]
    for i in range(0, 16):
        c.r(i, 0, 1, 4, a if (i // 2) % 2 == 0 else WHITE)
    c.r(1, 4, 1, 7, WOOD2); c.r(14, 4, 1, 7, WOOD2)
    c.r(0, 10, 16, 5, WOOD); c.r(0, 10, 16, 1, WOOD_HI)
    for k, x in enumerate(range(2, 14, 3)):
        c.r(x, 8, 2, 2, ACC[(k + s + 2) % 6])


def _fish_crate(c, s):
    c.r(1, 6, 14, 8, WOOD); c.r(1, 6, 14, 1, WOOD_HI); c.r(1, 10, 14, 1, WOOD2)
    c.r(2, 5, 12, 2, ICE)
    for k, x in enumerate((2, 7, 11)):
        col = [hx('#8aa8c0'), hx('#e08a6a'), hx('#a0b8a0')][(k + s) % 3]
        c.r(x, 3 + k % 2, 4, 2, col); c.p(x, 3 + k % 2, hx('#202020')); c.p(x + 4, 3 + k % 2, col)


def _produce_bins(c, s):
    for k, x in enumerate((1, 6, 11)):
        c.r(x, 7, 4, 7, WOOD2); c.r(x, 7, 4, 1, WOOD_HI)
        col = [hx('#e83030'), hx('#60c040'), hx('#f0a020'), hx('#a050d0'), hx('#f0e040')][(k + s) % 5]
        c.r(x, 4, 4, 3, col)
        for i in range(x, x + 4, 2):
            c.p(i, 4, mix(col, WHITE, 0.5))


def _net_buoys(c, s):
    for i in range(1, 15, 2):
        c.r(i, 2, 1, 11, ROPE)
    for j in range(2, 13, 3):
        c.r(1, j, 14, 1, ROPE)
    c.disc(4, 8, 2, hx('#e04848')); c.disc(11, 5, 2, hx('#f0d040')); c.p(3, 7, WHITE); c.p(10, 4, WHITE)


def _bookstack(c, s):
    for k in range(6):
        col = ACC[(k + s) % 6]
        w = 10 - (k * 3 + s) % 4
        x = 3 + (k * 5 + s) % 3
        c.r(x, 13 - k * 2, w, 2, col); c.r(x, 13 - k * 2, w, 1, mix(col, WHITE, 0.4))
        c.r(x + w - 1, 13 - k * 2, 1, 2, WHITE)


def _notice_board(c, s):
    c.r(1, 1, 14, 10, hx('#b08050')); c.r(1, 1, 14, 1, WOOD_HI)
    for k, (x, y, w, h) in enumerate(((2, 2, 4, 4), (7, 3, 3, 3), (11, 2, 3, 5), (3, 7, 5, 3), (9, 7, 4, 3))):
        col = [WHITE, hx('#f8e080'), hx('#a0d8f8'), hx('#f8b0c0')][(k + s) % 4]
        c.r(x, y, w, h, col); c.p(x + w // 2, y, hx('#e04848'))
    c.r(3, 11, 1, 4, WOOD2); c.r(12, 11, 1, 4, WOOD2)


def _bike_rack(c, s):
    for x in (2, 6, 10):
        c.r(x, 8, 1, 7, IRON); c.r(x + 3, 8, 1, 7, IRON); c.r(x, 8, 4, 1, IRON)
    a = ACC[(s + 1) % 6]
    c.disc(3, 11, 2, IRON2); c.disc(9, 11, 2, IRON2); c.p(3, 11, hx('#f0f0f0')); c.p(9, 11, hx('#f0f0f0'))
    c.r(4, 8, 5, 1, a); c.r(6, 6, 1, 3, a); c.r(5, 6, 3, 1, hx('#3a3a3a'))


def _coffee_cart(c, s):
    c.r(2, 2, 12, 2, hx('#6a3a20')); c.r(2, 4, 1, 4, WOOD2); c.r(13, 4, 1, 4, WOOD2)
    c.r(1, 8, 14, 5, hx('#3a7a5a')); c.r(1, 8, 14, 1, hx('#5aa07a'))
    c.r(4, 5, 3, 3, IRON); c.r(5, 4, 1, 1, IRON); c.r(9, 6, 2, 2, WHITE); c.r(11, 6, 2, 2, WHITE)
    c.disc(4, 14, 1, IRON2); c.disc(11, 14, 1, IRON2)


def _lobster_pot(c, s):
    c.disc(8, 8, 6, WOOD2); c.disc(8, 8, 5, hx('#3a2a20'))
    for x in range(3, 14, 2):
        c.r(x, 3, 1, 11, WOOD)
    c.r(2, 12, 12, 2, WOOD2); c.disc(8, 8, 1, ROPE)
    c.r(10, 9, 3, 2, hx('#e05030'))


def _rope_coil(c, s):
    for rr in (6, 4, 2):
        c.disc(8, 9, rr, ROPE if rr % 4 else hx('#b89858'))
    c.disc(8, 9, 1, hx('#8a6a3a')); c.r(13, 6, 2, 1, ROPE); c.r(14, 4, 1, 3, ROPE)


def _scale(c, s):
    c.r(7, 3, 2, 10, BRASS); c.r(4, 13, 8, 2, WOOD2)
    c.r(1, 3, 14, 1, BRASS)
    c.r(1, 4, 1, 3, IRON2); c.r(14, 4, 1, 3, IRON2)
    c.r(0, 7, 4, 1, BRASS); c.r(12, 7, 4, 1, BRASS)
    c.r(1, 5, 2, 2, hx('#e83030')); c.r(13, 6, 2, 1, hx('#60c040'))


def _bunting(c, s):
    c.r(0, 2, 16, 1, ROPE)
    for k, x in enumerate(range(0, 16, 4)):
        col = ACC[(k + s) % 6]
        c.r(x + 1, 3, 3, 1, col); c.r(x + 1, 4, 3, 1, col); c.p(x + 2, 5, col)
    c.r(0, 3, 1, 12, WOOD2); c.r(15, 3, 1, 12, WOOD2)


def _study_desk(c, s):
    c.r(1, 8, 14, 2, WOOD); c.r(1, 8, 14, 1, WOOD_HI); c.r(2, 10, 1, 5, WOOD2); c.r(13, 10, 1, 5, WOOD2)
    c.r(3, 6, 5, 2, WHITE); c.r(4, 6, 3, 1, hx('#a0a0b0'))
    c.r(11, 3, 1, 5, IRON2); c.r(9, 2, 4, 2, hx('#f0c040')); c.p(10, 4, hx('#fff6c0'))
    c.r(8, 6, 2, 2, hx('#e04848'))


PACK = {
    'market-stall': _market_stall, 'fish-crate': _fish_crate, 'produce-bins': _produce_bins, 'net-buoys': _net_buoys,
    'bookstack': _bookstack, 'notice-board': _notice_board, 'bike-rack': _bike_rack, 'coffee-cart': _coffee_cart,
    'lobster-pot': _lobster_pot, 'rope-coil': _rope_coil, 'scale': _scale, 'bunting': _bunting,
    'study-desk': _study_desk,
}
PROPS.update(PACK)
