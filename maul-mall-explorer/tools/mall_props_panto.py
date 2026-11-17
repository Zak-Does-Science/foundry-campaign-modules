"""Venue pack: Panto's mall (the theatre nation): stagecraft with elemental flair.
Registers into mall_props.PROPS on import. Theme stub: "theme": "panto"."""
from pixcore import hx, mix, dk
from mall_props import PROPS, WHITE, IRON, IRON2, BRASS, BRASS2, BRASS_HI, WOOD, WOOD2, WOOD_HI

VELVET, VELVET2, VELVET_HI = hx('#b0203a'), hx('#7a1028'), hx('#e0506a')
GOLD, GOLD_HI = hx('#e8b830'), hx('#fff0a0')
ACC = [hx(x) for x in ('#e04848', '#3a7ae0', '#f0b030', '#a060e0', '#40c070', '#f07ab0')]


def _stage_curtain(c, s):
    c.r(0, 0, 16, 3, GOLD); c.r(0, 2, 16, 1, BRASS2)
    for x in range(0, 16):
        c.r(x, 3, 1, 12, VELVET if x % 3 else VELVET2)
    for x in range(1, 16, 3):
        c.r(x, 3, 1, 12, VELVET_HI)
    c.r(0, 9, 16, 1, GOLD); c.p(7, 9, GOLD_HI)


def _spotlight(c, s):
    c.r(7, 9, 2, 5, IRON2); c.r(4, 14, 8, 1, IRON2)
    c.r(3, 3, 8, 6, hx('#2a2a34')); c.r(10, 2, 3, 8, hx('#3a3a48'))
    c.disc(13, 5, 2, hx('#fff6c0')); c.p(13, 5, WHITE)
    c.r(4, 4, 6, 1, hx('#4a4a58'))


def _prop_trunk(c, s):
    c.r(1, 5, 14, 9, hx('#6a3a7a')); c.r(1, 5, 14, 3, hx('#8a4a9a'))
    for x in (1, 14):
        c.r(x, 5, 1, 9, BRASS)
    c.r(1, 8, 14, 1, BRASS); c.r(7, 8, 2, 3, BRASS_HI)
    c.r(3, 2, 3, 3, hx('#f0d040')); c.r(9, 1, 2, 4, hx('#e04848')); c.p(12, 3, hx('#40c070'))


def _mask_stand(c, s):
    c.r(7, 9, 2, 5, WOOD2); c.r(4, 14, 8, 1, WOOD2)
    c.disc(4, 5, 3, hx('#f8e8c0')); c.disc(11, 5, 3, hx('#c8d8f8'))
    for (x, y) in ((3, 4), (5, 4), (10, 4), (12, 4)):
        c.p(x, y, hx('#202028'))
    c.r(3, 6, 3, 1, hx('#202028')); c.p(3, 5, hx('#202028')); c.p(5, 5, hx('#202028'))
    c.r(10, 7, 3, 1, hx('#202028')); c.p(10, 6, hx('#202028')); c.p(12, 6, hx('#202028'))


def _costume_rack(c, s):
    c.r(1, 1, 14, 1, BRASS); c.r(1, 1, 1, 14, BRASS); c.r(14, 1, 1, 14, BRASS)
    for k, x in enumerate((3, 6, 9, 12)):
        col = ACC[(k + s) % 6]
        c.r(x - 1, 2, 2, 9, col); c.r(x - 1, 2, 2, 1, GOLD)
        c.p(x - 1, 5, mix(col, WHITE, 0.5))
    c.r(1, 14, 14, 1, BRASS2)


def _ticket_booth(c, s):
    c.r(1, 1, 14, 3, VELVET); c.r(1, 1, 14, 1, GOLD)
    c.r(2, 4, 12, 6, hx('#f0e0c0')); c.r(4, 5, 8, 4, hx('#c0e8f8')); c.p(5, 6, WHITE)
    c.r(1, 10, 14, 5, VELVET2); c.r(1, 10, 14, 1, GOLD); c.r(6, 11, 4, 1, GOLD_HI)


