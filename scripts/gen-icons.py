#!/usr/bin/env python3
"""favicon.svg と同じ形状から PNG / ICO を生成する。

SVG がアイコンの唯一の定義。ここはその形状を Pillow で写して
ラスタ版（PWA と iOS が要求する）を出す。SVG を直すときは、
下の GEOMETRY も同じ値に直して再実行すること。

    python3 scripts/gen-icons.py

依存: Pillow のみ（ImageMagick / rsvg などの外部 SVG レンダラは使わない。
環境によって描画結果が変わるため）。
"""

from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "frontend" / "public"

BLUE = (0x76, 0x9C, 0xBF, 0xFF)
WHITE = (0xFF, 0xFF, 0xFF, 0xFF)

# favicon.svg と同じ 64 単位の座標系。
GEOMETRY = {
    "bg_radius": 14,
    "body": (11, 18, 53, 47),  # x0, y0, x1, y1
    "body_radius": 7,
    "pocket": (33, 26, 53, 39),
    "pocket_radius": 6.5,
    "clasp": (43.5, 32.5, 3),  # cx, cy, r
}

# 縮小前に何倍で描くか（アンチエイリアスの代わり）
SUPERSAMPLE = 8


def draw(size: int, *, rounded: bool, content_scale: float = 1.0) -> Image.Image:
    """アイコンを 1 枚描く。

    rounded=False は maskable 用（角丸は OS 側が被せるので、地は全面に敷く）。
    content_scale は財布を中央に縮める倍率（maskable のセーフゾーン対策）。
    """
    px = size * SUPERSAMPLE
    unit = px / 64
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if rounded:
        d.rounded_rectangle(
            (0, 0, px - 1, px - 1), radius=GEOMETRY["bg_radius"] * unit, fill=BLUE
        )
    else:
        d.rectangle((0, 0, px - 1, px - 1), fill=BLUE)

    def s(v: float) -> float:
        """64 単位の座標を、中央基準で content_scale 倍してピクセルへ。"""
        return (32 + (v - 32) * content_scale) * unit

    def r(v: float) -> float:
        return v * content_scale * unit

    x0, y0, x1, y1 = GEOMETRY["body"]
    d.rounded_rectangle(
        (s(x0), s(y0), s(x1), s(y1)), radius=r(GEOMETRY["body_radius"]), fill=WHITE
    )

    x0, y0, x1, y1 = GEOMETRY["pocket"]
    d.rounded_rectangle(
        (s(x0), s(y0), s(x1), s(y1)), radius=r(GEOMETRY["pocket_radius"]), fill=BLUE
    )

    cx, cy, rad = GEOMETRY["clasp"]
    d.ellipse((s(cx) - r(rad), s(cy) - r(rad), s(cx) + r(rad), s(cy) + r(rad)), fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    outputs = {
        "apple-touch-icon.png": draw(180, rounded=True),
        "icon-192.png": draw(192, rounded=True),
        "icon-512.png": draw(512, rounded=True),
        # maskable: 地を全面に敷き、財布はセーフゾーン（中央 80% の円）に収める
        "icon-maskable-512.png": draw(512, rounded=False, content_scale=0.68),
    }
    for name, img in outputs.items():
        img.save(PUBLIC / name, "PNG", optimize=True)
        print(f"  {name}  {img.size[0]}x{img.size[1]}")

    # favicon.ico は 16/32/48 を 1 ファイルに束ねる
    ico = draw(48, rounded=True)
    ico.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico  16/32/48")


if __name__ == "__main__":
    main()
