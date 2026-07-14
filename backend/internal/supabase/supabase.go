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
	// 精算の計算は DB 側（settle_subscription）が行うので、cron は id さえあればよい。
	// name はログ／エラーメッセージ用。
	q.Set("select", "id,name")
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

// SettleSubscription は到来済みの支払いを台帳に記録し、更新日を進める（DB 側の RPC）。
//
// **ロールフォワードの計算は SQL にしか無い。** Go 側にも書くと同じ規則が 2 箇所に生まれ、
// next_renewal_date の食い違いが二重計上や欠落に直結する。
// クライアント（アプリ）も同じ SQL を通って精算するので、計算は 1 箇所だけになる。
//
// USD でその支払日のレートが fx_rates に無ければ、RPC はそこで止めて needsFXOn に
// その日付を返す（SQL は為替 API を叩けない）。呼び出し側がレートを取得して保存し、
// 呼び直す。
//
// 二重計上は unique(subscription_id, occurred_on) が弾くので、
// アプリと cron が同時に走っても、再実行しても増えない。
func (c *Client) SettleSubscription(
	ctx context.Context, subscriptionID string,
) (recorded int, needsFXOn string, err error) {
	payload, err := c.do(ctx, http.MethodPost, "/rest/v1/rpc/settle_subscription",
		map[string]any{"p_subscription_id": subscriptionID}, "")
	if err != nil {
		return 0, "", err
	}

	// returns table(...) なので 1 行の配列で返る
	var rows []struct {
		Recorded  int     `json:"recorded"`
		NeedsFXOn *string `json:"needs_fx_on"`
	}
	if err := json.Unmarshal(payload, &rows); err != nil {
		return 0, "", fmt.Errorf("supabase: 精算結果を解釈できませんでした: %w", err)
	}
	if len(rows) == 0 {
		return 0, "", nil
	}
	if rows[0].NeedsFXOn != nil {
		needsFXOn = *rows[0].NeedsFXOn
	}
	return rows[0].Recorded, needsFXOn, nil
}

// Ping は Supabase Free の自動一時停止 (約7日アイドル) を避けるための軽い読み取り。
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.do(ctx, http.MethodGet, "/rest/v1/households?select=id&limit=1", nil, "")
	return err
}

// カテゴリの解決は RPC (roll_subscription_cycle) の中で行う。
// クライアント側で名前だけ引くと、同名の収入カテゴリを掴んで
// 支出を収入カテゴリで記録してしまう（categories は household×kind×name で一意）。
