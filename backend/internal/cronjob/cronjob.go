// Package cronjob は日次 cron の中身 (為替取得 / サブスク更新 / keep-alive) を組み立てる。
package cronjob

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/shiyow5/yuruwollet/backend/internal/fx"
	"github.com/shiyow5/yuruwollet/backend/internal/renewal"
	"github.com/shiyow5/yuruwollet/backend/internal/supabase"
)

// FXFetcher は為替取得。
type FXFetcher interface {
	FetchUSDJPY(ctx context.Context) (fx.Rate, error)
	// FetchUSDJPYOn は過去の指定日のレートを取得する。
	// cron が止まっていた期間の支払いを、その日のレートで確定するために使う。
	FetchUSDJPYOn(ctx context.Context, date string) (fx.Rate, error)
}

// Store は Supabase 側の操作。
type Store interface {
	UpsertFXRate(ctx context.Context, date string, rate float64) error
	ListDueSubscriptions(ctx context.Context, today string) ([]supabase.Subscription, error)
	// FXRateOn は date 以前で最も新しいキャッシュ済みレートを返す。
	FXRateOn(ctx context.Context, date string) (rate float64, rateDate string, found bool, err error)
	// RollSubscriptionCycle は支払いの記録と更新日の前進を 1 トランザクションで行う。
	// 一覧取得から呼出までの間に人が編集していたら applied=false（次回の cron で拾う）。
	RollSubscriptionCycle(
		ctx context.Context, snapshot supabase.Subscription,
		payments []supabase.Payment, update supabase.RenewalUpdate,
	) (applied bool, err error)
	Ping(ctx context.Context) error
}

// Job は日次処理。
type Job struct {
	FX    FXFetcher
	Store Store
	// Now は「今」を返す。テストで固定するためのシーム。
	Now func() time.Time
}

// jst は日付判定の単一の真実 (アプリ全体が JST)。
var jst = time.FixedZone("Asia/Tokyo", 9*60*60)

// Today は JST の今日 (00:00)。
func (j *Job) Today() time.Time {
	now := j.Now().In(jst)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, jst)
}

// Run は 3 つの処理を実行する。
//
// **1 つ落ちても他は必ず実行する**。為替 API が落ちている日に keep-alive まで
// 止まると、Supabase が一時停止してアプリ全体が死ぬ。
// 失敗はまとめて返し、cron 全体としては失敗扱いにする (ログに出す)。
func (j *Job) Run(ctx context.Context) error {
	var errs []error

	rate, fxErr := j.FX.FetchUSDJPY(ctx)
	if fxErr != nil {
		errs = append(errs, fmt.Errorf("為替の取得: %w", fxErr))
	} else if err := j.Store.UpsertFXRate(ctx, rate.Date, rate.Rate); err != nil {
		errs = append(errs, fmt.Errorf("為替の保存: %w", err))
		fxErr = err // 保存に失敗したレートは信用しない (再スナップに使わない)
	}

	// レートが無い日でも JPY サブスクは進める。USD は実額を確定できないので進めない。
	var usable *fx.Rate
	if fxErr == nil {
		usable = &rate
	}
	if err := j.rollSubscriptions(ctx, usable); err != nil {
		errs = append(errs, fmt.Errorf("サブスクの更新: %w", err))
	}

	if err := j.Store.Ping(ctx); err != nil {
		errs = append(errs, fmt.Errorf("keep-alive: %w", err))
	}

	return errors.Join(errs...)
}

// 支払いを記録するカテゴリ（kind=expense の「サブスク」）は RPC 側で解決する。
// クライアントが名前だけで引くと、同名の収入カテゴリを掴んで
// 支出を収入カテゴリで記録してしまう（categories は household×kind×name で一意）。

const dateLayout = "2006-01-02"

// rollSubscriptions は更新日が到来したサブスクについて、
// 到来したぶんの支払いを台帳に記録し、更新日を次の周期へ進める。
//
// 記録と前進は **1 つの RPC = 1 トランザクション** で行う（RollSubscriptionCycle）。
// 別々の往復にすると、その隙間でユーザーが編集/解約したときに、
// 古い金額の支払いだけが台帳に残る。
func (j *Job) rollSubscriptions(ctx context.Context, latest *fx.Rate) error {
	today := j.Today()
	subs, err := j.Store.ListDueSubscriptions(ctx, today.Format(dateLayout))
	if err != nil {
		return err
	}
	if len(subs) == 0 {
		return nil
	}

	// 同じ日のレートを何度も引かない (1 回の cron 内でのみ有効)
	rates := map[string]fx.Rate{}
	if latest != nil {
		rates[today.Format(dateLayout)] = *latest
	}

	var errs []error
	for _, sub := range subs {
		// 為替 API が落ちている日は USD を確定させない。
		// 古い概算のまま台帳に刻むと、あとから直せない。次に取れる日まで待つ。
		if sub.Currency == "USD" && latest == nil {
			continue
		}

		payments, update, err := j.planCycle(ctx, sub, today, rates)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", sub.ID, err))
			continue // 更新日を進めない。次回の cron でやり直す
		}
		if len(payments) == 0 {
			continue
		}

		// 一覧取得から呼出までの間に人が編集していたら applied=false。
		// 古いスナップショットで巻き戻さず、次回の cron で拾えば良いのでエラーにしない。
		if _, err := j.Store.RollSubscriptionCycle(ctx, sub, payments, update); err != nil {
			// 1 件の失敗で残りを諦めない
			errs = append(errs, fmt.Errorf("%s: %w", sub.ID, err))
		}
	}
	return errors.Join(errs...)
}

