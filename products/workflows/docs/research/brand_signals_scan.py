"""Throwaway research scanner for Silthus/posthog#199: which brand signals can parsers read from a repo.

Usage: python3 brand_signals_scan.py owner/repo [owner/repo ...] > results.json
Reads a GitHub token from `gh auth token`. One tree call per repo, then one contents read per selected file.
"""

import re
import sys
import json
import math
import base64
import subprocess
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

TOKEN = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()

MAX_FILE_READS = 25
MAX_FILE_BYTES = 400_000

APP_ROOT_PATTERN = re.compile(
    r"^((?:apps|packages|services|web|frontend|client|site|www)/[^/]+/|frontend/|client/|web/)"
)
GOOD_APP_NAMES = ("web", "www", "app", "dashboard", "frontend", "client", "site", "webapp", "builder", "platform")
BAD_APP_PARTS = (
    "docs",
    "storybook",
    "email",
    "emails",
    "example",
    "examples",
    "test",
    "tests",
    "e2e",
    "fixtures",
    "template",
    "templates",
    "playground",
    "vendor",
    "node_modules",
    "dist",
    "build",
    ".next",
)

MANIFEST_RE = re.compile(r"(^|/)(manifest\.json|site\.webmanifest|manifest\.webmanifest)$")
TAILWIND_RE = re.compile(r"(^|/)tailwind\.config\.(js|cjs|mjs|ts)$")
STYLE_RE = re.compile(r"\.(css|scss|sass|less)$")
STYLE_NAME_HINT = re.compile(
    r"(global|globals|app|main|index|theme|variables|vars|colors|tokens|base|style|styles|tailwind|application)", re.I
)
THEME_TS_RE = re.compile(
    r"(^|/)(theme|themes|colors|palette|tokens|create-theme|theme-?overrides)(/index)?\.(ts|tsx|js|jsx)$", re.I
)
HTML_RE = re.compile(
    r"(^|/)(index\.html|_document\.(tsx|jsx|js)|layout\.(tsx|jsx|js)|root\.tsx|base\.html|application\.html\.erb|app\.html|root\.html\.heex|_app\.(tsx|jsx))$"
)
LOGO_NAME_RE = re.compile(
    r"(logo|brand|wordmark|logomark|icon|favicon|apple-touch|android-chrome|og-image|opengraph-image|mark)", re.I
)
IMAGE_RE = re.compile(r"\.(svg|png|jpe?g|ico|webp|gif)$", re.I)

SHARED_THEME_PACKAGE_RE = re.compile(
    r"^packages/(tailwind-config|tailwind|ui|config|theme|design-system|tokens|styles)/"
)
THIRD_PARTY_LOGO_RE = re.compile(
    r"(app-store|appstore|integrations?|providers?|partners?|customers?|testimonials?|companies|sponsors?|clients|connectors?|sources?|destinations?|plugins?|flags|emoji|vendors?|third-party|brands)/"
)

TOKEN_PRIORITY = ("brand", "primary", "accent", "secondary", "theme")


def gh_get(url: str) -> dict:
    request = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def read_file(repo: str, path: str, ref: str) -> str:
    data = gh_get(f"https://api.github.com/repos/{repo}/contents/{urllib.request.quote(path)}?ref={ref}")
    return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")


# ---------- color math ----------


def clamp_byte(value: float) -> int:
    return max(0, min(255, round(value * 255)))


def rgb_to_hex(r: float, g: float, b: float) -> str:
    return "#{:02x}{:02x}{:02x}".format(clamp_byte(r), clamp_byte(g), clamp_byte(b))


def hsl_to_rgb(h: float, s: float, light: float) -> tuple[float, float, float]:
    h = (h % 360) / 360
    if s == 0:
        return light, light, light

    def hue(p: float, q: float, t: float) -> float:
        t %= 1
        if t < 1 / 6:
            return p + (q - p) * 6 * t
        if t < 1 / 2:
            return q
        if t < 2 / 3:
            return p + (q - p) * (2 / 3 - t) * 6
        return p

    q = light * (1 + s) if light < 0.5 else light + s - light * s
    p = 2 * light - q
    return hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)


def oklch_to_rgb(lightness: float, chroma: float, hue_deg: float) -> tuple[float, float, float]:
    a = chroma * math.cos(math.radians(hue_deg))
    b = chroma * math.sin(math.radians(hue_deg))
    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    l3, m3, s3 = l_**3, m_**3, s_**3
    linear = (
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
    )

    def gamma(x: float) -> float:
        x = max(0.0, min(1.0, x))
        return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055

    return gamma(linear[0]), gamma(linear[1]), gamma(linear[2])


