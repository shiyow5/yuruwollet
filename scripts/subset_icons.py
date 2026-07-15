#!/usr/bin/env python3
"""Material Symbols フォントを、使うアイコンだけにサブセットする（#9）。

全アイコンで約 3.8MB ある material-symbols-outlined.woff2 を、パレット
（frontend/src/lib/icons/palette.json の ui ∪ categories）に載っているアイコンだけに
削って **十数KB** にする。初回ロードを大幅に軽くするのが目的。

## なぜ ligature ではなく codepoint で描画するのか

Material Symbols は "restaurant" という文字列を ligature でアイコン glyph に置換する。
だが ligature を残したままサブセットすると、パレットの全アイコン名が a-z_ の文字だけで
綴られるため、closure でほぼ全 glyph が残ってしまう（削減が 1 割程度しか効かない）。

そこで **各アイコンをコードポイントで描画する**（Icon.tsx が palette.codepoints.json を見て
String.fromCodePoint で描く）。ligature を捨て、必要な glyph の unicode だけを残せるので、
partial-instance（FILL 軸だけ残して他を既定に固定）と合わせて十数KB になる。

## 生成物（すべてコミットする。CI に Python 依存を持ち込まない）

  - frontend/src/assets/fonts/material-symbols-subset.woff2  … サブセット済みフォント
  - frontend/src/lib/icons/palette.codepoints.json           … アイコン名 → 16進コードポイント
  - frontend/src/lib/icons/palette.manifest.json             … サブセットに含めた名前一覧（drift 検出用）

パレットを変えたら **必ずこのスクリプトを再実行**して生成物を更新する。忘れると
palette.manifest.test.ts が落ちる。

    make subset-icons        # or: python3 scripts/subset_icons.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PALETTE = ROOT / "frontend" / "src" / "lib" / "icons" / "palette.json"
SOURCE_CANDIDATES = [
    ROOT / "frontend" / "node_modules" / "material-symbols" / "material-symbols-outlined.woff2",
    ROOT / "node_modules" / "material-symbols" / "material-symbols-outlined.woff2",
]
OUT_FONT = ROOT / "frontend" / "src" / "assets" / "fonts" / "material-symbols-subset.woff2"
OUT_CODEPOINTS = ROOT / "frontend" / "src" / "lib" / "icons" / "palette.codepoints.json"
OUT_MANIFEST = ROOT / "frontend" / "src" / "lib" / "icons" / "palette.manifest.json"


def palette_names() -> list[str]:
    data = json.loads(PALETTE.read_text(encoding="utf-8"))
    names = list(data["ui"]) + [i for g in data["categories"] for i in g["icons"]]
    return sorted(set(names))  # SUBSET_ICONS（palette.ts）と同じ順


def name_to_codepoint(font) -> dict[str, int]:
    """アイコン名 → コードポイント。ligature(名前→glyph) と cmap(codepoint→glyph) を突き合わせる。"""
    cmap = font.getBestCmap()  # codepoint -> glyphname
    glyph_to_cp = {gn: cp for cp, gn in cmap.items()}
    glyph_to_char = {gn: chr(cp) for cp, gn in cmap.items()}

    name_to_glyph: dict[str, str] = {}

    def visit(subtable):
        if hasattr(subtable, "ExtSubTable"):  # LookupType 7: Extension
            subtable = subtable.ExtSubTable
        ligs = getattr(subtable, "ligatures", None)
        if isinstance(ligs, dict):
            for first, lig_list in ligs.items():
                head = glyph_to_char.get(first, "?")
                for lig in lig_list:
                    tail = "".join(glyph_to_char.get(c, "?") for c in lig.Component)
                    name_to_glyph[head + tail] = lig.LigGlyph

    for lookup in font["GSUB"].table.LookupList.Lookup:
        for st in lookup.SubTable:
            visit(st)

    return {
        name: glyph_to_cp[glyph]
        for name, glyph in name_to_glyph.items()
        if glyph in glyph_to_cp
    }


def main() -> int:
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    source = next((p for p in SOURCE_CANDIDATES if p.exists()), None)
    if source is None:
        print("ERROR: source font not found. run `npm install` in frontend first.", file=sys.stderr)
        return 1

    names = palette_names()
    resolver = name_to_codepoint(TTFont(str(source)))
    invalid = sorted(n for n in names if n not in resolver)
    if invalid:
        print("ERROR: これらはフォントに存在しないアイコン名です（typo？）:", file=sys.stderr)
        for n in invalid:
            print(f"  - {n}", file=sys.stderr)
        return 1

    codepoints = {n: resolver[n] for n in names}

    # FILL 軸だけ残して他（wght/GRAD/opsz）を既定に固定する。FILL は Icon の
    # fontVariationSettings が使う（BottomNav のアクティブ表示など）。
    font = TTFont(str(source))
    limits = {a.axisTag: a.defaultValue for a in font["fvar"].axes if a.axisTag != "FILL"}
    limits["FILL"] = (0, 0, 1)
    instantiateVariableFont(font, limits, inplace=True)

    tmp = OUT_FONT.parent / ".material-symbols-instanced.tmp.woff2"
    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(tmp))

    unicodes = ",".join(f"U+{cp:04X}" for cp in codepoints.values())
    cmd = [
        "pyftsubset",
        str(tmp),
        f"--unicodes={unicodes}",
        "--layout-features=",  # ligature は使わない（codepoint 描画）。全 layout feature を落とす
        "--flavor=woff2",
        f"--output-file={OUT_FONT}",
    ]
    try:
        subprocess.run(cmd, check=True)
    finally:
        tmp.unlink(missing_ok=True)

    OUT_CODEPOINTS.write_text(
        json.dumps({n: f"{cp:04x}" for n, cp in codepoints.items()}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    OUT_MANIFEST.write_text(
        json.dumps(names, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    before = source.stat().st_size
    after = OUT_FONT.stat().st_size
    print(f"サブセット完了: {len(names)} アイコン")
    print(f"  元:       {before / 1024 / 1024:.2f} MB")
    print(f"  サブセット: {after / 1024:.1f} KB  ({after / before:.2%} of original)")
    print(f"  → {OUT_FONT.relative_to(ROOT)}")
    print(f"  → {OUT_CODEPOINTS.relative_to(ROOT)}")
    print(f"  → {OUT_MANIFEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
