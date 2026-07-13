// Package supabase は service_role で PostgREST を叩く薄いクライアント。
package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

// Client は Supabase REST クライアント (service_role)。
type Client struct {
	HTTP       *http.Client
	BaseURL    string
	ServiceKey string
}

// New はクライアントを作る。
//
// httpClient は **必須**。nil を渡して net/http の既定トランスポートに落ちてはいけない。
// workerd では標準トランスポートが fetch を不正な this で呼び、Illegal invocation で
// panic する（それで cron が本番で毎回死んでいた）。ネイティブの go test は
// この経路を通らないので、既定値へのフォールバックを残すと**静かに再発する**。
func New(httpClient *http.Client, baseURL, serviceKey string) *Client {
	if httpClient == nil {
		panic("supabase: httpClient は必須です（workerd では net/http の既定トランスポートが panic する）")
	}
	return &Client{HTTP: httpClient, BaseURL: baseURL, ServiceKey: serviceKey}
}

// Subscription は cron が更新するために必要な最小限のサブスク情報。
type Subscription struct {
	ID               string   `json:"id"`
	HouseholdID      string   `json:"household_id"`
	OwnerMemberID    string   `json:"owner_member_id"`
	Name             string   `json:"name"`
	Currency         string   `json:"currency"`
	OriginalAmount   float64  `json:"original_amount"`
	Cycle            string   `json:"cycle"`
	NextRenewalDate  string   `json:"next_renewal_date"`
	RenewalAnchorDay int      `json:"renewal_anchor_day"`
	AmountJPY        int      `json:"amount_jpy"`
	FxRate           *float64 `json:"fx_rate"`
}

func (c *Client) do(ctx context.Context, method, path string, body any, prefer string) ([]byte, error) {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("supabase: リクエストを組み立てられませんでした: %w", err)
		}
		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, reader)
	if err != nil {
		return nil, fmt.Errorf("supabase: リクエストを作れませんでした: %w", err)
	}
	req.Header.Set("apikey", c.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+c.ServiceKey)
	req.Header.Set("Content-Type", "application/json")
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("supabase: 通信に失敗しました: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("supabase: %s %s → %d: %s", method, path, res.StatusCode, payload)
	}
	return payload, nil
}

// UpsertFXRate は当日の USD/JPY を保存する。同じ日の再実行でも行が増えない。
func (c *Client) UpsertFXRate(ctx context.Context, date string, rate float64) error {
	row := map[string]any{
		"rate_date": date,
		"base":      "USD",
		"quote":     "JPY",
		"rate":      rate,
	}
	_, err := c.do(ctx, http.MethodPost, "/rest/v1/fx_rates",
		[]map[string]any{row},
		"resolution=merge-duplicates")
	return err
}

// ListDueSubscriptions は更新日が today 以前に到来した active/trial のサブスクを返す。
// 解約検討中(considering_cancel)は課金されない前提なので進めない。
func (c *Client) ListDueSubscriptions(ctx context.Context, today string) ([]Subscription, error) {
	q := url.Values{}
	q.Set("select", "id,household_id,owner_member_id,name,currency,original_amount,cycle,next_renewal_date,renewal_anchor_day,amount_jpy,fx_rate")
	q.Set("next_renewal_date", "lte."+today)
	q.Set("status", "in.(active,trial)")

	payload, err := c.do(ctx, http.MethodGet, "/rest/v1/subscriptions?"+q.Encode(), nil, "")
	if err != nil {
		return nil, err
	}

	var subs []Subscription
	if err := json.Unmarshal(payload, &subs); err != nil {
		return nil, fmt.Errorf("supabase: サブスク一覧を解釈できませんでした: %w", err)
	}
	return subs, nil
}

// RenewalUpdate はロールフォワードで書き戻す値。
type RenewalUpdate struct {
	NextRenewalDate string
	AmountJPY       *int
	FxRate          *float64
	FxRateDate      *string
}

// Payment はサブスクの支払い 1 回ぶん（= 支出取引 1 件）。
type Payment struct {
	OccurredOn string `json:"occurred_on"`
	Amount     int    `json:"amount"`
}