def number(token: str, scale: float = 1.0) -> float:
    token = token.strip()
    if token.endswith("%"):
        return float(token[:-1]) / 100
    if token.endswith("deg"):
        return float(token[:-3])
    return float(token) / scale


NAMED = {
    "white": "#ffffff",
    "black": "#000000",
    "red": "#ff0000",
    "blue": "#0000ff",
    "green": "#008000",
    "orange": "#ffa500",
    "purple": "#800080",
}


def to_hex(raw: str) -> str | None:
    """Convert one CSS color expression to #rrggbb, or None when it is not a literal color."""
    value = raw.strip().strip("'\"").strip().rstrip(";").strip()
    value = re.sub(r"\s*/\s*[\d.]+%?\s*\)?$", lambda m: ")" if m.group(0).endswith(")") else "", value)
    try:
        if m := re.fullmatch(r"#([0-9a-fA-F]{3,8})", value):
            digits = m.group(1)
            if len(digits) in (3, 4):
                digits = "".join(c * 2 for c in digits[:3])
            return "#" + digits[:6].lower() if len(digits) >= 6 else None
        if m := re.fullmatch(r"rgba?\(\s*([^)]+)\)", value):
            parts = re.split(r"[\s,/]+", m.group(1).strip())
            return rgb_to_hex(*(number(p, 255) for p in parts[:3]))
        if m := re.fullmatch(r"hsla?\(\s*([^)]+)\)", value):
            parts = re.split(r"[\s,/]+", m.group(1).strip())
            return rgb_to_hex(*hsl_to_rgb(number(parts[0]), number(parts[1]), number(parts[2])))
        if m := re.fullmatch(r"oklch\(\s*([^)]+)\)", value):
            parts = re.split(r"[\s/]+", m.group(1).strip())
            lightness = number(parts[0])
            return rgb_to_hex(*oklch_to_rgb(lightness, number(parts[1]), number(parts[2]) if parts[2] != "none" else 0))
        if m := re.fullmatch(r"([\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%", value):
            return rgb_to_hex(*hsl_to_rgb(float(m.group(1)), float(m.group(2)) / 100, float(m.group(3)) / 100))
        if m := re.fullmatch(r"(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})", value):
            return rgb_to_hex(*(int(m.group(i)) / 255 for i in (1, 2, 3)))
    except (ValueError, IndexError):
        return None
    return NAMED.get(value.lower())


def saturation(hex_color: str) -> float:
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return max(r, g, b) - min(r, g, b)


def is_near_white(hex_color: str) -> bool:
    return min(int(hex_color[i : i + 2], 16) for i in (1, 3, 5)) > 230


def is_neutral(hex_color: str) -> bool:
    return saturation(hex_color) < 0.12


# ---------- signal extraction ----------


@dataclass(frozen=False)
class Signal:
    field: str
    value: str
    source: str
    detail: str = ""


@dataclass(frozen=False)
class Scan:
    repo: str
    app_root: str = ""
    files_read: int = 0
    signals: list[Signal] = field(default_factory=list)
    css_vars: dict[str, tuple[str, str]] = field(default_factory=dict)
    logo_candidates: list[dict] = field(default_factory=list)


def strip_dark_blocks(css: str) -> str:
    return re.sub(
        r"(\.dark|\[data-theme=['\"]?dark['\"]?\]|@media \(prefers-color-scheme:\s*dark\))[^{]*\{(?:[^{}]|\{[^{}]*\})*\}",
        "",
        css,
    )


def collect_css_vars(scan: Scan, path: str, css: str) -> None:
    for name, value in re.findall(r"(--[\w-]+)\s*:\s*([^;{}]+);", strip_dark_blocks(css)):
        scan.css_vars.setdefault(name, (value.strip(), path))
    for name, value in re.findall(r"\$([\w-]+)\s*:\s*([^;]+);", css):
        scan.css_vars.setdefault("$" + name, (value.strip().replace("!default", "").strip(), path))


