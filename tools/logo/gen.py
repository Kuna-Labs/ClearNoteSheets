"""
Generates the ClearNote crystal note as real 3D facet geometry projected to SVG.

Outputs
  sprite.svg            themeable <symbol> (tones come from CSS custom properties)
  note-light.svg        standalone, for light backgrounds
  note-dark.svg         standalone, for dark backgrounds
"""
import math, json, sys
import numpy as np

VB_W, VB_H = 200, 240
rng = np.random.default_rng(7)

def unit(v):
    v = np.asarray(v, float); n = np.linalg.norm(v); return v / n if n else v

def rot_x(a):
    c, s = math.cos(a), math.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def rot_y(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]])
def rot_z(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c,-s,0],[s,c,0],[0,0,1]])

# ---------------------------------------------------------------- brilliant cut
def brilliant():
    """Round brilliant, girdle radius 1, table up (+z). Returns list of faces (list of 3D points)."""
    R_TABLE, HC, G, HP, R_STAR = 0.55, 0.17, 0.035, 0.44, 0.79
    def crown_z(r):  # height on the crown cone
        return G/2 + (HC - G/2) * (1 - r) / (1 - R_TABLE)
    ang = lambda deg: math.radians(deg)
    pt = lambda r, deg, z: np.array([r*math.cos(ang(deg)), r*math.sin(ang(deg)), z])
    T  = [pt(R_TABLE, 45*k, HC) for k in range(8)]
    S  = [pt(R_STAR, 45*k + 22.5, crown_z(R_STAR*math.cos(ang(11)))) for k in range(8)]
    Gu = [pt(1.0, 22.5*j, G/2) for j in range(16)]
    Gl = [pt(1.0, 22.5*j, -G/2) for j in range(16)]
    C  = np.array([0, 0, -HP])
    A  = [C + 0.80*(Gl[2*k] - C) for k in range(8)]
    faces = [("table", T)]
    for k in range(8):
        k1 = (k+1) % 8
        faces.append(("star",   [T[k], T[k1], S[k]]))
        faces.append(("bezel",  [T[k], S[(k-1) % 8], Gu[2*k], S[k]]))
        faces.append(("ugird",  [S[k], Gu[2*k], Gu[2*k+1]]))
        faces.append(("ugird",  [S[k], Gu[2*k+1], Gu[(2*k+2) % 16]]))
        faces.append(("lgird",  [A[k], Gl[2*k], Gl[2*k+1]]))
        faces.append(("lgird",  [A[k1], Gl[2*k+1], Gl[(2*k+2) % 16]]))
        faces.append(("pmain",  [C, A[k], Gl[2*k+1], A[k1]]))
    for j in range(16):
        j1 = (j+1) % 16
        faces.append(("band", [Gu[j], Gu[j1], Gl[j1], Gl[j]]))
    return faces

# ---------------------------------------------------------------- crystal bar (stem)
def prism_between(p0, p1, r0, r1, sides=6, twist=0.0):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    axis = unit(p1 - p0)
    ref = np.array([0, 0, 1.0]) if abs(axis[2]) < .9 else np.array([1.0, 0, 0])
    u = unit(np.cross(axis, ref)); v = np.cross(axis, u)
    ring = lambda c, r: [c + r*(math.cos(twist + 2*math.pi*i/sides)*u + math.sin(twist + 2*math.pi*i/sides)*v) for i in range(sides)]
    b, t = ring(p0, r0), ring(p1, r1)
    faces = [("side", [b[i], b[(i+1) % sides], t[(i+1) % sides], t[i]]) for i in range(sides)]
    faces.append(("cap", t[::-1])); faces.append(("cap", b))
    return faces

