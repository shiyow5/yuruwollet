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
	"strconv"
	"strings"
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
	NextRenewalDate string   `json:"next_renewal_date"`
	AmountJPY       *int     `json:"amount_jpy,omitempty"`
	FxRate          *float64 `json:"fx_rate,omitempty"`
	FxRateDate      *string  `json:"fx_rate_date,omitempty"`
}

// UpdateSubscriptionRenewal は 1 件のサブスクを次の更新日へ進める。
//
// snapshot は一覧取得時に読んだ行。**その内容のままの行だけを更新する** (CAS)。
//
// 一覧取得から PATCH までの間にユーザーがサブスクを編集/解約すると、id だけで更新すると
// **cron が古いスナップショットからの計算でユーザーの編集を巻き戻してしまう**。
// 更新日だけでなく、**次の更新日と amount_jpy の計算に使った値をすべて** 条件に入れる
// (currency / original_amount / cycle / renewal_anchor_day)。
// 例えば課金日を変えずに金額や周期だけ編集された場合も、古い値で上書きしてはいけない。
//
// 一致する行が無ければ「その間に人が触った」だけなので、次回の cron で拾えば良い。
// エラーではなく applied=false を返す。
//
// renewal_anchor_day は **条件には入れるが、更新値としては送らない**:
// service_role の更新では DB トリガが anchor を保持する
// (丸めた日で上書きすると、月末課金が 28 日に固定化してしまう)。
func (c *Client) UpdateSubscriptionRenewal(
	ctx context.Context, snapshot Subscription, update RenewalUpdate,
) (applied bool, err error) {
	q := url.Values{}
	q.Set("id", "eq."+snapshot.ID)
	q.Set("next_renewal_date", "eq."+snapshot.NextRenewalDate)
	q.Set("currency", "eq."+snapshot.Currency)
	q.Set("cycle", "eq."+snapshot.Cycle)
	q.Set("original_amount", "eq."+strconv.FormatFloat(snapshot.OriginalAmount, 'f', -1, 64))
	// 解約検討中に変えられた行も進めない
	q.Set("status", "in.(active,trial)")

	// anchor はトリガが埋めるが、万一 null の行は null のままであることを条件にする
	if snapshot.RenewalAnchorDay > 0 {
		q.Set("renewal_anchor_day", "eq."+strconv.Itoa(snapshot.RenewalAnchorDay))
	} else {
		q.Set("renewal_anchor_day", "is.null")
	}

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

// CategoryID は household 内のカテゴリ名から id を引く。
// cron はサブスクの支払いを「サブスク」カテゴリで記録する。
func (c *Client) CategoryID(ctx context.Context, householdID, name string) (string, error) {
	q := url.Values{}
	q.Set("select", "id")
	q.Set("household_id", "eq."+householdID)
	q.Set("name", "eq."+name)
	q.Set("limit", "1")

	payload, err := c.do(ctx, http.MethodGet, "/rest/v1/categories?"+q.Encode(), nil, "")
	if err != nil {
		return "", err
	}
	var rows []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &rows); err != nil {
		return "", fmt.Errorf("supabase: カテゴリを解釈できませんでした: %w", err)
	}
	if len(rows) == 0 {
		return "", fmt.Errorf("supabase: カテゴリ %q が見つかりません", name)
	}
	return rows[0].ID, nil
}

// SubscriptionPayment はサブスクの支払い 1 件（= 支出取引）。
type SubscriptionPayment struct {
	HouseholdID    string `json:"household_id"`
	OwnerMemberID  string `json:"owner_member_id"`
	Type           string `json:"type"`
	Amount         int    `json:"amount"`
	CategoryID     string `json:"category_id"`
	Memo           string `json:"memo"`
	OccurredOn     string `json:"occurred_on"`
	SubscriptionID string `json:"subscription_id"`
}

// RecordSubscriptionPayment はサブスクの支払いを支出として台帳に記録する。
//
// **二重計上は DB が弾く**（unique(subscription_id, occurred_on) の部分インデックス）。
// cron は再実行されうるし、複数期ぶん遅れて追いつくこともあるので、
// アプリのロジックで「記録済みか」を判定するのではなく、
// **重複エラー(23505)を「すでに記録済み」として正常扱いする**。
//
// is_system_generated は付けない。残高調整と違い、これは **実際の支出** であり、
// カテゴリ別グラフ・月次収支・目標貯金の判定に **含めるべき** もの。
func (c *Client) RecordSubscriptionPayment(ctx context.Context, p SubscriptionPayment) (recorded bool, err error) {
	payload, err := c.do(ctx, http.MethodPost, "/rest/v1/transactions",
		[]SubscriptionPayment{p}, "return=minimal")
	if err == nil {
		return true, nil
	}
	// PostgREST は unique 違反を 409 + code 23505 で返す
	if strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "409") {
		return false, nil
	}
	_ = payload
	return false, err
}