// planCycle は 1 件ぶんの「記録すべき支払い」と「書き戻す値」を決める。
// payments が空なら、まだ更新日が来ていない（何もしない）。
func (j *Job) planCycle(
	ctx context.Context, sub supabase.Subscription, today time.Time, rates map[string]fx.Rate,
) ([]supabase.Payment, supabase.RenewalUpdate, error) {
	current, err := time.ParseInLocation(dateLayout, sub.NextRenewalDate, jst)
	if err != nil {
		// 日付が壊れている行は触らない (人が直すまで放置する方が安全)
		return nil, supabase.RenewalUpdate{}, nil
	}

	next, due := renewal.RollForward(current, renewal.Cycle(sub.Cycle), sub.RenewalAnchorDay, today)
	if len(due) == 0 {
		return nil, supabase.RenewalUpdate{}, nil
	}

	update := supabase.RenewalUpdate{NextRenewalDate: next.Format(dateLayout)}

	if sub.Currency != "USD" {
		payments := make([]supabase.Payment, 0, len(due))
		for _, d := range due {
			payments = append(payments, supabase.Payment{
				OccurredOn: d.Format(dateLayout),
				Amount:     sub.AmountJPY,
			})
		}
		return payments, update, nil
	}

	// USD は更新日が来て初めて実レートで確定する。
	// **各支払いを、その支払日のレートで確定する。** cron が数ヶ月止まっていた場合に
	// 全期を今日のレートで記録すると、過去の月次収支が実際と食い違う。
	payments := make([]supabase.Payment, 0, len(due))
	var last fx.Rate
	for _, d := range due {
		rate, err := j.rateOn(ctx, d.Format(dateLayout), rates)
		if err != nil {
			// レートが取れない期があるなら 1 件も進めない。
			// 古い概算のまま「確定した」ことにしてしまう方が有害。
			return nil, supabase.RenewalUpdate{}, fmt.Errorf("%s のレート: %w", d.Format(dateLayout), err)
		}
		payments = append(payments, supabase.Payment{
			OccurredOn: d.Format(dateLayout),
			Amount:     int(math.Round(sub.OriginalAmount * rate.Rate)),
		})
		last = rate
	}

	// サブスクに書き戻すのは **最後に到来した更新日** のレート（＝以後の表示に使う概算）
	amount := payments[len(payments)-1].Amount
	update.AmountJPY = &amount
	update.FxRate = &last.Rate
	update.FxRateDate = &last.Date

	return payments, update, nil
}

// maxRateStaleness はキャッシュ済みレートを「その日のレート」として使える上限。
//
// 為替市場は週末・祝日に閉まるので、更新日ちょうどの行が fx_rates に無いことは普通にある
// (日曜の課金 → 金曜のレート)。一方、cron が数ヶ月止まっていた場合の「その日以前の直近」は
// **1 ヶ月前のレート** になりうる。それはその日のレートではない。
// 数日のズレは許し、それを超えたら履歴 API を取りに行く。
const maxRateStaleness = 7 * 24 * time.Hour

// rateOn は date 時点の USD/JPY を返す。
// キャッシュ (fx_rates) → 履歴 API の順に探し、取れたものは fx_rates に保存する。
func (j *Job) rateOn(ctx context.Context, date string, rates map[string]fx.Rate) (fx.Rate, error) {
	if r, ok := rates[date]; ok {
		return r, nil
	}

	rate, rateDate, found, err := j.Store.FXRateOn(ctx, date)
	if err == nil && found && freshEnough(rateDate, date) {
		r := fx.Rate{Date: rateDate, Rate: rate}
		rates[date] = r
		return r, nil
	}

	// cron が止まっていた期間はキャッシュにも無い。履歴レートを取りに行く。
	r, fetchErr := j.FX.FetchUSDJPYOn(ctx, date)
	if fetchErr != nil {
		return fx.Rate{}, errors.Join(err, fetchErr)
	}
	// 保存できないレートは信用しない（既存の方針と同じ）
	if err := j.Store.UpsertFXRate(ctx, r.Date, r.Rate); err != nil {
		return fx.Rate{}, err
	}

	rates[date] = r
	return r, nil
}

// freshEnough は rateDate のレートを want 日のレートとして使ってよいか。
func freshEnough(rateDate, want string) bool {
	got, err := time.ParseInLocation(dateLayout, rateDate, jst)
	if err != nil {
		return false
	}
	target, err := time.ParseInLocation(dateLayout, want, jst)
	if err != nil {
		return false
	}
	return target.Sub(got) <= maxRateStaleness
}
