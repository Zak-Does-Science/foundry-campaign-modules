"""Procedural chibi NPCs, object sprites and pop-up booths (16 px art)."""
from collections import Counter
from PIL import Image
from pixcore import hx, mix, dk, alpha, hsh, T, PX
from mall_props import PROPS, build_prop
import mall_props_food  # noqa: F401  (registers the food-court / life props)
import mall_props_immia, mall_props_slooper, mall_props_panto, mall_props_moffidge  # noqa: F401,E401  (venue packs)
import mall_props_wc_light  # noqa: F401  (washrooms + crystal lighting)
import mall_props_puppets  # noqa: F401  (balcony puppet booth, theatre shows)
from mall_folk import FOLK

OUTLINE = hx('#1e1428')
EYE = hx('#1a1020')
WHITE = hx('#f8f6f0')
BLUSH = hx('#f08a8a')

CLOTH = [hx(c) for c in ('#d84848', '#4870d8', '#48a848', '#e8c040', '#9858c8', '#e88838', '#38b0b0', '#e868a8')]
HAIR = [hx(c) for c in ('#7a4a2a', '#2e2636', '#e8c868', '#c84828', '#e4e4ee', '#4868c8', '#4aa860', '#e080b0')]
HUMAN_SKIN = [hx(c) for c in ('#f6d2b0', '#e8b48a', '#c68a5e', '#8d5a3a', '#f0c8a0', '#d9a070', '#a8704a', '#ffe0c4')]

NPC_BASE = T(
    "................",
    ".....OOOOOO.....",
    "....OHHHHHHO....",
    "...OHHHHHHHHO...",
    "...OHHHHHHHHO...",
    "...OHSSSSSSHO...",
    "...OSSESSESSO...",
    "...OSSESSESSO...",
    "...OSbSSSSbSO...",
    "....OssssssO....",
    "....OCCCCCCO....",
    "...OSCCCCCCSO...",
    "...OSCcCCcCSO...",
    "....OCCCCCCO....",
    "....OccOOccO....",
    ".....FF..FF.....",
)

SPECIES = ['human', 'elf', 'gnome', 'goblin', 'hobgoblin', 'dwarf', 'halfling', 'orc', 'lizardfolk',
           'dragonborn', 'pixie', 'fishfolk', 'snail', 'automaton', 'mushroomfolk', 'tiefling', 'kobold', 'mole',
           'aarakocra', 'pikpik', 'spirit', 'goo', 'plantling', 'crud']
AGES = ('child', 'teen', 'elder')
OUTFITS = ('apron', 'chef', 'goolax', 'security', 'janitor', 'tourist',
           'beachwear', 'market-apron', 'stage-costume', 'monk-robe')

HAIR16 = HAIR + [hx(c) for c in ('#a05a2a', '#f0e0a0', '#5a3a28', '#d8783a', '#3a2a5a', '#c8c8d0', '#9a3a6a', '#2a4a3a')]
SKIN16 = HUMAN_SKIN + [hx(c) for c in ('#fce4cc', '#d8a882', '#b47850', '#6e4428', '#e8c0a0', '#c08860', '#94603c',
                                        '#f4d8b8')]
CLOTH16 = CLOTH + [hx(c) for c in ('#f4f0e8', '#2e3448', '#c8a878', '#5a8a3a', '#a03a3a', '#3a8ac8', '#d8b0e0',
                                   '#6a4a3a')]
HAIRY = ('human', 'elf', 'halfling', 'orc', 'hobgoblin', 'goblin', 'tiefling', 'pixie')
UNIFORM = {'goolax': ('#7a3ac8', '#f0c030'), 'security': ('#2a3a6a', '#e8c040'), 'janitor': ('#4a8a5a', '#e8e0c0'),
           'chef': ('#f4f0e8', '#d84848'), 'apron': (None, None), 'tourist': (None, None),
           'stage-costume': ('#b0203a', '#e8b830'), 'monk-robe': ('#7a5a3a', '#e8c040'),
           'beachwear': (None, None), 'market-apron': (None, None)}


def parse_tags(tags):
    """Tags from 'npc:<species>:<v>:<tag>...' (any order, unknown tags ignored)."""
    out = {'age': None, 'beard': None, 'outfit': None}
    for tg in tags or ():
        tg = str(tg).strip().lower()
        if tg in AGES:
            out['age'] = tg
        elif tg in ('beard', 'nobeard'):
            out['beard'] = tg == 'beard'
        elif tg in OUTFITS:
            out['outfit'] = tg
    return out


def norm_tags(tags):
    t = parse_tags(tags)
    return [x for x in (t['age'], {True: 'beard', False: 'nobeard', None: None}[t['beard']], t['outfit']) if x]