def resolve(scan: Scan, raw: str, depth: int = 0) -> str | None:
    raw = raw.strip().strip("'\"")
    if depth > 6:
        return None
    if hex_color := to_hex(raw):
        return hex_color
    inner = re.fullmatch(r"(?:hsla?|rgba?|oklch)\(\s*var\((--[\w-]+)\)\s*(?:/[^)]*)?\)", raw)
    if inner and inner.group(1) in scan.css_vars:
        wrapper = raw.split("(")[0]
        return to_hex(f"{wrapper}({scan.css_vars[inner.group(1)][0]})") or resolve(
            scan, scan.css_vars[inner.group(1)][0], depth + 1
        )
    if (ref := re.fullmatch(r"var\((--[\w-]+)(?:,[^)]*)?\)", raw)) and ref.group(1) in scan.css_vars:
        return resolve(scan, scan.css_vars[ref.group(1)][0], depth + 1)
    if raw.startswith("$") and raw in scan.css_vars:
        return resolve(scan, scan.css_vars[raw][0], depth + 1)
    return None


def color_role(name: str) -> str | None:
    lowered = name.lower().lstrip("-$")
    lowered = re.sub(r"^(color|colors|theme|mantine|chakra|bs|ui|tw)[-_]", "", lowered)
    for role in ("brand", "primary", "accent", "secondary"):
        if re.fullmatch(rf"{role}(-(default|main|500|600|base|color))?", lowered) or lowered == f"{role}-color":
            return role
    if lowered in ("background", "bg", "body-bg"):
        return "background"
    if lowered in ("foreground", "text", "body-color", "text-color", "fg"):
        return "text"
    if lowered in ("theme-color", "link-color", "link"):
        return "accent"
    return None


def extract_css_colors(scan: Scan) -> None:
    for name, (value, path) in scan.css_vars.items():
        role = color_role(name)
        if role and (hex_color := resolve(scan, value)):
            scan.signals.append(Signal(f"color:{role}", hex_color, path, f"{name}: {value[:40]}"))


def extract_object_color(scan: Scan, text: str, path: str, kind: str) -> None:
    for role in ("brand", "primary", "accent", "secondary"):
        for m in re.finditer(rf"['\"]?{role}['\"]?\s*:\s*(\{{[^{{}}]*\}}|['\"][^'\"]+['\"]|colors\.\w+)", text):
            body = m.group(1)
            if body.startswith("{"):
                pick = re.search(
                    r"(?:main|DEFAULT|500|600|base|value)['\"]?\s*:\s*['\"]([^'\"]+)['\"]", body
                ) or re.search(r":\s*['\"]([^'\"]+)['\"]", body)
                raw = pick.group(1) if pick else ""
            else:
                raw = body
            if raw.startswith("colors."):
                scan.signals.append(Signal(f"color:{role}", f"tailwind:{raw[7:]}", path, kind))
                continue
            if hex_color := resolve(scan, raw):
                scan.signals.append(Signal(f"color:{role}", hex_color, path, f"{kind} {raw[:40]}"))


def extract_fonts(scan: Scan, text: str, path: str) -> None:
    for names in re.findall(r"import\s*\{([^}]+)\}\s*from\s*['\"](?:next/font/google|@next/font/google)['\"]", text):
        for name in names.split(","):
            if name.strip():
                scan.signals.append(
                    Signal("font", name.strip().split(" as ")[0].replace("_", " "), path, "next/font/google")
                )
    for family in re.findall(r"fonts\.googleapis\.com/css2?\?family=([\w+]+)", text):
        scan.signals.append(Signal("font", family.replace("+", " "), path, "google fonts link"))
    for m in re.finditer(r"--font-(?:sans|body|base|primary)\s*:\s*([^;]+);", text):
        first = m.group(1).split(",")[0].strip().strip("'\"")
        if not first.startswith("var("):
            scan.signals.append(Signal("font", first, path, "--font-sans"))
    for m in re.finditer(r"(?:sans|body|primary)['\"]?\s*:\s*\[\s*['\"]([^'\"]+)['\"]", text):
        scan.signals.append(Signal("font", m.group(1), path, "tailwind fontFamily"))
    for m in re.finditer(r"fontFamily\s*:\s*['\"`]([^'\"`,]+)", text):
        scan.signals.append(Signal("font", m.group(1).strip(), path, "theme fontFamily"))
    for m in re.finditer(r"(?:^|[;{\s])body[^{]*\{[^}]*font-family\s*:\s*([^;]+);", text):
        scan.signals.append(Signal("font", m.group(1).split(",")[0].strip().strip("'\""), path, "body font-family"))
    for m in re.finditer(r"\$font-family[\w-]*\s*:\s*([^;]+);", text):
        scan.signals.append(Signal("font", m.group(1).split(",")[0].strip().strip("'\""), path, "scss $font-family"))


