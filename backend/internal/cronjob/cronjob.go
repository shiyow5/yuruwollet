// Package cronjob は日次 cron の中身 (為替取得 / サブスク精算 / keep-alive) を組み立てる。
package cronjob

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/shiyow5/yuruwollet/backend/internal/fx"
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
	// ListDueSubscriptions は更新日が到来したサブスクの id を返す。
	ListDueSubscriptions(ctx context.Context, today string) ([]supabase.Subscription, error)
	// SettleSubscription は到来済みの支払いを台帳に記録し、更新日を進める（DB 側の RPC）。
	//
	// **ロールフォワードの計算は SQL にしか無い。** Go 側にも書くと 2 箇所に同じ規則が生まれ、
	// next_renewal_date の食い違いが二重計上や欠落に直結する。
	//
	// USD でその日のレートが fx_rates に無ければ、そこで止めて needsFXOn に日付を返す
	// （SQL は為替 API を叩けない）。cron がその日のレートを取得して呼び直す。
	SettleSubscription(ctx context.Context, subscriptionID string) (recorded int, needsFXOn string, err error)
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

const dateLayout = "2006-01-02"

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
	}

	if err := j.settleSubscriptions(ctx); err != nil {
		errs = append(errs, fmt.Errorf("サブスクの精算: %w", err))
	}

	if err := j.Store.Ping(ctx); err != nil {
		errs = append(errs, fmt.Errorf("keep-alive: %w", err))
	}

	return errors.Join(errs...)
}

// maxFXFetchPerSubscription は 1 件のサブスクにつき履歴レートを取りに行く上限。
//
// 精算 RPC は「レートが無い日」で止まり、その日付を返す。cron はそれを取得して呼び直す。
// 通常は 1〜2 回で終わるが、レートが恒久的に取れない日があると無限ループになりうるので
// 上限を切る。打ち切ったぶんは次回の cron が続きから拾う（記録は冪等）。
const maxFXFetchPerSubscription = 12

// settleSubscriptions は更新日が到来したサブスクを精算する。
//
// **計算は DB 側（settle_subscription）にある。** cron の役割は
// 「SQL が要求した日の為替レートを取ってきて渡すこと」だけ。
func (j *Job) settleSubscriptions(ctx context.Context) error {
	today := j.Today()
	subs, err := j.Store.ListDueSubscriptions(ctx, today.Format(dateLayout))
	if err != nil {
		return err
	}

	var errs []error
	for _, sub := range subs {
		if err := j.settleOne(ctx, sub.ID); err != nil {
			// 1 件の失敗で残りを諦めない
			errs = append(errs, fmt.Errorf("%s (%s): %w", sub.Name, sub.ID, err))
		}
	}
	return errors.Join(errs...)
}

// settleOne は 1 件のサブスクを、レートを補給しながら精算し切る。
func (j *Job) settleOne(ctx context.Context, subscriptionID string) error {
	for i := 0; i < maxFXFetchPerSubscription; i++ {
		_, needsFXOn, err := j.Store.SettleSubscription(ctx, subscriptionID)
		if err != nil {
			return err
		}
		if needsFXOn == "" {
			return nil // 精算し切った
		}

		// SQL は為替 API を叩けない。要求された日のレートを取ってきて保存し、呼び直す。
		rate, err := j.FX.FetchUSDJPYOn(ctx, needsFXOn)
		if err != nil {
			// レートが取れない期があるなら、そこで止める。
			// 古い概算のまま「確定した」ことにする方が有害（あとから直せない）。
			// 記録済みのぶんはそのまま残り、次回の cron が続きから拾う。
			return fmt.Errorf("%s のレート: %w", needsFXOn, err)
		}
		if err := j.Store.UpsertFXRate(ctx, rate.Date, rate.Rate); err != nil {
			return fmt.Errorf("%s のレートの保存: %w", needsFXOn, err)
		}
	}
	return fmt.Errorf("為替レートの補給が %d 回を超えました（次回の cron が続きから拾います）",
		maxFXFetchPerSubscription)
}