def _variety(g, pal, sp, v, vv, age, beard, outfit):
    """Hair style/colour, skin tone, outfit cut and uniforms on top of the species body (adult rows)."""
    h = hsh(SPECIES.index(sp) if sp in SPECIES else 0, vv, 71)
    cut = vv // 8                               # 0 shirt, 1 trousers, 2 dress, 3 jacket
    if sp in ('human', 'halfling'):
        pal['S'] = SKIN16[(v + 5 * cut + (h >> 7) % 3) % 16]
    if sp in HAIRY and sp != 'pixie':
        pal['H'] = HAIR16[(v * 5 + cut * 3 + (h >> 11)) % 16]
    if age == 'elder':
        pal['H'] = hx('#d8d8e0') if h % 2 else hx('#a8a8b4')
    # outfit colours
    if sp not in ('automaton', 'snail'):
        pal['C'] = CLOTH16[(v + 3 * cut + (h >> 5)) % 16]
        if age == 'child':
            pal['C'] = CLOTH[(v + cut + (h >> 5)) % 8]
        pal['c'] = dk(pal['C'], 0.72)
    style = (h >> 3) % 7
    if cut == 2:
        style = (1, 2, 3)[h % 3]               # dress: long hair / bun / ponytail
    if sp in HAIRY and outfit not in ('chef', 'security', 'janitor', 'tourist', 'monk-robe', 'beachwear'):
        if style == 1:                            # long hair down the sides
            for y in range(5, 10):
                _put(g, 3, y, 'H'); _put(g, 12, y, 'H'); _put(g, 2, y, 'O'); _put(g, 13, y, 'O')
            _put(g, 2, 4, 'O'); _put(g, 13, 4, 'O')
        elif style == 2:                          # bun on top
            for (x, ch) in ((6, 'O'), (7, 'H'), (8, 'H'), (9, 'O')):
                _put(g, x, 0, ch)
            _put(g, 7, 1, 'H'); _put(g, 8, 1, 'H')
        elif style == 3:                          # ponytail
            for y in range(4, 9):
                _put(g, 13, y, 'H'); _put(g, 14, y, 'O')
            _put(g, 13, 9, 'O'); _put(g, 13, 3, 'O')
        elif style == 4:                          # spiky
            for x in (5, 7, 9):
                _put(g, x, 0, 'O'); _put(g, x, 1, 'H')
        elif style == 5:                          # side fringe
            _put(g, 4, 5, 'H'); _put(g, 5, 5, 'H'); _put(g, 6, 5, 'H')
    # outfit cut
    if cut == 1:
        pal['T'] = CLOTH16[(v + 9 + (h >> 9)) % 16]
        for y in (13, 14):
            for x in range(16):
                if g[y][x] in 'Cc':
                    g[y][x] = 'T'
    elif cut == 2:
        _setrow(g, 12, "...OSCCCCCCSO...")
        _setrow(g, 13, "...OCCCCCCCCO...")
        _setrow(g, 14, "...OccccccccO...")
        _setrow(g, 15, ".....FF..FF.....")
    elif cut == 3:
        pal['J'] = mix(CLOTH16[(v + 11) % 16], hx('#202020'), 0.35)
        for y in range(10, 14):
            for x in range(16):
                if g[y][x] in 'Cc' and x not in (7, 8):
                    g[y][x] = 'J'
    # uniforms / outfits
    if outfit in UNIFORM:
        a, b = UNIFORM[outfit]
        if a:
            pal['C'] = hx(a); pal['c'] = dk(pal['C'], 0.72); pal['X'] = hx(b)
            for y in range(10, 15):
                for x in range(16):
                    if g[y][x] in 'TJ':
                        g[y][x] = 'C'
            _put(g, 6, 11, 'X')
        if outfit == 'apron':
            pal['A'] = hx('#f4f0e8')
            for y in range(11, 14):
                for x in range(5, 11):
                    if g[y][x] in 'CcTJ':
                        g[y][x] = 'A'
            _put(g, 5, 10, 'A'); _put(g, 10, 10, 'A')
        elif outfit == 'chef':
            pal['A'] = hx('#ffffff')
            _setrow(g, 0, ".....OOOOOO.....")
            _setrow(g, 1, "....OAAAAAAO....")
            _setrow(g, 2, "...OOAAAAAAOO...")
        elif outfit in ('security', 'janitor'):
            pal['K'] = pal['C'] if outfit == 'security' else hx('#e0a030')
            _setrow(g, 1, "....OOOOOOOO....")
            _setrow(g, 2, "...OKKKKKKKKO...")
            _setrow(g, 3, "..OkkkkkkkkKKO..")
            pal['k'] = dk(pal['K'], 0.7)
        elif outfit == 'market-apron':
            pal['A'] = hx('#b07a48'); pal['K'] = CLOTH[(v + 2) % 8]; pal['k'] = dk(pal['K'], 0.7)
            for y in range(11, 15):
                for x in range(5, 11):
                    if g[y][x] in 'CcTJ':
                        g[y][x] = 'A'
            _put(g, 7, 12, 'O'); _put(g, 8, 12, 'O')        # pocket
            if sp in HAIRY:
                _setrow(g, 2, "....OKKKKKKO....")         # headscarf
                _put(g, 12, 3, 'K'); _put(g, 13, 4, 'K')
        elif outfit == 'beachwear':
            pal['C'] = CLOTH[(v + 5) % 8]; pal['c'] = dk(pal['C'], 0.72)
            for x in range(4, 12):                          # tank top: shoulders and chest band show skin
                if g[10][x] in 'Cc':
                    g[10][x] = 'S'
            for y in (13, 14):
                for x in range(16):
                    if g[y][x] in 'cT':
                        g[y][x] = 'C'
            pal['G2'] = hx('#202028')
            for x in range(5, 11):                          # sunglasses
                _put(g, x, 6, 'O')
            _put(g, 5, 7, 'O'); _put(g, 6, 7, 'O'); _put(g, 9, 7, 'O'); _put(g, 10, 7, 'O')
        elif outfit == 'stage-costume':
            pal['Q'] = hx('#ff9ab0')
            for (x, y) in ((5, 11), (9, 12), (7, 13), (10, 11)):
                _put(g, x, y, 'X')
            _put(g, 9, 0, 'O'); _put(g, 10, 0, 'Q'); _put(g, 10, 1, 'Q'); _put(g, 11, 0, 'O')   # plume
        elif outfit == 'monk-robe':
            pal['K'] = pal['C']; pal['k'] = pal['c']
            _setrow(g, 1, ".....OOOOOO.....")               # hood up
            _setrow(g, 2, "....OKKKKKKO....")
            _setrow(g, 3, "...OKKKKKKKKO...")
            _setrow(g, 4, "...OKkkkkkkKO...")
            _setrow(g, 12, "...OSCCCCCCSO...")
            _setrow(g, 13, "...OCCCCCCCCO...")
            _setrow(g, 14, "...OccccccccO...")
            _setrow(g, 15, ".....FF..FF.....")
            for x in range(5, 11):
                if g[11][x] in 'CcTJ':
                    g[11][x] = 'X' if x in (5, 10) else g[11][x]
        elif outfit == 'tourist':
            pal['K'] = hx('#f0e0a0'); pal['k'] = hx('#c8a860')
            _setrow(g, 1, "....OOOOOOOO....")
            _setrow(g, 2, "..OOKKKKKKKKOO..")
            _setrow(g, 3, ".OkkkkkkkkkkkkO.")
            pal['C'] = CLOTH[(v + 3) % 8]
            for (x, y) in ((6, 11), (9, 12), (7, 13)):
                _put(g, x, y, 'W')
            _put(g, 8, 11, 'O'); _put(g, 8, 12, 'O')     # camera strap
    # generic beard (dwarves draw their own)
    if beard and sp not in ('automaton', 'snail', 'pixie', 'aarakocra', 'mushroomfolk'):
        _put(g, 4, 8, 'H'); _put(g, 11, 8, 'H')
        for x in range(5, 11):
            _put(g, x, 9, 'H')
        for x in range(6, 10):
            _put(g, x, 10, 'H')
        pal['b'] = pal['S']


