"""Procedural 16 px tiles for MAUL mall maps (GBC-Pokemon-town style, fake 3/4 walls)."""
from pixcore import hx, mix, dk, alpha, hsh, T, PX
import mall_trees
import mall_depth

WALLISH = set('#wDE')
FLOORS = set('.,:"o')
LEGEND = set(' #w.,:"~TprStcbfkx+DH^vE_o=')


def _p(d):
    out = {}
    for k, v in d.items():
        out[k] = [hx(c) for c in v] if isinstance(v, list) else hx(v)
    return out


PALETTES = {
    'galleria': _p(dict(
        outline='#2a1838',
        sea='#2c64b4', sea2='#3d7dcc', sea3='#2457a0', foam='#d8eeff',
        cliff='#6a4688', cliff2='#553672', cliff3='#43285c', cliff_hi='#8e66ae',
        moss='#5fa040', moss2='#80c456',
        wall_top='#6a4692', wall_top2='#5d3d82', wall_front='#43286a', wall_front2='#36205a',
        mortar='#26143e', wall_base='#140a20', wall_hi='#9472bc', wall_edge='#160a22',
        floor_a='#f6edd6', floor_b='#efe4c8', floor_line='#e2d4b2', floor_hi='#fcf7e9',
        carpet='#e3a4a4', carpet2='#d99898', carpet3='#ecb8b4',
        mat='#5aa84a', mat2='#3c7a34', mat_hi='#9ad870', mat_trim='#f0c040',
        pave='#ab97bd', pave2='#9a85ae', pave_m='#76628c', pave_hi='#c6b6d6',
        grass='#74ba4e', grass2='#5ca03c', grass3='#a0d86c', grass_edge='#3e7a2c',
        water='#4c9ee2', water2='#7ec2f4', water3='#3482c8', rim='#ddd2e8', rim2='#a896bc',
        wood='#b8743e', wood2='#93582c', wood3='#d9965a', wood_dk='#5c3418',
        metal='#9aa3ad', metal2='#6c7580', metal_hi='#d6dde4',
        lantern='#ffd65a', lantern2='#ffae2e', lantern_hi='#fff3b0',
        glass='#a6dcec', glass2='#78bad2', glass_hi='#effcff',
        caps=['#d8463a', '#e8862a', '#8a5ad0', '#3aa8a0', '#d84a8a'],
        stem='#f2e6ca', stem2='#cdb894',
        rug='#3f8a5a', rug2='#e6bc4c', rug3='#2e6a44',
        rock='#8a6aa8', rock2='#6a4c88', rock_hi='#b296cc',
        body='#5a9a58', body2='#447a44',
        sign_fill='#f8eabc', sign_b1='#5c3418', sign_b2='#b0703c', sign_text='#3a1f52', sign_text2='#3a1f52',
        accent=['#e04848', '#f0b030', '#58c0e8', '#a060e0', '#60c060', '#f07ab0'],
    )),
    'cogskill': _p(dict(
        outline='#141822',
        sea='#141c2a', sea2='#1e2a3e', sea3='#0e1420', foam='#ffd060',
        cliff='#3c4858', cliff2='#2e3846', cliff3='#222a36', cliff_hi='#5a6a7c',
        moss='#e8b83a', moss2='#2a2a2a',
        wall_top='#3a4858', wall_top2='#323f4e', wall_front='#222c38', wall_front2='#1b2430',
        mortar='#121920', wall_base='#080b10', wall_hi='#647a90', wall_edge='#06080c',
        floor_a='#c3ccd4', floor_b='#bac4cd', floor_line='#a3aeb9', floor_hi='#d6dde3',
        carpet='#79bdbb', carpet2='#6db1b0', carpet3='#93d0cc',
        mat='#e8b83a', mat2='#c8962a', mat_hi='#ffe27a', mat_trim='#5ff4ff',
        pave='#959ba3', pave2='#8c939b', pave_m='#6c727a', pave_hi='#adb3ba',
        grass='#52aa6c', grass2='#3e8c56', grass3='#7cd08c', grass_edge='#2a6a40',
        water='#2eb4cc', water2='#78e4f0', water3='#2090aa', rim='#c9a14a', rim2='#8f6a26',
        wood='#c99a3e', wood2='#9a7028', wood3='#ecc674', wood_dk='#5a3e12',
        metal='#9aa3ad', metal2='#6c7580', metal_hi='#d6dde4',
        lantern='#ffe066', lantern2='#ffb030', lantern_hi='#fff6c0',
        glass='#78e0e0', glass2='#3eb4bc', glass_hi='#dafcff',
        caps=['#4fa86a', '#3e9a7a', '#5ab05a', '#46a090', '#62b468'],
        stem='#c99a3e', stem2='#8f6a26',
        rug='#4a3080', rug2='#4ff0e0', rug3='#3a2468',
        rock='#6c7178', rock2='#50555c', rock_hi='#8e949b',
        body='#3a3f5a', body2='#2a2e44',
        sign_fill='#142030', sign_b1='#0a0e16', sign_b2='#c9a14a', sign_text='#5ff4ff', sign_text2='#ff6ac0',
        accent=['#ff4fa8', '#4ff0e0', '#ffe066', '#9a6aff', '#5aff8a', '#ff8a3a'],
    )),
}

def _derive(base, **over):
    d = dict(PALETTES[base])
    d.update(_p(over))
    return d


# Venue theme stubs (16 Nov 2026). Each borrows the drawing style of an existing theme (THEME_STYLE) and only swaps colours.
THEME_STYLE = {'galleria': 'galleria', 'cogskill': 'cogskill',
               'immia': 'galleria', 'slooper': 'galleria', 'panto': 'cogskill', 'moffidge': 'galleria'}
PALETTES['immia'] = _derive(      # palace-turned-mall on the beach: sandstone, gold, turquoise, white marble
    'galleria', outline='#24140a',
    wall_top='#c8955a', wall_top2='#b8854c', wall_front='#8a5a30', wall_front2='#764a26', mortar='#5a361a',
    wall_base='#2e1a0c', wall_hi='#ecc890', wall_edge='#24140a',
    floor_a='#fbf6ec', floor_b='#eef4f0', floor_line='#d8e4e0', floor_hi='#ffffff',
    carpet='#7cd0c8', carpet2='#6cc4bc', carpet3='#a0e4dc',
    sea='#2c8ac4', sea2='#4aa8dc', sea3='#2478b0',
    cliff='#e0c080', cliff2='#d0ac68', cliff3='#b89050', cliff_hi='#f4dca0', moss='#f0e0b0', moss2='#fff4d0',
    grass_edge='#c8a868', pave='#e8d8b0', pave2='#dccaa0', pave_m='#b8a478', pave_hi='#f8ecd0',
    rug='#1e8a8a', rug2='#e8b830', rug3='#146a6a',
    sign_fill='#fff4d8', sign_b1='#6a4010', sign_b2='#e8b830', sign_text='#1e5a6a', sign_text2='#1e5a6a',
    mat='#1e8a8a', mat2='#146a6a', mat_hi='#5ad0c8', mat_trim='#e8b830')
PALETTES['slooper'] = _derive(    # harbour market + student town: weathered timber, sea-green, rope and brick
    'galleria', outline='#100c08',
    wall_top='#7a6a58', wall_top2='#6c5c4c', wall_front='#4a3e30', wall_front2='#3e3428', mortar='#2a2218',
    wall_base='#140f0a', wall_hi='#a89480', wall_edge='#100c08',
    floor_a='#e8dcc0', floor_b='#ddd0b0', floor_line='#c8b890', floor_hi='#f4ecd8',
    carpet='#9ac0a0', carpet2='#8cb494', carpet3='#b4d4b8',
    sea='#2a6a7a', sea2='#3a8090', sea3='#205a6a',
    cliff='#5a6a5a', cliff2='#4a5a4a', cliff3='#3a483a', cliff_hi='#7a8a7a', moss='#6a9a4a',
    pave='#a8a49c', pave2='#9c988f', pave_m='#77736b', pave_hi='#c0bcb4',
    sign_fill='#f0e8d0', sign_b1='#3a2a1a', sign_b2='#8a6a4a', sign_text='#2a4a5a', sign_text2='#2a4a5a',
    mat='#c84a3a', mat2='#a03a2e', mat_hi='#e87a6a', mat_trim='#e8d8a0')
PALETTES['panto'] = _derive(      # theatre nation: velvet walls, gold trim, stage-board floors, night city outside
    'cogskill', outline='#0a0306',
    wall_top='#5a1a2a', wall_top2='#4c1624', wall_front='#38101c', wall_front2='#2e0c16', mortar='#1e0810',
    wall_base='#0e0408', wall_hi='#9a3a50', wall_edge='#0a0306',
    floor_a='#c89a6a', floor_b='#bc8e5e', floor_line='#a07448', floor_hi='#dcb080',
    carpet='#d8606a', carpet2='#cc5460', carpet3='#e88088',
    sea='#1a1020', sea2='#281830', sea3='#120a18', wood='#e8b830', wood2='#b08420', wood3='#fff0a0',
    sign_fill='#2a0a14', sign_b1='#0a0306', sign_b2='#e8b830', sign_text='#ffe066', sign_text2='#ff9ab0',
    mat='#e8b830', mat2='#c89a28', mat_hi='#fff0a0', mat_trim='#b0203a')
