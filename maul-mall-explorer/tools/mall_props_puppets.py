"""Puppet-booth pack (theatre shows, SPEC 29, 17 Nov 2026): the Galleria's balcony puppet booth, drawn as two rows of
tiles that join up seamlessly (left end / middle / right end), plus the Show Ticket Stub item icon.

  puppet-booth-left / puppet-booth / puppet-booth-right   front row: wooden ledge on top, striped cloth below
  puppet-back-left  / puppet-back  / puppet-back-right    back row: painted backdrop (sky, sun, banañon leaves)

Registers into mall_props.PROPS on import. `python tools/mall_props_puppets.py` also writes assets/ui/ticket-stub.png.
"""
import os
import sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixcore import hx, PX  # noqa: E402
from mall_props import PROPS, WOOD, WOOD2, WOOD_HI  # noqa: E402

TEAL, TEAL2 = hx('#2a8a9a'), hx('#1c5f6c')
CREAM, CREAM2 = hx('#f4ecd8'), hx('#d8ccb0')
SKY, SKY2 = hx('#8ad0f0'), hx('#c8ecf8')
LEAF, LEAF2, LEAF_HI = hx('#3a9a48'), hx('#26703a'), hx('#7ad060')
SUN, SUN_HI = hx('#f4c838'), hx('#fff0a0')
GOLD = hx('#e8b830')


def _front(c, s, left=False, right=False):
    # cloth: vertical stripes, a little scallop at the hem
    for x in range(16):
        col = TEAL if (x // 4) % 2 == 0 else CREAM
        c.r(x, 3, 1, 12, col)
        c.p(x, 14, TEAL2 if col == TEAL else CREAM2)
    for x in range(1, 16, 4):
        c.p(x, 4, GOLD)
    # the ledge the puppets stand on
    c.r(0, 0, 16, 1, WOOD_HI)
    c.r(0, 1, 16, 1, WOOD)
    c.r(0, 2, 16, 1, WOOD2)
    if left:
        c.r(0, 0, 2, 15, WOOD2)
        c.r(0, 0, 1, 15, WOOD)
    if right:
        c.r(14, 0, 2, 15, WOOD2)
        c.r(15, 0, 1, 15, WOOD)


def _back(c, s, left=False, right=False):
    # painted sky with a horizon of banañon leaves; the sun sits on the middle panel only (seed picks)
    for y in range(16):
        c.r(0, y, 16, 1, SKY if y < 8 else SKY2)
    if s % 3 == 0:
        c.disc(8, 6, 2, SUN)
        c.p(7, 5, SUN_HI)
    for (x, h) in ((0, 5), (3, 7), (6, 4), (9, 6), (12, 5), (14, 7)):
        c.r(x, 16 - h, 3, h, LEAF if (x + s) % 2 else LEAF2)
        c.p(x + 1, 16 - h, LEAF_HI)
    if left:
        c.r(0, 0, 2, 16, WOOD2)
        c.r(0, 0, 1, 16, WOOD)
    if right:
        c.r(14, 0, 2, 16, WOOD2)
        c.r(15, 0, 1, 16, WOOD)


PROPS.update({
    'puppet-booth-left': lambda c, s: _front(c, s, left=True),
    'puppet-booth': lambda c, s: _front(c, s),
    'puppet-booth-right': lambda c, s: _front(c, s, right=True),
    'puppet-back-left': lambda c, s: _back(c, 1, left=True),
    'puppet-back': lambda c, s: _back(c, s),
    'puppet-back-right': lambda c, s: _back(c, 1, right=True),
})


# ---------------------------------------------------------------- ticket stub icon (item image)
TICKET = (
    "................",
    "................",
    "................",
    "..OOOOOOOOOOOO..",
    ".ORRRRRRRWRRRRO.",
    ".ORYYYYYRWRRRRO.",
    "OR.Y...YRWRRRRRO",
    "ORRYYYYYRWRSRRRO",
    "ORRRRRRRRWRSRR.O",
    "OR.RRRRRRWRRRRRO",
    ".ORRYYYYRWRRRRO.",
    ".ORRRRRRRWRRRRO.",
    "..OOOOOOOOOOOO..",
    "................",
    "................",
    "................",
)


def ticket_icon(path, scale=4):
    pal = {'O': hx('#3a1020'), 'R': hx('#d84848'), 'Y': hx('#f4d488'), 'W': hx('#fbf8f0'), 'S': hx('#fff0a0')}
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    PX(img).blit(0, 0, TICKET, pal)
    img = img.resize((16 * scale, 16 * scale), Image.NEAREST)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return path


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print(ticket_icon(os.path.join(root, 'assets', 'ui', 'ticket-stub.png')))
