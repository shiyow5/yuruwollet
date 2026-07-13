#!/usr/bin/env python3
"""favicon.svg から PNG / ICO を生成する。

    python3 scripts/gen-icons.py

**favicon.svg がアイコンの唯一の定義。** この script はそれを読んで、
PWA と iOS が要求するラスタ版を出す。形状を変えるときは SVG だけ直せばよい。
（以前は座標をこちらにも書き写していたが、二重管理はいずれ必ずズレる）

外部の SVG レンダラ（ImageMagick / rsvg / inkscape）は使わない。環境によって
入っていたり入っていなかったり、描画結果も変わるため。SVG は素直な図形しか
使っていないので、Pillow で直接描く。
"""

import re
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "frontend" / "public" / "favicon.svg"
PUBLIC = ROOT / "frontend" / "public"

SVG_NS = "{http://www.w3.org/2000/svg}"

# 縮小前に何倍で描くか（アンチエイリアスの代わり）
SUPERSAMPLE = 8


def color(value: str) -> tuple[int, int, int, int]:
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", (value or "").strip())
    if not m:
        raise SystemExit(f"favicon.svg: 対応していない色指定です: {value!r}")
    h = m.group(1)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


def load_shapes() -> tuple[float, list[dict]]:
    """favicon.svg を読み、viewBox の一辺と図形のリストを返す。"""
    root = ET.parse(SVG).getroot()

    box = [float(v) for v in root.get("viewBox", "").split()]
    if len(box) != 4 or box[0] != 0 or box[1] != 0 or box[2] != box[3]:
        raise SystemExit(f"favicon.svg: viewBox は '0 0 N N' の正方形にしてください: {box}")

    shapes: list[dict] = []
    for el in root:
        if el.tag == f"{SVG_NS}rect":
            shapes.append(
                {
                    "kind": "rect",
                    "x": float(el.get("x", 0)),
                    "y": float(el.get("y", 0)),
                    "w": float(el.get("width")),
                    "h": float(el.get("height")),
                    "r": float(el.get("rx", 0)),
                    "fill": color(el.get("fill")),
                }
            )
        elif el.tag == f"{SVG_NS}circle":
            shapes.append(
                {
                    "kind": "circle",
                    "cx": float(el.get("cx")),
                    "cy": float(el.get("cy")),
                    "r": float(el.get("r")),
                    "fill": color(el.get("fill")),
                }
            )
        else:
            raise SystemExit(
                f"favicon.svg: {el.tag} は描けません。rect / circle だけで作ってください"
                "（この script は外部の SVG レンダラを使わないため）"
            )

    if not shapes:
        raise SystemExit("favicon.svg に図形がありません")
    return box[2], shapes


def draw(size: int, *, rounded: bool, content_scale: float = 1.0) -> Image.Image:
    """favicon.svg の図形を size x size に描く。

    rounded=False は maskable / apple-touch 用（角丸は OS が被せるので地を全面に敷く）。
    content_scale は 1 枚目（＝地）以外を中央基準で縮める倍率（maskable のセーフゾーン対策）。
    """
    side, shapes = load_shapes()
    px = size * SUPERSAMPLE
    unit = px / side
    mid = side / 2

    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    for i, s in enumerate(shapes):
        background = i == 0
        scale = 1.0 if background else content_scale

        def to_px(v: float, sc: float = scale) -> float:
            return (mid + (v - mid) * sc) * unit

        def length(v: float, sc: float = scale) -> float:
            return v * sc * unit

        if s["kind"] == "rect":
            radius = 0 if (background and not rounded) else length(s["r"])
            d.rounded_rectangle(
                (to_px(s["x"]), to_px(s["y"]), to_px(s["x"] + s["w"]), to_px(s["y"] + s["h"])),
                radius=radius,
                fill=s["fill"],
            )
        else:
            cx, cy, r = to_px(s["cx"]), to_px(s["cy"]), length(s["r"])
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=s["fill"])

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    outputs = {
        # apple-touch-icon は **不透明** でなければならない。
        # 角丸で作ると角が透明になり、iOS のホーム画面では **黒く** 描画される
        # （Lighthouse の apple-touch-icon 監査も透過を弾く）。
        # 角丸は iOS が自分で被せるので、地を全面に敷いた不透明の正方形を渡す。
        "apple-touch-icon.png": draw(180, rounded=False).convert("RGB"),
        "icon-192.png": draw(192, rounded=True),
        "icon-512.png": draw(512, rounded=True),
        # maskable: 地を全面に敷き、図はセーフゾーン（中央 80% の円）に収める
        "icon-maskable-512.png": draw(512, rounded=False, content_scale=0.68),
    }
    for name, img in outputs.items():
        img.save(PUBLIC / name, "PNG", optimize=True)
        print(f"  {name}  {img.size[0]}x{img.size[1]}  {img.mode}")

    # favicon.ico は 16/32/48 を 1 ファイルに束ねる
    ico = draw(48, rounded=True)
    ico.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico  16/32/48")


if __name__ == "__main__":
    main()