def _dressing_table(c, s):
    c.r(2, 0, 12, 8, hx('#3a2a3a')); c.r(4, 2, 8, 5, hx('#c0e8f8')); c.p(5, 3, WHITE)
    for x in (2, 5, 8, 11, 13):
        c.p(x, 0, hx('#fff6a0'))
    c.r(1, 8, 14, 3, WOOD); c.r(1, 8, 14, 1, WOOD_HI); c.r(2, 11, 1, 4, WOOD2); c.r(13, 11, 1, 4, WOOD2)
    c.p(4, 7, hx('#e04848')); c.p(6, 7, hx('#f07ab0')); c.p(10, 7, GOLD)


def _fire_brazier(c, s):
    c.r(3, 8, 10, 3, IRON); c.r(3, 8, 10, 1, hx('#a8b4c0')); c.r(5, 11, 2, 4, IRON2); c.r(9, 11, 2, 4, IRON2)
    c.disc(8, 5, 4, hx('#ff7a20')); c.disc(8, 6, 2, hx('#ffd040')); c.r(7, 0, 2, 3, hx('#ff5020'))
    c.p(5, 2, hx('#ff7a20')); c.p(11, 3, hx('#ff7a20'))


def _water_orb(c, s):
    c.r(5, 11, 6, 2, hx('#4a6aa0')); c.r(4, 13, 8, 2, hx('#3a5a90'))
    c.disc(8, 6, 5, hx('#3ab0e0')); c.disc(8, 6, 3, hx('#78d8f8')); c.p(6, 3, WHITE); c.p(7, 3, WHITE)
    c.r(5, 8, 6, 1, hx('#2080b8'))


def _air_fan(c, s):
    c.r(7, 8, 2, 6, IRON2); c.r(4, 14, 8, 1, IRON2)
    cols = [hx('#e8f4ff'), hx('#a8d8f0'), hx('#e8f4ff'), hx('#a8d8f0')]
    for k, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
        x0, y0 = 8 + dx * 3 - (2 if dy else 0), 5 + dy * 3 - (2 if dx else 0)
        c.r(min(8, 8 + dx * 5), min(5, 5 + dy * 5) if dy else 4, abs(dx) * 5 + (2 if dy else 0), abs(dy) * 5 + (2 if dx else 0), cols[k])
    c.disc(8, 5, 1, BRASS)


def _earth_pillar(c, s):
    c.r(4, 1, 8, 14, hx('#8a7a6a')); c.r(4, 1, 2, 14, hx('#a89888'))
    c.r(3, 0, 10, 2, hx('#6a5a4a')); c.r(3, 13, 10, 2, hx('#6a5a4a'))
    c.r(7, 4, 1, 3, hx('#5a4a3a')); c.r(8, 6, 2, 1, hx('#5a4a3a')); c.r(6, 9, 1, 3, hx('#5a4a3a'))
    c.p(10, 3, hx('#60c070')); c.p(11, 3, hx('#60c070')); c.p(5, 11, hx('#60c070'))


def _sandbag(c, s):
    c.r(7, 0, 1, 7, hx('#d8c8a0'))
    c.disc(8, 10, 4, hx('#c8a870')); c.r(5, 6, 6, 2, hx('#a88850')); c.p(6, 9, hx('#e0c890'))
    c.r(6, 6, 4, 1, hx('#d8c8a0'))


def _playbill_stand(c, s):
    a = ACC[s % 6]
    c.r(2, 0, 12, 12, GOLD); c.r(3, 1, 10, 10, hx('#f8f0e0'))
    c.r(4, 2, 8, 3, a); c.disc(8, 7, 2, mix(a, hx('#202020'), 0.3)); c.r(4, 10, 8, 1, a)
    c.r(4, 12, 1, 3, WOOD2); c.r(11, 12, 1, 3, WOOD2)


PACK = {
    'stage-curtain': _stage_curtain, 'spotlight': _spotlight, 'prop-trunk': _prop_trunk, 'mask-stand': _mask_stand,
    'costume-rack': _costume_rack, 'ticket-booth': _ticket_booth, 'dressing-table': _dressing_table,
    'fire-brazier': _fire_brazier, 'water-orb': _water_orb, 'air-fan': _air_fan, 'earth-pillar': _earth_pillar,
    'sandbag': _sandbag, 'playbill-stand': _playbill_stand,
}
PROPS.update(PACK)
