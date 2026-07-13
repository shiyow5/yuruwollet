// Package renewal はサブスクの更新日ロールフォワードを扱う。
package renewal

import "time"

// Cycle はサブスクの更新周期。
type Cycle string

const (
	// Monthly は毎月更新。
	Monthly Cycle = "monthly"
	// Yearly は毎年更新。
	Yearly Cycle = "yearly"
)

// lastDayOfMonth は year/month の末日 (28-31) を返す。
func lastDayOfMonth(year int, month time.Month, loc *time.Location) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, loc).Day()
}

// advance は current から months ヶ月進め、日は anchor に合わせる。
// 進めた先の月に anchor 日が無ければ**その月の末日に丸める**。
//
// なぜ anchor が要るか:
//   - time.AddDate は繰り上がる。1/31 に 1 ヶ月足すと 2/31 → 3/3 になり、1 回のロールで
//     2 ヶ月ぶん進んでしまう。
//   - かといって単純に「前回の日付」を基準に丸めると、**丸めた日が次回の基準になって固定化する**。
//     1/31 → 2/28 を保存すると、次は 3/28 になり、以後ずっと 28 日課金に化ける。
//   - 本来の課金日 (anchor) を別に持ち、毎回そこから丸め直せば 1/31 → 2/28 → 3/31 に戻る。
func advance(current time.Time, months, anchor int) time.Time {
	loc := current.Location()
	// 日を 1 に固定して月だけ進める (繰り上がりを起こさせない)
	base := time.Date(current.Year(), current.Month(), 1, 0, 0, 0, 0, loc).AddDate(0, months, 0)

	day := anchor
	if last := lastDayOfMonth(base.Year(), base.Month(), loc); day > last {
		day = last
	}
	return time.Date(base.Year(), base.Month(), day, 0, 0, 0, 0, loc)
}

// AnchorOf は更新日から本来の課金日を推定する (anchor 未設定の既存行のフォールバック)。
func AnchorOf(t time.Time) int {
	return t.Day()
}

// Next は current の次の更新日を 1 期ぶん進めて返す。
// anchor は本来の課金日 (1-31)。0 以下なら current の日を使う。
func Next(current time.Time, cycle Cycle, anchor int) time.Time {
	if anchor <= 0 {
		anchor = AnchorOf(current)
	}
	months := 1
	if cycle == Yearly {
		months = 12
	}
	return advance(current, months, anchor)
}

// RollForward は next_renewal_date が today 以前なら、today より後になるまで進める。
//
// 何期ぶん遅れていても 1 回の実行で追いつく (Worker が数日止まっていた場合に備える)。
// 進める必要が無ければ current をそのまま返し、rolled=false とする。
func RollForward(current time.Time, cycle Cycle, anchor int, today time.Time) (next time.Time, rolled bool) {
	next = current
	// 更新日「当日」も到来済みとして進める (その日のうちに次の周期へ移す)
	for !next.After(today) {
		next = Next(next, cycle, anchor)
		rolled = true
	}
	return next, rolled
}
