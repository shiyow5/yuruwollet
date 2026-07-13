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
	UpdateSubscriptionRenewal(ctx context.Context, id string, update supabase.RenewalUpdate) error
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

// rollSubscriptions は更新日が到来したサブスクを次の周期へ進める。
func (j *Job) rollSubscriptions(ctx context.Context, rate *fx.Rate) error {
	today := j.Today()
	subs, err := j.Store.ListDueSubscriptions(ctx, today.Format("2006-01-02"))
	if err != nil {
		return err
	}

	var errs []error
	for _, sub := range subs {
		update, skip := j.planUpdate(sub, rate, today)
		if skip {
			continue
		}
		if err := j.Store.UpdateSubscriptionRenewal(ctx, sub.ID, update); err != nil {
			// 1 件の失敗で残りを諦めない
			errs = append(errs, fmt.Errorf("%s: %w", sub.ID, err))
		}
	}
	return errors.Join(errs...)
}

// planUpdate は 1 件ぶんの書き戻し内容を決める。skip=true なら触らない。
func (j *Job) planUpdate(sub supabase.Subscription, rate *fx.Rate, today time.Time) (supabase.RenewalUpdate, bool) {
	current, err := time.ParseInLocation("2006-01-02", sub.NextRenewalDate, jst)
	if err != nil {
		return supabase.RenewalUpdate{}, true
	}

	// USD は更新日が来て初めて実レートで確定する。レートが無い日に進めてしまうと、
	// 古い概算のまま「確定した」ことになってしまうので、次に取れる日まで待つ。
	if sub.Currency == "USD" && rate == nil {
		return supabase.RenewalUpdate{}, true
	}

	next, rolled := renewal.RollForward(current, renewal.Cycle(sub.Cycle), sub.RenewalAnchorDay, today)
	if !rolled {
		return supabase.RenewalUpdate{}, true
	}

	update := supabase.RenewalUpdate{NextRenewalDate: next.Format("2006-01-02")}

	if sub.Currency == "USD" && rate != nil {
		// 概算 → 実額。更新日に到来した時点のレートで確定させる。
		amount := int(math.Round(sub.OriginalAmount * rate.Rate))
		update.AmountJPY = &amount
		update.FxRate = &rate.Rate
		update.FxRateDate = &rate.Date
	}

	return update, false
}
