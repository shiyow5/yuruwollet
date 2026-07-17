#!/usr/bin/env python3
"""ローカル supabase に #44 の網羅確認用テストデータを投入 / 撤去する。

設計の要点（安全性はここで担保している）:

1. **ローカル専用**。接続先は `docker exec <local container> psql` に固定してあり、
   接続文字列を受け取らない。**本番に届く経路が構造的に存在しない**。
2. **全行が決定的な UUIDv5**（固定 namespace + ラベル）。`--remove` はこの id 集合だけを
   消すので、手で作った行や実データに当たりようがない。`--apply` も冪等（再実行で同じ id を上書き）。
   唯一の例外が `profiles.opening_balance`（既存行の更新なので id で切り分けられない）。
   これは `--apply` 時に元の値を BACKUP_FILE に控え、`--remove` で書き戻す。
3. **`is_system_generated`（残高調整）の行は作らない**。RLS で禁止されており RPC 経由のみ。
   24 日の壁は UI から `?now=` で確認する（#44 の注意書き）。

使い方:
    python3 scripts/seed_testdata.py --apply     # 投入
    python3 scripts/seed_testdata.py --status    # 今いくつ入っているか
    python3 scripts/seed_testdata.py --remove    # 撤去
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

CONTAINER = 'supabase_db_yuruwollet'
HOUSEHOLD = 'main'

# opening_balance は既存行の更新なので id では切り分けられない。投入前の値をここに控えて撤去時に戻す。
BACKUP_FILE = Path(__file__).with_name('.testdata-opening-balance.json')

# この namespace から生成した id だけが「テストデータ」。撤去はこの集合に閉じる。
NS = uuid.UUID('6f1a9c2e-8b34-4d5f-9a10-2c7e5b8d4f31')

# 為替は seed.sql が入れる 150.000000 に合わせる（USD サブスクの amount_jpy と辻褄を合わせるため）。
FX_RATE = 150.0


def tid(label: str) -> str:
    """ラベルから決定的な UUID を作る。同じラベルなら何度でも同じ id。"""
    return str(uuid.uuid5(NS, label))


# ---------------------------------------------------------------- 月の計算


def month_start(today: date, back: int) -> date:
    """today の `back` ヶ月前の 1 日。"""
    total = today.year * 12 + (today.month - 1) - back
    return date(total // 12, total % 12 + 1, 1)


# ---------------------------------------------------------------- データ定義


@dataclass(frozen=True)
class Txn:
    member: str
    kind: str  # 'income' | 'expense'
    category: str
    day: int
    amount: int
    memo: str


# 月ごとの収支。**貯金目標の達成 / 未達成 / マイナスを狙って組んである**（下の GOALS と対で見ること）。
#   back=3: 目標なしの月
#   back=2: 達成する月
#   back=1: 未達成の月
#   back=0: 今月。ゆるり = 使いすぎでマイナス / しよを = 目標未設定
LEDGER: dict[int, list[Txn]] = {
    3: [
        # --- ゆるり: 収入 115,000 / 支出 37,700 ---
        Txn('yururi', 'income', 'バイト代', 25, 85000, 'コンビニ'),
        Txn('yururi', 'income', '仕送り', 5, 30000, '実家から'),
        Txn('yururi', 'expense', '食費', 3, 4200, 'スーパー'),
        Txn('yururi', 'expense', '食費', 11, 1800, 'コンビニ'),
        Txn('yururi', 'expense', '食費', 19, 5600, 'まとめ買い'),
        Txn('yururi', 'expense', '友好費', 8, 3400, 'カフェ'),
        Txn('yururi', 'expense', '交通費', 2, 12000, '定期券'),
        Txn('yururi', 'expense', '光熱費', 15, 7800, '電気・ガス'),
        Txn('yururi', 'expense', 'その他', 22, 2900, '日用品'),
        # --- しよを: 収入 70,000 / 支出 41,000 ---
        Txn('shiyowo', 'income', 'バイト代', 25, 55000, '塾講師'),
        Txn('shiyowo', 'income', '仕送り', 5, 15000, '実家から'),
        Txn('shiyowo', 'expense', '食費', 3, 3600, 'スーパー'),
        Txn('shiyowo', 'expense', '食費', 14, 4900, '外食'),
        Txn('shiyowo', 'expense', '交通費', 2, 8500, '定期券'),
        Txn('shiyowo', 'expense', '友好費', 9, 5200, '飲み会'),
        Txn('shiyowo', 'expense', '光熱費', 15, 6800, '電気・ガス'),
        Txn('shiyowo', 'expense', 'その他', 21, 12000, '参考書'),
    ],
    2: [
        # --- ゆるり: 収入 118,000 / 支出 62,000 → 差 56,000 ≥ 目標 50,000 = 達成 ---
        Txn('yururi', 'income', 'バイト代', 25, 88000, 'コンビニ'),
        Txn('yururi', 'income', '仕送り', 5, 30000, '実家から'),
        Txn('yururi', 'expense', '食費', 2, 5200, 'スーパー'),
        Txn('yururi', 'expense', '食費', 9, 3800, 'コンビニ'),
        Txn('yururi', 'expense', '食費', 17, 6400, 'まとめ買い'),
        Txn('yururi', 'expense', '食費', 24, 4100, 'スーパー'),
        Txn('yururi', 'expense', '友好費', 6, 5800, '飲み会'),
        Txn('yururi', 'expense', '友好費', 20, 3200, 'カフェ'),
        Txn('yururi', 'expense', '交通費', 1, 12000, '定期券'),
        Txn('yururi', 'expense', '学祭関連', 13, 9500, '衣装代'),
        Txn('yururi', 'expense', '光熱費', 15, 8300, '電気・ガス'),
        Txn('yururi', 'expense', 'その他', 27, 3700, '日用品'),
        # --- しよを: 収入 72,000 / 支出 45,000 → 差 27,000 ≥ 目標 20,000 = 達成 ---
        Txn('shiyowo', 'income', 'バイト代', 25, 57000, '塾講師'),
        Txn('shiyowo', 'income', '仕送り', 5, 15000, '実家から'),
        Txn('shiyowo', 'expense', '食費', 4, 4100, 'スーパー'),
        Txn('shiyowo', 'expense', '食費', 13, 5300, '外食'),
        Txn('shiyowo', 'expense', '食費', 22, 3800, 'コンビニ'),
        Txn('shiyowo', 'expense', '交通費', 2, 8500, '定期券'),
        Txn('shiyowo', 'expense', '友好費', 16, 7600, '映画'),
        Txn('shiyowo', 'expense', '光熱費', 15, 7100, '電気・ガス'),
        Txn('shiyowo', 'expense', 'その他', 26, 8600, '日用品'),
    ],
    1: [
        # --- ゆるり: 収入 118,000 / 支出 92,000 → 差 26,000 < 目標 50,000 = 未達成 ---
        Txn('yururi', 'income', 'バイト代', 25, 88000, 'コンビニ'),
        Txn('yururi', 'income', '仕送り', 5, 30000, '実家から'),
        Txn('yururi', 'expense', '食費', 4, 6100, 'スーパー'),
        Txn('yururi', 'expense', '食費', 12, 4700, 'コンビニ'),
        Txn('yururi', 'expense', '食費', 21, 5900, 'まとめ買い'),
        Txn('yururi', 'expense', '食費', 28, 3300, 'スーパー'),
        Txn('yururi', 'expense', '友好費', 7, 12800, '誕生日プレゼント'),
        Txn('yururi', 'expense', '友好費', 18, 4400, 'カフェ'),
        Txn('yururi', 'expense', '交通費', 1, 12000, '定期券'),
        Txn('yururi', 'expense', '学祭関連', 10, 24000, '機材レンタル'),
        Txn('yururi', 'expense', '光熱費', 15, 9200, '電気・ガス'),
        Txn('yururi', 'expense', 'その他', 23, 9600, '日用品'),
        # --- しよを: 収入 72,000 / 支出 66,000 → 差 6,000 < 目標 20,000 = 未達成 ---
        Txn('shiyowo', 'income', 'バイト代', 25, 57000, '塾講師'),
        Txn('shiyowo', 'income', '仕送り', 5, 15000, '実家から'),
        Txn('shiyowo', 'expense', '食費', 5, 5500, 'スーパー'),
        Txn('shiyowo', 'expense', '食費', 15, 4200, 'コンビニ'),
        Txn('shiyowo', 'expense', '食費', 25, 6300, '外食'),
        Txn('shiyowo', 'expense', '交通費', 2, 8500, '定期券'),
        Txn('shiyowo', 'expense', '友好費', 11, 9800, 'ライブ'),
        Txn('shiyowo', 'expense', '学祭関連', 19, 15000, '出店の材料費'),
        Txn('shiyowo', 'expense', '光熱費', 15, 7900, '電気・ガス'),
        Txn('shiyowo', 'expense', 'その他', 28, 8800, '日用品'),
    ],
    0: [
        # --- ゆるり: 収入 30,000 / 支出 55,000 → 差 -25,000 = **マイナスの月** ---
        Txn('yururi', 'income', '仕送り', 5, 30000, '実家から'),
        Txn('yururi', 'expense', '食費', 2, 5400, 'スーパー'),
        Txn('yururi', 'expense', '食費', 9, 4800, 'コンビニ'),
        Txn('yururi', 'expense', '食費', 14, 3900, 'まとめ買い'),
        Txn('yururi', 'expense', '友好費', 6, 6700, '飲み会'),
        Txn('yururi', 'expense', '交通費', 1, 12000, '定期券'),
        Txn('yururi', 'expense', '光熱費', 15, 8700, '電気・ガス'),
        Txn('yururi', 'expense', 'その他', 11, 13500, 'ヘッドホン'),
        # --- しよを: 収入 35,000 / 支出 28,000（目標は未設定のままにする）---
        Txn('shiyowo', 'income', '仕送り', 5, 15000, '実家から'),
        Txn('shiyowo', 'income', 'バイト代', 10, 20000, '単発バイト'),
        Txn('shiyowo', 'expense', '食費', 3, 4600, 'スーパー'),
        Txn('shiyowo', 'expense', '食費', 12, 5100, '外食'),
        Txn('shiyowo', 'expense', '交通費', 2, 8500, '定期券'),
        Txn('shiyowo', 'expense', '友好費', 8, 3900, 'カフェ'),
        Txn('shiyowo', 'expense', '光熱費', 15, 5900, '電気・ガス'),
    ],
}

# (member, back, target)。back=0 の shiyowo は**わざと入れない**（「目標未設定」の表示を見るため）。
GOALS = [
    ('yururi', 2, 50000),   # 達成（差 56,000）
    ('yururi', 1, 50000),   # 未達成（差 26,000）
    ('yururi', 0, 50000),   # マイナス（差 -25,000）
    ('shiyowo', 2, 20000),  # 達成（差 27,000）
    ('shiyowo', 1, 20000),  # 未達成（差 6,000）
]


@dataclass(frozen=True)
class Sub:
    member: str
    name: str
    currency: str
    original: float
    cycle: str
    status: str
    renewal_day: int  # 31 を渡すと「月末課金」になる（月の日数に丸める）
    renewal_month_back: int  # 何ヶ月後に更新が来るか（負 = 未来）


SUBS = [
    # JPY / monthly / active
    Sub('yururi', 'Netflix', 'JPY', 1490, 'monthly', 'active', 1, -1),
    # USD / monthly / active（概算表示の確認）
    Sub('yururi', 'Spotify', 'USD', 10.99, 'monthly', 'active', 5, -1),
    # JPY / monthly / **月末課金 31 日**（#44 の明示要件）
    Sub('yururi', 'ジム', 'JPY', 7800, 'monthly', 'active', 31, -1),
    # USD / yearly / considering_cancel
    Sub('yururi', 'Adobe CC', 'USD', 239.88, 'yearly', 'considering_cancel', 20, -2),
    # JPY / yearly / active
    Sub('shiyowo', 'Amazon Prime', 'JPY', 5900, 'yearly', 'active', 12, -3),
    # USD / monthly / trial
    Sub('shiyowo', 'ChatGPT Plus', 'USD', 20.00, 'monthly', 'trial', 8, -1),
    # JPY / monthly / considering_cancel
    Sub('shiyowo', '動画配信サービス', 'JPY', 990, 'monthly', 'considering_cancel', 22, -1),
]


@dataclass(frozen=True)
class Wish:
    member: str
    genre: str
    title: str
    url: str | None
    memo: str
    archived: bool


WISHES = [
    Wish('yururi', 'want', '新しいコーヒーメーカー', 'https://example.com/coffee', '朝が楽になりそう', False),
    Wish('shiyowo', 'want', 'ワイヤレスイヤホン', None, 'ノイキャン付きがいい', False),
    Wish('yururi', 'place', '海辺のカフェ', 'https://example.com/cafe', '夕方に行きたい', False),
    Wish('shiyowo', 'place', '夜景の見える展望台', None, '冬がきれいらしい', False),
    # 思い出アーカイブ（status=done + archived=true。片方だけ動かすと UI が壊れる）
    Wish('yururi', 'want', 'ホットサンドメーカー', None, '毎朝つかってる', True),
    Wish('shiyowo', 'place', '紅葉の京都', None, '人が多かったけど良かった', True),
]

OPENING_BALANCE = {'yururi': 120000, 'shiyowo': 95000}


# ---------------------------------------------------------------- SQL 組み立て


def q(s: str) -> str:
    """文字列リテラルをエスケープする。"""
    return "'" + s.replace("'", "''") + "'"


def resolve_renewal(today: date, sub: Sub) -> date:
    base = month_start(today, sub.renewal_month_back)
    last = month_start(base, -1) - timedelta(days=1)
    return date(base.year, base.month, min(sub.renewal_day, last.day))


def build_apply_sql(today: date) -> str:
    lines: list[str] = ['begin;']

    for member, bal in OPENING_BALANCE.items():
        lines.append(
            f'update public.profiles set opening_balance = {bal} where member_id = {q(member)};'
        )

    for back, txns in LEDGER.items():
        base = month_start(today, back)
        for i, t in enumerate(txns):
            occurred = date(base.year, base.month, t.day)
            row_id = tid(f'txn:{back}:{t.member}:{i}')
            lines.append(
                'insert into public.transactions '
                '(id, household_id, owner_member_id, type, amount, category_id, memo, occurred_on) '
                f'select {q(row_id)}, {q(HOUSEHOLD)}, {q(t.member)}, {q(t.kind)}, {t.amount}, '
                f'c.id, {q(t.memo)}, {q(occurred.isoformat())} '
                f'from public.categories c where c.household_id = {q(HOUSEHOLD)} '
                f'and c.kind = {q(t.kind)} and c.name = {q(t.category)} '
                'on conflict (id) do update set amount = excluded.amount, '
                'memo = excluded.memo, occurred_on = excluded.occurred_on;'
            )

    for member, back, target in GOALS:
        base = month_start(today, back)
        row_id = tid(f'goal:{member}:{back}')
        lines.append(
            'insert into public.savings_goals (id, household_id, member_id, period_month, target_amount) '
            f'values ({q(row_id)}, {q(HOUSEHOLD)}, {q(member)}, {q(base.isoformat())}, {target}) '
            'on conflict (id) do update set target_amount = excluded.target_amount;'
        )

    for s in SUBS:
        row_id = tid(f'sub:{s.member}:{s.name}')
        renewal = resolve_renewal(today, s)
        if s.currency == 'USD':
            amount_jpy = round(s.original * FX_RATE)
            fx_rate = f'{FX_RATE:.6f}'
            fx_date = q(today.isoformat())
        else:
            amount_jpy = int(s.original)
            fx_rate = 'null'
            fx_date = 'null'
        lines.append(
            'insert into public.subscriptions '
            '(id, household_id, owner_member_id, name, currency, original_amount, amount_jpy, '
            'fx_rate, fx_rate_date, cycle, next_renewal_date, status) '
            f'values ({q(row_id)}, {q(HOUSEHOLD)}, {q(s.member)}, {q(s.name)}, {q(s.currency)}, '
            f'{s.original}, {amount_jpy}, {fx_rate}, {fx_date}, {q(s.cycle)}, '
            f'{q(renewal.isoformat())}, {q(s.status)}) '
            'on conflict (id) do update set original_amount = excluded.original_amount, '
            'amount_jpy = excluded.amount_jpy, next_renewal_date = excluded.next_renewal_date, '
            'status = excluded.status;'
        )

    for i, w in enumerate(WISHES):
        row_id = tid(f'wish:{i}')
        url = q(w.url) if w.url else 'null'
        status = 'done' if w.archived else 'planned'
        lines.append(
            'insert into public.wishlist_items '
            '(id, household_id, registrant_id, genre, title, url, memo, status, archived) '
            f'values ({q(row_id)}, {q(HOUSEHOLD)}, {q(w.member)}, {q(w.genre)}, {q(w.title)}, '
            f'{url}, {q(w.memo)}, {q(status)}, {str(w.archived).lower()}) '
            'on conflict (id) do update set title = excluded.title, status = excluded.status, '
            'archived = excluded.archived;'
        )

    lines.append('commit;')
    return '\n'.join(lines)


def all_ids() -> dict[str, list[str]]:
    """テストデータの id 集合。撤去はこれだけを消す。"""
    return {
        'transactions': [
            tid(f'txn:{back}:{t.member}:{i}')
            for back, txns in LEDGER.items()
            for i, t in enumerate(txns)
        ],
        'savings_goals': [tid(f'goal:{m}:{b}') for m, b, _ in GOALS],
        'subscriptions': [tid(f'sub:{s.member}:{s.name}') for s in SUBS],
        'wishlist_items': [tid(f'wish:{i}') for i, _ in enumerate(WISHES)],
    }


def build_remove_sql(restore: dict[str, int]) -> str:
    lines = ['begin;']
    ids = all_ids()
    # transactions は subscriptions からの参照（決済行）がありうるので先に消す
    for table in ('transactions', 'savings_goals', 'subscriptions', 'wishlist_items'):
        joined = ', '.join(q(i) for i in ids[table])
        lines.append(f'delete from public.{table} where id in ({joined});')
    # 投入前の opening_balance に戻す（控えが無ければ触らない = 勝手に 0 にしない）
    for member, bal in restore.items():
        lines.append(
            f'update public.profiles set opening_balance = {int(bal)} where member_id = {q(member)};'
        )
    lines.append('commit;')
    return '\n'.join(lines)


def build_status_sql() -> str:
    ids = all_ids()
    parts = []
    for table in ('transactions', 'savings_goals', 'subscriptions', 'wishlist_items'):
        joined = ', '.join(q(i) for i in ids[table])
        parts.append(
            f"select '{table}' as table_name, count(*) as seeded, {len(ids[table])} as expected "
            f'from public.{table} where id in ({joined})'
        )
    return '\nunion all\n'.join(parts) + ';'


# ---------------------------------------------------------------- 実行


def psql(sql: str) -> str:
    proc = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
         '-v', 'ON_ERROR_STOP=1'],
        input=sql,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.exit(f'psql に失敗しました:\n{proc.stderr.strip()}')
    return proc.stdout


def read_opening_balance() -> dict[str, int]:
    """投入前の opening_balance を読む（撤去時に書き戻すため）。"""
    out = psql(
        '\\pset format unaligned\n\\pset tuples_only on\n'
        'select member_id || \'=\' || opening_balance from public.profiles '
        f'where member_id in ({", ".join(q(m) for m in OPENING_BALANCE)}) order by member_id;'
    )
    result: dict[str, int] = {}
    for line in out.strip().splitlines():
        if '=' in line:
            member, _, bal = line.strip().partition('=')
            result[member] = int(bal)
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--apply', action='store_true', help='テストデータを投入する（冪等）')
    g.add_argument('--remove', action='store_true', help='テストデータだけを撤去する')
    g.add_argument('--status', action='store_true', help='今いくつ入っているかを表示する')
    g.add_argument('--dump-sql', action='store_true', help='実行せずに SQL を出力する（確認用）')
    ap.add_argument('--today', help='基準日 (YYYY-MM-DD)。既定は今日。')
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()

    if args.dump_sql:
        print(build_apply_sql(today))
        return

    if args.apply:
        # 上書きする前に元の opening_balance を控える。
        # 既に控えがある = 前回の投入が撤去されていない → 控えを上書きすると元の値を永久に失う。
        if not BACKUP_FILE.exists():
            BACKUP_FILE.write_text(json.dumps(read_opening_balance()), encoding='utf-8')
        psql(build_apply_sql(today))
        print(f'投入しました（基準日 {today}）。')
        print(psql(build_status_sql()))
    elif args.remove:
        if BACKUP_FILE.exists():
            restore = json.loads(BACKUP_FILE.read_text(encoding='utf-8'))
        else:
            restore = {}
            print('注意: opening_balance の控えが無いので、初期残高には触れません。', file=sys.stderr)
        psql(build_remove_sql(restore))
        BACKUP_FILE.unlink(missing_ok=True)
        restored = ' / '.join(f'{m}={v}' for m, v in restore.items()) or '触れず'
        print(f'撤去しました（テストデータの id のみ / opening_balance: {restored}）。')
        print(psql(build_status_sql()))
    else:
        print(psql(build_status_sql()))


if __name__ == '__main__':
    main()