def extract_meta(scan: Scan, text: str, path: str) -> None:
    for m in re.finditer(r"theme-color['\"]?\s+content=['\"]([^'\"]+)", text):
        if hex_color := to_hex(m.group(1)):
            scan.signals.append(Signal("color:theme-color", hex_color, path, "<meta theme-color>"))
    for m in re.finditer(r"themeColor\s*:\s*['\"]([^'\"]+)['\"]", text):
        if hex_color := to_hex(m.group(1)):
            scan.signals.append(Signal("color:theme-color", hex_color, path, "next viewport themeColor"))
    if m := re.search(r"<title>([^<{]{2,60})</title>", text):
        scan.signals.append(Signal("name", m.group(1).strip(), path, "<title>"))
    if m := re.search(r"(?:siteName|applicationName)\s*:\s*['\"]([^'\"]{2,40})['\"]", text):
        scan.signals.append(Signal("name", m.group(1), path, "metadata siteName"))
    if m := re.search(r"title\s*:\s*\{\s*default\s*:\s*['\"]([^'\"]{2,60})['\"]", text):
        scan.signals.append(Signal("name", m.group(1), path, "metadata title.default"))


def extract_manifest(scan: Scan, text: str, path: str) -> None:
    try:
        manifest = json.loads(text)
    except json.JSONDecodeError:
        return
    for key in ("name", "short_name"):
        if isinstance(manifest.get(key), str) and manifest[key].strip():
            scan.signals.append(Signal("name", manifest[key].strip(), path, f"manifest {key}"))
    for key, role in (("theme_color", "theme-color"), ("background_color", "manifest-bg")):
        if isinstance(manifest.get(key), str) and (hex_color := to_hex(manifest[key])):
            scan.signals.append(Signal(f"color:{role}", hex_color, path, f"manifest {key}"))
    for icon in manifest.get("icons", []) or []:
        if isinstance(icon, dict) and icon.get("src"):
            scan.signals.append(Signal("logo:manifest-icon", icon["src"], path, str(icon.get("sizes", ""))))


def extract_package_name(scan: Scan, text: str, path: str) -> None:
    try:
        package = json.loads(text)
    except json.JSONDecodeError:
        return
    if isinstance(package.get("name"), str):
        scan.signals.append(Signal("name", package["name"], path, "package.json name"))


def extract_svg_colors(scan: Scan, text: str, path: str) -> None:
    fills = [
        to_hex(v)
        for v in re.findall(r"(?:fill|stop-color|stroke)\s*[=:]\s*['\"]?(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))", text)
    ]
    colorful = [c for c in fills if c and not is_neutral(c)]
    if colorful:
        dominant = max(set(colorful), key=colorful.count)
        scan.signals.append(Signal("color:logo-svg", dominant, path, f"{len(colorful)} colored fills"))


# ---------- file selection ----------


def app_root_of(path: str) -> str:
    m = APP_ROOT_PATTERN.match(path)
    return m.group(1) if m else ""


def is_noise(path: str) -> bool:
    parts = path.lower().split("/")
    return any(part in BAD_APP_PARTS for part in parts[:-1])


def pick_app_root(paths: list[str]) -> str:
    package_roots = {p.rsplit("package.json", 1)[0] for p in paths if p.endswith("package.json") and not is_noise(p)}
    candidates = {root for root in package_roots if root == "" or APP_ROOT_PATTERN.fullmatch(root)}
    if not candidates:
        return ""
    app_candidates = {root for root in candidates if root.startswith(("apps/", "frontend", "client", "web/"))}
    candidates = app_candidates or candidates

    def score(root: str) -> float:
        inside = [p for p in paths if p.startswith(root) and not is_noise(p)]
        brand_files = sum(
            1
            for p in inside
            if MANIFEST_RE.search(p)
            or TAILWIND_RE.search(p)
            or (IMAGE_RE.search(p) and LOGO_NAME_RE.search(p.rsplit("/", 1)[-1]))
        )
        name = root.rstrip("/").rsplit("/", 1)[-1]
        bonus = 5 if name in GOOD_APP_NAMES else 0
        public_dir = 3 if any(p.startswith(root + "public/") or p.startswith(root + "static/") for p in inside) else 0
        return brand_files + bonus + public_dir - (2 if root == "" and len(candidates) > 1 else 0)

    return max(sorted(candidates), key=score)