def _age(g, pal, sp, age):
    blank = list('.' * 16)
    if age == 'child':
        g = [blank[:] for _ in range(3)] + [r[:] for r in g[0:10]] + [g[11][:], g[14][:], g[15][:]]
    elif age == 'teen':
        g = [blank[:]] + [r[:] for r in g[0:12]] + [r[:] for r in g[13:16]]
    elif age == 'elder':
        pal['Z'] = hx('#8a5a30')
        for y in range(10, 16):
            _put(g, 13, y, 'Z')
        _put(g, 12, 10, 'Z'); _put(g, 14, 15, 'O')
    return g


PIKPIK = [
    "...OO...........",
    "..OBBO.....OOO..",
    "..OBBOPP..ObbBO.",
    ".OWEBBOPP.ObbBBO",
    "YYWWBBO..ObbBBBO",
    "Y.OBBO...ObbBBBO",
    "...OBO..ObbBBBBO",
    "...OBO..ObbBBBO.",
    "...OBO.ObbBBBBO.",
    "..OBSSOObbBBBO..",
    "..OBSsSSBBBBO...",
    "..OBSSSBBBBO....",
    "...OBBBBBOO.....",
    "....OLOOLO......",
    "....OL..LO......",
    "...LLL.LLL......",
]
PIKPIK_BABY = [
    "................", "................", "................", "................",
    "................", "................", "................",
    "....OOOP........",
    "...OBBBOP.OO....",
    "..OWEBBO.ObbO...",
    "YYOWWBBOObbBO...",
    "..OBBBBBBBBO....",
    "..OBBBBBBBO.....",
    "...OOBBOOO......",
    "....OL.LO.......",
    "....L..L........",
]


def build_spirit(variant, pulse=False):
    """A spirit (Coach Ly'thol): a floating orb of light. v%3 tint: white, warm gold, pale green.
    pulse=True is frame 2: a slightly bigger, brighter glow with the sparkles moved (not a breath)."""
    tints = [((255, 255, 255), (214, 228, 255)), ((255, 248, 222), (255, 214, 120)), ((246, 255, 240), (176, 240, 176))]
    core, rim = tints[variant % 3]
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    p = img.load()
    cx, cy = 7.5, 6.5
    glow_r = 7.4 if pulse else 6.8
    for y in range(16):
        for x in range(16):
            d = ((x + 0.5 - 8 - (cx - 7.5)) ** 2 + (y + 0.5 - cy - 0.5) ** 2) ** 0.5
            if d <= 4.4:                                   # solid core, a touch of rim colour at its edge
                t = max(0.0, (d - 2.6) / 1.8) * (0.35 if pulse else 0.5)
                p[x, y] = tuple(int(core[i] + (rim[i] - core[i]) * t) for i in range(3)) + (255,)
            elif d <= 5.4:                                 # pale rim (opaque enough to read on light floors)
                p[x, y] = rim + (235 if pulse else 215,)
            elif d <= glow_r:                              # soft halo
                a = int((1 - (d - 5.4) / (glow_r - 5.4)) * (120 if pulse else 80))
                p[x, y] = rim + (max(a, 0),)
    # a little highlight and sparkles
    p[6, 4] = (255, 255, 255, 255)
    sparks = [(2, 1), (13, 3), (1, 10), (14, 9)] if not pulse else [(3, 0), (14, 5), (0, 8), (12, 11)]
    for (x, y) in sparks:
        p[x, y] = core + (255,)
    # faint floor shadow: it floats
    for x in range(5, 11):
        p[x, 15] = (10, 6, 20, 60)
    for x in range(6, 10):
        p[x, 14] = (10, 6, 20, 35)
    return img


def special_frame2(species, variant, tags):
    """Species whose idle frame 2 is drawn (pulse / jiggle / sway / drip) rather than the 1-px breath. None otherwise."""
    if species == 'spirit':
        return build_spirit(variant, pulse=True)
    if species in FOLK:
        t = parse_tags(tags)
        return FOLK[species](variant, True, t['age'], t['outfit'])
    return None


SIT_AS_IS = ('spirit', 'pikpik', 'snail', 'goo', 'plantling', 'crud')


