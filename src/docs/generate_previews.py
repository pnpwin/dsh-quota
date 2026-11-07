"""Generate documentation illustrations from fictional data only.

These are NOT browser screenshots or evidence of runtime/visual verification.
No settings, credentials, screenshots, account records or network data are read.
Requires Pillow for documentation generation only; the plugin has no dependency.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, PngImagePlugin

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "images"
SCALE = 2
BG = "#f5f6f8"
SURFACE = "#fafafa"
BASE = "#ffffff"
BORDER = "#e8e9ec"
INK = "#1a1b1e"
SECONDARY = "#686a70"
MUTED = "#92959b"
GREEN = "#21bb67"
AMBER = "#d99a36"
FOOTNOTE = "Illustration - fictional providers and values - no account data"
DEMO = {
    "a": {"name": "Provider A", "balance": "24.50 USD"},
    "b": {"name": "Provider B", "session": 82, "monthly": 64},
    "c": {"name": "Provider C", "weekly": 47, "credits": "120.00 credits"},
}


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, round(size * SCALE))
    return ImageFont.load_default(size=round(size * SCALE))


class Illustration:
    def __init__(self, width, height):
        self.width, self.height = width, height
        self.image = Image.new("RGB", (width * SCALE, height * SCALE), BG)
        self.draw = ImageDraw.Draw(self.image)

    def box(self, x, y, width, height, fill=BASE, radius=12, stroke=BORDER):
        self.draw.rounded_rectangle(
            [x * SCALE, y * SCALE, (x + width) * SCALE, (y + height) * SCALE],
            radius=radius * SCALE, fill=fill, outline=stroke, width=SCALE,
        )

    def surface(self, x, y, width, height):
        shadow = Image.new("RGBA", self.image.size)
        ImageDraw.Draw(shadow).rounded_rectangle(
            [x * SCALE, (y + 4) * SCALE, (x + width) * SCALE, (y + height + 4) * SCALE],
            radius=16 * SCALE, fill=(25, 30, 40, 18),
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(9 * SCALE))
        self.image = Image.alpha_composite(self.image.convert("RGBA"), shadow).convert("RGB")
        self.draw = ImageDraw.Draw(self.image)
        self.box(x, y, width, height, SURFACE, 16)

    def text(self, x, y, value, size=12, color=INK, bold=False, right=False):
        self.draw.text((x * SCALE, y * SCALE), str(value), fill=color,
                       font=font(size, bold), anchor="rt" if right else "lt")

    def line(self, x1, y, x2, color=BORDER):
        self.draw.line([(x1 * SCALE, y * SCALE), (x2 * SCALE, y * SCALE)], fill=color, width=SCALE)

    def dot(self, x, y, color=GREEN):
        r = 3 * SCALE
        self.draw.ellipse([x * SCALE - r, y * SCALE - r, x * SCALE + r, y * SCALE + r], fill=color)

    def ring(self, x, y, percent, color=GREEN):
        r = 6 * SCALE
        bounds = [x * SCALE - r, y * SCALE - r, x * SCALE + r, y * SCALE + r]
        self.draw.ellipse(bounds, outline="#dfe3e5", width=2 * SCALE)
        if percent:
            self.draw.arc(bounds, -90, -90 + percent * 3.6, fill=color, width=2 * SCALE)

    def refresh_icon(self, x, y):
        # Draw a vector glyph so no platform font can substitute a missing box.
        self.draw.arc([(x - 6) * SCALE, (y - 6) * SCALE, (x + 6) * SCALE, (y + 6) * SCALE], 30, 310, fill=SECONDARY, width=SCALE)
        self.draw.line([(x + 5) * SCALE, (y - 9) * SCALE, (x + 5) * SCALE, (y - 3) * SCALE, (x - 1) * SCALE, (y - 3) * SCALE], fill=SECONDARY, width=SCALE)

    def quota_icon(self, x, y):
        self.draw.ellipse([(x - 7) * SCALE, (y - 7) * SCALE, (x + 7) * SCALE, (y + 7) * SCALE], outline=INK, width=SCALE)
        self.draw.line([(x - 3) * SCALE, y * SCALE, x * SCALE, (y + 3) * SCALE, (x + 5) * SCALE, (y - 4) * SCALE], fill=INK, width=SCALE)

    def metric(self, x, right, y, label, value, reset=None):
        self.text(x, y, label, color=MUTED)
        self.text(right, y, value, color=SECONDARY, right=True)
        if reset:
            self.text(right, y + 20, f"Resets {reset}", color=MUTED, right=True)

    def meter(self, x, y, width, percent):
        self.box(x, y, width, 3, "#e9ecee", 1, None)
        self.box(x, y, max(1, width * percent / 100), 3, GREEN if percent > 25 else AMBER, 1, None)

    def footnote(self, y):
        # Preserve the same explicit demonstration label in every image.
        bounds = self.draw.textbbox((0, 0), FOOTNOTE, font=font(10))
        self.text((self.width - (bounds[2] - bounds[0]) / SCALE) / 2, y, FOOTNOTE, 10, MUTED)

    def save(self, name):
        OUT.mkdir(parents=True, exist_ok=True)
        info = PngImagePlugin.PngInfo()
        info.add_text("Description", "Generated documentation illustration. Every provider label and value is fictional. No real account names, identifiers, tokens or balances.")
        self.image.save(OUT / name, pnginfo=info, optimize=True)


def dialog_strip():
    image = Illustration(1060, 238)
    image.text(28, 18, "QUOTAS IN THE CONVERSATION", 11, MUTED, True)
    image.box(24, 48, 1012, 88, BASE, 14)
    image.text(44, 68, "Write a message...", 14, MUTED)
    image.text(45, 109, "+", 18, SECONDARY)
    image.box(984, 98, 28, 24, "#edf0f2", 8, None)
    image.text(993, 102, "\u2191", 16, SECONDARY)
    y = 163
    image.dot(43, y + 6)
    image.text(57, y, f"{DEMO['a']['name']}  {DEMO['a']['balance']}", 12, SECONDARY)
    image.ring(293, y + 6, DEMO["b"]["monthly"], AMBER)
    image.text(307, y, f"{DEMO['b']['name']}  {DEMO['b']['monthly']}%", 12, SECONDARY)
    image.ring(475, y + 6, DEMO["c"]["weekly"])
    image.text(489, y, f"{DEMO['c']['name']}  {DEMO['c']['weekly']}%", 12, SECONDARY)
    image.quota_icon(727, y + 6)
    image.text(745, y, "3 turns 12 steps  ·  52 tok/s", 12, SECONDARY)
    image.footnote(207)
    image.save("dialog-quota-strip.png")


def compact_widget():
    image = Illustration(452, 680)
    image.surface(24, 20, 404, 604)
    image.quota_icon(49, 48)
    image.text(67, 42, "LLM quotas", 13, INK, True)
    image.refresh_icon(374, 48)
    image.text(399, 40, "\u00d7", 17, SECONDARY)
    image.line(42, 82, 410)
    image.text(42, 107, DEMO["a"]["name"], 13, INK, True)
    image.dot(402, 114)
    image.metric(42, 402, 141, "Account balance", DEMO["a"]["balance"])
    image.line(42, 176, 410)
    image.text(42, 200, DEMO["b"]["name"], 13, INK, True)
    image.dot(402, 207, AMBER)
    image.metric(42, 402, 235, "Session", f"{DEMO['b']['session']}% left", "3h 20m")
    image.metric(42, 402, 287, "Monthly total", f"{DEMO['b']['monthly']}% left", "12d 6h")
    image.metric(42, 402, 339, "Monthly code", f"{DEMO['b']['monthly']}% left", "12d 6h")
    image.line(42, 382, 410)
    image.text(42, 407, DEMO["c"]["name"], 13, INK, True)
    image.dot(402, 414)
    image.metric(42, 402, 443, "Account balance", DEMO["c"]["credits"])
    image.metric(42, 402, 478, "Weekly", f"{DEMO['c']['weekly']}% left", "4d 8h")
    image.box(423, 96, 4, 442, "#eeeeef", 2, None)
    image.box(423, 108, 4, 228, "#d8dadd", 2, None)
    image.line(42, 553, 410)
    image.text(42, 579, "Checked just now", 12, MUTED)
    image.text(410, 579, "Open quotas  \u2192", 12, INK, right=True)
    image.footnote(650)
    image.save("quota-widget.png")


def quota_overview():
    image = Illustration(1000, 760)
    image.box(24, 20, 952, 686, BASE, 16)
    image.quota_icon(58, 57)
    image.text(78, 45, "LLM quotas", 20, INK, True)
    image.box(815, 40, 86, 30, BASE, 8)
    image.text(831, 48, "Settings", 12, SECONDARY)
    image.box(914, 40, 30, 30, BASE, 8)
    image.refresh_icon(929, 55)
    image.text(56, 88, "Providers configured in Models. Credentials stay on the host.", 12, MUTED)
    image.box(56, 124, 888, 548, BASE, 12)
    x, right = 76, 924
    image.text(x, 147, DEMO["a"]["name"], 13, INK, True)
    image.dot(915, 154)
    image.metric(x, right, 181, "Account balance", DEMO["a"]["balance"])
    image.line(x, 217, right)
    image.text(x, 239, DEMO["b"]["name"], 13, INK, True)
    image.dot(915, 246, AMBER)
    image.metric(x, right, 274, "Session", f"{DEMO['b']['session']}% left", "3h 20m")
    image.meter(x, 314, right - x, DEMO["b"]["session"])
    image.metric(x, right, 338, "Monthly total", f"{DEMO['b']['monthly']}% left", "12d 6h")
    image.meter(x, 378, right - x, DEMO["b"]["monthly"])
    image.metric(x, right, 402, "Monthly code", f"{DEMO['b']['monthly']}% left", "12d 6h")
    image.meter(x, 442, right - x, DEMO["b"]["monthly"])
    image.line(x, 466, right)
    image.text(x, 489, DEMO["c"]["name"], 13, INK, True)
    image.dot(915, 496)
    image.metric(x, right, 523, "Account balance", DEMO["c"]["credits"])
    image.metric(x, right, 557, "Weekly", f"{DEMO['c']['weekly']}% left", "4d 8h")
    image.meter(x, 597, right - x, DEMO["c"]["weekly"])
    image.text(x, 634, "Currencies and independent accounts are not combined.", 12, MUTED)
    image.footnote(730)
    image.save("quota-overview.png")


if __name__ == "__main__":
    dialog_strip()
    compact_widget()
    quota_overview()
    print("Generated three documentation illustrations using fictional data only.")
