"""Builds games/globe-sleuths/worldmap.js from Natural Earth country shapes.

Usage:  python tools/make_worldmap.py path/to/countries-110m.json

The input is world-atlas's countries-110m.json (Natural Earth 1:110m, public domain, TopoJSON).
The game can't fetch files (it must run from file://), so the map is baked into a plain script.

Projection: Equal Earth (equal-area), so continents show their true relative sizes.
Names: internationally recognized, UN-style short names (e.g. "Türkiye", "North Macedonia").
Somaliland and N. Cyprus are merged into Somalia and Cyprus (they aren't UN-recognized states).
Each country is tagged with a continent using tools/globe-sleuths-continents.json (rough outlines).
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
S = 60.0  # map units per projection unit: the world is about 325 x 158 units

RENAME = {
    'United States of America': 'United States', 'Dem. Rep. Congo': 'DR Congo', 'Central African Rep.': 'Central African Republic',
    'Bosnia and Herz.': 'Bosnia and Herzegovina', 'S. Sudan': 'South Sudan', 'Eq. Guinea': 'Equatorial Guinea',
    'Dominican Rep.': 'Dominican Republic', 'Solomon Is.': 'Solomon Islands', 'Macedonia': 'North Macedonia',
    'eSwatini': 'Eswatini', 'Turkey': 'Türkiye', 'Czechia': 'Czechia', 'Falkland Is.': 'Falkland Islands',
    'Fr. S. Antarctic Lands': 'French Southern Lands', 'W. Sahara': 'Western Sahara',
}
MERGE = {'Somaliland': 'Somalia', 'N. Cyprus': 'Cyprus'}
# Shapes with no name label on the map (disputed, or too small to matter).
NO_LABEL = {'Western Sahara', 'Taiwan', 'Falkland Islands', 'French Southern Lands', 'Kosovo', 'Palestine', 'Israel', 'New Caledonia', 'Puerto Rico'}
CONT_FIX = {
    'Türkiye': 'AS', 'Kazakhstan': 'AS', 'Egypt': 'AF', 'Greenland': 'NA', 'Panama': 'NA', 'Cyprus': 'EU',
    'Georgia': 'AS', 'Armenia': 'AS', 'Azerbaijan': 'AS', 'Indonesia': 'AS', 'Papua New Guinea': 'AU',
    'Timor-Leste': 'AS', 'French Southern Lands': 'AN', 'Falkland Islands': 'SA', 'Fiji': 'AU', 'Vanuatu': 'AU',
    'Solomon Islands': 'AU', 'New Caledonia': 'AU', 'Qatar': 'AS', 'Bahamas': 'NA', 'Trinidad and Tobago': 'SA', 'Antarctica': 'AN',
    'United States': 'NA', 'France': 'EU', 'Norway': 'EU', 'Spain': 'EU', 'Portugal': 'EU', 'Chile': 'SA', 'Ecuador': 'SA',
}
RUSSIA_SPLIT_LON = 60.0  # the Urals, roughly: west of it is Europe
# Natural Earth draws Crimea inside Russia; the internationally recognized border puts it in Ukraine.
CRIMEA_POINT = (34.1, 45.2)


def equal_earth(lon, lat):
    A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
    M = math.sqrt(3) / 2
    lam, phi = math.radians(lon), math.radians(lat)
    th = math.asin(M * math.sin(phi))
    t2 = th * th; t6 = t2 * t2 * t2
    x = lam * math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x * S, -y * S


def decode_arcs(topo):
    sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
    out = []
    for arc in topo['arcs']:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        out.append(pts)
    return out


def ring_pts(ring, arcs):
    pts = []
    for a in ring:
        seg = arcs[a] if a >= 0 else arcs[~a][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts


def area_centroid(pts):
    a = cx = cy = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i + 1) % len(pts)]
        c = x0 * y1 - x1 * y0
        a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    if abs(a) < 1e-9:
        return 0, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    return a / 2, cx / (3 * a), cy / (3 * a)


def inside(pt, poly):
    x, y = pt; ins = False
    for i in range(len(poly)):
        x0, y0 = poly[i]; x1, y1 = poly[i - 1]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            ins = not ins
    return ins


def clip_lon(pts, keep_west):
    """Sutherland-Hodgman clip of a lon/lat ring against lon = RUSSIA_SPLIT_LON."""
    L = RUSSIA_SPLIT_LON
    keep = (lambda p: p[0] <= L) if keep_west else (lambda p: p[0] >= L)
    out = []
    for i in range(len(pts)):
        cur, prev = pts[i], pts[i - 1]
        if keep(cur):
            if not keep(prev):
                t = (L - prev[0]) / (cur[0] - prev[0]); out.append((L, prev[1] + t * (cur[1] - prev[1])))
            out.append(cur)
        elif keep(prev):
            t = (L - prev[0]) / (cur[0] - prev[0]); out.append((L, prev[1] + t * (cur[1] - prev[1])))
    return out


def unseam(pts):
    """A ring or line that jumps across the 180° meridian is moved to one side (e.g. 179 -> 181).
    Antarctica is left alone: it wraps the whole globe, and its seam edges are dropped from the coasts."""
    if pts and min(p[1] for p in pts) < -60:
        return pts
    if any(abs(pts[i][0] - pts[i - 1][0]) > 180 for i in range(1, len(pts))):
        return [(x + 360 if x < 0 else x, y) for x, y in pts]
    return pts


def path_d(rings):
    d = []
    for r in map(unseam, rings):
        if len(r) < 3:
            continue
        pp = [equal_earth(*p) for p in r]
        d.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pp) + 'Z')
    return ''.join(d)


def line_d(pts):
    pp = [equal_earth(*p) for p in unseam(pts)]
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pp)


def main(src):
    topo = json.load(open(src, encoding='utf-8'))
    conts = json.load(open(os.path.join(HERE, 'globe-sleuths-continents.json'), encoding='utf-8'))
    arcs = decode_arcs(topo)
    geoms = topo['objects']['countries']['geometries']

    def poly_name(raw, poly):
        name = MERGE.get(raw, raw)
        if name == 'Russia' and inside(CRIMEA_POINT, ring_pts(poly[0], arcs)):
            return 'Ukraine'
        return name

    # Which countries use each arc (for drawing each border once, and skipping merged ones).
    owner = {}
    for gi, g in enumerate(geoms):
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
        for poly in polys:
            name = poly_name(g['properties']['name'], poly)
            for ring in poly:
                for a in ring:
                    owner.setdefault(a if a >= 0 else ~a, []).append(name)

    countries = {}
    for g in geoms:
        polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
        for poly in polys:
            n = poly_name(g['properties']['name'], poly)
            countries.setdefault(RENAME.get(n, n), []).extend(ring_pts(r, arcs) for r in poly)

    out = []
    for name, rings in countries.items():
        # Biggest ring (in projected area) sets the label spot and the continent.
        rings = [unseam(r) for r in rings]
        best = max(rings, key=lambda r: abs(area_centroid([equal_earth(*p) for p in r])[0]))
        _, cx, cy = area_centroid([equal_earth(*p) for p in best])
        _, lx, ly = area_centroid(best)
        cont = CONT_FIX.get(name)
        if not cont:
            for c, poly in conts:
                if c and inside((lx, ly), poly):
                    cont = c; break
        if name == 'Russia':
            west = [clip_lon(r, True) for r in rings]; east = [clip_lon(r, False) for r in rings]
            out.append({'n': name, 'c': 'EU', 'd': path_d(west), 'lab': None})
            out.append({'n': name, 'c': 'AS', 'd': path_d(east), 'lab': [round(x, 1) for x in equal_earth(100, 62)]})
            continue
        if not cont:
            print('no continent for', name, file=sys.stderr); cont = ''
        xs = [equal_earth(*p)[0] for r in rings for p in r]; ys = [equal_earth(*p)[1] for r in rings for p in r]
        bw = max(equal_earth(*p)[0] for p in best) - min(equal_earth(*p)[0] for p in best)
        out.append({'n': name, 'c': cont, 'd': path_d(rings),
                    'lab': None if name in NO_LABEL else [round(cx, 1), round(cy, 1)],
                    'w': round(bw, 1), 'box': [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]})

    # Borders: arcs shared by two different countries. Coasts: arcs used once (minus the 180° / pole seams).
    borders, coasts = [], []
    for a, names in owner.items():
        pts = arcs[a]
        if len(names) >= 2:
            if names[0] != names[1]:
                borders.append(line_d(pts))
        else:
            if all(abs(p[0]) >= 179.99 or p[1] <= -89.9 for p in pts):
                continue
            coasts.append(line_d(pts))

    js = ('// GENERATED by tools/make_worldmap.py from Natural Earth 1:110m countries (public domain) -- do not edit by hand.\n'
          '// Equal Earth projection (equal-area). x right, y down; the world is about 325 x 158 map units.\n'
          '(function () {\n  \'use strict\';\n'
          f'  const S = {S};\n'
          '  function project(lon, lat) {\n'
          '    const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;\n'
          '    const lam = lon * Math.PI / 180, th = Math.asin(M * Math.sin(lat * Math.PI / 180)), t2 = th * th, t6 = t2 * t2 * t2;\n'
          '    const x = lam * Math.cos(th) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));\n'
          '    const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));\n'
          '    return [x * S, -y * S];\n  }\n'
          f'  const COUNTRIES = {json.dumps(out, ensure_ascii=False, separators=(",", ":"))};\n'
          f'  const BORDERS = {json.dumps("".join(borders))};\n'
          f'  const COASTS = {json.dumps("".join(coasts))};\n'
          '  window.MDMap = { S, project, COUNTRIES, BORDERS, COASTS };\n'
          '})();\n')
    dst = os.path.join(ROOT, 'games', 'globe-sleuths', 'worldmap.js')
    open(dst, 'w', encoding='utf-8', newline='\n').write(js)
    print('wrote', dst, len(js), 'bytes,', len(out), 'shapes')


if __name__ == '__main__':
    main(sys.argv[1])
