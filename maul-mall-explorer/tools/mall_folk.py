"""Th'Tief folk drawn from shapes rather than the humanoid template (SPEC 20, 16 Nov 2026):
goo (slime folk), plantling (little walking plants), crud (gross, charming environment spirits).

Each builder is fn(variant, frame2=False, age=None, outfit=None) -> 16x16 RGBA. frame2 is that species' idle frame:
goo jiggles, plantlings sway their leaves, cruds pop a bubble / drip / drift. age 'child' draws a smaller body.
"""
from PIL import Image
from pixcore import hx, mix, dk
from mall_trees import _L

OUT = hx('#1e1428')
EYE = hx('#1a1020')
WHITE = hx('#fbf8f0')


def _eyes(L, x0, y, gap=3, big=False, grumpy=False, droopy=False):
    for x in (x0, x0 + gap):
        if big:
            L.rect(x, y, 2, 2, WHITE); L.set(x + 1, y + 1, EYE)
        else:
            L.set(x, y, EYE)
        if grumpy:
            L.set(x - (0 if x == x0 else -1), y - 1, EYE)
        if droopy:
            L.set(x, y - 1, mix(EYE, WHITE, 0.4))


def _hat(L, outfit, cx, top):
    """Tiny outfit cue on top of a non-humanoid body."""
    if outfit == 'chef':
        L.rect(cx - 2, top - 3, 5, 3, WHITE); L.rect(cx - 3, top - 1, 7, 1, hx('#dfe4ec'))
    elif outfit in ('security', 'janitor', 'goolax'):
        col = {'security': hx('#2a3a6a'), 'janitor': hx('#e0a030'), 'goolax': hx('#7a3ac8')}[outfit]
        L.rect(cx - 2, top - 2, 5, 2, col); L.rect(cx + 2, top - 1, 2, 1, col)
    elif outfit in ('tourist', 'beachwear'):
        L.rect(cx - 3, top - 1, 7, 1, hx('#f0e0a0')); L.rect(cx - 2, top - 2, 5, 1, hx('#f0e0a0'))
    elif outfit == 'stage-costume':
        L.set(cx, top - 1, hx('#ff9ab0')); L.set(cx + 1, top - 2, hx('#ff9ab0'))


def _apron(L, outfit, cx, y):
    if outfit in ('apron', 'chef', 'market-apron'):
        col = hx('#b07a48') if outfit == 'market-apron' else WHITE
        L.rect(cx - 2, y, 5, 3, col)


def _finish(L, outline=OUT):
    L.outline(outline)
    return L.img


# ---------------------------------------------------------------- goo folk
GOO = ['#7ee05a', '#ff7ac0', '#5ad8f0', '#a87af0', '#ffa04a', '#5a8aff', '#f0e05a', '#ff5a5a']


def build_goo(variant, frame2=False, age=None, outfit=None):
    v = variant % 32
    base = hx(GOO[v % 8])
    if v // 8 == 1:
        base = mix(base, WHITE, 0.25)
    elif v // 8 == 2:
        base = dk(base, 0.85)
    small = age == 'child'
    L = _L(16, 16)
    rx, ry = (4.5, 3.5) if small else (6.0, 5.0)
    if frame2:
        rx, ry = rx + 1, ry - 1                               # jiggle: squash wide
    cy = 15 - ry - 0.5
    body = base[:3] + (215,)
    L.disc(8, cy, rx, ry, body)
    L.disc(8, cy - ry * 0.75, rx * 0.65, ry * 0.75, body)     # dome
    top = int(cy - ry * 1.5)
    # inner bubbles, highlight, face
    L.disc(10, cy + 1, 1, 1, dk(base, 0.8)[:3] + (215,))
    L.set(5, int(cy) + 2, dk(base, 0.8)[:3] + (215,))
    L.rect(5, top + 2, 2, 1, (255, 255, 255, 230)); L.set(5, top + 3, (255, 255, 255, 200))
    _eyes(L, 6, int(cy) - 1, gap=3, big=not small)
    L.set(7, int(cy) + 1, EYE); L.set(8, int(cy) + 2, EYE); L.set(9, int(cy) + 1, EYE)
    _hat(L, outfit, 8, top + 1)
    _apron(L, outfit, 8, int(cy) + 2)
    return _finish(L, dk(base, 0.45))