// FXRateOn は date 以前で最も新しい USD/JPY をキャッシュ (fx_rates) から返す。
// 休日はその日の行が無いので、その日以前の直近を使う。
func (c *Client) FXRateOn(ctx context.Context, date string) (rate float64, rateDate string, found bool, err error) {
	q := url.Values{}
	q.Set("select", "rate,rate_date")
	q.Set("base", "eq.USD")
	q.Set("quote", "eq.JPY")
	q.Set("rate_date", "lte."+date)
	q.Set("order", "rate_date.desc")
	q.Set("limit", "1")

	payload, err := c.do(ctx, http.MethodGet, "/rest/v1/fx_rates?"+q.Encode(), nil, "")
	if err != nil {
		return 0, "", false, err
	}

	var rows []struct {
		Rate     float64 `json:"rate"`
		RateDate string  `json:"rate_date"`
	}
	if err := json.Unmarshal(payload, &rows); err != nil {
		return 0, "", false, fmt.Errorf("supabase: 為替レートを解釈できませんでした: %w", err)
	}
	if len(rows) == 0 {
		return 0, "", false, nil
	}
	return rows[0].Rate, rows[0].RateDate, true, nil
}

// RollSubscriptionCycle は「支払いの記録」と「更新日の前進」を
// **1 つの RPC = 1 つの DB トランザクション** で行う。
//
// 2 回の往復に分けると、その隙間でユーザーがサブスクを編集/解約したときに、
// 古いスナップショットの金額で **支払いだけが台帳に残る**（更新は CAS で弾かれるが、
// 既に入った取引は取り消せない）。RPC 側はサブスク行を FOR UPDATE で固定してから
// スナップショットと突き合わせるので、その隙間が構造的に存在しない。
//
// snapshot は一覧取得時に読んだ行。**次の更新日と支払額の計算に使った値をすべて**
// 渡し、RPC 側で突き合わせる (currency / original_amount / cycle / renewal_anchor_day)。
// 一致しなければ「その間に人が触った」だけなので、エラーではなく applied=false。
// 次回の cron が新しい値で拾い直す。
//
// renewal_anchor_day は **突合せには使うが、更新値としては送らない**:
// DB トリガが anchor を保持する（丸めた日で上書きすると月末課金が 28 日に固定化する）。
//
// 二重計上は RPC 内の on conflict do nothing が弾くので、cron を再実行しても増えない。
func (c *Client) RollSubscriptionCycle(
	ctx context.Context, snapshot Subscription, payments []Payment, update RenewalUpdate,
) (applied bool, err error) {
	args := map[string]any{
		"p_subscription_id":            snapshot.ID,
		"p_expected_next_renewal_date": snapshot.NextRenewalDate,
		"p_expected_currency":          snapshot.Currency,
		"p_expected_original_amount":   snapshot.OriginalAmount,
		"p_expected_cycle":             snapshot.Cycle,
		"p_expected_anchor_day":        snapshot.RenewalAnchorDay,
		"p_payments":                   payments,
		"p_next_renewal_date":          update.NextRenewalDate,
	}
	// JPY に fx 系を混ぜると DB 制約に弾かれる。USD のときだけ送る。
	if update.AmountJPY != nil {
		args["p_amount_jpy"] = *update.AmountJPY
	}
	if update.FxRate != nil {
		args["p_fx_rate"] = *update.FxRate
	}
	if update.FxRateDate != nil {
		args["p_fx_rate_date"] = *update.FxRateDate
	}

	payload, err := c.do(ctx, http.MethodPost,
		"/rest/v1/rpc/roll_subscription_cycle", args, "")
	if err != nil {
		return false, err
	}

	if err := json.Unmarshal(payload, &applied); err != nil {
		return false, fmt.Errorf("supabase: 更新結果を解釈できませんでした: %w", err)
	}
	return applied, nil
}

// Ping は Supabase Free の自動一時停止 (約7日アイドル) を避けるための軽い読み取り。
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.do(ctx, http.MethodGet, "/rest/v1/households?select=id&limit=1", nil, "")
	return err
}

// カテゴリの解決は RPC (roll_subscription_cycle) の中で行う。
// クライアント側で名前だけ引くと、同名の収入カテゴリを掴んで
// 支出を収入カテゴリで記録してしまう（categories は household×kind×name で一意）。