# ---------------------------------------------------------------- faceted flag
def flag(outer, inner, thick, ridge_lift):
    """outer/inner: 2D polylines in view space sharing the last point (the tip)."""
    o = [np.array([x, y, 0.0]) for x, y in outer]
    i = [np.array([x, y, 0.0]) for x, y in inner]
    n = len(o)
    ridge_f, ridge_b = [], []
    for k in range(n):
        m = (o[k] + i[k]) / 2
        w = np.linalg.norm(o[k] - i[k])
        lift = ridge_lift * (0.35 + 0.65 * w / max(np.linalg.norm(o[0] - i[0]), 1e-6))
        jitter = 0.08 * np.array([0, 0, 1]) * ridge_lift * math.sin(k * 2.3)
        ridge_f.append(m + np.array([0, 0, thick/2 + lift]) + jitter)
        ridge_b.append(m + np.array([0, 0, -thick/2 - lift*0.8]))
    of = [p + np.array([0, 0, thick/2]) for p in o]; ob = [p - np.array([0, 0, thick/2]) for p in o]
    inf = [p + np.array([0, 0, thick/2]) for p in i]; inb = [p - np.array([0, 0, thick/2]) for p in i]
    faces = []
    for k in range(n-1):
        # front: two strips split into triangles so every facet is planar
        faces += [("ffront", [of[k], of[k+1], ridge_f[k+1]]), ("ffront", [of[k], ridge_f[k+1], ridge_f[k]])]
        faces += [("ffront", [ridge_f[k], ridge_f[k+1], inf[k+1]]), ("ffront", [ridge_f[k], inf[k+1], inf[k]])]
        faces += [("fback",  [ob[k+1], ob[k], ridge_b[k]]), ("fback", [ob[k+1], ridge_b[k], ridge_b[k+1]])]
        faces += [("fback",  [ridge_b[k+1], ridge_b[k], inb[k]]), ("fback", [ridge_b[k+1], inb[k], inb[k+1]])]
        faces += [("fside",  [of[k+1], of[k], ob[k], ob[k+1]])]
        faces += [("fside",  [inf[k], inf[k+1], inb[k+1], inb[k]])]
    faces += [("fside", [of[0], inf[0], inb[0], ob[0]])]
    return faces

# ---------------------------------------------------------------- build the scene
def scene():
    parts = []
    # gem head: tilt so the table faces up-right toward the viewer, pavilion points down-left
    M = rot_z(math.radians(-38)) @ rot_x(math.radians(-50)) @ rot_z(math.radians(11))
    center, scale = np.array([70.0, 190.0, 0.0]), 45.0
    for kind, f in brilliant():
        pts = [center + scale * (M @ p) * np.array([1, -1, 1]) for p in f]
        parts.append(("gem", kind, pts))
    # stem: slim hexagonal crystal, slightly tapered, entering the gem near the girdle
    for kind, f in prism_between([99.0, 196, -6], [125.5, 20, -2], 6.0, 4.6, sides=8, twist=0.2):
        parts.append(("stem", kind, f))
    # flag
    global OUTER, INNER
    outer = [(126.0, 17.0), (156.0, 33.0), (180.0, 55.0), (191.0, 82.0), (189.0, 114.0), (178.0, 150.0)]
    inner = [(127.5, 54.0), (146.0, 66.0), (163.0, 82.0), (173.0, 101.0), (177.5, 124.0), (178.0, 150.0)]
    OUTER, INNER = outer, inner
    for kind, f in flag(outer, inner, thick=7.0, ridge_lift=6.0):
        parts.append(("flag", kind, f))
    return parts

LIGHT = unit([-0.45, -0.75, 0.55])   # SVG y is down, so -y means "from above"
VIEW = np.array([0, 0, 1.0])

def env(r, seed):
    """Fake environment: bright sky above, soft horizon, plus per-facet scintillation."""
    sky = 0.5 + 0.5 * (-r[1])                   # reflections pointing up are bright
    bands = 0.5 + 0.5 * math.sin(6.0 * r[0] + 4.0 * r[1] + seed)
    return 0.55 * sky + 0.45 * bands