PALETTES['moffidge'] = _derive(   # mountain monastery: grey stone, snow, silver, monastic red, sky for the void
    'galleria', outline='#101014',
    wall_top='#7a7a8a', wall_top2='#6c6c7c', wall_front='#4a4a5a', wall_front2='#3e3e4c', mortar='#2a2a36',
    wall_base='#141418', wall_hi='#a8a8b8', wall_edge='#101014',
    floor_a='#ece8e0', floor_b='#e0dcd2', floor_line='#ccc6ba', floor_hi='#f8f6f0',
    carpet='#d89090', carpet2='#cc8484', carpet3='#e8aaa8',
    sea='#8aa8c8', sea2='#a8c4dc', sea3='#7a98b8', foam='#ffffff',
    cliff='#7a7a88', cliff2='#686876', cliff3='#565664', cliff_hi='#9a9aa8', moss='#f4f8ff', moss2='#ffffff',
    grass_edge='#c8d4e0', sign_fill='#f4f0e4', sign_b1='#3a3a48', sign_b2='#c8d0dc', sign_text='#3a2a5a',
    sign_text2='#3a2a5a', mat='#3a5ac8', mat2='#2a4aa0', mat_hi='#7a9ae8', mat_trim='#e8c040')


MUSHROOM = T(
    "................",
    ".....OOOOOO.....",
    "...OOCCWWCCOO...",
    "..OCCCCWWCCCCO..",
    ".OCWWCCCCCCWWCO.",
    ".OCWWCCCCCCCCCO.",
    "OCCCCCCWWCCCCCCO",
    "OcCCCCCWWCCCCCcO",
    "OccCCCCCCCCCCccO",
    ".OOccccccccccOO.",
    "...OOggggggOO...",
    "......OsSSO.....",
    "......OsSSO.....",
    "......OsSSO.....",
    ".....OssSSSO....",
    ".....dOOOOOd....",
)
TOPIARY = T(
    "................",
    ".....OOOOOO.....",
    "...OOGGLLGGOO...",
    "..OGGLLGGGGGGO..",
    ".OGGLLGGGGGgGGO.",
    ".OGGGGGGGgGGGGO.",
    ".OGGGGgGGGGGGgO.",
    ".OgGGGGGGGGGGgO.",
    "..OggGGGGGGggO..",
    "...OOggggggOO...",
    ".....OOkkOO.....",
    "....OBBBBBBO....",
    "....ObBNNBbO....",
    "....ObBBBBbO....",
    ".....ObbbbO.....",
    ".....dddddd.....",
)
POTTED = T(
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
)
ROCK = T(
    "................",
    "................",
    "................",
    "......OOOO......",
    "....OOMMMMOO....",
    "...OMMRLLRRMO...",
    "..ORRLLRRRRRRO..",
    "..ORLLRRRRRrRO..",
    ".ORRRRRRRRrRRRO.",
    ".ORRRRRRRRRRrRO.",
    ".OrRRRRRRRRRrrO.",
    ".OrrRRRRRRRrrrO.",
    "..OrrrrrrrrrrO..",
    "...OOOOOOOOOO...",
    "...dddddddddd...",
    "................",
)
CRATES = T(
    "................",
    "........OOOOOO..",
    "........OLLLLO..",
    "........OXwWXO..",
    "........OXWwXO..",
    ".OOOOOOOOOOOOO..",
    ".OLLLLLLLLLLLO..",
    ".OXXXXXXXXXXXO..",
    ".OXwWWWWWWWWXO..",
    ".OXWwWWWWWWWXO..",
    ".OXWWwWWWWWWXO..",
    ".OXWWWwWWWWWXO..",
    ".OXWWWWwWWWWXO..",
    ".OXXXXXXXXXXXO..",
    ".OOOOOOOOOOOOO..",
    ".ddddddddddddd..",
)
VENDING = T(
    "..OOOOOOOOOOOO..",
    "..OLLLLLLLLLLO..",
    "..OOOOOOOOOOOO..",
    "..OBGGGGGGGBBO..",
    "..OBGRGYGPGBBO..",
    "..OBGGGGGGGBBO..",
    "..OBGYGPGRGBkO..",
    "..OBGGGGGGGBBO..",
    "..OBGPGRGYGBBO..",
    "..OBGGGGGGGBBO..",
    "..OBBBBBBBBBBO..",
    "..OBkkkkkkkBBO..",
    "..ObbbbbbbbbbO..",
    "..ObbbbbbbbbbO..",
    "..OOOOOOOOOOOO..",
    "..dddddddddddd..",
)
ARCADE = T(
    "..OOOOOOOOOOOO..",
    "..ONNNNNNNNNNO..",
    "..OOOOOOOOOOOO..",
    "..OBBBBBBBBBBO..",
    "..OBOOOOOOOOBO..",
    "..OBOSSSSSSOBO..",
    "..OBOSsSSSSOBO..",
    "..OBOSSSSsSOBO..",
    "..OBOSSSSSSOBO..",
    "..OBOOOOOOOOBO..",
    ".OBBBBBBBBBBBBO.",
    ".OCCRCCYCCGCCCO.",
    ".OOOOOOOOOOOOOO.",
    "..ObBBBBBBBBbO..",
    "..ObBBBBBBBBbO..",
    "..OOOOOOOOOOOO..",
)


