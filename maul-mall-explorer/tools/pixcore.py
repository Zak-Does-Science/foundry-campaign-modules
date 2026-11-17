"""Shared pixel helpers for the MAUL mall renderer."""


def hx(s):
    s = s.lstrip('#')
    a = int(s[6:8], 16) if len(s) == 8 else 255
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3)) + (255,)


def dk(c, f):
    return (min(255, int(c[0] * f)), min(255, int(c[1] * f)), min(255, int(c[2] * f)), 255)


def alpha(c, a):
    return (c[0], c[1], c[2], a)


def hsh(*v):
    h = 2166136261
    for n in v:
        h ^= (int(n) & 0xffffffff)
        h = (h * 16777619) & 0xffffffff
    h ^= h >> 13
    h = (h * 0x5bd1e995) & 0xffffffff
    h ^= h >> 15
    return h


def T(*rows):
    """Validated 16-wide template."""
    for r in rows:
        if len(r) != 16:
            raise ValueError(f"template row len {len(r)} != 16: {r!r}")
    return list(rows)


class PX:
    def __init__(self, img):
        self.img = img
        self.p = img.load()
        self.w, self.h = img.size

    def set(self, x, y, c):
        if c is None or not (0 <= x < self.w and 0 <= y < self.h):
            return
        if c[3] < 255:
            if c[3] == 0:
                return
            o = self.p[x, y]
            if o[3] == 0:
                self.p[x, y] = c
                return
            a = c[3] / 255
            self.p[x, y] = (int(o[0] + (c[0] - o[0]) * a), int(o[1] + (c[1] - o[1]) * a),
                            int(o[2] + (c[2] - o[2]) * a), max(o[3], c[3]))
        else:
            self.p[x, y] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.p[x, y]
        return (0, 0, 0, 0)

    def rect(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.set(i, j, c)

    def darken(self, x, y, f=0.72):
        if 0 <= x < self.w and 0 <= y < self.h:
            o = self.p[x, y]
            if o[3] == 0:
                self.p[x, y] = (10, 6, 20, int(255 * (1 - f) * 1.4))
            else:
                self.p[x, y] = (int(o[0] * f), int(o[1] * f), int(o[2] * f), o[3])

    def drect(self, x, y, w, h, f):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.darken(i, j, f)

    def blit(self, ox, oy, rows, cmap, flip=False):
        for j, row in enumerate(rows):
            n = len(row)
            for i, ch in enumerate(row):
                if ch == '.' or ch == '?':
                    continue
                xx = ox + (n - 1 - i if flip else i)
                if ch == 'd':
                    self.darken(xx, oy + j, 0.72)
                    continue
                c = cmap.get(ch)
                if c is not None:
                    self.set(xx, oy + j, c)
