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
	"time"
)

// Client は Supabase REST クライアント (service_role)。
type Client struct {
	HTTP       *http.Client
	BaseURL    string
	ServiceKey string
}

// New はクライアントを作る。
func New(httpClient *http.Client, baseURL, serviceKey string) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{HTTP: httpClient, BaseURL: baseURL, ServiceKey: serviceKey}
}

// Subscription は cron が更新するために必要な最小限のサブスク情報。
type Subscription struct {
	ID               string   `json:"id"`
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
	q.Set("select", "id,currency,original_amount,cycle,next_renewal_date,renewal_anchor_day,amount_jpy,fx_rate")
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
	NextRenewalDate string   `json:"next_renewal_date"`
	AmountJPY       *int     `json:"amount_jpy,omitempty"`
	FxRate          *float64 `json:"fx_rate,omitempty"`
	FxRateDate      *string  `json:"fx_rate_date,omitempty"`
}

// UpdateSubscriptionRenewal は 1 件のサブスクを次の更新日へ進める。
//
// expectedDate は一覧取得時に読んだ next_renewal_date。**その値のままの行だけを更新する** (CAS)。
// 一覧取得から PATCH までの間にユーザーが更新日を編集/解約すると、id だけで更新すると
// **cron が古いスナップショットからの計算でユーザーの編集を巻き戻してしまう**
// (例: 課金日を 7/13 → 12/31 に変えた直後に cron が 8/13 へ戻す)。
//
// 一致する行が無ければ「その間に人が触った」だけなので、次回の cron で拾えば良い。
// エラーではなく applied=false を返す。
//
// renewal_anchor_day は送らない: service_role の更新では DB トリガが anchor を保持する
// (丸めた日で上書きすると、月末課金が 28 日に固定化してしまう)。
func (c *Client) UpdateSubscriptionRenewal(
	ctx context.Context, id, expectedDate string, update RenewalUpdate,
) (applied bool, err error) {
	q := url.Values{}
	q.Set("id", "eq."+id)
	q.Set("next_renewal_date", "eq."+expectedDate)
	// 解約検討中に変えられた行も進めない
	q.Set("status", "in.(active,trial)")
	q.Set("select", "id")

	payload, err := c.do(ctx, http.MethodPatch,
		"/rest/v1/subscriptions?"+q.Encode(), update, "return=representation")
	if err != nil {
		return false, err
	}

	var updated []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &updated); err != nil {
		return false, fmt.Errorf("supabase: 更新結果を解釈できませんでした: %w", err)
	}
	return len(updated) > 0, nil
}

// Ping は Supabase Free の自動一時停止 (約7日アイドル) を避けるための軽い読み取り。
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.do(ctx, http.MethodGet, "/rest/v1/households?select=id&limit=1", nil, "")
	return err
}