class FloorArt:
    """Draws one floor grid at tile offset (ox, oy) onto px."""

    def __init__(self, px, grid, theme, ox, oy):
        self.px = px
        self.g = grid
        self.h = len(grid)
        self.w = len(grid[0]) if grid else 0
        self.palette_theme = theme
        self.theme = THEME_STYLE.get(theme, theme)     # drawing style
        self.P = PALETTES[theme]
        self.ox, self.oy = ox, oy
        self.base = self._compute_base()
        self.fdone = set()
        self.tree_pins = {}          # (x, y) -> tree type, from the mall JSON trees list
        self.level = 0               # floor level for the depth tint (mall_depth.level_of), set by render_mall
        self._squares = None

    # ---------------- grid helpers
    def at(self, x, y):
        if 0 <= y < self.h and 0 <= x < self.w:
            return self.g[y][x]
        return ' '

    def b(self, x, y):
        if 0 <= y < self.h and 0 <= x < self.w:
            return self.base[y][x]
        return None

    def wallish(self, x, y):
        return self.at(x, y) in WALLISH

    def _compute_base(self):
        base = [[None] * self.w for _ in range(self.h)]
        for y in range(self.h):
            for x in range(self.w):
                c = self.g[y][x]
                if c in FLOORS or c == '~':
                    base[y][x] = c
                elif c == ' ' or c in WALLISH:
                    base[y][x] = None
                else:
                    base[y][x] = '?'
        for _ in range(6):
            changed = False
            for y in range(self.h):
                for x in range(self.w):
                    if base[y][x] != '?':
                        continue
                    votes = {}
                    for (dx, dy, wgt) in ((0, 1, 3), (0, -1, 3), (1, 0, 3), (-1, 0, 3),
                                          (1, 1, 1), (-1, 1, 1), (1, -1, 1), (-1, -1, 1)):
                        xx, yy = x + dx, y + dy
                        if 0 <= yy < self.h and 0 <= xx < self.w:
                            bb = base[yy][xx]
                            if bb in FLOORS:
                                votes[bb] = votes.get(bb, 0) + wgt
                    if votes:
                        base[y][x] = max(sorted(votes), key=lambda k: votes[k])
                        changed = True
            if not changed:
                break
        for y in range(self.h):
            for x in range(self.w):
                if base[y][x] == '?':
                    c = self.g[y][x]
                    # railings floating over void keep a void base
                    base[y][x] = ' ' if c == '_' else '.'
        # railings: if more void than floor around, sit over void
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] == '_':
                    nv = sum(1 for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)) if self.at(x + dx, y + dy) == ' ')
                    if nv >= 2 and base[y][x] != ' ':
                        pass
        return base

    # ---------------- pixel helpers
    def org(self, x, y):
        return (self.ox + x) * 16, (self.oy + y) * 16

    def put(self, X, Y, i, j, c):
        self.px.set(X + i, Y + j, c)

    def rect(self, X, Y, i, j, w, h, c):
        self.px.rect(X + i, Y + j, w, h, c)

    # ---------------- entry
    def draw(self, region=None):
        """Draw the floor; `region` = (x0, y0, x1, y1) exclusive limits draws only those cells."""
        x0, y0, x1, y1 = region or (0, 0, self.w, self.h)
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(self.w, x1), min(self.h, y1)
        for y in range(y0, y1):
            for x in range(x0, x1):
                self.draw_cell(x, y)
        for y in range(y0, y1):
            for x in range(x0, x1):
                fn = OVERLAY.get(self.at(x, y))
                if fn and fn is not ov_tree:
                    X, Y = self.org(x, y)
                    fn(self, X, Y, x, y)
        mall_depth.faces(self, (x0, y0, x1, y1))
        self.draw_trees((x0, y0, x1, y1))
        mall_depth.tint(self, (x0, y0, x1, y1), self.level)

    def tree_squares(self):
        if self._squares is None:
            cells = [(x, y) for y in range(self.h) for x in range(self.w) if self.g[y][x] == 'T']
            self._squares = mall_trees.cover_squares(cells)
        return self._squares

    def tree_specs(self, region):
        """(x, y, size, type, seed) for every tree touching the region, top rows first."""
        x0, y0, x1, y1 = region
        types = mall_trees.TYPES.get(self.palette_theme) or mall_trees.TYPES.get(self.theme, mall_trees.TYPES['galleria'])
        for (x, y, s) in sorted(self.tree_squares(), key=lambda q: (q[1] + q[2], q[0])):
            if x + s <= x0 or x >= x1 or y + s <= y0 or y >= y1:
                continue
            pin = next((self.tree_pins[(x + i, y + j)] for j in range(s) for i in range(s)
                        if (x + i, y + j) in self.tree_pins), None)
            seed = hsh(x + self.ox, y + self.oy, s, 13)
            ttype = pin or types[seed % len(types)]
            yield x, y, s, ttype, seed >> 3

    def draw_trees(self, region):
        """Trees last (canopies overhang neighbours), top rows first so lower trees overlap upper ones."""
        for (x, y, s, ttype, seed) in self.tree_specs(region):
            X, Y = self.org(x, y)
            if s == 1 and ttype == ('mushroom' if self.theme == 'galleria' else 'topiary'):
                ov_tree(self, X, Y, x, y)          # the classic small sprites
            else:
                mall_trees.draw_tree(self.px.img, X, Y, s, ttype, seed, self.theme)

    def draw_cell(self, x, y):
        c = self.at(x, y)
        X, Y = self.org(x, y)
        if c == ' ':
            self.void(X, Y, x, y, self.at(x, y - 1) != ' ' and self.at(x, y - 1) != '_' )
            return
        if c in WALLISH:
            self.wall_cell(X, Y, x, y, c)
            return
        bb = self.base[y][x]
        if bb == ' ':
            self.void(X, Y, x, y, False)
        elif bb == '~' or c == '~':
            self.water(X, Y, x, y)
        else:
            self.floor(X, Y, x, y, bb)
        self.wall_shadow(X, Y, x, y, c)
        mall_depth.contact(self, X, Y, x, y)

    def wall_shadow(self, X, Y, x, y, c):
        """Soft drop shadow cast by tall walls onto the walkable cell: strong south, light east."""
        if c == '+':
            return
        if self.wallish(x, y - 1):
            for j, f in enumerate((0.55, 0.68, 0.80, 0.90, 0.96)):
                for i in range(16):
                    self.px.darken(X + i, Y + j, f)
        elif self.wallish(x - 1, y - 1):
            # corner wedge where a wall ends to the north-west
            for j, f in enumerate((0.62, 0.76, 0.88)):
                for i in range(4 - j):
                    self.px.darken(X + i, Y + j, f)
        if self.wallish(x - 1, y):
            for i, f in enumerate((0.70, 0.86)):
                for j in range(0 if not self.wallish(x, y - 1) else 5, 16):
                    self.px.darken(X + i, Y + j, f)
        if self.wallish(x + 1, y):
            for j in range(0 if not self.wallish(x, y - 1) else 5, 16):
                self.px.darken(X + 15, Y + j, 0.86)

    # ---------------- void / cliff
    def void(self, X, Y, x, y, cliff_top):
        P = self.P
        gx0, gy0 = X, Y
        if self.theme == 'galleria':
            self.px.rect(X, Y, 16, 16, P['sea'])
            hv = hsh(gx0 // 16, gy0 // 16, 7)
            # waves: little arcs
            for k in range(2):
                hk = hsh(hv, k)
                wx, wy = hk % 12, (hk >> 4) % 14
                if (hk >> 9) % 3 == 0:
                    continue
                for i, dy in enumerate((1, 0, 0, 1)):
                    self.put(X, Y, wx + i, wy + dy, P['sea2'])
            if hv % 23 == 0:
                self.put(X, Y, (hv >> 5) % 16, (hv >> 9) % 16, P['foam'])
            for j in (5, 13):
                for i in range(16):
                    if (i + j + (gx0 // 16) * 3) % 11 == 0:
                        self.put(X, Y, i, j, P['sea3'])
        else:
            self.px.rect(X, Y, 16, 16, P['sea'])
            hv = hsh(gx0 // 16, gy0 // 16, 9)
            # city blocks with windows
            if hv % 3:
                bw = 6 + hv % 8
                bx = (hv >> 4) % (16 - bw + 1)
                self.px.rect(X + bx, Y + 2, bw, 13, P['sea2'])
                for j in range(4, 14, 3):
                    for i in range(bx + 1, bx + bw - 1, 2):
                        h2 = hsh(gx0 + i, gy0 + j)
                        col = P['lantern'] if h2 % 9 == 0 else (P['glass2'] if h2 % 13 == 0 else P['sea3'])
                        self.put(X, Y, i, j, col)
            if hv % 37 == 0:
                self.put(X, Y, (hv >> 6) % 16, (hv >> 10) % 16, P['accent'][0])
        if cliff_top:
            self.cliff(X, Y, x, y)

    def cliff(self, X, Y, x, y):
        P = self.P
        if self.theme == 'galleria':
            for j in range(13):
                for i in range(16):
                    gx = X + i
                    band = (gx // 3 + (hsh(gx // 3) % 3)) % 3
                    c = (P['cliff'], P['cliff2'], P['cliff'])[band]
                    if j > 9:
                        c = P['cliff2'] if band != 1 else P['cliff3']
                    if (gx % 3 == 0) and j > 2:
                        c = P['cliff3']
                    self.put(X, Y, i, j, c)
            # moss drips from the top
            for i in range(16):
                ln = 1 + hsh(X + i, 3) % 4
                for j in range(ln):
                    self.put(X, Y, i, j, P['moss'] if j < ln - 1 else P['grass_edge'])
                self.put(X, Y, i, 0, P['moss2'])
            # foam at the waterline
            for i in range(16):
                if (i + X // 16) % 4 != 3:
                    self.put(X, Y, i, 13, P['foam'])
                self.put(X, Y, i, 14, P['sea2'] if i % 3 else P['foam'])
        else:
            self.px.rect(X, Y, 16, 13, P['cliff'])
            for i in range(16):
                gx = X + i
                for j in range(3):
                    stripe = ((gx + j) // 3) % 2 == 0
                    self.put(X, Y, i, j, P['moss'] if stripe else P['moss2'])
            self.px.rect(X, Y + 3, 16, 1, P['cliff3'])
            for i in (2, 10):
                for j in range(5, 12, 3):
                    self.put(X, Y, i, j, P['cliff_hi'])
            self.px.rect(X, Y + 12, 16, 1, P['cliff3'])
            for i in range(0, 16, 8):
                self.px.rect(X + i, Y + 4, 1, 8, P['cliff2'])

    # ---------------- walls
    def wall_cell(self, X, Y, x, y, c):
        front = not self.wallish(x, y + 1)
        if c == 'D':
            self.wall_front(X, Y, x, y, cap=4)
            self.door_locked(X, Y, x, y)
            return
        if c == 'E':
            self.wall_front(X, Y, x, y, cap=3)
            self.elevator(X, Y, x, y)
            return
        if c == 'w':
            vertical = not front and (self.wallish(x, y - 1) or self.wallish(x, y + 1)) \
                and not (self.at(x - 1, y) == 'w' or self.at(x + 1, y) == 'w')
            if vertical:
                self.wall_top(X, Y, x, y)
                P = self.P
                self.rect(X, Y, 5, 0, 6, 16, P['glass'])
                self.rect(X, Y, 4, 0, 1, 16, P['outline'])
                self.rect(X, Y, 11, 0, 1, 16, P['outline'])
                for j in range(16):
                    if (j + Y // 16 * 5) % 7 < 2:
                        self.put(X, Y, 6 + (j % 3), j, P['glass_hi'])
                self.rect(X, Y, 9, 0, 1, 16, P['glass2'])
            else:
                self.wall_front(X, Y, x, y, cap=4)
                self.window(X, Y, x, y)
            return
        if front:
            self.wall_front(X, Y, x, y, cap=4)
        else:
            self.wall_top(X, Y, x, y)

    def wall_top(self, X, Y, x, y):
        P = self.P
        self.px.rect(X, Y, 16, 16, P['wall_top'])
        # subtle block pattern
        for j in range(16):
            for i in range(16):
                gx, gy = X + i, Y + j
                if self.theme == 'galleria':
                    if (gy % 8 == 0) or ((gx + (8 if (gy // 8) % 2 else 0)) % 16 == 0):
                        self.put(X, Y, i, j, P['wall_top2'])
                else:
                    if gx % 16 == 0 or gy % 16 == 0:
                        self.put(X, Y, i, j, P['wall_top2'])
                    elif (gx % 16, gy % 16) in ((2, 2), (13, 2), (2, 13), (13, 13)):
                        self.put(X, Y, i, j, P['wall_front2'])
        for k in range(5):
            hv = hsh(X, Y, k, 99)
            i, j = 2 + hv % 12, 2 + (hv >> 4) % 12
            self.put(X, Y, i, j, P['wall_top2'])
            if k < 2:
                self.put(X, Y, i + 1, j, P['wall_hi'])
        O = P['wall_edge']
        hi = P['wall_hi']
        n, wl, e = self.wallish(x, y - 1), self.wallish(x - 1, y), self.wallish(x + 1, y)
        # lit top rim (north / west) and shaded rim (east) just inside the dark outline
        if not n:
            self.rect(X, Y, 0, 1, 16, 1, hi); self.rect(X, Y, 0, 2, 16, 1, mix(P['wall_top'], hi, 0.4))
        if not wl:
            self.rect(X, Y, 1, 0 if n else 1, 1, 16 if n else 15, hi)
        if not e:
            self.rect(X, Y, 14, 0 if n else 1, 1, 16 if n else 15, P['wall_top2'])
        if not n:
            self.rect(X, Y, 0, 0, 16, 1, O)
        if not wl:
            self.rect(X, Y, 0, 0, 1, 16, O)
        if not e:
            self.rect(X, Y, 15, 0, 1, 16, O)
        # concave corner nubs
        for dx in (-1, 1):
            if self.wallish(x + dx, y) and n and not self.wallish(x + dx, y - 1):
                self.put(X, Y, 0 if dx < 0 else 15, 0, O)

    def wall_front(self, X, Y, x, y, cap=4):
        P = self.P
        O = P['wall_edge']
        # cap (top face strip)
        self.rect(X, Y, 0, 0, 16, cap, P['wall_top'])
        if not self.wallish(x, y - 1):
            self.rect(X, Y, 0, 0, 16, 1, O)
            self.rect(X, Y, 0, 1, 16, 1, P['wall_hi'])
        if not self.wallish(x - 1, y):
            self.rect(X, Y, 1, 0, 1, cap, P['wall_hi'])
        self.rect(X, Y, 0, cap - 1, 16, 1, mix(P['wall_top'], P['wall_hi'], 0.35))
        self.rect(X, Y, 0, cap, 16, 1, O)
        # face
        f0 = cap + 1
        self.rect(X, Y, 0, f0, 16, 16 - f0, P['wall_front'])
        if self.theme == 'galleria':
            for j in range(f0, 15):
                gy = Y + j
                row = (j - f0) // 4
                if (j - f0) % 4 == 3:
                    self.rect(X, Y, 0, j, 16, 1, P['mortar'])
                    continue
                for i in range(16):
                    gx = X + i
                    if (gx + (4 if row % 2 else 0)) % 8 == 0:
                        self.put(X, Y, i, j, P['mortar'])
                    elif (j - f0) % 4 == 0 and (gx + (4 if row % 2 else 0)) % 8 in (1, 2, 3):
                        self.put(X, Y, i, j, mix(P['wall_front'], P['wall_hi'], 0.25))
            # warm lantern sconces every so often
            if (x + self.ox) % 6 == 3 and hsh(x + self.ox, y, 77) % 3 != 0 and not self.wallish(x, y + 1):
                L, L2, Lh = P['lantern'], P['lantern2'], P['lantern_hi']
                for j in range(f0, 15):
                    for i in range(3, 13):
                        d = abs(i - 7.5) + abs(j - (f0 + 4)) * 0.8
                        if d < 6:
                            self.px.set(X + i, Y + j, (255, 214, 90, int(90 - d * 14)))
                self.rect(X, Y, 6, f0 + 1, 4, 1, P['outline'])
                self.rect(X, Y, 6, f0 + 2, 4, 4, L2)
                self.rect(X, Y, 7, f0 + 2, 2, 3, L)
                self.put(X, Y, 7, f0 + 2, Lh)
                self.rect(X, Y, 5, f0 + 2, 1, 4, P['outline']); self.rect(X, Y, 10, f0 + 2, 1, 4, P['outline'])
                self.rect(X, Y, 6, f0 + 6, 4, 1, P['outline'])
                self.rect(X, Y, 7, f0 + 7, 2, 1, P['wood_dk'])
            # moss specks along the top
            for i in range(16):
                hv = hsh(X + i, Y, 11)
                if hv % 5 == 0:
                    self.put(X, Y, i, f0, P['moss'])
                    if hv % 3 == 0:
                        self.put(X, Y, i, f0 + 1, P['grass_edge'])
        else:
            # brass trim band + panel seams + rivets + neon strip
            self.rect(X, Y, 0, f0, 16, 2, P['wood'])
            self.rect(X, Y, 0, f0 + 1, 16, 1, P['wood2'])
            for i in range(16):
                gx = X + i
                if gx % 16 == 0:
                    self.rect(X, Y, i, f0 + 2, 1, 13 - f0, P['mortar'])
                if gx % 16 == 8:
                    self.rect(X, Y, i, f0 + 2, 1, 13 - f0, P['wall_front2'])
            for i in (3, 12):
                self.put(X, Y, i, f0 + 4, P['wall_hi'])
                self.put(X, Y, i, 13, P['wall_hi'])
            if hsh(X // 16, Y // 16, 3) % 4 == 0:
                col = P['accent'][hsh(X // 16, 5) % 2]
                self.rect(X, Y, 0, 11, 16, 1, col)
        # darker skirting at the foot of the face, then the hard base line
        self.rect(X, Y, 0, 14, 16, 1, mix(P['wall_front2'], P['wall_base'], 0.5))
        self.rect(X, Y, 0, 15, 16, 1, P['wall_base'])
        if not self.wallish(x - 1, y):
            self.rect(X, Y, 0, 0, 1, 16, O)
        if not self.wallish(x + 1, y):
            self.rect(X, Y, 15, 0, 1, 16, O)

    def window(self, X, Y, x, y):
        P = self.P
        O = P['outline']
        l = self.at(x - 1, y) == 'w'
        r = self.at(x + 1, y) == 'w'
        x0 = 0 if l else 2
        x1 = 16 if r else 14
        self.rect(X, Y, x0, 6, x1 - x0, 8, P['glass'])
        self.rect(X, Y, x0, 6, x1 - x0, 1, P['glass2'])
        # reflections
        gx = X // 16
        for k in range(8):
            i = (k + gx * 5) % 16 - k // 2
            j = 7 + k
            if 0 <= j < 14:
                for d in (0, 1):
                    ii = (gx * 7 + 9 - k + d) % 20
                    if x0 <= ii < x1:
                        self.put(X, Y, ii, j, P['glass_hi'])
        # frame
        if not l:
            self.rect(X, Y, 1, 5, 1, 10, O)
            self.rect(X, Y, 0, 5, 1, 10, P['wall_front2'])
        else:
            self.rect(X, Y, 0, 6, 1, 8, P['wall_front2'])
        if not r:
            self.rect(X, Y, 14, 5, 1, 10, O)
            self.rect(X, Y, 15, 5, 1, 10, P['wall_front2'])
        self.rect(X, Y, 0, 14, 16, 1, P['wood'] if self.theme == 'cogskill' else P['wall_hi'])
        self.rect(X, Y, 0, 15, 16, 1, P['wall_base'])
        # display goods silhouettes in the window
        hv = hsh(X // 16, Y // 16, 21)
        if hv % 2 == 0:
            col = P['accent'][hv % len(P['accent'])]
            bx = 4 + (hv >> 3) % 7
            self.rect(X, Y, bx, 11, 3, 3, col)
            self.put(X, Y, bx, 11, mix(col, hx('#ffffff'), 0.5))

    def door_locked(self, X, Y, x, y):
        P = self.P
        O = P['outline']
        self.rect(X, Y, 1, 4, 14, 12, O)
        if self.theme == 'galleria':
            self.rect(X, Y, 2, 5, 12, 11, P['wood'])
            for i in (5, 8, 11):
                self.rect(X, Y, i, 5, 1, 11, P['wood2'])
            self.rect(X, Y, 2, 5, 12, 1, P['wood3'])
            # iron bands
            self.rect(X, Y, 2, 7, 12, 1, P['metal2'])
            self.rect(X, Y, 2, 13, 12, 1, P['metal2'])
        else:
            self.rect(X, Y, 2, 5, 12, 11, P['metal2'])
            for j in range(6, 16, 2):
                self.rect(X, Y, 2, j, 12, 1, P['metal'])
            # hazard strip
            for i in range(2, 14):
                self.put(X, Y, i, 15, P['lantern'] if (i // 2) % 2 else O)
        # padlock
        self.rect(X, Y, 6, 8, 4, 1, O)
        self.rect(X, Y, 6, 9, 1, 2, O); self.rect(X, Y, 9, 9, 1, 2, O)
        self.rect(X, Y, 5, 10, 6, 5, O)
        self.rect(X, Y, 6, 11, 4, 3, hx('#f4c838'))
        self.rect(X, Y, 6, 11, 4, 1, hx('#fff2a8'))
        self.put(X, Y, 7, 12, O); self.put(X, Y, 8, 12, O)
        # red lamp
        self.rect(X, Y, 7, 1, 2, 2, hx('#ff3a3a'))
        self.put(X, Y, 7, 1, hx('#ffb0b0'))

    def elevator(self, X, Y, x, y):
        P = self.P
        O = P['outline']
        self.rect(X, Y, 1, 3, 14, 13, O)
        self.rect(X, Y, 2, 4, 12, 3, P['metal2'])
        # up/down indicator
        L = P['lantern']
        for (i, j) in ((5, 5), (4, 6), (5, 6), (6, 6)):
            self.put(X, Y, i, j, L)
        for (i, j) in ((9, 5), (10, 5), (11, 5), (10, 6)):
            self.put(X, Y, i, j, L)
        self.rect(X, Y, 2, 7, 12, 1, O)
        self.rect(X, Y, 2, 8, 12, 8, P['metal'])
        self.rect(X, Y, 3, 8, 1, 8, P['metal_hi'])
        self.rect(X, Y, 9, 8, 1, 8, P['metal_hi'])
        self.rect(X, Y, 7, 8, 2, 8, O)
        self.rect(X, Y, 2, 15, 12, 1, P['metal2'])

    # ---------------- floors
    def floor(self, X, Y, x, y, kind):
        P = self.P
        px = self.px
        if kind == '.':
            for j in range(16):
                for i in range(16):
                    gx, gy = X + i, Y + j
                    if self.theme == 'galleria':
                        q = ((gx // 8) + (gy // 8)) % 2
                        c = P['floor_a'] if q == 0 else P['floor_b']
                        if gx % 16 == 15 or gy % 16 == 15:
                            c = P['floor_line']
                        elif q == 0 and (gx % 8 == 0 or gy % 8 == 0):
                            c = P['floor_hi']
                    else:
                        q = ((gx // 16) + (gy // 16)) % 2
                        c = P['floor_a'] if q == 0 else P['floor_b']
                        lx, ly = gx % 16, gy % 16
                        if lx == 15 or ly == 15:
                            c = P['floor_line']
                        elif lx == 0 or ly == 0:
                            c = P['floor_hi']
                        elif (lx, ly) in ((2, 2), (13, 2), (2, 13), (13, 13)):
                            c = P['metal2']
                        elif q == 1 and (lx + ly) % 4 == 0 and (lx - ly) % 4 == 0 and 3 < lx < 12 and 3 < ly < 12:
                            c = P['floor_line']
                    px.p[gx, gy] = c
        elif kind == ',':
            for j in range(16):
                for i in range(16):
                    gx, gy = X + i, Y + j
                    c = P['carpet']
                    if gx % 8 == 0 and gy % 8 == 0:
                        c = P['carpet3']
                    elif gx % 8 == 4 and gy % 8 == 4:
                        c = P['carpet2']
                    px.p[gx, gy] = c
        elif kind == ':':
            self.paving(X, Y)
        elif kind == '"':
            self.grass(X, Y, x, y)
        elif kind == 'o':
            self.rug(X, Y, x, y)
        else:
            self.floor(X, Y, x, y, '.')

    def paving(self, X, Y):
        P = self.P
        for j in range(16):
            for i in range(16):
                gx, gy = X + i, Y + j
                row = gy // 4
                off = (row * 5) % 8
                sx = (gx + off) // 8
                lx, ly = (gx + off) % 8, gy % 4
                hv = hsh(sx, row, 3)
                c = P['pave'] if hv % 3 else P['pave2']
                if ly == 3 or lx == 7:
                    c = P['pave_m']
                elif (lx in (0, 6) and ly in (0, 2)):
                    c = P['pave_m'] if (lx, ly) in ((6, 2),) else c
                if (lx in (0, 6) and ly in (0, 2)):
                    c = mix(c, P['pave_m'], 0.6)
                if ly == 0 and lx < 6 and lx > 0:
                    c = P['pave_hi'] if c != P['pave_m'] else c
                if self.theme == 'cogskill' and ly == 3 and lx == 7:
                    c = P['pave_m']
                self.px.p[gx, gy] = c

    def grass(self, X, Y, x, y):
        P = self.P
        self.px.rect(X, Y, 16, 16, P['grass'])
        hv = hsh(X // 16, Y // 16, 5)
        for k in range(4):
            hk = hsh(hv, k)
            tx, ty = 1 + hk % 13, 2 + (hk >> 4) % 12
            self.put(X, Y, tx, ty, P['grass2'])
            self.put(X, Y, tx + 2, ty, P['grass2'])
            self.put(X, Y, tx + 1, ty + 1, P['grass2'])
            self.put(X, Y, tx + 1, ty - 1, P['grass3'])
        if hv % 5 == 0:
            fc = P['accent'][(hv >> 3) % len(P['accent'])]
            fx, fy = 3 + (hv >> 6) % 10, 3 + (hv >> 10) % 10
            for (i, j) in ((0, -1), (-1, 0), (1, 0), (0, 1)):
                self.put(X, Y, fx + i, fy + j, hx('#fff8f0'))
            self.put(X, Y, fx, fy, fc)
        E = P['grass_edge']
        isg = lambda xx, yy: self.b(xx, yy) == '"'
        if not isg(x, y - 1):
            self.rect(X, Y, 0, 0, 16, 1, E); self.rect(X, Y, 0, 1, 16, 1, P['grass3'])
        if not isg(x, y + 1):
            self.rect(X, Y, 0, 15, 16, 1, E); self.rect(X, Y, 0, 14, 16, 1, P['grass2'])
        if not isg(x - 1, y):
            self.rect(X, Y, 0, 0, 1, 16, E)
        if not isg(x + 1, y):
            self.rect(X, Y, 15, 0, 1, 16, E)
        # round outer corners
        for (dx, dy, ci, cj) in ((-1, -1, 0, 0), (1, -1, 15, 0), (-1, 1, 0, 15), (1, 1, 15, 15)):
            if not isg(x + dx, y) and not isg(x, y + dy):
                self.put(X, Y, ci, cj, self.under_color(X + ci, Y + cj))
                self.put(X, Y, ci + (1 if dx < 0 else -1), cj + (1 if dy < 0 else -1), E)

    def under_color(self, gx, gy):
        P = self.P
        q = ((gx // 8) + (gy // 8)) % 2
        return P['floor_a'] if q == 0 else P['floor_b']

    def rug(self, X, Y, x, y):
        P = self.P
        for j in range(16):
            for i in range(16):
                gx, gy = X + i, Y + j
                c = P['rug']
                if (gx + gy) % 8 == 0 or (gx - gy) % 8 == 0:
                    c = P['rug3']
                if (gx + gy) % 8 == 4 and (gx - gy) % 8 == 4:
                    c = P['rug2']
                self.px.p[gx, gy] = c
        isr = lambda xx, yy: self.b(xx, yy) == 'o'
        B, O = P['rug2'], P['rug3']
        if not isr(x, y - 1):
            self.rect(X, Y, 0, 0, 16, 1, O); self.rect(X, Y, 0, 1, 16, 2, B); self.rect(X, Y, 0, 3, 16, 1, O)
        if not isr(x, y + 1):
            self.rect(X, Y, 0, 15, 16, 1, O); self.rect(X, Y, 0, 13, 16, 2, B); self.rect(X, Y, 0, 12, 16, 1, O)
        if not isr(x - 1, y):
            self.rect(X, Y, 0, 0, 1, 16, O); self.rect(X, Y, 1, 0, 2, 16, B); self.rect(X, Y, 3, 0, 1, 16, O)
        if not isr(x + 1, y):
            self.rect(X, Y, 15, 0, 1, 16, O); self.rect(X, Y, 13, 0, 2, 16, B); self.rect(X, Y, 12, 0, 1, 16, O)
        # tidy borders where perpendicular edges meet
        if not isr(x, y - 1):
            if not isr(x - 1, y):
                self.rect(X, Y, 1, 1, 2, 2, B)
            if not isr(x + 1, y):
                self.rect(X, Y, 13, 1, 2, 2, B)
        if not isr(x, y + 1):
            if not isr(x - 1, y):
                self.rect(X, Y, 1, 13, 2, 2, B)
            if not isr(x + 1, y):
                self.rect(X, Y, 13, 13, 2, 2, B)

    def water(self, X, Y, x, y):
        P = self.P
        self.px.rect(X, Y, 16, 16, P['water'])
        for j in range(16):
            for i in range(16):
                gx, gy = X + i, Y + j
                if (gy % 8 == 3 and (gx + gy // 8 * 3) % 8 in (0, 1, 2)) or \
                   (gy % 8 == 2 and (gx + gy // 8 * 3) % 8 in (3,)) or \
                   (gy % 8 == 4 and (gx + gy // 8 * 3) % 8 in (7,)):
                    self.px.p[gx, gy] = P['water2']
                elif gy % 8 == 6 and (gx + 4) % 12 in (0, 1):
                    self.px.p[gx, gy] = P['water3']
        isw = lambda xx, yy: self.at(xx, yy) in '~ ' or self.b(xx, yy) == '~'
        R, R2 = P['rim'], P['rim2']
        if not isw(x, y - 1):
            self.rect(X, Y, 0, 0, 16, 2, R); self.rect(X, Y, 0, 2, 16, 1, R2); self.rect(X, Y, 0, 3, 16, 1, P['water3'])
        if not isw(x, y + 1):
            self.rect(X, Y, 0, 13, 16, 1, P['water2']); self.rect(X, Y, 0, 14, 16, 2, R)
        if not isw(x - 1, y):
            self.rect(X, Y, 0, 0, 2, 16, R); self.rect(X, Y, 2, 0, 1, 16, R2)
        if not isw(x + 1, y):
            self.rect(X, Y, 14, 0, 2, 16, R); self.rect(X, Y, 13, 0, 1, 16, R2)

    # ---------------- objects
    def cmap(self, **extra):
        P = self.P
        m = {'O': P['outline']}
        m.update(extra)
        return m


def ov_tree(a, X, Y, x, y):
    P = a.P
    hv = hsh(x, y, a.ox, 13)
    if a.theme == 'galleria':
        cap = P['caps'][hv % len(P['caps'])]
        m = a.cmap(C=cap, c=dk(cap, 0.75), W=hx('#fff8ee'), g=P['stem2'], S=P['stem'], s=P['stem2'])
        a.px.blit(X, Y, MUSHROOM, m, flip=bool(hv & 16))
    else:
        g = P['caps'][hv % len(P['caps'])]
        m = a.cmap(G=g, g=dk(g, 0.72), L=mix(g, hx('#ffffff'), 0.35), k=P['wood_dk'], B=P['wood'], b=P['wood2'],
                   N=P['accent'][1])
        a.px.blit(X, Y, TOPIARY, m)


def ov_potted(a, X, Y, x, y):
    P = a.P
    if a.theme == 'galleria':
        m = a.cmap(G=hx('#4caa48'), g=hx('#2e7a34'), L=hx('#8ad860'), P=hx('#c86a3a'), p=hx('#9a4a2a'), Q=hx('#e8946a'))
    else:
        m = a.cmap(G=hx('#3eb87a'), g=hx('#24804e'), L=hx('#8af0b0'), P=P['wood'], p=P['wood2'], Q=P['wood3'])
    a.px.blit(X, Y, POTTED, m, flip=bool(hsh(x, y) & 1))


def ov_rock(a, X, Y, x, y):
    P = a.P
    m = a.cmap(R=P['rock'], r=P['rock2'], L=P['rock_hi'], M=P['moss'] if a.theme == 'galleria' else P['rock_hi'])
    a.px.blit(X, Y, ROCK, m, flip=bool(hsh(x, y) & 1))


def ov_crates(a, X, Y, x, y):
    P = a.P
    if a.theme == 'galleria':
        m = a.cmap(W=hx('#c8904e'), w=hx('#a06a34'), L=hx('#e0b070'), X=hx('#8a5a30'))
    else:
        m = a.cmap(W=hx('#6c7a88'), w=hx('#56626e'), L=hx('#9aa8b4'), X=hx('#e8b83a'))
    a.px.blit(X, Y, CRATES, m, flip=bool(hsh(x, y) & 1))


def ov_vending(a, X, Y, x, y):
    P = a.P
    hv = hsh(x, y, 17)
    if a.theme == 'galleria':
        m = a.cmap(L=P['lantern'], B=P['body'], b=P['body2'], G=P['glass'], R=hx('#e04848'), Y=hx('#f0c030'),
                   P=hx('#a060e0'), k=P['outline'])
        a.px.blit(X, Y, VENDING, m)
    else:
        n = P['accent'][hv % 3]
        scr = [hx('#2a8aff'), hx('#ff4fa8'), hx('#3ad86a'), hx('#ffb030')][(hv >> 3) % 4]
        m = a.cmap(N=n, B=P['body'], b=P['body2'], S=scr, s=mix(scr, hx('#ffffff'), 0.6), C=hx('#20243a'),
                   R=hx('#ff4040'), Y=hx('#ffe040'), G=hx('#40e070'))
        a.px.blit(X, Y, ARCADE, m)


def ov_shelf(a, X, Y, x, y):
    P = a.P
    O = P['outline']
    fr, fr2 = (P['wood'], P['wood2']) if a.theme == 'galleria' else (P['metal2'], hx('#4a5260'))
    back = dk(fr2, 0.6)
    a.rect(X, Y, 0, 0, 16, 16, O)
    a.rect(X, Y, 1, 1, 14, 14, back)
    a.rect(X, Y, 1, 1, 14, 1, mix(fr, hx('#ffffff'), 0.3))
    l = a.at(x - 1, y) == 'S'
    r = a.at(x + 1, y) == 'S'
    if l:
        a.rect(X, Y, 0, 1, 1, 14, back)
    if r:
        a.rect(X, Y, 15, 1, 1, 14, back)
    for sy in (5, 10, 14):
        a.rect(X, Y, 0 if l else 1, sy, 16 - (0 if l else 1) - (0 if r else 1), 1, fr)
        a.rect(X, Y, 0 if l else 1, sy + 1 if sy < 14 else sy, 16 - (0 if l else 1) - (0 if r else 1), 1, fr2)
    acc = P['accent']
    for band, top in enumerate((2, 7, 11)):
        i = 2
        k = 0
        while i < 14:
            hv = hsh(X + i, Y + top, band, k)
            w = 1 + hv % 2
            h = 2 + (hv >> 3) % 2 + (1 if band < 2 else 0)
            if band == 2:
                h = min(h, 3)
            col = acc[(hv >> 5) % len(acc)]
            yb = (5, 10, 14)[band]
            a.rect(X, Y, i, yb - h, w, h, col)
            a.put(X, Y, i, yb - h, mix(col, hx('#ffffff'), 0.5))
            i += w + 1 + ((hv >> 8) % 2)
            k += 1
    if not l:
        a.rect(X, Y, 1, 1, 1, 14, fr)
    if not r:
        a.rect(X, Y, 14, 1, 1, 14, fr2)


def ov_counter(a, X, Y, x, y):
    P = a.P
    O = P['outline']
    isC = lambda xx, yy: a.at(xx, yy) == '='
    l, r, u, d = isC(x - 1, y), isC(x + 1, y), isC(x, y - 1), isC(x, y + 1)
    top, top2, front, front2 = P['wood3'], P['wood'], P['wood2'], P['wood_dk']
    if a.theme == 'cogskill':
        front, front2 = P['body'], P['body2']
    x0 = 0 if l else 1
    x1 = 16 if r else 15
    vert_mid = d
    ty0 = 0 if u else 2
    ty1 = 16 if d else 9
    a.rect(X, Y, x0, ty0, x1 - x0, ty1 - ty0, top)
    a.rect(X, Y, x0, ty1 - 2 if not d else 15, x1 - x0, 1 if d else 2, top2)
    if not u:
        a.rect(X, Y, x0, ty0 - 1, x1 - x0, 1, O)
        a.rect(X, Y, x0, ty0, x1 - x0, 1, mix(top, hx('#ffffff'), 0.4))
    if not d:
        a.rect(X, Y, x0, 9, x1 - x0, 1, O)
        a.rect(X, Y, x0, 10, x1 - x0, 5, front)
        for i in range(x0, x1):
            if (X + i) % 8 == 0:
                a.rect(X, Y, i, 10, 1, 5, front2)
        if a.theme == 'cogskill':
            a.rect(X, Y, x0, 12, x1 - x0, 1, P['accent'][1])
        a.rect(X, Y, x0, 15, x1 - x0, 1, O)
    if not l:
        a.rect(X, Y, 0, ty0 - (0 if u else 1), 1, (16 if not d else 16) - ty0 + (0 if u else 1), O)
    if not r:
        a.rect(X, Y, 15, ty0 - (0 if u else 1), 1, 16 - ty0 + (0 if u else 1), O)
    # little item on counter
    hv = hsh(x, y, 31)
    if hv % 3 == 0 and not u:
        col = P['accent'][(hv >> 4) % len(P['accent'])]
        ix = 4 + (hv >> 8) % 8
        a.rect(X, Y, ix, 3, 3, 3, col)
        a.rect(X, Y, ix - 1, 3, 1, 3, O); a.rect(X, Y, ix + 3, 3, 1, 3, O); a.rect(X, Y, ix, 2, 3, 1, O)
        a.put(X, Y, ix, 3, mix(col, hx('#ffffff'), 0.5))


def ov_table(a, X, Y, x, y):
    P = a.P
    O = P['outline']
    isT = lambda xx, yy: a.at(xx, yy) == 't'
    l, r, u, d = isT(x - 1, y), isT(x + 1, y), isT(x, y - 1), isT(x, y + 1)
    top = P['wood3'] if a.theme == 'galleria' else hx('#e8eef2')
    top2 = P['wood'] if a.theme == 'galleria' else hx('#b8c4cc')
    x0, x1 = (0 if l else 2), (16 if r else 14)
    y0, y1 = (0 if u else 3), (16 if d else 11)
    # shadow
    if not d:
        a.px.drect(X + x0 + 1, Y + 13, x1 - x0 - 1, 2, 0.75)
    a.rect(X, Y, x0, y0, x1 - x0, y1 - y0, top)
    if not u:
        a.rect(X, Y, x0, y0 - 1, x1 - x0, 1, O)
        a.rect(X, Y, x0, y0, x1 - x0, 1, mix(top, hx('#ffffff'), 0.45))
    if not d:
        a.rect(X, Y, x0, y1, x1 - x0, 2, top2)
        a.rect(X, Y, x0, y1 + 2, x1 - x0, 1, O)
        if not l:
            a.rect(X, Y, x0 + 1, y1 + 2, 1, 2, O)
        if not r:
            a.rect(X, Y, x1 - 2, y1 + 2, 1, 2, O)
    if not l:
        a.rect(X, Y, x0 - 1, y0 - (0 if u else 1), 1, y1 - y0 + (2 if not d else 0) + (0 if u else 1) + (1 if not d else 0), O)
    if not r:
        a.rect(X, Y, x1, y0 - (0 if u else 1), 1, y1 - y0 + (2 if not d else 0) + (0 if u else 1) + (1 if not d else 0), O)
    hv = hsh(x, y, 41)
    if hv % 2 == 0:
        # cup / plate
        cx, cy = 5 + (hv >> 3) % 5, (y0 + 2) + (hv >> 6) % 3
        if cy + 3 <= y1:
            a.rect(X, Y, cx, cy, 3, 3, hx('#fffaf0'))
            a.put(X, Y, cx + 1, cy + 1, P['accent'][(hv >> 9) % len(P['accent'])])
            a.rect(X, Y, cx, cy + 3, 3, 1, dk(top, 0.75))


def ov_chair(a, X, Y, x, y):
    P = a.P
    O = P['outline']
    if a.theme == 'galleria':
        cap = P['caps'][hsh(x, y, 3) % len(P['caps'])]
        a.px.drect(X + 4, Y + 13, 8, 2, 0.75)
        a.rect(X, Y, 6, 10, 4, 4, P['stem']); a.rect(X, Y, 6, 10, 1, 4, P['stem2'])
        a.rect(X, Y, 5, 10, 1, 4, O); a.rect(X, Y, 10, 10, 1, 4, O); a.rect(X, Y, 6, 14, 4, 1, O)
        a.rect(X, Y, 4, 5, 8, 5, cap)
        a.rect(X, Y, 4, 9, 8, 1, dk(cap, 0.72))
        a.rect(X, Y, 5, 4, 6, 1, O); a.rect(X, Y, 3, 5, 1, 5, O); a.rect(X, Y, 12, 5, 1, 5, O)
        a.rect(X, Y, 4, 10, 8, 1, O)
        a.put(X, Y, 4, 4, O); a.put(X, Y, 11, 4, O)
        a.put(X, Y, 6, 6, hx('#fff8ee')); a.put(X, Y, 9, 7, hx('#fff8ee')); a.put(X, Y, 10, 6, hx('#fff8ee'))
    else:
        a.px.drect(X + 4, Y + 13, 8, 2, 0.75)
        a.rect(X, Y, 7, 9, 2, 5, P['metal']); a.rect(X, Y, 5, 13, 6, 1, P['metal2'])
        a.rect(X, Y, 4, 5, 8, 4, P['carpet3'])
        a.rect(X, Y, 4, 8, 8, 1, P['carpet'])
        a.rect(X, Y, 5, 4, 6, 1, O); a.rect(X, Y, 3, 5, 1, 4, O); a.rect(X, Y, 12, 5, 1, 4, O); a.rect(X, Y, 4, 9, 8, 1, O)
        a.put(X, Y, 5, 5, hx('#ffffff'))


def ov_bench(a, X, Y, x, y):
    P = a.P
    O = P['outline']
    isB = lambda xx, yy: a.at(xx, yy) == 'b'
    l, r = isB(x - 1, y), isB(x + 1, y)
    slat, slat2 = (P['wood3'], P['wood']) if a.theme == 'galleria' else (P['wood3'], P['wood'])
    x0, x1 = (0 if l else 1), (16 if r else 15)
    a.px.drect(X + x0, Y + 13, x1 - x0, 2, 0.75)
    for sy in (4, 7, 10):
        a.rect(X, Y, x0, sy, x1 - x0, 2, slat)
        a.rect(X, Y, x0, sy + 1, x1 - x0, 1, slat2)
        a.rect(X, Y, x0, sy + 2, x1 - x0, 1, O)
    a.rect(X, Y, x0, 3, x1 - x0, 1, O)
    legc = P['wood_dk'] if a.theme == 'galleria' else P['metal2']
    for lx in ([2] if not l else []) + ([12] if not r else []) + ([7] if l and r and x % 2 else []):
        a.rect(X, Y, lx, 13, 2, 2, legc)
        a.rect(X, Y, lx, 15, 2, 1, O)
    if not l:
        a.rect(X, Y, 0, 3, 1, 10, O)
    if not r:
        a.rect(X, Y, 15, 3, 1, 10, O)


def ov_fountain(a, X, Y, x, y):
    """Fountains: connected f-tiles form one basin with a centrepiece."""
    if (x, y) in a.fdone:
        return
    # flood fill component
    comp = []
    stack = [(x, y)]
    seen = {(x, y)}
    while stack:
        cx, cy = stack.pop()
        comp.append((cx, cy))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (cx + dx, cy + dy)
            if n not in seen and a.at(*n) == 'f':
                seen.add(n); stack.append(n)
    a.fdone.update(comp)
    P = a.P
    O = P['outline']
    cs = set(comp)
    rim, rim2 = P['rim'], P['rim2']
    for (cx, cy) in comp:
        TX, TY = a.org(cx, cy)
        u, d = (cx, cy - 1) in cs, (cx, cy + 1) in cs
        l, r = (cx - 1, cy) in cs, (cx + 1, cy) in cs
        x0, x1 = (0 if l else 1), (16 if r else 15)
        y0, y1 = (0 if u else 2), (16 if d else 12)
        a.px.rect(TX + x0, TY + y0, x1 - x0, y1 - y0, P['water'])
        for j in range(y0, y1):
            for i in range(x0, x1):
                gx, gy = TX + i, TY + j
                if gy % 6 == 2 and (gx + gy) % 7 in (0, 1):
                    a.px.p[gx, gy] = P['water2']
        if not u:
            a.rect(TX, TY, x0, y0 - 1, x1 - x0, 1, O)
            a.rect(TX, TY, x0, y0, x1 - x0, 2, rim); a.rect(TX, TY, x0, y0 + 2, x1 - x0, 1, P['water3'])
        if not d:
            a.rect(TX, TY, x0, y1 - 2, x1 - x0, 2, rim)
            a.rect(TX, TY, x0, y1, x1 - x0, 2, rim2)
            a.rect(TX, TY, x0, y1 + 2, x1 - x0, 1, O)
            a.px.drect(TX + x0, TY + y1 + 3, x1 - x0, 1, 0.75)
        if not l:
            a.rect(TX, TY, x0 - 1, y0 - (0 if u else 1), 1, (y1 + 3 if not d else 16) - y0 + (0 if u else 1), O)
            a.rect(TX, TY, x0, y0, 2, (y1 + 2 if not d else 16) - y0, rim)
        if not r:
            a.rect(TX, TY, x1, y0 - (0 if u else 1), 1, (y1 + 3 if not d else 16) - y0 + (0 if u else 1), O)
            a.rect(TX, TY, x1 - 2, y0, 2, (y1 + 2 if not d else 16) - y0, rim)
    # centrepiece at component centre
    xs = [c[0] for c in comp]; ys = [c[1] for c in comp]
    cxp = a.org(0, 0)[0] + int((min(xs) + max(xs) + 1) * 8)
    cyp = a.org(0, 0)[1] + int((min(ys) + max(ys) + 1) * 8)
    big = len(comp) >= 4
    px = a.px
    if a.theme == 'galleria':
        cap = P['caps'][0]
        s = 2 if big else 1
        # stem
        px.rect(cxp - 2, cyp - 3, 4, 6, P['stem']); px.rect(cxp - 2, cyp - 3, 1, 6, P['stem2'])
        px.rect(cxp - 3, cyp - 3, 1, 6, O); px.rect(cxp + 2, cyp - 3, 1, 6, O)
        # cap
        cw = 5 + 2 * s
        px.rect(cxp - cw, cyp - 7 - s, cw * 2, 4 + s, cap)
        px.rect(cxp - cw, cyp - 4, cw * 2, 1, dk(cap, 0.7))
        px.rect(cxp - cw + 1, cyp - 8 - s, cw * 2 - 2, 1, O)
        px.rect(cxp - cw - 1, cyp - 7 - s, 1, 4 + s, O); px.rect(cxp + cw, cyp - 7 - s, 1, 4 + s, O)
        px.rect(cxp - cw, cyp - 3, cw * 2, 1, O)
        for (i, j) in ((-3, -6), (2, -5), (4, -7), (-5, -5)):
            px.set(cxp + i, cyp + j - (s - 1), hx('#fff8ee'))
    else:
        # gear sculpture
        r_ = 5 if big else 4
        for j in range(-r_ - 1, r_ + 2):
            for i in range(-r_ - 1, r_ + 2):
                d2 = i * i + j * j
                if d2 <= r_ * r_:
                    px.set(cxp + i, cyp - 4 + j, P['wood'] if d2 > 4 else P['outline'])
                elif d2 <= (r_ + 1) ** 2 and (i + j) % 2 == 0:
                    px.set(cxp + i, cyp - 4 + j, P['wood2'])
        px.set(cxp - 1, cyp - 6, P['wood3'])
    # spray droplets
    for k in range(10 if big else 6):
        hk = hsh(cxp, cyp, k)
        dx = (hk % 15) - 7
        dy = -((hk >> 4) % 6) - 9
        px.set(cxp + dx, cyp + dy + 8, hx('#e8f8ff'))
    for k in (-1, 0, 1):
        px.set(cxp + k, cyp - 12 - (1 if big else 0), P['water2'])


def _mat(a, X, Y, i0, j0, w, h):
    """Bright welcome mat (theme colours) with a trim border: the 'way in' cue."""
    P = a.P
    O = P['outline']
    a.rect(X, Y, i0 - 1, j0 - 1, w + 2, h + 2, O)
    a.rect(X, Y, i0, j0, w, h, P['mat_trim'])
    a.rect(X, Y, i0 + 1, j0 + 1, w - 2, h - 2, P['mat'])
    if a.theme == 'galleria':
        for i in range(i0 + 1, i0 + w - 1):
            for j in range(j0 + 1, j0 + h - 1):
                if (i + j) % 3 == 0:
                    a.put(X, Y, i, j, P['mat_hi'])
    else:
        for i in range(i0 + 1, i0 + w - 1):
            for j in range(j0 + 1, j0 + h - 1):
                if i % 2 == 0 and j % 2 == 0:
                    a.put(X, Y, i, j, P['mat2'])


def ov_door_open(a, X, Y, x, y):
    """Open doorway: wall-coloured lintel + posts framing a lit opening, mat on the threshold."""
    P = a.P
    O = P['wall_edge']
    top, face, face2, hi = P['wall_top'], P['wall_front'], P['wall_front2'], P['wall_hi']
    wl, wr = a.wallish(x - 1, y), a.wallish(x + 1, y)
    wu, wd = a.wallish(x, y - 1), a.wallish(x, y + 1)
    horiz = wl or wr or not (wu or wd)
    if horiz:
        # lintel (continues the neighbouring wall cap); the opening below it is lit floor
        a.rect(X, Y, 0, 0, 16, 4, top)
        if not wu:
            a.rect(X, Y, 0, 0, 16, 1, O); a.rect(X, Y, 0, 1, 16, 1, hi)
        a.rect(X, Y, 0, 4, 16, 1, O)
        for j, f in ((5, 0.62), (6, 0.8), (7, 0.92)):
            a.px.drect(X + 3, Y + j, 10, 1, f)
        # door posts (jambs), 3 px each, full height
        for p0 in (0, 13):
            a.rect(X, Y, p0, 4, 3, 12, face)
            a.rect(X, Y, p0, 4, 1, 12, hi if p0 == 0 else face2)
            a.rect(X, Y, p0, 15, 3, 1, P['wall_base'])
        a.rect(X, Y, 3, 4, 1, 12, O); a.rect(X, Y, 12, 4, 1, 12, O)
        if not wl:
            a.rect(X, Y, 0, 0, 1, 16, O)
        if not wr:
            a.rect(X, Y, 15, 0, 1, 16, O)
        _mat(a, X, Y, 5, 10, 6, 6)
        # welcome mat on the walkable cell in front (south) of the door
        if a.at(x, y + 1) in '.,:"o':
            _mat(a, X, Y + 16, 4, 0, 8, 4)
    else:
        # opening in a vertical wall: the wall above already shows its face; shade under it, mat in the gap
        if wu:
            for j, f in enumerate((0.6, 0.75, 0.9)):
                a.px.drect(X, Y + j, 16, 1, f)
        _mat(a, X, Y, 4, 3, 8, 11)


def _stairs(a, X, Y, x, y, up):
    P = a.P
    O = P['outline']
    side = P['wall_front2']
    a.rect(X, Y, 0, 0, 16, 16, O)
    a.rect(X, Y, 0, 0, 2, 16, side); a.rect(X, Y, 14, 0, 2, 16, side)
    base_tread = P['floor_a'] if a.theme == 'galleria' else P['metal_hi']
    base_riser = P['floor_line'] if a.theme == 'galleria' else P['metal2']
    for k in range(5):
        y0 = 1 + k * 3
        t = k / 4
        f = (1.05 - 0.45 * t) if up else (0.6 + 0.45 * t)
        if up:
            f = 0.62 + 0.45 * (1 - t)
        tread = dk(base_tread, min(1.0, f))
        riser = dk(base_riser, min(1.0, f * 0.92))
        a.rect(X, Y, 2, y0, 12, 2, tread)
        a.rect(X, Y, 2, y0 + 2, 12, 1, riser)
    a.rect(X, Y, 1, 0, 1, 16, O); a.rect(X, Y, 14, 0, 1, 16, O)
    # arrow
    L = P['lantern']
    if up:
        pts = [(7, 3), (8, 3), (6, 4), (7, 4), (8, 4), (9, 4), (5, 5), (6, 5), (7, 5), (8, 5), (9, 5), (10, 5),
               (7, 6), (8, 6), (7, 7), (8, 7), (7, 8), (8, 8)]
        oy = 2
    else:
        pts = [(7, 3), (8, 3), (7, 4), (8, 4), (7, 5), (8, 5), (5, 6), (6, 6), (7, 6), (8, 6), (9, 6), (10, 6),
               (6, 7), (7, 7), (8, 7), (9, 7), (7, 8), (8, 8)]
        oy = 2
    for (i, j) in pts:
        for (di, dj) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (i + di, j + dj) not in pts:
                a.put(X, Y, i + di, j + dj + oy, O)
    for (i, j) in pts:
        a.put(X, Y, i, j + oy, L)


def ov_up(a, X, Y, x, y):
    _stairs(a, X, Y, x, y, True)


def ov_down(a, X, Y, x, y):
    _stairs(a, X, Y, x, y, False)


def ov_railing(a, X, Y, x, y):
    P = a.P
    O = P['outline']
    isR = lambda xx, yy: a.at(xx, yy) == '_' or a.wallish(xx, yy)
    horiz = (a.at(x - 1, y) == '_' or a.at(x + 1, y) == '_') or not (a.at(x, y - 1) == '_' or a.at(x, y + 1) == '_')
    if a.theme == 'galleria':
        rail, rail2, post = P['wood3'], P['wood'], P['wood2']
    else:
        rail, rail2, post = P['wood3'], P['wood'], P['wood2']
    if horiz:
        l, r = isR(x - 1, y), isR(x + 1, y)
        x0, x1 = (0 if l else 1), (16 if r else 15)
        if a.theme == 'cogskill':
            a.px.rect(X + x0, Y + 7, x1 - x0, 6, alpha(P['glass'], 120))
            for i in range(x0, x1):
                if (X + i) % 5 == 0:
                    a.put(X, Y, i, 8, alpha(P['glass_hi'], 200))
        a.px.drect(X + x0, Y + 14, x1 - x0, 1, 0.7)
        for pxp in (2, 10):
            a.rect(X, Y, pxp, 6, 2, 8, post)
            a.rect(X, Y, pxp + 2, 6, 1, 8, O)
            a.rect(X, Y, pxp - 1, 6, 1, 8, O)
            a.rect(X, Y, pxp - 1, 14, 4, 1, O)
        a.rect(X, Y, x0, 4, x1 - x0, 1, O)
        a.rect(X, Y, x0, 5, x1 - x0, 1, mix(rail, hx('#ffffff'), 0.35))
        a.rect(X, Y, x0, 6, x1 - x0, 1, rail2)
        a.rect(X, Y, x0, 7, x1 - x0, 1, O)
        if a.theme == 'galleria':
            a.rect(X, Y, x0, 10, x1 - x0, 1, rail2)
            a.rect(X, Y, x0, 11, x1 - x0, 1, O)
        if not l:
            a.rect(X, Y, x0 - 1, 4, 1, 4, O)
        if not r:
            a.rect(X, Y, x1, 4, 1, 4, O)
    else:
        u, d = isR(x, y - 1), isR(x, y + 1)
        y0, y1 = (0 if u else 3), (16 if d else 13)
        if a.theme == 'cogskill':
            a.px.rect(X + 5, Y + y0, 6, y1 - y0, alpha(P['glass'], 110))
        a.rect(X, Y, 6, y0, 1, y1 - y0, O)
        a.rect(X, Y, 7, y0, 2, y1 - y0, rail)
        a.rect(X, Y, 8, y0, 1, y1 - y0, rail2)
        a.rect(X, Y, 9, y0, 1, y1 - y0, O)
        a.px.drect(X + 10, Y + y0, 1, y1 - y0, 0.75)
        for pyp in (4, 11):
            a.rect(X, Y, 6, pyp, 4, 2, post)
            a.rect(X, Y, 5, pyp - 1, 6, 1, O); a.rect(X, Y, 5, pyp + 2, 6, 1, O)
            a.rect(X, Y, 5, pyp, 1, 2, O); a.rect(X, Y, 10, pyp, 1, 2, O)
        if not u:
            a.rect(X, Y, 6, y0 - 1, 4, 1, O)
        if not d:
            a.rect(X, Y, 6, y1, 4, 1, O)


OVERLAY = {
    'T': ov_tree, 'p': ov_potted, 'r': ov_rock, 'x': ov_crates, 'k': ov_vending, 'S': ov_shelf,
    '=': ov_counter, 't': ov_table, 'c': ov_chair, 'b': ov_bench, 'f': ov_fountain, '+': ov_door_open,
    '^': ov_up, 'v': ov_down, '_': ov_railing,
}