def own_logo_name(path: str, repo_short: str) -> bool:
    name = path.rsplit("/", 1)[-1].lower()
    return bool(re.match(r"^(logo|logomark|wordmark|brand)([-_.@]|$)", name)) or (repo_short in name and "logo" in name)


def select_files(paths: list[str], sizes: dict[str, int], app_root: str, repo_short: str) -> list[str]:
    def in_scope(path: str) -> bool:
        if SHARED_THEME_PACKAGE_RE.match(path) and not is_noise(path):
            return True
        return (
            (path.startswith(app_root) or app_root_of(path) in ("", app_root))
            and not is_noise(path)
            and sizes.get(path, 0) < MAX_FILE_BYTES
        )

    def depth_from_app(path: str) -> int:
        return path[len(app_root) :].count("/") if path.startswith(app_root) else 99

    picks: list[str] = []
    picks += [p for p in ("package.json", app_root + "package.json") if p in sizes]
    picks += sorted((p for p in paths if MANIFEST_RE.search(p) and in_scope(p)), key=depth_from_app)[:2]
    picks += sorted((p for p in paths if TAILWIND_RE.search(p) and in_scope(p)), key=depth_from_app)[:2]
    picks += sorted((p for p in paths if HTML_RE.search(p) and in_scope(p)), key=depth_from_app)[:3]
    styles = [p for p in paths if STYLE_RE.search(p) and in_scope(p) and STYLE_NAME_HINT.search(p.rsplit("/", 1)[-1])]
    picks += sorted(styles, key=lambda p: (not p.startswith(app_root), depth_from_app(p), len(p)))[:6]
    picks += sorted((p for p in paths if THEME_TS_RE.search(p) and in_scope(p)), key=depth_from_app)[:3]
    svg_logos = [
        p
        for p in paths
        if p.lower().endswith(".svg")
        and own_logo_name(p, repo_short)
        and in_scope(p)
        and not THIRD_PARTY_LOGO_RE.search(p.lower())
    ]
    picks += sorted(svg_logos, key=lambda p: (not p.startswith(app_root), depth_from_app(p)))[:2]
    seen: list[str] = []
    for path in picks:
        if path not in seen:
            seen.append(path)
    return seen[:MAX_FILE_READS]


def logo_candidates(paths: list[str], sizes: dict[str, int], app_root: str, repo_short: str) -> list[dict]:
    found = []
    for path in paths:
        name = path.rsplit("/", 1)[-1].lower()
        if (
            not IMAGE_RE.search(name)
            or not LOGO_NAME_RE.search(name)
            or is_noise(path)
            or THIRD_PARTY_LOGO_RE.search(path.lower())
        ):
            continue
        if not (path.startswith(app_root) or app_root == ""):
            continue
        score = 0
        score += 6 if own_logo_name(path, repo_short) else 2 if "logo" in name else 0
        score += 2 if repo_short in name else 0
        score += 3 if re.search(r"(public|static|assets|images|img)/", path) else 0
        score += 2 if name.endswith(".png") else 1 if name.endswith(".svg") else 0
        score -= 4 if re.search(r"(white|dark|inverse|light|mono|black)", name) else 0
        score -= 2 if re.search(r"(icons?/|lucide|heroicons|vendor)", path.lower()) and "logo" not in name else 0
        score -= path.count("/") * 0.2
        found.append(
            {"path": path, "format": name.rsplit(".", 1)[-1], "bytes": sizes.get(path, 0), "score": round(score, 1)}
        )
    return sorted(found, key=lambda c: -c["score"])[:5]


# ---------- proposal ----------


