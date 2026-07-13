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
}

// Store は Supabase 側の操作。
type Store interface {
	UpsertFXRate(ctx context.Context, date string, rate float64) error
	ListDueSubscriptions(ctx context.Context, today string) ([]supabase.Subscription, error)
	// UpdateSubscriptionRenewal は snapshot と一致する行だけを更新する (CAS)。
	// 一致しなければ applied=false（その間に人が触ったので、次回の cron で拾う）。
	UpdateSubscriptionRenewal(
		ctx context.Context, snapshot supabase.Subscription, update supabase.RenewalUpdate,
	) (applied bool, err error)
	// CategoryID は household 内のカテゴリ名から id を引く。
	CategoryID(ctx context.Context, householdID, name string) (string, error)
	// RecordSubscriptionPayment はサブスクの支払いを支出として記録する。
	// 既に記録済み（DB の unique 制約）なら recorded=false を返し、エラーにしない。
	RecordSubscriptionPayment(
		ctx context.Context, payment supabase.SubscriptionPayment,
	) (recorded bool, err error)
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

// SubscriptionCategory は cron がサブスクの支払いを記録するカテゴリ名。
const SubscriptionCategory = "サブスク"

// rollSubscriptions は更新日が到来したサブスクについて、
// **支払いを台帳に記録してから** 更新日を次の周期へ進める。
//
// 順序が重要: 先に更新日を進めてしまうと、記録に失敗したときにその支払いが
// **永久に失われる**（次回の cron からは「到来済み」に見えなくなるため）。
// 逆順なら、記録できて更新に失敗しても、次回 cron が同じ日を再記録しようとして
// DB の unique 制約が「記録済み」と教えてくれる（冪等）。
func (j *Job) rollSubscriptions(ctx context.Context, rate *fx.Rate) error {
	today := j.Today()
	subs, err := j.Store.ListDueSubscriptions(ctx, today.Format("2006-01-02"))
	if err != nil {
		return err
	}
	if len(subs) == 0 {
		return nil
	}

	var errs []error
	categoryCache := map[string]string{}

	for _, sub := range subs {
		p := j.planUpdate(sub, rate, today)
		if p.skip {
			continue
		}

		categoryID, ok := categoryCache[sub.HouseholdID]
		if !ok {
			categoryID, err = j.Store.CategoryID(ctx, sub.HouseholdID, SubscriptionCategory)
			if err != nil {
				errs = append(errs, fmt.Errorf("%s: カテゴリ取得: %w", sub.ID, err))
				continue
			}
			categoryCache[sub.HouseholdID] = categoryID
		}

		// 到来した更新日ぶんの支払いをすべて記録する。
		// cron が数ヶ月止まっていたなら、その回数ぶん実際に課金されている。
		failed := false
		for _, dueDate := range p.due {
			_, err := j.Store.RecordSubscriptionPayment(ctx, supabase.SubscriptionPayment{
				HouseholdID:    sub.HouseholdID,
				OwnerMemberID:  sub.OwnerMemberID,
				Type:           "expense",
				Amount:         p.amount,
				CategoryID:     categoryID,
				Memo:           sub.Name,
				OccurredOn:     dueDate.Format("2006-01-02"),
				SubscriptionID: sub.ID,
			})
			if err != nil {
				errs = append(errs, fmt.Errorf("%s (%s): 支払いの記録: %w",
					sub.ID, dueDate.Format("2006-01-02"), err))
				failed = true
				break
			}
		}
		// 記録できていない支払いがあるなら更新日を進めない（次回 cron でやり直す）
		if failed {
			continue
		}

		// 一覧取得から更新までの間に人が編集していたら applied=false。
		// 古いスナップショットで巻き戻さず、次回の cron で拾えば良いのでエラーにしない。
		if _, err := j.Store.UpdateSubscriptionRenewal(ctx, sub, p.update); err != nil {
			// 1 件の失敗で残りを諦めない
			errs = append(errs, fmt.Errorf("%s: %w", sub.ID, err))
		}
	}
	return errors.Join(errs...)
}

// plan は 1 件ぶんの処理内容。skip=true なら触らない。
type plan struct {
	update supabase.RenewalUpdate
	// due は到来した更新日（= 実際に発生した支払い）。cron が止まっていた期間ぶんも含む。
	due []time.Time
	// amount は 1 回ぶんの支払額（円）。
	amount int
	skip   bool
}

// planUpdate は 1 件ぶんの処理内容を決める。
func (j *Job) planUpdate(sub supabase.Subscription, rate *fx.Rate, today time.Time) plan {
	current, err := time.ParseInLocation("2006-01-02", sub.NextRenewalDate, jst)
	if err != nil {
		return plan{skip: true}
	}

	// USD は更新日が来て初めて実レートで確定する。レートが無い日に進めてしまうと、
	// 古い概算のまま「確定した」ことになってしまうので、次に取れる日まで待つ。
	if sub.Currency == "USD" && rate == nil {
		return plan{skip: true}
	}

	next, due := renewal.RollForward(current, renewal.Cycle(sub.Cycle), sub.RenewalAnchorDay, today)
	if len(due) == 0 {
		return plan{skip: true}
	}

	update := supabase.RenewalUpdate{NextRenewalDate: next.Format("2006-01-02")}
	amount := sub.AmountJPY

	if sub.Currency == "USD" && rate != nil {
		// 概算 → 実額。更新日に到来した時点のレートで確定させる。
		amount = int(math.Round(sub.OriginalAmount * rate.Rate))
		update.AmountJPY = &amount
		update.FxRate = &rate.Rate
		update.FxRateDate = &rate.Date
	}

	return plan{update: update, due: due, amount: amount}
}
