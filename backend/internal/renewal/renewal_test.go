package renewal

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestNext(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		current string
		cycle   Cycle
		anchor  int
		want    string
	}{
		{"monthly 通常", "2026-07-10", Monthly, 10, "2026-08-10"},
		{"monthly 年またぎ", "2026-12-15", Monthly, 15, "2027-01-15"},
		{"yearly 通常", "2026-07-10", Yearly, 10, "2027-07-10"},

		// time.AddDate は 1/31 + 1ヶ月 を 3/3 に繰り上げてしまう。
		// サブスクの更新日としては 2/28 が正しい (1 回のロールで 2 ヶ月進んではいけない)。
		{"月末: 1/31 → 2/28", "2026-01-31", Monthly, 31, "2026-02-28"},
		{"月末: うるう年は 2/29", "2028-01-31", Monthly, 31, "2028-02-29"},
		{"月末: 3/31 → 4/30", "2026-03-31", Monthly, 31, "2026-04-30"},

		// ここが anchor を持つ理由。丸めた 2/28 を次の基準にすると 3/28 に化けるが、
		// 本来の課金日 (31) を保持していれば 3/31 に戻る。
		{"丸めた翌月は本来の課金日に戻る: 2/28(anchor31) → 3/31", "2026-02-28", Monthly, 31, "2026-03-31"},
		{"anchor 30: 2/28 → 3/30", "2026-02-28", Monthly, 30, "2026-03-30"},

		// yearly でうるう日 2/29 の翌年は 2/28、その次は 2/29 に戻る
		{"yearly 2/29 → 翌年 2/28", "2028-02-29", Yearly, 29, "2029-02-28"},
		{"yearly 2/28(anchor29) → うるう年は 2/29 に戻る", "2027-02-28", Yearly, 29, "2028-02-29"},

		// anchor 未設定 (既存行) は現在の日をそのまま使う
		{"anchor 0 は current の日を使う", "2026-07-10", Monthly, 0, "2026-08-10"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := Next(d(tc.current), tc.cycle, tc.anchor)
			if got.Format("2006-01-02") != tc.want {
				t.Errorf("Next(%s, %s, anchor=%d) = %s, want %s",
					tc.current, tc.cycle, tc.anchor, got.Format("2006-01-02"), tc.want)
			}
		})
	}
}

func TestRollForward(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		current    string
		cycle      Cycle
		anchor     int
		today      string
		want       string
		wantRolled bool
	}{
		{"未来の更新日は進めない", "2026-08-10", Monthly, 10, "2026-07-13", "2026-08-10", false},

		// 更新日「当日」は到来済みとして進める
		{"当日は進める", "2026-07-13", Monthly, 13, "2026-07-13", "2026-08-13", true},

		{"1 期ぶん遅れ", "2026-06-10", Monthly, 10, "2026-07-13", "2026-08-10", true},

		// Worker が数ヶ月止まっていても 1 回で追いつく
		{"複数期ぶん遅れをまとめて進める", "2026-01-10", Monthly, 10, "2026-07-13", "2026-08-10", true},

		{"yearly の遅れ", "2024-03-01", Yearly, 1, "2026-07-13", "2027-03-01", true},

		// 複数期またぐ間に短い月を通っても、本来の課金日を失わない
		{"1/31 から 4 月まで遅れても 31 日に戻る", "2026-01-31", Monthly, 31, "2026-03-15", "2026-03-31", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			next, rolled := RollForward(d(tc.current), tc.cycle, tc.anchor, d(tc.today))
			if next.Format("2006-01-02") != tc.want {
				t.Errorf("next = %s, want %s", next.Format("2006-01-02"), tc.want)
			}
			if rolled != tc.wantRolled {
				t.Errorf("rolled = %v, want %v", rolled, tc.wantRolled)
			}
			if !next.After(d(tc.today)) {
				t.Errorf("next (%s) は today (%s) より後でなければならない", next.Format("2006-01-02"), tc.today)
			}
		})
	}
}

func TestAnchorOf(t *testing.T) {
	t.Parallel()
	if got := AnchorOf(d("2026-01-31")); got != 31 {
		t.Errorf("AnchorOf = %d, want 31", got)
	}
}