def shade_faces(parts):
    out = []
    for idx, (part, kind, pts) in enumerate(parts):
        P = np.array(pts)
        c = P.mean(axis=0)
        n = unit(np.cross(P[1] - P[0], P[2] - P[0]))
        # orient outward: away from part centroid
        out.append([part, kind, P, n, c])
    # outward orientation per part
    centroids = {}
    for part in set(o[0] for o in out):
        centroids[part] = np.mean([o[4] for o in out if o[0] == part], axis=0)
    shaded = []
    for part, kind, P, n, c in out:
        if np.dot(n, c - centroids[part]) < 0:
            n = -n; P = P[::-1]
        front = n[2] > 0.0
        diff = max(0.0, float(np.dot(n, LIGHT)))
        r = 2 * np.dot(n, VIEW) * n - VIEW
        spec = max(0.0, float(np.dot(unit(r), LIGHT))) ** 18
        e = env(r, rng.uniform(0, 6.28))
        tone = 0.35 * diff + 0.55 * e + 0.6 * spec
        if kind in ("table",): tone = 0.55 + 0.35 * e
        if kind in ("band", "cap"): tone *= 0.7
        shaded.append(dict(part=part, kind=kind, P=P, n=n, depth=float(c[2]), front=front, tone=float(np.clip(tone, 0, 1))))
    for part in set(f["part"] for f in shaded):
        fr = [f for f in shaded if f["part"] == part and f["front"]]
        order = sorted(fr, key=lambda f: f["tone"])
        for i, f in enumerate(order):
            f["tone"] = float(np.clip(0.55 * (i / max(1, len(order) - 1)) + 0.45 * f["tone"], 0, 1))
    return shaded

def hull(points):
    pts = sorted(set((round(p[0], 3), round(p[1], 3)) for p in points))
    if len(pts) < 3: return pts
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def fmt(P):
    return " ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in P)