# ---------------------------------------------------------------- plantlings
def build_plantling(variant, frame2=False, age=None, outfit=None):
    """v%4: 0 sprout, 1 cactus, 2 flower-head, 3 leafy shrub."""
    v = variant % 32
    kind = v % 4
    small = age == 'child'
    sway = 1 if frame2 else 0
    G, Gd, Gl = hx('#5ab84a'), hx('#3a8a34'), hx('#9ae070')
    if v // 4 % 2:
        G, Gd, Gl = hx('#4aa878'), hx('#2e7a54'), hx('#8ae0b0')
    pet = [hx('#ff7ab0'), hx('#ffd040'), hx('#ff8a3a'), hx('#c890ff'), hx('#f8f8f8'), hx('#ff5a5a')][(v // 4) % 6]
    L = _L(16, 16)
    s = 1 if small else 0                     # child: everything 2 px lower / narrower
    # legs
    L.rect(6, 13, 1, 3, hx('#6a4428')); L.rect(9, 13, 1, 3, hx('#6a4428'))
    if kind == 0:      # sprout: round seed body, two leaves on a stalk
        L.disc(8, 10 + s, 4 - s, 3.5 - s * 0.5, hx('#c89a5a'))
        L.rect(8, 3 + 2 * s, 1, 4, Gd)
        L.disc(5 + sway, 4 + 2 * s, 2.5, 1.5, G); L.disc(11 + sway, 3 + 2 * s, 2.5, 1.5, G)
        L.set(4 + sway, 3 + 2 * s, Gl); L.set(10 + sway, 2 + 2 * s, Gl)
        _eyes(L, 6, 10 + s, gap=3); L.set(8, 12 + s, hx('#8a5a30'))
        top = 2 + 2 * s
    elif kind == 1:    # cactus with arms and a flower
        L.rect(6, 3 + 2 * s, 5 - s, 11 - 2 * s, G); L.disc(8, 3 + 2 * s, 2.5 - s * 0.5, 1.5, G)
        L.rect(3 + sway, 6 + s, 2, 4, G); L.rect(3 + sway, 9 + s, 3, 2, G)
        L.rect(12 - s + sway, 5 + s, 2, 4, G); L.rect(11 - s, 8 + s, 2, 2, G)
        for (x, y) in ((7, 6), (9, 9), (7, 11), (9, 5)):
            L.set(x, y + s, Gl)
        L.disc(8 + sway, 1 + 2 * s, 1.5, 1, pet)
        _eyes(L, 7, 7 + s, gap=2)
        top = 1 + 2 * s
    elif kind == 2:    # flower-head on a stem body
        L.rect(7, 8, 3, 5, Gd); L.disc(5, 10, 2, 1, G); L.disc(11, 10, 2, 1, G)
        r = 4.5 - s
        for (dx, dy) in ((0, -1), (1, 0), (0, 1), (-1, 0), (0.7, 0.7), (-0.7, 0.7), (0.7, -0.7), (-0.7, -0.7)):
            L.disc(8 + sway + dx * r * 0.75, 5 + s + dy * r * 0.75, 2, 2, pet)
        L.disc(8 + sway, 5 + s, 2.5, 2.5, hx('#f0c040'))
        _eyes(L, 7 + sway, 4 + s, gap=2); L.set(8 + sway, 6 + s, hx('#8a5a30'))
        top = 1 + s
    else:              # leafy shrub
        L.disc(8, 9 + s, 5.5 - s, 4.5 - s, G)
        for (x, y) in ((4, 6), (7, 4), (11, 5), (12, 9), (3, 10)):
            L.disc(x + sway * (1 if y < 8 else 0), y + s * 2, 1.5, 1.5, Gl if (x + y) % 2 else G)
        L.set(5, 8 + s, pet); L.set(11, 11 + s, pet)
        _eyes(L, 6, 9 + s, gap=3, big=not small)
        top = 4 + 2 * s
    _hat(L, outfit, 8, top)
    _apron(L, outfit, 8, 10)
    return _finish(L)


# ---------------------------------------------------------------- cruds
def build_crud(variant, frame2=False, age=None, outfit=None):
    """v%5: 0 mud bubble on a log, 1 oil puddle with eyes, 2 grumpy smog wisp, 3 litter tangle, 4 soggy cardboard lump."""
    v = variant % 32
    kind = v % 5
    small = age == 'child'
    s = 1 if small else 0
    L = _L(16, 16)
    if kind == 0:
        mud, mud2 = [(hx('#7a5230'), hx('#5a3a20')), (hx('#8a6a40'), hx('#6a4a28')), (hx('#5a4a3a'), hx('#3a2e24'))][(v // 5) % 3]
        L.rect(1, 11, 14, 4, hx('#9a6436')); L.rect(1, 11, 14, 1, hx('#c08850')); L.rect(1, 13, 14, 1, hx('#7a4a26'))
        L.disc(14, 12.5, 1.5, 2, hx('#e0b070')); L.set(14, 12, hx('#9a6436'))         # cut end of the log
        L.disc(7, 7 + s, 4.5 - s, 3.5 - s, mud); L.disc(5, 5 + s, 1.5, 1, mix(mud, WHITE, 0.25))
        L.disc(10, 8 + s, 1, 1, mud2)
        _eyes(L, 5, 6 + s, gap=3, big=True)
        L.rect(6, 9 + s, 3, 1, mud2)
        if frame2:     # a bubble pops on top + a drip
            L.disc(9, 2 + s, 1.5, 1.5, mix(mud, WHITE, 0.15)); L.set(9, 1 + s, mix(mud, WHITE, 0.5))
            L.set(3, 11, mud2)
        else:
            L.set(9, 3 + s, mix(mud, WHITE, 0.15))
        top = 3 + s
    elif kind == 1:
        oil, sheen = hx('#1e1a26'), [hx('#8a5ad0'), hx('#3ab0a0'), hx('#d04a8a')][(v // 5) % 3]
        L.disc(8, 12, 7 - s, 3 - s * 0.5, oil)
        L.rect(3, 11, 4, 1, sheen); L.rect(9, 13, 4, 1, mix(sheen, hx('#40c070'), 0.5))
        L.rect(5, 8 + s, 2, 3, oil); L.rect(9, 7 + s, 2, 4, oil)            # eye stalks
        L.rect(5, 7 + s, 2, 2, WHITE); L.set(6, 8 + s, EYE); L.rect(9, 6 + s, 2, 2, WHITE); L.set(10, 7 + s, EYE)
        if frame2:     # ripple
            L.set(2, 12, sheen); L.set(14, 12, sheen); L.set(12, 10, mix(sheen, WHITE, 0.4))
        top = 6 + s
    elif kind == 2:
        g1, g2 = [(hx('#8a8a94'), hx('#6a6a74')), (hx('#9a9078'), hx('#7a7060')), (hx('#7a8090'), hx('#5a6070'))][(v // 5) % 3]
        d = 1 if frame2 else 0
        for (x, y, r) in ((6, 7, 3.5), (10, 6, 3), (8, 4, 3), (11, 9, 2.5), (5, 10, 2)):
            L.disc(x + d, y + s, r - s * 0.5, r - s * 0.5, g1 if (x + y) % 2 else g2)
        L.set(6 + d, 3 + s, mix(g1, WHITE, 0.4)); L.set(13 + d, 11 + s, g2)
        _eyes(L, 7 + d, 7 + s, gap=3, grumpy=True)
        L.rect(8 + d, 9 + s, 2, 1, EYE)
        for x in range(6, 11):
            L.set(x, 15, (10, 6, 20, 50))                                 # floats: faint shadow
        top = 2 + s
    elif kind == 3:
        L.disc(8, 10 + s, 5 - s, 4 - s, hx('#a89880'))
        bits = [hx('#e04848'), hx('#3a7ae0'), hx('#f0c030'), hx('#f8f8f8'), hx('#40c070')]
        for k, (x, y, w, h) in enumerate(((4, 8, 3, 2), (9, 7, 3, 2), (6, 11, 2, 3), (10, 11, 3, 2), (3, 11, 2, 2))):
            L.rect(x, y + s, w, h, bits[(k + v // 5) % 5])
        L.rect(11, 5 + s, 2, 3, hx('#c8d0d8')); L.set(11, 5 + s, hx('#e04848'))   # a can
        wig = 1 if frame2 else 0
        L.line(3, 6 + s - wig, 6, 8 + s, hx('#e8d8b0')); L.line(13, 9 + s, 15, 7 + s + wig, hx('#e8d8b0'))
        _eyes(L, 6, 9 + s, gap=4, big=True)
        top = 5 + s
    else:
        box, box2 = hx('#b8905a'), hx('#8a6a40')
        L.rect(3, 6 + s, 10, 9 - s, box); L.rect(2, 10 + s, 12, 5 - s, box)
        L.rect(3, 6 + s, 10, 1, mix(box, WHITE, 0.2)); L.rect(7, 6 + s, 2, 5, hx('#d8c8a0'))        # tape
        L.disc(5, 12, 2, 1.5, box2); L.disc(11, 9 + s, 1.5, 1.5, box2)                            # soggy patches
        _eyes(L, 5, 9 + s, gap=5, droopy=True)
        L.rect(6, 12 + s, 4, 1, box2)
        if frame2:
            L.set(4, 15, hx('#a8c8e0')); L.set(12, 15, hx('#a8c8e0'))                            # drip
        top = 6 + s
    _hat(L, outfit, 8, top)
    return _finish(L)


FOLK = {'goo': build_goo, 'plantling': build_plantling, 'crud': build_crud}
