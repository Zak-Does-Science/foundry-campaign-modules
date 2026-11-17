#!/usr/bin/env python3
"""Player-character live sprites (SPEC 22, 16 Nov 2026), hand-drawn from Zak's team scenes and tokens
(C:\\Claude_TBP\\Banton team.png, Toggleton team.png, <Name>-Token.png).

Keys `pc:<slug>` in assets/sprites/live/index.json, same frame format as NPCs (frame 2 = breath). Heights vary so the
characters keep believable sizes: gnomes and goblins short inside a 16x16 frame, Mirva 16x20, Kuso 16x24 (fh / footY say so).
`python tools/mall_pcs.py` exports the sheets + index entries and writes assets/sprites/packs/player-characters.png;
render_mall.py also re-exports them on every run so a full re-render never prunes them.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image  # noqa: E402
from pixcore import PX, hx  # noqa: E402
import pixfont  # noqa: E402

ROOT = os.path.dirname(HERE)
O = hx('#1e1428')

PCS = {
    # ---------------------------------------------------------------- Ban'ton (Monday)
    'snide-piper': dict(name='Snide Piper', table='Ban\'ton', rows=[
        "...hh......hh...",
        "..h.OOOOOOOO.h..",
        "..hOHHHHHHHHOh..",
        "...OHSSSSSSHO...",
        "...OSSESSESSO...",
        "...OSHHHHHHSO...",
        "....OHSHHSHO....",
        "...OCCOHHOCCO...",
        "..OCCGcCCcGCCO..",
        ".PPSCGCCCCGCSO..",
        ".PPOCcCCCCcCO...",
        "..OCCCCCCCCCCO..",
        "...OFFOOOOFFO...",
        "...OFFO..OFFO...",
        "....OFO..OFO....",
        "....KK....KK....",
    ], pal=dict(h='#d8b070', H='#b86a28', S='#d89a68', E='#1a1020', C='#c8781e', c='#6a4010', G='#3a6a3a',
                P='#d8b070', F='#9a6430', K='#2a1a10')),
    'mirva-nox': dict(name='Mirva Nox', table='Ban\'ton', rows=[
        "...WWW....WWW...",
        "..WWWWW..WWWWW..",
        "...OWHHHHHHWO...",
        "...OHHHHHHHHO...",
        "..OSHHSSSSHHSO..",
        "...OSSESSESSO...",
        "...OSSSSSSSSO...",
        "....OSSmmSSO....",
        "...OOSSSSSSOO...",
        "..OPPpWPPWpPPO..",
        "..OSPPPWWPPPSO..",
        ".OTSPPPPPPPPSTO.",
        ".OTOKKKXXKKKOTO.",
        "..OSBBBBBBBBSO..",
        "...OBBLBBLBBO...",
        "...OBLBBBBLBO...",
        "...OBBLBBLBBO...",
        "...OBLBOOBLBO...",
        "...OBBBO.OBBBO..",
        "...OOOO...OOOO..",
    ], pal=dict(W='#f0ece8', H='#2a2630', S='#8a8a98', E='#f4f4f8', m='#3a2a3a', P='#ec9cc4', p='#c87aa0',
                T='#4a4a58', K='#1e1a22', X='#e8e4d8', B='#26222c', L='#d070a0')),
    'hallory-clampton': dict(name='Hallory Clampton', table='Ban\'ton', rows=[
        "................",
        "................",
        "....OOOOOOOO....",
        "...OYYYYYYYYO...",
        "...OhhhhhhhhO...",
        "...OYGGSSGGYO...",
        "...OYGgSSGgYO...",
        "...OYSSSSSSYO...",
        "....OSSrrSSO....",
        ".....OWWWWO.....",
        "....OVUUUUVO....",
        "...ODVUUUUVDO...",
        "....OUUUUUUO....",
        "....OUUUUUUO....",
        "....OUUOOUUO....",
        "....OZZO.OZZO...",
    ], pal=dict(Y='#e8c070', h='#40b0b0', G='#2a2a34', g='#a8c8e0', S='#f0c8a8', r='#d04050', W='#f4f0e8',
                V='#e070c0', U='#a060c0', D='#6a2a8a', Z='#e8f0f4')),
    'turd': dict(name='T.U.R.D.', table='Ban\'ton', rows=[
        "................",
        "................",
        "................",
        ".....OOOOOO.....",
        "....OSSSSSSO....",
        ".OO.OSSSSSSO.OO.",
        ".OSOgRgSgRgOSO..",
        "..OeOSSSSSSOeO..",
        "....OSSmmSSO....",
        ".....OSSSSO.....",
        "....OWWWWWWO....",
        "...OSWWWWWWSO...",
        "....OKKKKKKO....",
        "....OTTTTTTO....",
        "....OTTOOTTO....",
        "....OBBO.OBBO...",
    ], pal=dict(S='#ece4dc', g='#3a3040', R='#e03040', e='#8a3ac0', m='#8a5a5a', W='#f4f0e8', K='#5a3a20',
                T='#d07a30', B='#4a3020')),
    # ---------------------------------------------------------------- Toggleton (Tuesday)
    'undyne-deindie': dict(name='Undyne DeIndie', table='Toggleton', rows=[
        "...O.O.O....bPb.",
        "..OYOYOYO...PPP.",
        "..OYYYYYYO..bPb.",
        "..OYMMMMYO......",
        "...OMMMMMO......",
        "...OMMMMMO......",
        "....OMMMO.......",
        "..OyTRTRTyO.....",
        ".OGTRTyTRTGO....",
        ".OGOTRTRTOGO....",
        "...ORTRTRTO.....",
        "...ORRTTTRRO....",
        "....OBBOBBO.....",
        "....OBBOBBO.....",
        "...OTRO.OTRO....",
        "...OWWO.OWWO....",
    ], pal=dict(Y='#f08040', M='#b8b8c4', T='#2aa898', R='#c03048', y='#e8c040', G='#7aa060', B='#2a2230',
                W='#f4f0e8', b='#4060e0', P='#f040a0')),
    'lenore-evergloom': dict(name='Lenore Evergloom', table='Toggleton', rows=[
        "......OOOO......",
        ".....OHHHHO.....",
        "....OHHHHHHO....",
        "...OHHHHHHHHO...",
        "...OHSSSSSSHO...",
        "..OSSSESSESSSO..",
        "...OSSSSSSSSO...",
        "....OSSkkSSO....",
        ".....OSSSSO.....",
        "...OSBBRRBBSO...",
        "..OSOBRBBRBOSO..",
        "...SOBBRRBBOS...",
        "....OBBBBBBO....",
        "....OBBOOBBO....",
        "....OBRO.OBRO...",
        "....ORRO.ORRO...",
    ], pal=dict(H='#a8a8b4', S='#f0dcd0', E='#3a3a4a', k='#1e1a22', B='#1e1a22', R='#a02030')),
    'julip': dict(name='Julip', table='Toggleton', rows=[
        "................",
        "...OOO....OOO...",
        "..OHHHO..OHHHO..",
        "..OHHHOOOOHHHO..",
        "...OOHHHHHHOO...",
        ".OO.OHSSSSHO.OO.",
        ".OSOSSESSESSOSO.",
        "..OeOSSSSSSOeO..",
        "....OSSmmSSO....",
        ".....OSSSSO.....",
        "....OUYUUUUO....",
        "...OSUUYUUUSO...",
        "....OUUUYUUO....",
        "....OUUUUUUO....",
        "....OUUOOUUO....",
        "....OKKO.OKKO...",
    ], pal=dict(H='#4a3020', S='#7ab060', E='#1a1020', e='#3a7ae0', m='#3a5a30', U='#7a5ab0', Y='#e0a030',
                K='#3a2a40')),
    'kuso-sharpfang': dict(name='Kuso Sharpfang', table='Toggleton', rows=[
        "...........OOO..",
        ".....OW....OkO..",
        "....OBWO....OkO.",
        "...OBBBBO...OkO.",
        "...OBYBYBO..OkO.",
        "...OBBBBBO..OkO.",
        "....OLLLBO..OkO.",
        "....OBBBO..OkO..",
        "..OOBBBBBOOOkO..",
        ".OBBrLLLLrBBBO..",
        ".OBBLrLLrLBBBO..",
        "OBBOLLrrLLOBBO..",
        "OBOOLLLLLLOObO..",
        "OBO.OLLLLLO.OBO.",
        ".O.OrrrrrrrO.O..",
        "...OkkkkkkkO....",
        "...OTTTTTTTO....",
        "...OTTTOTTTOW...",
        "...OTTTOTTTObW..",
        "...OBBBOBBBObbW.",
        "...OBBO.OBBO.bW.",
        "...OBBO.OBBO.Ob.",
        "..OBBBO.OBBBO...",
        "..OWOWO.OWOWO...",
    ], pal=dict(W='#f0e8d8', B='#3442a8', b='#222c78', Y='#f0d040', L='#7484d4', r='#d8c088', k='#5a5450',
                T='#a09040')),
    'indy': dict(name='Indy', table="Ban'ton", rows=[
        "..H..........H..",
        "...HH.OOOO.HH...",
        "....OHPPPPHO....",
        "...OEEPppPEEO...",
        "...OEEPPPPEEO...",
        "....OPpWWpPO..b.",
        ".....OWWWWTTTb..",
        "OOO.ORRWRRRO.OOO",
        "OKKOORRWRRSROKKO",
        "OKKKRRRWRSSRRKKO",
        ".OKKRRRWSSSSOKO.",
        "..OPRRRSSRRRPO..",
        "..OPOSSSSSSSOPO.",
        "...OWWrWWWrWWO..",
        "...OWrYrWWrYrO..",
        "..OWWWrWWWWrWWO.",
        "..OWrYrWWWrYrWO.",
        ".OWWWWWWWWWWWWWO",
        ".OOOOOOOOOOOOOOO",
        "...OWO....OWO...",
    ], pal=dict(H='#f0e2d0', P='#ec8f80', p='#b8544a', E='#1c1c26', W='#f6f0e8', R='#c8383a', S='#d27a78',
                T='#8a5a2a', K='#f0a090', r='#e89038', Y='#f2c440', b='#5a3418'), smoke=(14, 4)),
    # ---------------------------------------------------------------- GM character (Zak): Orichalcum's man in the malls
    'aurelius-goldtrail': dict(name='Aurelius Goldtrail III', table='Orichalcum', rows=[  # drawn facing RIGHT like every walker (17 Nov 2026: was facing left, so he walked backwards)
        "..........OOOO..",
        ".........OhhhhO.",
        ".........OhhhhO.",
        "..OOOO..OObbbbOO",
        ".OSSSSO.OhhhhhhO",
        "OSsssWSO.OBBBBO.",
        "OSSsssSO.OmBEWO.",
        "OSSsGsSOOcMMMMO.",
        "OSSSssSOBcBBBO..",
        ".OSSSSSOBccccBO.",
        "..OSSSOBBBBTBBO.",
        "..OOOOBBBBBBBO..",
        ".OBBBBBBBBBBBOY.",
        "OBBBBBBBBBBBBOK.",
        ".OOOOOOOOOOOOOK.",
        "..............K.",
    ], pal=dict(h='#1a1a24', b='#e8c040', B='#a8c48a', E='#14101c', m='#f4f4fc', W='#fffbe8', M='#5a3a24', S='#e8b830', s='#a87818',
                G='#d02848', c='#f6d860', T='#fff0a0', K='#5a3a20', Y='#f6d860')),
}
ORDER = ['snide-piper', 'mirva-nox', 'hallory-clampton', 'turd', 'indy',
         'undyne-deindie', 'lenore-evergloom', 'julip', 'kuso-sharpfang', 'aurelius-goldtrail']


def build_pc(slug):
    d = PCS[slug]
    rows = d['rows']
    for r in rows:
        if len(r) != 16:
            raise ValueError(f"{slug}: row {r!r} is {len(r)} wide")
    pal = {k: hx(v) for k, v in d['pal'].items()}
    pal['O'] = O
    img = Image.new('RGBA', (16, len(rows)), (0, 0, 0, 0))
    PX(img).blit(0, 0, rows, pal)
    return img


def sheet(slug):
    """2 frames side by side; frame 2 = breath (everything above the legs 1 px lower)."""
    img = build_pc(slug)
    h = img.height
    sh = Image.new('RGBA', (32, h), (0, 0, 0, 0))
    sh.paste(img, (0, 0))
    f2 = Image.new('RGBA', (16, h), (0, 0, 0, 0))
    cut = h - 4
    f2.paste(img.crop((0, 0, 16, cut)), (0, 1))
    f2.paste(img.crop((0, cut, 16, h)), (0, cut))
    sh.paste(f2, (16, 0))
    return sh


def export(live_dir, index):
    os.makedirs(live_dir, exist_ok=True)
    for slug in ORDER:
        sh = sheet(slug)
        fname = f"pc_{slug}.png"
        sh.save(os.path.join(live_dir, fname), optimize=True)
        index[f"pc:{slug}"] = {'file': fname, 'fw': 16, 'fh': sh.height, 'frames': 2, 'footY': sh.height - 1}
        if PCS[slug].get('smoke'):
            index[f"pc:{slug}"]['smoke'] = list(PCS[slug]['smoke'])
    return index


def contact_sheet(path, scale=6):
    cw, chh = 84, 44
    img = Image.new('RGBA', (4 * cw, ((len(ORDER) + 3) // 4) * (chh + 6) + 12), (232, 226, 214, 255))
    px = PX(img)
    for i, slug in enumerate(ORDER):
        x0, y0 = (i % 4) * cw, (i // 4) * (chh + 6) + 4
        sh = sheet(slug)
        h = sh.height
        img.alpha_composite(sh.crop((0, 0, 16, h)), (x0 + 24, y0 + 26 - h))
        img.alpha_composite(sh.crop((16, 0, 32, h)), (x0 + 44, y0 + 26 - h))
        name = PCS[slug]['name'].upper()
        pixfont.draw_tiny(px, x0 + max(1, (cw - pixfont.tiny_width(name)) // 2), y0 + 31, name, O)
        tag = f"PC:{slug.upper()}"
        pixfont.draw_tiny(px, x0 + max(1, (cw - pixfont.tiny_width(tag)) // 2), y0 + 38, tag, hx('#7a6a8a'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((img.width * scale, img.height * scale), Image.NEAREST).save(path, optimize=True)
    return path


# ---------------------------------------------------------------- Undyne's changing room (other playable races)
# He keeps the spiky orange hair, the teal-red harlequin outfit and the winged pink orb familiar in every form.
U_HAIR = [
    "....O.O.O.O.....",
    "...OYOYOYOYO....",
    "...OYYYYYYYYO...",
]
U_HEAD = {
    'plain': ["...OSSSSSSSSO...", "...OSSESSESSO...", "...OSSSSSSSSO...", "....OSSmmSSO....", ".....OSSSSO....."],
    'ears': ["..OSSSSSSSSSSO..", "..OSSSESSESSSO..", "...OSSSSSSSSO...", "....OSSmmSSO....", ".....OSSSSO....."],
    'goblin': [".OO.OSSSSSSO.OO.", ".OSOSSESSESSOSO.", "..O.OSSSSSSO.O..", "....OSSmmSSO....", ".....OSSSSO....."],
    'beard': ["...OSSSSSSSSO...", "...OSSESSESSO...", "...OYSSSSSSYO...", "...OYYYmmYYYO...", "....OYYYYYYO...."],
    'snout': ["...OSSSSSSSSO...", "...OSSESSESSO...", "...OSSSSSSSSSO..", "...OSSSSSSmSSO..", "....OSSSSSSO...."],
    'robot': ["...OSSSSSSSSO...", "...OSNNSSNNSO...", "...OSsSSSSsSO...", "....OSmmmmSO....", ".....OSssSO....."],
}
U_BODY = {
    'small': [
        "....OyTRTyO.....",
        "...OSTRTRTSO....",
        "....ORTRTRO.....",
        "....OBBOBBO.....",
        "....OWWOWWO.....",
    ],
    'medium': [
        "...OyTRTRTyO....",
        "..OSTRTyTRTSO...",
        "..OSOTRTRTOSO...",
        "....ORTRTRTO....",
        "....ORRTTTRRO...",
        "....OBBOOBBO....",
        "....OTRO.OTRO...",
        "....OWWO.OWWO...",
    ],
    'tall': [
        "..OOyTRTRTyOO...",
        ".OSTRTRTRTRTSO..",
        ".OSTRTyTyTRTSO..",
        ".OSOTRTRTRTOSO..",
        ".OSOTRTRTRTOSO..",
        ".OO.ORTRTRO.OO..",
        "....ORRTTTRRO...",
        "...ORRTTTTTRRO..",
        "....OBBBOBBBO...",
        "....OBBBOBBBO...",
        "....OBBBOBBBO...",
        "....OBBBOBBBO...",
        "...OTRTO.OTRTO..",
        "...OTRTO.OTRTO..",
        "...OWWWO.OWWWO..",
        "...OOOOO.OOOOO..",
    ],
}
U_PAL = dict(Y='#f08040', T='#2aa898', R='#c03048', y='#e8c040', B='#2a2230', W='#f4f0e8', b='#4060e0', P='#f040a0',
             E='#1a1020', m='#8a4a4a', N='#5ff4ff')
# form: (label, head, body, skin, extra palette, extra pixels [(x, y_from_head_top, char)], tail)
UNDYNE_FORMS = {
    'gnome': ('Gnome', 'plain', 'small', '#f0c8a8', {}, [], None),
    'halfling': ('Halfling', 'plain', 'small', '#e8b48a', {}, [], None),
    'goblin': ('Goblin', 'goblin', 'small', '#7ab060', {}, [], None),
    'dwarf': ('Dwarf', 'beard', 'small', '#e0a880', {}, [], None),
    'human': ('Human', 'plain', 'medium', '#f0c8a0', {}, [], None),
    'elf': ('Elf', 'ears', 'medium', '#f8e0c8', {'E': '#3a7a5a'}, [], None),
    'tiefling': ('Tiefling', 'ears', 'medium', '#c84a5a', {'E': '#f8e060', 'K': '#d8c8b0'},
                 [(2, -1, 'K'), (2, -2, 'K'), (1, -3, 'K'), (12, -2, 'K'), (12, -3, 'K')], 'S'),
    'lizardfolk': ('Lizardfolk', 'snout', 'medium', '#5ca85a', {'E': '#f0d040'}, [], 'S'),
    'fire-genasi': ('Fire genasi', 'plain', 'medium', '#e8603a', {'E': '#fff070', 'm': '#a02a10', 'F': '#ffd040'},
                    [(4, 0, 'F'), (10, 2, 'F'), (11, 0, 'F'), (5, 4, 'F')], None),
    'dragonborn': ('Dragonborn', 'snout', 'tall', '#c89a3a', {'E': '#c03020', 'K': '#f0e8d8'},
                   [(2, -1, 'K'), (2, -2, 'K'), (1, -3, 'K'), (12, -2, 'K'), (12, -3, 'K'), (12, -4, 'K')], 'S'),
    'warforged': ('Warforged', 'robot', 'tall', '#8a96a4', {'s': '#5a6470'}, [], None),
}


def build_undyne_form(form):
    label, head, body, skin, extra, pix, tail = UNDYNE_FORMS[form]
    rows = U_HAIR + U_HEAD[head] + U_BODY[body]
    h = 24 if body == 'tall' else 16
    rows = ["." * 16] * (h - len(rows)) + rows
    for r in rows:
        if len(r) != 16:
            raise ValueError(f"undyne {form}: row {r!r} is {len(r)} wide")
    g = [list(r) for r in rows]
    head_top = h - len(U_BODY[body]) - len(U_HEAD[head])
    for (x, dy, ch) in pix:
        y = head_top + dy
        if 0 <= y < h and g[y][x] == '.' or (0 <= y < h and ch == 'F'):
            g[y][x] = ch
    if tail:                                   # tail curling out behind the right leg
        for (x, dy) in ((12, -4), (13, -5), (13, -6), (14, -7)):
            y = h + dy
            if g[y][x] == '.':
                g[y][x] = tail
    # the winged orb familiar, top right
    for j, row in enumerate(("bPb", "PPP", "bPb")):
        for i, ch in enumerate(row):
            if g[j][13 + i] == '.':
                g[j][13 + i] = ch
    pal = {k: hx(v) for k, v in U_PAL.items()}
    pal.update({k: hx(v) for k, v in extra.items()})
    pal['S'] = hx(skin)
    pal.setdefault('s', hx('#6a7480'))
    pal['O'] = O
    img = Image.new('RGBA', (16, h), (0, 0, 0, 0))
    PX(img).blit(0, 0, [''.join(r) for r in g], pal)
    return img


def _breath(img):
    h = img.height
    sh = Image.new('RGBA', (32, h), (0, 0, 0, 0))
    sh.paste(img, (0, 0))
    f2 = Image.new('RGBA', (16, h), (0, 0, 0, 0))
    cut = h - 4
    f2.paste(img.crop((0, 0, 16, cut)), (0, 1))
    f2.paste(img.crop((0, cut, 16, h)), (0, cut))
    sh.paste(f2, (16, 0))
    return sh


def export_undyne_forms(live_dir, index):
    os.makedirs(live_dir, exist_ok=True)
    for form in UNDYNE_FORMS:
        sh = _breath(build_undyne_form(form))
        fname = f"pc_undyne-deindie_{form}.png"
        sh.save(os.path.join(live_dir, fname), optimize=True)
        index[f"pc:undyne-deindie:{form}"] = {'file': fname, 'fw': 16, 'fh': sh.height, 'frames': 2,
                                               'footY': sh.height - 1}
    return index


def undyne_sheet(path, scale=6):
    forms = [('default', 'Undyne - real')] + [(f, UNDYNE_FORMS[f][0]) for f in UNDYNE_FORMS]
    cols, cw, chh = 4, 84, 44
    rows_n = (len(forms) + cols - 1) // cols
    img = Image.new('RGBA', (cols * cw, rows_n * (chh + 6) + 6), (232, 226, 214, 255))
    px = PX(img)
    for i, (form, label) in enumerate(forms):
        x0, y0 = (i % cols) * cw, (i // cols) * (chh + 6) + 4
        sh = sheet('undyne-deindie') if form == 'default' else _breath(build_undyne_form(form))
        h = sh.height
        img.alpha_composite(sh.crop((0, 0, 16, h)), (x0 + 24, y0 + 26 - h + 2))
        img.alpha_composite(sh.crop((16, 0, 32, h)), (x0 + 44, y0 + 26 - h + 2))
        name = label.upper()
        pixfont.draw_tiny(px, x0 + max(1, (cw - pixfont.tiny_width(name)) // 2), y0 + 32, name, O)
        key = 'PC:UNDYNE-DEINDIE' if form == 'default' else f":{form.upper()}"
        pixfont.draw_tiny(px, x0 + max(1, (cw - pixfont.tiny_width(key)) // 2), y0 + 39, key, hx('#7a6a8a'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((img.width * scale, img.height * scale), Image.NEAREST).save(path, optimize=True)
    return path


_export_pcs = export


def export(live_dir, index):           # noqa: F811  (player characters + Undyne's forms)
    _export_pcs(live_dir, index)
    return export_undyne_forms(live_dir, index)


if __name__ == '__main__':
    print(undyne_sheet(os.path.join(ROOT, 'assets', 'sprites', 'packs', 'undyne-forms.png')))
    live = os.path.join(ROOT, 'assets', 'sprites', 'live')
    idx_path = os.path.join(live, 'index.json')
    index = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {}
    export(live, index)
    with open(idx_path, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(index.items())), fh, indent=2)
    print(contact_sheet(os.path.join(ROOT, 'assets', 'sprites', 'packs', 'player-characters.png')))