def propose(scan: Scan, repo_meta: dict) -> dict:
    by_field: dict[str, list[Signal]] = {}
    for signal in scan.signals:
        by_field.setdefault(signal.field, []).append(signal)

    def first(*fields: str, colorful: bool = False) -> Signal | None:
        for name in fields:
            for signal in by_field.get(name, []):
                if signal.value.startswith("#") and (
                    is_near_white(signal.value) or (colorful and is_neutral(signal.value))
                ):
                    continue
                if signal.value.startswith("#") or not name.startswith("color"):
                    return signal
        return None

    for signal in by_field.get("name", []):
        signal.value = re.sub(r"(^@[\w.-]+/|[-_ ](monorepo|app|root|web)$)", "", signal.value)
    generic = re.compile(r"^(@[\w-]+/)?(web|app|www|frontend|client|dashboard|root|monorepo|main|site|platform)$", re.I)
    names = [s for s in by_field.get("name", []) if not generic.match(s.value)]
    name_rank = (
        "manifest name",
        "metadata siteName",
        "manifest short_name",
        "metadata title.default",
        "<title>",
        "package.json name",
    )
    names.sort(key=lambda s: name_rank.index(s.detail) if s.detail in name_rank else len(name_rank))
    name = next(iter(names), None)
    primary = first(
        "color:brand", "color:primary", "color:theme-color", "color:logo-svg", "color:accent", colorful=True
    ) or first("color:brand", "color:primary", "color:theme-color")
    accent = next(
        (
            s
            for f in ("color:accent", "color:secondary", "color:logo-svg")
            for s in by_field.get(f, [])
            if primary and s.value != primary.value and not is_neutral(s.value)
        ),
        None,
    )
    font = next(
        iter(
            s
            for s in by_field.get("font", [])
            if not s.value.startswith(("var(", "$", "inherit", "system-ui", "-apple"))
        ),
        None,
    )
    return {
        "name": (name.value, name.source) if name else (repo_meta.get("name"), "repo name"),
        "primary": (primary.value, primary.source, primary.detail) if primary else None,
        "primary_is_neutral": bool(primary and is_neutral(primary.value)),
        "accent": (accent.value, accent.source) if accent else None,
        "text": next(((s.value, s.source) for s in by_field.get("color:text", [])), None),
        "background": next(((s.value, s.source) for s in by_field.get("color:background", [])), None),
        "font": (font.value, font.source, font.detail) if font else None,
        "logo": scan.logo_candidates[0] if scan.logo_candidates else None,
    }


def scan_repo(repo: str) -> dict:
    meta = gh_get(f"https://api.github.com/repos/{repo}")
    ref = meta["default_branch"]
    tree = gh_get(f"https://api.github.com/repos/{repo}/git/trees/{ref}?recursive=1")
    blobs = [entry for entry in tree["tree"] if entry["type"] == "blob"]
    paths = [entry["path"] for entry in blobs]
    sizes = {entry["path"]: entry.get("size", 0) for entry in blobs}
    scan = Scan(repo=repo)
    scan.app_root = pick_app_root(paths)
    repo_short = re.sub(r"[^a-z0-9]", "", repo.split("/")[1].lower().split(".")[0])[:12]
    files = select_files(paths, sizes, scan.app_root, repo_short)
    with ThreadPoolExecutor(max_workers=8) as pool:
        contents = dict(zip(files, pool.map(lambda p: read_file(repo, p, ref), files)))
    scan.files_read = len(files)
    for path, text in contents.items():
        if STYLE_RE.search(path):
            collect_css_vars(scan, path, text)
    for path, text in contents.items():
        if path.endswith("package.json"):
            extract_package_name(scan, text, path)
        elif MANIFEST_RE.search(path):
            extract_manifest(scan, text, path)
        elif path.endswith(".svg"):
            extract_svg_colors(scan, text, path)
        else:
            if TAILWIND_RE.search(path) or THEME_TS_RE.search(path):
                extract_object_color(scan, text, path, "theme object")
            if HTML_RE.search(path):
                extract_meta(scan, text, path)
            extract_fonts(scan, text, path)
    extract_css_colors(scan)
    scan.logo_candidates = logo_candidates(paths, sizes, scan.app_root, repo_short)
    return {
        "repo": repo,
        "homepage": meta.get("homepage"),
        "tree_entries": len(tree["tree"]),
        "tree_truncated": tree.get("truncated", False),
        "app_root": scan.app_root,
        "files_read": files,
        "api_calls": 2 + len(files),
        "proposal": propose(scan, meta),
        "signals": [s.__dict__ for s in scan.signals],
        "logo_candidates": scan.logo_candidates,
    }


if __name__ == "__main__":
    results = []
    for repo_name in sys.argv[1:]:
        try:
            results.append(scan_repo(repo_name))
        except Exception as error:  # throwaway script: report and keep scanning
            results.append({"repo": repo_name, "error": repr(error)})
        sys.stderr.write(f"scanned {repo_name}\n")
    json.dump(results, sys.stdout, indent=1)