def render(shaded, mode):
    """mode: 'sprite' (CSS classes), 'light', 'dark' (literal colors)."""
    # painter's order: back faces of everything first, then front faces; within each, by depth
    ORDER = {"stem": 0, "flag": 1, "gem": 2}
    back = sorted([f for f in shaded if not f["front"] and f["part"] != "gem"], key=lambda f: (ORDER[f["part"]], f["depth"]))
    front = sorted([f for f in shaded if f["front"] and f["part"] != "gem"], key=lambda f: (ORDER[f["part"]], f["depth"]))
    # the gem is drawn last, as a unit (its own back faces, then front), so it sits over the stem's foot
    front += sorted([f for f in shaded if not f["front"] and f["part"] == "gem"], key=lambda f: f["depth"])
    front += sorted([f for f in shaded if f["front"] and f["part"] == "gem"], key=lambda f: f["depth"])
    def tone_class(t, is_front):
        if not is_front:
            return "cnb" + str(1 + min(2, int(t * 3)))
        return "cnt" + str(1 + min(6, int(t * 7)))
    LIT = {
        "light": dict(t=["rgba(23,43,59,.30)", "rgba(23,43,59,.16)", "rgba(96,120,139,.10)", "rgba(255,255,255,.22)",
                        "rgba(255,255,255,.45)", "rgba(255,255,255,.70)", "rgba(255,255,255,.94)"],
                      b=["rgba(23,43,59,.07)", "rgba(96,120,139,.06)", "rgba(255,255,255,.18)"],
                      line="rgba(255,255,255,.92)", bline="rgba(96,120,139,.32)", edge="rgba(23,43,59,.55)", prism=.5, spark="#FFFFFF"),
        "dark": dict(t=["rgba(8,20,30,.34)", "rgba(8,20,30,.16)", "rgba(185,201,214,.06)", "rgba(185,201,214,.16)",
                       "rgba(205,222,235,.30)", "rgba(220,234,245,.48)", "rgba(240,248,255,.72)"],
                     b=["rgba(0,0,0,.14)", "rgba(96,120,139,.10)", "rgba(185,201,214,.10)"],
                     line="rgba(225,238,248,.6)", bline="rgba(225,238,248,.22)", edge="rgba(225,236,245,.62)", prism=.36, spark="#FFFFFF"),
    }
    out = []
    def poly(f, cls, is_front):
        if mode == "sprite":
            extra = " cnl" if is_front else " cnbl"
            return f'<polygon class="{cls}{extra}" points="{fmt(f["P"])}"/>'
        L = LIT[mode]
        fill = L["t"][int(cls[3]) - 1] if cls.startswith("cnt") else L["b"][int(cls[3]) - 1]
        stroke = (f' stroke="{L["line"]}" stroke-width=".45" stroke-linejoin="round"' if is_front
                  else f' stroke="{L["bline"]}" stroke-width=".35" stroke-linejoin="round"')
        return f'<polygon fill="{fill}"{stroke} points="{fmt(f["P"])}"/>'
    for f in back:
        out.append(poly(f, tone_class(f["tone"], False), False))
    def outline(points, cls="cne"):
        d = "M" + " L".join(f"{p[0]:.2f},{p[1]:.2f}" for p in points) + "Z"
        if mode == "sprite":
            return f'<path class="{cls}" d="{d}"/>'
        return f'<path fill="none" stroke="{LIT[mode]["edge"]}" stroke-width="1" stroke-linejoin="round" d="{d}"/>'
    stem_pts = [p for f in shaded if f["part"] == "stem" for p in f["P"]]
    last_stem = max(i for i, f in enumerate(front) if f["part"] == "stem")
    for i, f in enumerate(front):
        out.append(poly(f, tone_class(f["tone"], f["front"]), f["front"]))
        if i == last_stem:
            out.append(outline(hull(stem_pts)))
            # bright glint running up the stem's leading edge
            g = 'class="cng"' if mode == "sprite" else 'stroke="#FFFFFF" stroke-width=".9" stroke-linecap="round" opacity=".85"'
            out.append(f'<path {g} fill="none" d="M98.6,176 L121.4,27"/>')
    table = [f for f in shaded if f["kind"] == "table"][0]
    if mode == "sprite":
        out.append(f'<polygon class="cnsh" fill="url(#cnSheen)" points="{fmt(table["P"])}"/>')
    else:
        out.append(f'<polygon fill="url(#cnSheen)" points="{fmt(table["P"])}"/>')
    # silhouettes give the crystal a crisp cut edge, like the brand artwork
    outlines = []
    pts = [p for f in shaded if f["part"] == "gem" for p in f["P"]]
    outlines.append(hull(pts))
    outlines.append(OUTER + INNER[::-1][1:])
    for o in outlines:
        d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in [(p[0], p[1]) for p in o]) + "Z"
        if mode == "sprite":
            out.append(f'<path class="cne" d="{d}"/>')
        else:
            out.append(f'<path fill="none" stroke="{LIT[mode]["edge"]}" stroke-width="1" stroke-linejoin="round" d="{d}"/>')
    # dispersion: rainbow fire on a handful of bright front facets of gem and flag
    bright = [f for f in front if f["part"] in ("gem", "flag") and f["kind"] not in ("table", "band")]
    bright.sort(key=lambda f: -f["tone"])
    fire = bright[3:18:2]
    for k, f in enumerate(fire):
        gid = f"cnFire{k % 3}"
        if mode == "sprite":
            out.append(f'<polygon class="cnp" fill="url(#{gid})" points="{fmt(f["P"])}"/>')
        else:
            out.append(f'<polygon fill="url(#{gid})" opacity="{LIT[mode]["prism"]}" points="{fmt(f["P"])}"/>')
    return out, fire

def silhouette_paths():
    # outlines that give the crystal definition on pale backgrounds
    return []

def build():
    parts = scene()
    shaded = shade_faces(parts)
    return shaded

