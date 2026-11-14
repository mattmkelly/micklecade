"""Draws the MickleCade app icon (an arcade joystick topped with a swirly marble) as PNGs.

Pure Python -- shapes are signed distances, so each size is drawn sharp, not scaled.
Usage: python make_icon.py <out_dir>
"""
import math, struct, sys, zlib, os


def png(path, w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)


def hexc(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def mix(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def sd_round_box(x, y, cx, cy, hx, hy, r):
    qx = abs(x - cx) - hx + r
    qy = abs(y - cy) - hy + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def sd_ellipse(x, y, cx, cy, rx, ry):
    k = math.hypot((x - cx) / rx, (y - cy) / ry)
    return (k - 1) * min(rx, ry)


PINK, CYAN, YELLOW = hexc('#ff4fd8'), hexc('#4ff0ff'), hexc('#ffe14f')
ORANGE = hexc('#ff6b2c')
TOP, BOTTOM = hexc('#34116e'), hexc('#0c0624')
MC, MR = (0.5, 0.375), 0.215                           # the marble
LIGHT = (-0.45, -0.6, 0.66)
LL = math.sqrt(sum(c * c for c in LIGHT))
LIGHT = tuple(c / LL for c in LIGHT)
SPARKLES = [(0.19, 0.2, 0.075, YELLOW), (0.83, 0.25, 0.06, CYAN), (0.84, 0.58, 0.04, YELLOW), (0.16, 0.6, 0.035, PINK)]


def sparkle_cover(x, y, px, sx, sy, s):
    # 4-point star: |dx|^.5 + |dy|^.5 < s^.5, supersampled 4x4 near its edge
    if abs(x - sx) > s or abs(y - sy) > s:
        return 0.0
    hit = 0
    for i in range(4):
        for j in range(4):
            dx = abs(x - sx + (i - 1.5) * px / 4) / s
            dy = abs(y - sy + (j - 1.5) * px / 4) / s
            if math.sqrt(dx) + math.sqrt(dy) < 1:
                hit += 1
    return hit / 16


def shade(x, y, size):
    px = 1 / size
    cov = lambda d: clamp(0.5 - d / px)
    # background, with a soft pink glow behind the marble
    col = mix(TOP, BOTTOM, y)
    g = math.exp(-((math.hypot(x - 0.5, y - 0.42) / 0.36) ** 2))
    col = mix(col, PINK, 0.32 * g)

    # neon frame
    d = abs(sd_round_box(x, y, 0.5, 0.5, 0.435, 0.435, 0.15)) - 0.014
    col = mix(col, PINK, 0.55 * math.exp(-max(d, 0) / 0.025))
    col = mix(col, mix(PINK, [1, 1, 1], 0.35), cov(d))

    for (sx, sy, s, c) in SPARKLES:
        a = sparkle_cover(x, y, px, sx, sy, s)
        if a:
            col = mix(col, mix(c, [1, 1, 1], 0.3), a)

    # joystick base: body, then its top
    d = sd_round_box(x, y, 0.5, 0.86, 0.29, 0.055, 0.045)
    col = mix(col, hexc('#8e0f22'), cov(d))
    d = sd_ellipse(x, y, 0.5, 0.8, 0.29, 0.075)
    col = mix(col, mix(hexc('#ff4a62'), hexc('#c41730'), clamp((y - 0.73) / 0.15)), cov(d))
    d = sd_ellipse(x, y, 0.5, 0.79, 0.075, 0.024)
    col = mix(col, hexc('#4a0812'), cov(d))
    # the stick, lit from the left
    d = sd_round_box(x, y, 0.5, 0.63, 0.03, 0.16, 0.03)
    col = mix(col, mix(hexc('#f2f6ff'), hexc('#8a93ad'), clamp((x - 0.47) / 0.06)), cov(d))

    # the marble
    dx, dy = (x - MC[0]) / MR, (y - MC[1]) / MR
    rr = dx * dx + dy * dy
    d = (math.sqrt(rr) - 1) * MR
    if d < px:
        nz = math.sqrt(max(0.0, 1 - min(rr, 1)))
        nx, ny = dx, dy
        lon = math.atan2(nx, nz + 1e-6)
        lat = math.asin(clamp(ny, -1, 1))
        stripe = math.sin(lat * 6.5 + math.sin(lon * 2.4) * 1.4 + lon * 1.3)
        base = mix(ORANGE, YELLOW, clamp((stripe - 0.25) * 6))
        lam = max(0.0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2])
        c = [v * (0.32 + 0.85 * lam) for v in base]
        # a soft sheen plus a crisp window-shaped glint, so it reads as glass
        sheen = math.exp(-(((dx + 0.3) ** 2 + (dy + 0.35) ** 2) / 0.12))
        glint = clamp((0.2 - math.hypot((dx + 0.42) * 1.25, dy + 0.45)) / 0.04)
        c = mix(c, [1, 1, 1], 0.28 * sheen)
        c = mix(c, [1, 1, 1], 0.95 * glint)
        c = mix(c, hexc('#5a1400'), 0.5 * clamp((math.sqrt(rr) - 0.82) / 0.18))   # rim
        col = mix(col, c, cov(d))
    return col


def render(size, path):
    rows = []
    for j in range(size):
        y = (j + 0.5) / size
        row = []
        for i in range(size):
            c = shade((i + 0.5) / size, y, size)
            row += [int(clamp(v) * 255 + 0.5) for v in c]
        rows.append(row)
    png(path, size, size, rows)


if __name__ == '__main__':
    out = sys.argv[1]
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (48, 'favicon-48.png')]:
        render(size, os.path.join(out, name))
        print('wrote', name)
