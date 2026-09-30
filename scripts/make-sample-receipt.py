"""Renders the fictional receipt used by the example app and the README screenshots.

Usage: python3 scripts/make-sample-receipt.py  (requires Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "example" / "assets" / "sample-receipt.jpg"
W = 1200

LINES = [
    ("center", "HARBOR STREET COFFEE", 1.35),
    ("center", "112 Harbor St, Portland OR", 1.0),
    ("center", "Tel (503) 555-0142", 1.0),
    ("gap", "", 1.0),
    ("left", "03/14/2026            08:41 AM", 1.0),
    ("left", "Order #4471     Server: Maya", 1.0),
    ("rule", "", 1.0),
    ("row", ("Oat Latte", "5.25"), 1.0),
    ("row", ("2 x Butter Croissant", "7.00"), 1.0),
    ("row", ("Drip Coffee 12oz", "3.10"), 1.0),
    ("row", ("Blueberry Muffin", "3.75"), 1.0),
    ("row", ("Loyalty Discount", "1.00-"), 1.0),
    ("rule", "", 1.0),
    ("row", ("Subtotal", "18.10"), 1.0),
    ("row", ("Sales Tax 8.5%", "1.54"), 1.0),
    ("row", ("TOTAL", "$19.64"), 1.3),
    ("gap", "", 1.0),
    ("row", ("VISA ****4412", "19.64"), 1.0),
    ("gap", "", 1.0),
    ("center", "Thank you - see you soon!", 1.0),
]


def font(size):
    for path in ("/System/Library/Fonts/Menlo.ttc", "/Library/Fonts/Courier New.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    paper_w, paper_h = 820, 2000
    paper = Image.new("RGB", (paper_w, paper_h), (250, 248, 242))
    draw = ImageDraw.Draw(paper)

    base = 34
    y = 70
    margin = 60
    for kind, content, scale in LINES:
        f = font(int(base * scale))
        if kind == "gap":
            y += 28
            continue
        if kind == "rule":
            draw.text((margin, y), "-" * 32, font=f, fill=(90, 90, 90))
            y += 50
            continue
        if kind == "center":
            w = draw.textlength(content, font=f)
            draw.text(((paper_w - w) / 2, y), content, font=f, fill=(25, 25, 28))
        elif kind == "left":
            draw.text((margin, y), content, font=f, fill=(25, 25, 28))
        else:
            label, amount = content
            draw.text((margin, y), label, font=f, fill=(25, 25, 28))
            w = draw.textlength(amount, font=f)
            draw.text((paper_w - margin - w, y), amount, font=f, fill=(25, 25, 28))
        y += int(base * scale * 1.55)

    paper_h = y + 60
    paper = paper.crop((0, 0, paper_w, paper_h)).filter(ImageFilter.GaussianBlur(0.6))

    H = paper_h + 260
    bg = Image.new("RGB", (W, H), (58, 62, 70))
    # Subtle table texture so the document detector has something to separate from.
    noise = Image.effect_noise((W, H), 18).convert("RGB")
    bg = Image.blend(bg, noise, 0.08)
    shadow = Image.new("RGBA", (paper_w + 40, paper_h + 40), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle((20, 20, paper_w + 20, paper_h + 20), fill=(0, 0, 0, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))

    ox, oy = (W - paper_w) // 2, (H - paper_h) // 2
    bg.paste(shadow, (ox - 12, oy - 4), shadow)
    bg.paste(paper, (ox, oy))
    bg.save(OUT, quality=88)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