def gradients():
    return """<linearGradient id="cnFire0" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#FF8A7A"/><stop offset=".22" stop-color="#FFC56B"/><stop offset=".45" stop-color="#FFF29A"/>
<stop offset=".62" stop-color="#8EF0C0"/><stop offset=".8" stop-color="#7DB7FF"/><stop offset="1" stop-color="#C69BFF"/></linearGradient>
<linearGradient id="cnFire1" x1="1" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#7DB7FF"/><stop offset=".35" stop-color="#8EF0C0"/><stop offset=".6" stop-color="#FFF29A"/>
<stop offset="1" stop-color="#FF9A8B"/></linearGradient>
<linearGradient id="cnFire2" x1="0" y1="1" x2="1" y2="0">
<stop offset="0" stop-color="#C69BFF"/><stop offset=".4" stop-color="#7DB7FF"/><stop offset=".7" stop-color="#9FF0C8"/>
<stop offset="1" stop-color="#FFD27A"/></linearGradient>
<linearGradient id="cnSheen" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".38" stop-color="#FFFFFF" stop-opacity=".08"/>
<stop offset=".52" stop-color="#FFFFFF" stop-opacity=".35"/><stop offset=".6" stop-color="#FFFFFF" stop-opacity="0"/>
<stop offset="1" stop-color="#FFFFFF" stop-opacity=".12"/></linearGradient>
<radialGradient id="cnSparkGlow"><stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset=".25" stop-color="#FFFFFF" stop-opacity=".55"/>
<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>"""

REFRACT = '''<filter id="cnRefract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="11" result="noise"/>
<feGaussianBlur in="noise" stdDeviation="3" result="soft"/>
<feDisplacementMap in="SourceGraphic" in2="soft" scale="40" xChannelSelector="R" yChannelSelector="G"/>
</filter>'''

def star(cx, cy, r_long, r_short, rot=0):
    pts = []
    for k in range(8):
        a = math.radians(rot + 45 * k)
        r = r_long if k % 2 == 0 else r_short
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + "Z"

def sparkles(mode):
    # main sparkle sits on the crown's leading edge, a smaller one on the flag's corner
    s = []
    fill = 'class="cns"' if mode == "sprite" else 'fill="#FFFFFF"'
    s.append(f'<circle cx="93" cy="160" r="15" fill="url(#cnSparkGlow)" opacity=".8"/>')
    s.append(f'<path {fill} d="{star(93, 160, 17, 1.3)}"/>')
    s.append(f'<path {fill} opacity=".7" d="{star(93, 160, 7, .8, 45)}"/>')
    s.append(f'<circle cx="180" cy="55" r="7" fill="url(#cnSparkGlow)" opacity=".7"/>')
    s.append(f'<path {fill} opacity=".9" d="{star(180, 55, 7.5, .8)}"/>')
    s.append(f'<circle cx="126" cy="18" r="4" fill="url(#cnSparkGlow)" opacity=".6"/>')
    return s

if __name__ == "__main__":
    shaded = build()
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    for mode in ("sprite", "light", "dark"):
        polys, fire = render(shaded, mode)
        body = "\n".join(polys + sparkles(mode))
        if mode == "sprite":
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">\n'
                   f'<defs>\n{gradients()}\n{REFRACT}\n'
                   f'<symbol id="cn-note" viewBox="0 0 {VB_W} {VB_H}">\n{body}\n</symbol>\n</defs>\n</svg>\n')
            open(f"{out_dir}/sprite.svg", "w").write(svg)
        else:
            bg = {"light": "#F5F2EC", "dark": "#172B3B"}[mode]
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W} {VB_H}" role="img" aria-label="ClearNote Sheets">\n'
                   f'<defs>{gradients()}</defs>\n{body}\n</svg>\n')
            open(f"{out_dir}/note-{mode}.svg", "w").write(svg)
            # preview on its intended background
            prev = svg.replace('aria-label="ClearNote Sheets">', f'aria-label="ClearNote Sheets"><rect width="100%" height="100%" fill="{bg}"/>', 1)
            open(f"{out_dir}/preview-{mode}.svg", "w").write(prev)
    print("faces:", len(shaded))
