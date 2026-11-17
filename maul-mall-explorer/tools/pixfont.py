"""Tiny 5x7 bitmap font for MAUL mall shop signs (proportional, trimmed glyphs)."""
import unicodedata

_G = {
    'A': [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    'B': ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
    'C': [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
    'D': ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
    'E': ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
    'F': ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
    'G': [" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"],
    'H': ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    'I': ["###", " # ", " # ", " # ", " # ", " # ", "###"],
    'J': ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
    'K': ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
    'L': ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
    'M': ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
    'N': ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
    'O': [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    'P': ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
    'Q': [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
    'R': ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
    'S': [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
    'T': ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
    'U': ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    'V': ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
    'W': ["#   #", "#   #", "#   #", "# # #", "# # #", "# # #", " # # "],
    'X': ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
    'Y': ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
    'Z': ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
    '0': [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
    '1': [" # ", "## ", " # ", " # ", " # ", " # ", "###"],
    '2': [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
    '3': ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
    '4': ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
    '5': ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
    '6': ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
    '7': ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
    '8': [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
    '9': [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
    '&': [" ##  ", "#  # ", "# #  ", " #   ", "# # #", "#  # ", " ## #"],
    "'": ["#", "#", " ", " ", " ", " ", " "],
    '!': ["#", "#", "#", "#", "#", " ", "#"],
    '-': ["   ", "   ", "   ", "###", "   ", "   ", "   "],
    '.': [" ", " ", " ", " ", " ", " ", "#"],
    ',': ["  ", "  ", "  ", "  ", "  ", " #", "# "],
    '?': [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
    '/': ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
    ':': [" ", "#", " ", " ", " ", "#", " "],
}
SPACE_W = 3


def _norm(ch):
    if ch in _G or ch == ' ':
        return ch
    up = ch.upper()
    if up in _G:
        return up
    base = unicodedata.normalize('NFKD', ch)[0].upper()   # ñ -> N, é -> E
    if base in _G:
        return base
    if ch in '’‘`':
        return "'"
    if ch in '–—':
        return '-'
    return None


def glyph_rows(ch):
    return _G[ch]


def text_width(text):
    w = 0
    for ch in text:
        n = _norm(ch)
        if n == ' ':
            w += SPACE_W + 1
        else:
            w += len(_G[n or '?'][0]) + 1
    return max(0, w - 1)


def unknown_chars(text):
    return sorted({ch for ch in text if _norm(ch) is None})


def draw_text(px, x, y, text, color, shadow=None):
    """Draw text with top-left at (x, y). Returns width."""
    cx = x
    for ch in text:
        n = _norm(ch)
        if n == ' ':
            cx += SPACE_W + 1
            continue
        rows = _G[n or '?']
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == '#':
                    if shadow is not None:
                        px.set(cx + i, y + j + 1, shadow)
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == '#':
                    px.set(cx + i, y + j, color)
        cx += len(rows[0]) + 1
    return cx - x - 1


# ---------------------------------------------------------------- tiny 3x5 font (unit-number sign plaques)
_T = {
    '0': ["###", "# #", "# #", "# #", "###"], '1': [" # ", "## ", " # ", " # ", "###"],
    '2': ["###", "  #", "###", "#  ", "###"], '3': ["###", "  #", " ##", "  #", "###"],
    '4': ["# #", "# #", "###", "  #", "  #"], '5': ["###", "#  ", "###", "  #", "###"],
    '6': ["###", "#  ", "###", "# #", "###"], '7': ["###", "  #", " # ", " # ", " # "],
    '8': ["###", "# #", "###", "# #", "###"], '9': ["###", "# #", "###", "  #", "###"],
    'A': [" # ", "# #", "###", "# #", "# #"], 'B': ["## ", "# #", "## ", "# #", "## "],
    'C': [" ##", "#  ", "#  ", "#  ", " ##"], 'D': ["## ", "# #", "# #", "# #", "## "],
    'E': ["###", "#  ", "## ", "#  ", "###"], 'F': ["###", "#  ", "## ", "#  ", "#  "],
    'G': [" ##", "#  ", "# #", "# #", " ##"], 'H': ["# #", "# #", "###", "# #", "# #"],
    'I': ["###", " # ", " # ", " # ", "###"], 'J': ["  #", "  #", "  #", "# #", " # "],
    'K': ["# #", "# #", "## ", "# #", "# #"], 'L': ["#  ", "#  ", "#  ", "#  ", "###"],
    'M': ["# #", "###", "###", "# #", "# #"], 'N': ["## ", "# #", "# #", "# #", "# #"],
    'O': [" # ", "# #", "# #", "# #", " # "], 'P': ["## ", "# #", "## ", "#  ", "#  "],
    'Q': [" # ", "# #", "# #", "## ", " ##"], 'R': ["## ", "# #", "## ", "# #", "# #"],
    'S': [" ##", "#  ", " # ", "  #", "## "], 'T': ["###", " # ", " # ", " # ", " # "],
    'U': ["# #", "# #", "# #", "# #", "###"], 'V': ["# #", "# #", "# #", "# #", " # "],
    'W': ["# #", "# #", "###", "###", "# #"], 'X': ["# #", "# #", " # ", "# #", "# #"],
    'Y': ["# #", "# #", " # ", " # ", " # "], 'Z': ["###", "  #", " # ", "#  ", "###"],
    ' ': ["   "] * 5, ':': ['   ', ' # ', '   ', ' # ', '   '], '<': ['  #', ' # ', '#  ', ' # ', '  #'], '>': ['#  ', ' # ', '  #', ' # ', '#  '], '_': ['   ', '   ', '   ', '   ', '###'], '-': ["   ", "   ", "###", "   ", "   "], '?': ["## ", "  #", " # ", "   ", " # "],
}
_T.update({  # punctuation for posters (world map): apostrophe, comma, full stop, plus, bang, ampersand
    "'": [" # ", " # ", "   ", "   ", "   "], ',': ["   ", "   ", "   ", " # ", "#  "], '.': ["   ", "   ", "   ", "   ", " # "],
    '+': ["   ", " # ", "###", " # ", "   "], '!': [" # ", " # ", " # ", "   ", " # "], '&': [" # ", "# #", " # ", "# #", " ##"],
})


def tiny_width(text):
    return max(0, len(text) * 4 - 1)


def draw_tiny(px, x, y, text, color, shadow=None):
    """3x5 caps/digits; top-left at (x, y). Returns width."""
    for k, ch in enumerate(text.upper()):
        rows = _T.get(ch, _T['?'])
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == '#':
                    if shadow is not None:
                        px.set(x + k * 4 + i + 1, y + j + 1, shadow)
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c == '#':
                    px.set(x + k * 4 + i, y + j, color)
    return tiny_width(text)


# ---------------------------------------------------------------- accents (16 Nov 2026: names keep their ñ / é)
# Accented letters are drawn as their base glyph plus a mark in the 2 rows above it (both fonts are caps).
_MARKS = {
    'tilde': [(0, 1), (1, 0), (2, 0), (3, 1), (4, 0)],
    'acute': [(2, 1), (3, 0)],
    'grave': [(1, 0), (2, 1)],
    'circ': [(1, 1), (2, 0), (3, 1)],
    'uml': [(1, 1), (3, 1)],
    'ring': [(2, 0)],
}
_ACC = {'\u0303': 'tilde', '\u0301': 'acute', '\u0300': 'grave', '\u0302': 'circ', '\u0308': 'uml', '\u030a': 'ring'}


def accent_of(ch):
    """'ñ' -> 'tilde', 'É' -> 'acute', plain letters -> None."""
    d = unicodedata.normalize('NFD', ch)
    for m in d[1:]:
        if m in _ACC:
            return _ACC[m]
    return None


def _scale_mark(mark, w):
    pts = _MARKS[mark]
    if w >= 5:
        return pts
    # narrow (3-wide) glyphs: squeeze the 5-wide mark into 3 columns
    out = set()
    for (i, j) in pts:
        out.add((min(w - 1, i * w // 5), j))
    return sorted(out)


_draw_text_plain = draw_text
_draw_tiny_plain = draw_tiny


def draw_text(px, x, y, text, color, shadow=None):
    """5x7 text with accent marks drawn above accented letters (needs 2 px of headroom)."""
    w = _draw_text_plain(px, x, y, text, color, shadow)
    cx = x
    for ch in text:
        n = _norm(ch)
        if n == ' ':
            cx += SPACE_W + 1
            continue
        gw = len(_G[n or '?'][0])
        mk = accent_of(ch)
        if mk:
            for (i, j) in _scale_mark(mk, gw):
                px.set(cx + i, y - 2 + j, color)
        cx += gw + 1
    return w


def draw_tiny(px, x, y, text, color, shadow=None):
    """3x5 caps/digits with accent marks above (2 px headroom); accented letters use their base glyph."""
    base = ''.join(unicodedata.normalize('NFD', ch)[0] for ch in text)
    w = _draw_tiny_plain(px, x, y, base, color, shadow)
    for k, ch in enumerate(text):
        mk = accent_of(ch)
        if mk:
            for (i, j) in _scale_mark(mk, 3):
                px.set(x + k * 4 + i, y - 2 + j, color)
    return w