def seated(img, species='human'):
    """Sitting pose (17 Nov 2026) for a 16x16 humanoid frame: head and arms stay put, the legs fold into one lap band
    in trouser colour (row 12) with the shoes peeking out under it (row 13), so the figure ends 2 px higher and a sitter
    anchored like a stander sits up on the bench seat with the bench legs still showing below. Shape folk (goo,
    plantlings, cruds, spirits, snails, PikPiks) have no legs to fold: they just perch 2 px up."""
    src = img.load()
    out = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    if species in SIT_AS_IS:
        out.paste(img.crop((0, 2, 16, 16)), (0, 0))
        return out
    o = out.load()
    for y in range(0, 12):                      # head .. arms, unchanged
        for x in range(16):
            if src[x, y][3]:
                o[x, y] = src[x, y]
    row = lambda y: [src[x, y] for x in range(16)]
    r12 = row(12)
    xs = [x for x in range(16) if r12[x][3]]
    if not xs:
        return out
    legs = Counter(p for p in row(14) if p[3] and p[:3] != OUTLINE[:3]).most_common(1)
    leg = legs[0][0] if legs else dk(r12[(xs[0] + xs[-1]) // 2], 0.72)
    shoes = Counter(p for p in row(15) if p[3]).most_common(1)
    shoe = shoes[0][0] if shoes else OUTLINE
    l, r = min(xs), max(xs)
    for x in range(l, r + 1):                   # lap: outline | hand | trousers ... | hand | outline
        if x in (l, r):
            o[x, 12] = OUTLINE
        elif x in (l + 1, r - 1):
            o[x, 12] = r12[x] if r12[x][3] else leg
        else:
            o[x, 12] = leg
    for x in range(l + 1, r):                   # seat edge under the lap, shoes poking out
        o[x, 13] = shoe if src[x, 15][3] else OUTLINE
    return out


def build_pikpik(variant, age=None):
    """Ban'ton's riding bird: v%4 0-1 saddled, 2 wild, 3 baby (or :child)."""
    v = variant % 32
    kind = 'baby' if (age == 'child' or v % 4 == 3) else ('wild' if v % 4 == 2 else 'saddled')
    rows = PIKPIK_BABY if kind == 'baby' else PIKPIK
    pal = {'O': hx('#060c0c'), 'B': hx('#0f2a2a'), 'b': hx('#1c4444'), 'W': WHITE, 'E': EYE,
           'Y': hx('#d07a2a'), 'L': hx('#e08a30'),
           'P': [hx('#c060a8'), hx('#e070c0'), hx('#a050c0'), hx('#f08ab0')][(v // 4) % 4],
           'S': [hx('#9a5a3a'), hx('#7a4428'), hx('#b8743e'), hx('#5a3a5a')][(v // 4) % 4],
           's': hx('#3a2018')}
    if kind == 'wild':
        pal['S'] = pal['B']; pal['s'] = pal['B']
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    PX(img).blit(0, 0, rows, pal)
    return img


def _put(g, x, y, ch):
    if 0 <= y < len(g) and 0 <= x < 16:
        g[y][x] = ch


def _patch(g, x0, y0, rows, mirror=True):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == '?':
                continue
            _put(g, x0 + i, y0 + j, ch)
            if mirror:
                _put(g, 15 - (x0 + i), y0 + j, ch)


def _setrow(g, y, row):
    g[y] = list(row)


def build_npc(species, variant, *tags):
    """Returns (16x16 RGBA image, known: bool).

    variant 0-31: v % 8 picks the species palette (as before), v // 8 the outfit cut (shirt / trousers / dress / jacket);
    hair style, hair and skin tones come from a stable hash. tags: child | teen | elder, beard | nobeard,
    and outfits apron | chef | goolax | security | janitor | tourist."""
    t = parse_tags(tags)
    age, beard, outfit = t['age'], t['beard'], t['outfit']
    if species == 'spirit':
        return build_spirit(variant), True
    if species in FOLK:
        return FOLK[species](variant, False, age, outfit), True
    if species == 'pikpik':
        return build_pikpik(variant, age), True
    vv = variant % 32
    v = vv % 8
    known = species in SPECIES
    sp0 = species if known else 'human'
    if beard is None:
        beard = sp0 == 'dwarf'
    if age == 'child':
        beard = False
    g = [list(r) for r in NPC_BASE]
    pal = {'O': OUTLINE, 'E': EYE, 'W': WHITE, 'b': BLUSH,
           'C': CLOTH[v], 'c': dk(CLOTH[v], 0.72), 'F': hx('#3a2a22'),
           'H': HAIR[v], 'S': HUMAN_SKIN[v], 'K': hx('#e8dcc0'), 'k': hx('#b8a888'),
           'Y': hx('#f0d040'), 'N': hx('#5ff0ff'), 'P': hx('#f090a8'), 'G': hx('#c8f0ffc0'),
           'M': hx('#a8b4c0'), 'm': hx('#6c7884')}
    sp = species if known else 'human'

    if sp == 'elf':
        pal['S'] = [hx('#f8e0c8'), hx('#e8d0f0'), hx('#d8b090'), hx('#a87858')][v % 4]
        _patch(g, 0, 4, ["O???", "OSO?", "?OSS", "??OO"])
    elif sp == 'gnome':
        pal['K'] = CLOTH[v]; pal['k'] = dk(CLOTH[v], 0.7); pal['H'] = hx('#f4f2ee')
        pal['S'] = HUMAN_SKIN[v % 3]
        _setrow(g, 0, "......OKO.......")
        _setrow(g, 1, ".....OKKKO......")
        _setrow(g, 2, "....OKKKKKO.....")
        _setrow(g, 3, "..OOkKKKKKKkOO..")
        _setrow(g, 4, "...OOOOOOOOOO...")
        _setrow(g, 8, "...OHSSPPSSHO...")
        _setrow(g, 9, "....OHHHHHHO....")
        _setrow(g, 10, "....OHHHHHHO....")
        _setrow(g, 11, "...OSCHHHHCSO...")
        pal['C'] = CLOTH[(v + 1) % 8]; pal['c'] = dk(pal['C'], 0.72)
    elif sp == 'goblin':
        pal['S'] = [hx('#7cc152'), hx('#94c84a'), hx('#5fae5a'), hx('#a8c860')][v % 4]
        _patch(g, 0, 5, ["OOO?", "OSSS", "?OOO"])
        _setrow(g, 2, "....OHHHHHHO....")
        pal['s'] = dk(pal['S'], 0.82)
    elif sp == 'hobgoblin':
        pal['S'] = [hx('#d9773a'), hx('#c8603a'), hx('#e08a4a'), hx('#b85a30')][v % 4]
        pal['H'] = HAIR[1]
        _patch(g, 1, 5, ["OO?", "?SS"])
    elif sp == 'dwarf':
        pal['M'] = hx('#b8c0c8')
        _setrow(g, 1, ".....OOOOOO.....")
        _setrow(g, 2, "....OMMMMMMO....")
        _setrow(g, 3, "...OMMMMMMMMO...")
        _setrow(g, 4, "...OmmmmmmmmO...")
        if beard:
            _setrow(g, 8, "...OHSSPPSSHO...")
            _setrow(g, 9, "...OHHHHHHHHO...")
            _setrow(g, 10, "....OHHHHHHO....")
            _setrow(g, 11, "...OSCHHHHCSO...")
        pal['P'] = dk(pal['S'], 0.85)
        pal['H'] = [HAIR[0], HAIR[3], HAIR[2], HAIR[1], hx('#a05a2a'), HAIR[4], hx('#d8783a'), HAIR[0]][v]
        if beard and vv >= 16:      # braided beard tips
            _put(g, 6, 11, 'Y'); _put(g, 9, 11, 'Y')
        beard = False               # the dwarf beard is already drawn
    elif sp == 'halfling':
        pal['F'] = dk(pal['S'], 0.8)
        _setrow(g, 1, "....O.OOOO.O....")
        _setrow(g, 2, "...OHOHHHHOHO...")
        _put(g, 5, 1, 'O'); _put(g, 10, 1, 'O')
    elif sp == 'orc':
        pal['S'] = [hx('#8aa860'), hx('#7a9a70'), hx('#9ab070'), hx('#6c8c58')][v % 4]
        pal['H'] = HAIR[1]
        _put(g, 6, 8, 'W'); _put(g, 9, 8, 'W')
        _patch(g, 2, 5, ["O?", "SO"])
    elif sp == 'lizardfolk':
        pal['S'] = [hx('#5ca85a'), hx('#4a9a8a'), hx('#7ab04a'), hx('#3a8a5a')][v % 4]
        pal['H'] = pal['S']; pal['K'] = hx('#f08838')
        _put(g, 7, 0, 'O'); _put(g, 8, 0, 'O'); _put(g, 7, 1, 'K'); _put(g, 8, 1, 'K'); _put(g, 7, 2, 'K')
        _put(g, 6, 6, 'Y'); _put(g, 9, 6, 'Y'); _put(g, 5, 8, 'S'); _put(g, 10, 8, 'S')
        _patch(g, 12, 11, ["??O?", "?OSO", "OSO?"], mirror=False)
    elif sp == 'dragonborn':
        cols = ('#c84a3a', '#c08a3a', '#4a78c8', '#4aa05a', '#e0b840', '#b8c0c8', '#3a3448', '#e8e4dc')
        pal['S'] = hx(cols[v]); pal['H'] = pal['S']; pal['K'] = hx('#f0e6c8')
        _put(g, 4, 1, 'K'); _put(g, 3, 1, 'O'); _put(g, 4, 0, 'O'); _put(g, 3, 2, 'K')
        _put(g, 11, 1, 'K'); _put(g, 12, 1, 'O'); _put(g, 11, 0, 'O'); _put(g, 12, 2, 'K')
        _put(g, 6, 6, 'Y'); _put(g, 9, 6, 'Y')
        _put(g, 5, 8, 'S'); _put(g, 10, 8, 'S'); _put(g, 7, 8, 's'); _put(g, 8, 8, 's')
        pal['C'] = CLOTH[(v + 3) % 8]; pal['c'] = dk(pal['C'], 0.72)
    elif sp == 'pixie':
        pal['S'] = hx('#ffe4ec'); pal['H'] = [hx('#ff80c0'), hx('#80d0ff'), hx('#c0a0ff'), hx('#ffd060')][v % 4]
        _patch(g, 0, 8, ["?OO?", "OGGO", "OGGO", "?OGO", "??O?"])
        _put(g, 1, 3, 'Y'); _put(g, 14, 2, 'Y')
    elif sp == 'fishfolk':
        pal['S'] = [hx('#5cc0c8'), hx('#6aa8e0'), hx('#58c8a0'), hx('#e0906a')][v % 4]
        pal['H'] = dk(pal['S'], 0.7); pal['K'] = dk(pal['S'], 0.7)
        _patch(g, 1, 4, ["?O?", "OKO", "OKK", "?OO"])
        _put(g, 7, 0, 'O'); _put(g, 8, 0, 'O'); _put(g, 7, 1, 'K'); _put(g, 8, 1, 'K')
        _put(g, 6, 6, 'W'); _put(g, 9, 6, 'W')
    elif sp == 'snail':
        pal['S'] = [hx('#d8c0a0'), hx('#c8d0a0'), hx('#e0b8b0'), hx('#b8c8c0')][v % 4]
        pal['H'] = pal['S']; pal['K'] = [hx('#c87a3a'), hx('#9a6ac8'), hx('#d8a040'), hx('#5aa0a0')][v % 4]
        pal['k'] = dk(pal['K'], 0.7)
        _setrow(g, 0, "....OEO..OEO....")
        _setrow(g, 1, ".....O....O.....")
        _put(g, 5, 2, 'O'); _put(g, 10, 2, 'O')
        _setrow(g, 1, ".....O....O.....")
        _patch(g, 10, 7, ["??OOOO", "?OKKKO", "OKkkKO", "OKkKKO", "OKKkKO", "?OKKO?", "??OO??"], mirror=False)
        _setrow(g, 14, "...OSSSSSSSSO...")
        _setrow(g, 15, "....OOOOOOOO....")
        g[2] = list("....OSSOSSSO....")
    elif sp == 'automaton':
        pal['S'] = hx('#b4bec8'); pal['s'] = hx('#7c8894'); pal['H'] = hx('#8c98a4'); pal['b'] = pal['S']
        _setrow(g, 0, ".......YO.......")
        _setrow(g, 6, "...OSNNNNNNSO...")
        _setrow(g, 7, "...OSSSSSSSSO...")
        _put(g, 7, 12, 'N'); _put(g, 8, 12, 'N')
    elif sp == 'mushroomfolk':
        pal['K'] = [hx('#d8463a'), hx('#e88a2a'), hx('#8a5ad0'), hx('#3aa8a0'), hx('#d84a8a'), hx('#c8a040'),
                    hx('#5a78d0'), hx('#a0603a')][v]
        pal['k'] = dk(pal['K'], 0.72); pal['S'] = hx('#f4e6c8'); pal['s'] = hx('#d8c4a0')
        _setrow(g, 0, "....OOOOOOOO....")
        _setrow(g, 1, "..OOKKWWKKKKOO..")
        _setrow(g, 2, ".OKKKKWWKKWWKKO.")
        _setrow(g, 3, "OKWWKKKKKKWWKKKO")
        _setrow(g, 4, "OKWWKKKKKKKKKkKO")
        _setrow(g, 5, ".OOkkkkkkkkkkOO.")
        _setrow(g, 6, "...OSSESSESSO...")
    elif sp == 'tiefling':
        pal['S'] = [hx('#c84a4a'), hx('#9a5ac8'), hx('#5a7ad8'), hx('#e07aa0'), hx('#b86ad8'),
                    hx('#d8603a'), hx('#7a5ab8'), hx('#e8a0b8')][v]
        pal['H'] = [HAIR[1], HAIR[4], HAIR[1], HAIR[5]][v % 4]; pal['K'] = hx('#3a2a3a')
        for (x, y) in ((3, 2), (3, 1), (2, 0)):
            _put(g, x, y, 'K'); _put(g, 15 - x, y, 'K')
        _patch(g, 12, 11, ["???O", "??OK", "?OKO", "OKO?"], mirror=False)
        pal['Y'] = hx('#f8e060'); _put(g, 6, 6, 'Y'); _put(g, 9, 6, 'Y')
    elif sp == 'kobold':
        pal['S'] = [hx('#d8643a'), hx('#c84838'), hx('#a86a4a'), hx('#5a7ac8')][v % 4]
        pal['H'] = pal['S']; pal['K'] = hx('#f0e6c8')
        _put(g, 4, 1, 'K'); _put(g, 11, 1, 'K'); _put(g, 4, 0, 'O'); _put(g, 11, 0, 'O')
        _put(g, 6, 6, 'Y'); _put(g, 9, 6, 'Y'); _put(g, 7, 8, 's'); _put(g, 8, 8, 's')
        _patch(g, 12, 12, ["??O", "?OS", "OSO"], mirror=False)
    elif sp == 'mole':
        pal['S'] = [hx('#7a5a48'), hx('#5a4a44'), hx('#8a6a50'), hx('#6a5a5a')][v % 4]
        pal['H'] = dk(pal['S'], 0.85); pal['s'] = dk(pal['S'], 0.82); pal['b'] = pal['S']
        _setrow(g, 6, "...OSSSSSSSSO...")
        _setrow(g, 7, "...OSSESSESSO...")
        _setrow(g, 8, "...OSSSPPSSSO...")
        _put(g, 4, 11, 'P'); _put(g, 11, 11, 'P')
    elif sp == 'aarakocra':
        feath = [('#c84a3a', '#8a2e22'), ('#3a78c8', '#24508a'), ('#8a6a48', '#5a4430'), ('#e8e4dc', '#a8a49c'),
                 ('#4aa05a', '#2e6a3a'), ('#e0b840', '#a07c20'), ('#2e2e3a', '#18181e'), ('#e070a0', '#a04870')][v]
        pal['S'] = hx(feath[0]); pal['H'] = hx(feath[1]); pal['Y'] = hx('#f0b030'); pal['b'] = pal['S']
        _setrow(g, 0, ".......OO.......")
        _setrow(g, 1, ".....OOHHOO.....")
        _setrow(g, 7, "...OSSSYYSSSO...")
        _setrow(g, 8, "...OSSSYYSSSO...")
        _setrow(g, 9, "....OssOOssO....")
        _patch(g, 0, 10, ["??OH", "?OHH", "OHHS", "?OOO"])
    pal.setdefault('s', dk(pal['S'], 0.82))
    if 's' not in pal or sp not in ('automaton', 'mushroomfolk', 'goblin', 'mole'):
        pal['s'] = dk(pal['S'], 0.84)
    _variety(g, pal, sp, v, vv, age, beard, outfit)
    g = _age(g, pal, sp, age)
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    px = PX(img)
    px.blit(0, 0, [''.join(r) for r in g], pal)
    if not known:
        # grey-out to flag unknown species, and add a '?' tag
        for y in range(16):
            for x in range(16):
                c = img.getpixel((x, y))
                if c[3]:
                    l = (c[0] + c[1] + c[2]) // 3
                    img.putpixel((x, y), (l, l, l, c[3]))
        for (x, y) in ((13, 0), (14, 0), (15, 1), (14, 2), (14, 4)):
            px.set(x, y, hx('#ff3060'))
    return img, known


# ---------------------------------------------------------------- objects
OBJ = {
    'sign': T(
        "................",
        "................",
        ".OOOOOOOOOOOOOO.",
        ".OLLLLLLLLLLLLO.",
        ".OWWWWWWWWWWWWO.",
        ".OWkkkkWkkkWWWO.",
        ".OWWWWWWWWWWWWO.",
        ".OWkkkWkkkkkkWO.",
        ".OwwwwwwwwwwwwO.",
        ".OOOOOOOOOOOOOO.",
        ".......OwO......",
        ".......OwO......",
        ".......OwO......",
        ".......OwO......",
        "......OOOOO.....",
        "......ddddd.....",
    ),
    'poster': T(
        "................",
        "...OOOOOOOOOO...",
        "...OWWWWWWWWO...",
        "...OWAAAAAAWO...",
        "...OWAYYAAAWO...",
        "...OWAYYAAAWO...",
        "...OWAAAAAAWO...",
        "...OWAABBAAWO...",
        "...OWABBBBAWO...",
        "...OWWWWWWWWO...",
        "...OWkkkkkkWO...",
        "...OWWWWWWWWO...",
        "...OWkkkkWWWO...",
        "...OWWWWWWWWO...",
        "...OOOOOOOOOO...",
        "...dddddddddd...",
    ),
    'chest': T(
        "................",
        "................",
        "................",
        "................",
        "...OOOOOOOOOO...",
        "..OLLLLLLLLLLO..",
        ".OLWWWWWWWWWWLO.",
        ".OWWWWWWWWWWWWO.",
        ".OGGGGGGGGGGGGO.",
        ".OwwwwwYYwwwwwO.",
        ".OWWWWWYYWWWWWO.",
        ".OWWWWWWWWWWWWO.",
        ".OGGGGGGGGGGGGO.",
        ".OwwwwwwwwwwwwO.",
        ".OOOOOOOOOOOOOO.",
        ".dddddddddddddd.",
    ),
    'crate': T(
        "................",
        "................",
        "................",
        "................",
        "................",
        ".OOOOOOOOOOOOO..",
        ".OLLLLLLLLLLLO..",
        ".OXXXXXXXXXXXO..",
        ".OXwWWWWWWWWXO..",
        ".OXWwWWWWWWWXO..",
        ".OXWWwWWWWWWXO..",
        ".OXWWWwWWWWWXO..",
        ".OXXXXXXXXXXXO..",
        ".OXXXXXXXXXXXO..",
        ".OOOOOOOOOOOOO..",
        ".ddddddddddddd..",
    ),
    'trashcan': T(
        "................",
        "................",
        ".......YY.......",
        ".....OOYYOO.....",
        "....OLLLLLLO....",
        "...OMMMMMMMMO...",
        "...OOOOOOOOOO...",
        "....OMmMMmMO....",
        "....OMmMMmMO....",
        "....OMmMMmMO....",
        "....OMmMMmMO....",
        "....OMmMMmMO....",
        "....OmmmmmmO....",
        "....OOOOOOOO....",
        "....dddddddd....",
        "................",
    ),
    'plant': T(
        "................",
        ".......OO.......",
        "...OO.OLGO.OO...",
        "..OLGOOLGGOLGO..",
        "..OGGGOGGGOGGO..",
        "...OGGGGGGGGO...",
        "..OLGGgGGgGGLO..",
        "...OgGGGGGGgO...",
        "....OOggggOO....",
        "....OPPPPPPO....",
        "...OPPQQQQPPO...",
        "...OOOOOOOOOO...",
        "....OPPPPPpO....",
        "....OpPPPPpO....",
        ".....OppppO.....",
        ".....dddddd.....",
    ),
    'crystal': T(
        "................",
        ".......O........",
        "......OLO.......",
        "......OLCO......",
        "...O..OLCO..O...",
        "..OLO.OLCCO.OLO.",
        "..OLCOOLCCOOLCO.",
        "..OLCOLCCCCOLCO.",
        "..OLCCLCCCCCCcO.",
        "..OCCcCCCCcCccO.",
        "...OccCCCCcccO..",
        "....OOOOOOOOO...",
        "...OSSSSSSSSSO..",
        "...OsssssssssO..",
        "....OOOOOOOOO...",
        "....ddddddddd...",
    ),
    'cart': T(
        "................",
        "................",
        "..OOOOOOOOOOOO..",
        "..OAAaaAAaaAAO..",
        "..OOOOOOOOOOOO..",
        "...O........O...",
        "...O........O...",
        ".OOOOOOOOOOOOOO.",
        ".OYRGYRGYRGYRGO.",
        ".OWWWWWWWWWWWWO.",
        ".OWwwwwwwwwwwWO.",
        ".OWWWWWWWWWWWWO.",
        ".OOOOOOOOOOOOOO.",
        "..OkO......OkO..",
        "..OOO......OOO..",
        "..ddd......ddd..",
    ),
    'statue': T(
        "......OOOO......",
        ".....OSSSSO.....",
        ".....OSsSsO.....",
        ".....OSSSSO.....",
        "......OSSO......",
        "....OOSSSSOO....",
        "...OSSSSSSSSO...",
        "...OSOSSSSOSO...",
        "...OSOSSSSOSO...",
        ".....OSSSSO.....",
        ".....OSOOSO.....",
        "...OOOOOOOOOO...",
        "...OPPPPPPPPO...",
        "...OPpPPPPpPO...",
        "...OOOOOOOOOO...",
        "...dddddddddd...",
    ),
    'lamp': T(
        "......OOOO......",
        ".....OYYYYO.....",
        "....OYLLLLYO....",
        "....OYLLLLYO....",
        ".....OYYYYO.....",
        "......OOOO......",
        ".......OO.......",
        "......OMMO......",
        "......OMmO......",
        "......OMmO......",
        "......OMmO......",
        "......OMmO......",
        ".....OOOOOO.....",
        ".....OMMMMO.....",
        ".....OOOOOO.....",
        ".....dddddd.....",
    ),
    'note': T(
        "................",
        "................",
        "................",
        "................",
        "................",
        ".....OOOOOO.....",
        ".....OWWWWOO....",
        ".....OWkkWWO....",
        ".....OWWWWWO....",
        ".....OWkkkWO....",
        ".....OWWWWWO....",
        ".....OWkkWWO....",
        ".....OOOOOOO....",
        ".....ddddddd....",
        "................",
        "................",
    ),
    'cat': T(
        "................",
        "................",
        "................",
        "................",
        "...OO...OO......",
        "...OFO.OFO......",
        "...OFFFFFFO.....",
        "...OFEFFEFO.....",
        "...OFFPPFFO.....",
        "....OFFFFOO.....",
        "....OFFFFFFO....",
        "...OFFfFFFFFO...",
        "...OFFfFFFFFOO..",
        "...OFFFFFFFFOFO.",
        "....OOOOOOOOOO..",
        "....dddddddddd..",
    ),
    '_unknown': T(
        "................",
        "...OOOOOOOOOO...",
        "..OYYYYYYYYYYO..",
        "..OYyOOOOOOyYO..",
        "..OYOO....OOYO..",
        "..OYYYYYY.OOYO..",
        "..OYYYYYOOOYYO..",
        "..OYYYYOOYYYYO..",
        "..OYYYYOOYYYYO..",
        "..OYYYYYYYYYYO..",
        "..OYYYYOOYYYYO..",
        "..OYyYYOOYYyYO..",
        "..OYYYYYYYYYYO..",
        "...OOOOOOOOOO...",
        "...dddddddddd...",
        "................",
    ),
}
OBJ_NAMES = [k for k in OBJ if not k.startswith('_')] + sorted(PROPS)


def build_obj(thing, seed=0):
    if thing in PROPS:
        return build_prop(thing, seed), True
    if thing == 'pikpik':
        return build_pikpik(seed), True
    known = thing in OBJ
    rows = OBJ[thing if known else '_unknown']
    pal = {'O': OUTLINE, 'W': hx('#f4ecd8'), 'w': hx('#d8ccb0'), 'L': hx('#fffaf0'), 'k': hx('#7a5a40'),
           'Y': hx('#f4c838'), 'y': hx('#fff0a0'), 'G': hx('#e0b030'), 'A': hx('#5a9ae0'), 'B': hx('#e05a7a'),
           'M': hx('#9aa4b0'), 'm': hx('#6c7684'), 'P': hx('#c86a3a'), 'p': hx('#9a4a2a'), 'Q': hx('#e8946a'),
           'G2': None, 'X': hx('#8a5a30'), 'S': hx('#b8b0c0'), 's': hx('#8a8298'),
           'R': hx('#e04848'), 'N': hx('#5ff0ff')}
    if thing == 'chest':
        pal.update({'W': hx('#b8743e'), 'w': hx('#93582c'), 'L': hx('#d9965a')})
    elif thing == 'crate':
        pal.update({'W': hx('#c8904e'), 'w': hx('#a06a34'), 'L': hx('#e0b070'), 'X': hx('#8a5a30')})
    elif thing == 'plant':
        pal.update({'G': hx('#4caa48'), 'g': hx('#2e7a34'), 'L': hx('#8ad860')})
    elif thing == 'crystal':
        cc = [('#c890ff', '#8a50d8'), ('#80e0ff', '#3a98d0'), ('#ff90c8', '#d04a8a'), ('#90ffb8', '#3ab070')][seed % 4]
        pal.update({'C': hx(cc[0]), 'c': hx(cc[1]), 'L': hx('#ffffff')})
    elif thing == 'cart':
        pal.update({'A': hx('#e04848'), 'a': hx('#f8f0e0'), 'W': hx('#c8904e'), 'w': hx('#a06a34'),
                    'G': hx('#58c048'), 'k': hx('#3a3a3a')})
    elif thing == 'statue':
        pal.update({'S': hx('#c8c0d0'), 's': hx('#8a8098'), 'P': hx('#9a90a8'), 'p': hx('#7a7088')})
    elif thing == 'lamp':
        pal.update({'Y': hx('#ffd65a'), 'L': hx('#fff6c0'), 'M': hx('#4a4a58'), 'm': hx('#2e2e3a')})
    elif thing == 'poster':
        a = [('#5a9ae0', '#e05a7a'), ('#e8a030', '#5ab070'), ('#9a5ad8', '#f0d040'), ('#40b8b0', '#e06040')][seed % 4]
        pal.update({'A': hx(a[0]), 'B': hx(a[1])})
    elif thing == 'cat':
        fur = [('#e8964a', '#c87430'), ('#9a9aa8', '#74748a'), ('#3a3440', '#26222c'), ('#f4f0e8', '#d0c8bc')][seed % 4]
        pal.update({'F': hx(fur[0]), 'f': hx(fur[1]), 'E': hx('#40c060') if seed % 4 == 2 else EYE, 'P': hx('#f090a8')})
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    PX(img).blit(0, 0, rows, pal)
    return img, known


def parse_sprite(s):
    """'npc:goblin:3' -> ('npc','goblin',3); 'obj:lamp' -> ('obj','lamp',0)."""
    parts = (s or '').split(':')
    if len(parts) >= 2 and parts[0] == 'npc':
        try:
            v = int(parts[2]) if len(parts) > 2 else 0
        except ValueError:
            v = 0
        return 'npc', parts[1].strip().lower(), v
    if len(parts) >= 2 and parts[0] == 'obj':
        return 'obj', parts[1].strip().lower(), 0
    return 'bad', s, 0


# ---------------------------------------------------------------- pop-up booths
BOOTH_COLS = ['#e04848', '#3a7ae0', '#3ab05a', '#f0a830', '#9a58d0', '#28b0b0']


def build_booth(color_hex=None, locked=False):
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    px = PX(img)
    O = OUTLINE
    if locked:
        A, A2 = hx('#9a96a4'), hx('#e8e4dc')
    else:
        A, A2 = hx(color_hex), hx('#fbf6ea')
    Ad, A2d = dk(A, 0.78), dk(A2, 0.84)
    wood, wood2, wood3 = hx('#b8743e'), hx('#8a5228'), hx('#dc9c5c')
    # ground shadow
    for x in range(2, 30):
        px.set(x, 30, (10, 6, 20, 90)); px.set(x, 29, (10, 6, 20, 60))
    # posts
    for x0 in (3, 27):
        px.rect(x0, 11, 2, 18, wood); px.rect(x0 + 1, 11, 1, 18, wood2)
        px.rect(x0 - 1, 11, 1, 18, O); px.rect(x0 + 2, 11, 1, 18, O)
    # back wall in shadow
    px.rect(5, 11, 22, 10, hx('#5a3a2a') if not locked else hx('#4a4652'))
    if not locked:
        # shelf with jars
        px.rect(5, 15, 22, 1, wood2)
        goods = ['#f05a5a', '#5ad0f0', '#f0d040', '#a070f0', '#60d070', '#f09040']
        for i, x in enumerate(range(6, 26, 3)):
            c = hx(goods[(i + len(color_hex)) % len(goods)])
            px.rect(x, 12, 2, 3, c); px.set(x, 12, mix(c, hx('#ffffff'), 0.5)); px.set(x, 11, O)
    # counter
    px.rect(1, 20, 30, 1, O)
    px.rect(1, 21, 30, 2, wood3); px.rect(1, 22, 30, 1, wood)
    px.rect(1, 23, 30, 1, O)
    px.rect(1, 24, 30, 5, A if not locked else hx('#7a7684'))
    for x in range(1, 31):
        if not locked and ((x - 1) // 3) % 2 == 1:
            px.rect(x, 24, 1, 5, A2)
    px.rect(1, 28, 30, 1, dk(A, 0.6) if not locked else hx('#4a4652'))
    px.rect(0, 20, 1, 10, O); px.rect(31, 20, 1, 10, O); px.rect(1, 29, 30, 1, O)
    if not locked:
        # goods on counter
        items = [(4, '#f05a5a'), (8, '#f0d040'), (12, '#5ad0f0'), (19, '#a070f0'), (23, '#60d070'), (26, '#f09040')]
        for x, c in items:
            c = hx(c)
            px.rect(x, 18, 3, 3, c); px.rect(x, 18, 3, 1, mix(c, hx('#ffffff'), 0.45))
            px.rect(x - 1, 18, 1, 3, O); px.rect(x + 3, 18, 1, 3, O); px.rect(x, 17, 3, 1, O)
        # price tag / little sign
        px.rect(14, 15, 4, 5, hx('#f8f0d8')); px.rect(13, 15, 1, 5, O); px.rect(18, 15, 1, 5, O)
        px.rect(13, 14, 6, 1, O); px.rect(13, 20, 6, 1, O); px.set(15, 17, hx('#e04848')); px.set(16, 17, hx('#e04848'))
    else:
        # shutter down over the front
        px.rect(4, 11, 24, 18, hx('#b8b4c0'))
        for y in range(11, 29):
            if (y - 11) % 3 == 2:
                px.rect(4, y, 24, 1, hx('#8a8696'))
            elif (y - 11) % 3 == 0:
                px.rect(4, y, 24, 1, hx('#d4d0dc'))
        px.rect(3, 11, 1, 18, O); px.rect(28, 11, 1, 18, O); px.rect(4, 28, 24, 1, O)
        # padlock
        px.rect(14, 19, 4, 1, O); px.rect(13, 20, 1, 2, O); px.rect(18, 20, 1, 2, O)
        px.rect(12, 22, 8, 6, O); px.rect(13, 23, 6, 4, hx('#f0c030')); px.rect(13, 23, 6, 1, hx('#fff0a0'))
        px.rect(15, 24, 2, 2, O)
    # awning (rows 1..12)
    for y in range(1, 11):
        inset = max(0, 3 - y)
        for x in range(1 + inset, 31 - inset):
            stripe = ((x - 1) // 4) % 2 == 0
            c = A if stripe else A2
            if y <= 3:
                c = mix(c, hx('#ffffff'), 0.18)
            elif y >= 8:
                c = Ad if stripe else A2d
            px.set(x, y, c)
    for x in range(0, 32):
        inset = max(0, 3 - 0)
    # awning outline
    for y in range(1, 11):
        inset = max(0, 3 - y)
        px.set(inset, y, O); px.set(31 - inset, y, O)
    px.rect(3, 0, 26, 1, O)
    px.set(1, 2, O); px.set(2, 1, O); px.set(29, 1, O); px.set(30, 2, O)
    # scalloped edge rows 11-12
    for i, x0 in enumerate(range(1, 31, 4)):
        stripe = i % 2 == 0
        c = Ad if stripe else A2d
        px.rect(x0, 11, 4, 1, c); px.rect(x0 + 1, 12, 2, 1, c)
        px.set(x0, 12, O); px.set(x0 + 3, 12, O); px.rect(x0 + 1, 13, 2, 1, O)
    px.set(0, 11, O); px.set(31, 11, O)
    # pennant at top
    px.rect(15, 0, 2, 1, hx('#f8e060'))
    return img
