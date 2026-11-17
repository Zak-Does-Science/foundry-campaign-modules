#!/usr/bin/env python3
"""Contact sheets for the venue packs (16 Nov 2026): assets/sprites/packs/<venue>.png.

Each sheet: a small demo floor in the venue's theme stub (walls, window, doors, carpet, tree), every prop of the venue
pack with its name, and a row of NPCs wearing the venue's outfit tag.   Usage: python tools/make_packs.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image  # noqa: E402
from pixcore import PX, hx  # noqa: E402
from mall_tiles import FloorArt, PALETTES  # noqa: E402
from mall_sprites import build_npc, build_obj  # noqa: E402
import mall_props_immia, mall_props_slooper, mall_props_panto, mall_props_moffidge  # noqa: E402,E401
import pixfont  # noqa: E402

ROOT = os.path.dirname(HERE)
VENUES = [
    ('immia', 'IMMIA BEACH', mall_props_immia.PACK, 'beachwear', ['human', 'elf', 'fishfolk', 'tiefling', 'halfling', 'dragonborn']),
    ('slooper', 'SLOOPERMARKET', mall_props_slooper.PACK, 'market-apron', ['halfling', 'goblin', 'human', 'gnome', 'kobold', 'orc']),
    ('panto', 'PANTO', mall_props_panto.PACK, 'stage-costume', ['elf', 'human', 'tiefling', 'gnome', 'pixie', 'dwarf']),
    ('moffidge', 'MOFFIDGE', mall_props_moffidge.PACK, 'monk-robe', ['dwarf', 'human', 'aarakocra', 'halfling', 'elf', 'orc']),
]
DEMO = [
    "              ",
    " ############ ",
    " #,,,,#.....# ",
    " #,S,,w..T..# ",
    " #,,,,+.....# ",
    " ###w##..p..# ",
    " #oo..+.....# ",
    " #oo..#..b..# ",
    " ############ ",
    "              ",
]
CELL_W, CELL_H, COLS, SCALE = 68, 30, 7, 3


def sheet(venue, title, pack, outfit, species):
    P = PALETTES[venue]
    names = sorted(pack)
    rows = (len(names) + COLS - 1) // COLS
    dw, dh = len(DEMO[0]) * 16, len(DEMO) * 16
    W = max(dw + 8 + 16 * 13, COLS * CELL_W + 8)
    H = 14 + dh + 8 + rows * CELL_H + 8 + 2 * 22 + 8
    img = Image.new('RGBA', (W, H), P['floor_a'][:3] + (255,))
    px = PX(img)
    pixfont.draw_text(px, 4, 3, title, P['wall_front'])
    # demo floor
    demo = Image.new('RGBA', (dw, dh), (0, 0, 0, 255))
    FloorArt(PX(demo), DEMO, venue, 0, 0).draw()
    img.alpha_composite(demo, (4, 14))
    # palette swatches beside the demo
    keys = ['wall_top', 'wall_front', 'wall_hi', 'floor_a', 'floor_b', 'carpet', 'pave', 'sea', 'cliff', 'mat', 'mat_trim',
            'sign_fill', 'sign_text']
    for k, key in enumerate(keys):
        x, y = dw + 10 + (k % 2) * 60, 14 + (k // 2) * 14
        px.rect(x, y, 10, 10, P['outline'])
        px.rect(x + 1, y + 1, 8, 8, P[key])
        pixfont.draw_tiny(px, x + 13, y + 3, key.replace('_', '-')[:10], P['outline'])
    # props
    y0 = 14 + dh + 8
    for i, n in enumerate(names):
        cx, cy = 4 + (i % COLS) * CELL_W, y0 + (i // COLS) * CELL_H
        im, _ = build_obj(n, i)
        img.alpha_composite(im, (cx + (CELL_W - 16) // 2, cy))
        label = n.upper()
        pixfont.draw_tiny(px, cx + max(0, (CELL_W - pixfont.tiny_width(label)) // 2), cy + 19, label, P['outline'])
    # outfit NPCs (adult + child + elder samples)
    y1 = y0 + rows * CELL_H + 4
    pixfont.draw_tiny(px, 4, y1, f'NPC:<SPECIES>:<V>:{outfit.upper()}', P['outline'])
    for k in range(12):
        sp = species[k % len(species)]
        tags = [outfit] + (['child'] if k in (3, 9) else ['elder'] if k == 6 else [])
        im, _ = build_npc(sp, k * 5 + 1, *tags)
        img.alpha_composite(im, (4 + k * 20, y1 + 8))
    for k in range(12):
        im, _ = build_npc(species[(k + 2) % len(species)], k * 3 + 2)
        img.alpha_composite(im, (4 + k * 20, y1 + 28))
    out_dir = os.path.join(ROOT, 'assets', 'sprites', 'packs')
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f'{venue}.png')
    img.resize((W * SCALE, H * SCALE), Image.NEAREST).save(path, optimize=True)
    return path


if __name__ == '__main__':
    for v in VENUES:
        print(sheet(*v))
