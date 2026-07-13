// Package fx は USD/JPY の為替レート取得を扱う。
package fx

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// DefaultBaseURL は keyless の為替 API (API キー不要)。
const DefaultBaseURL = "https://api.frankfurter.dev"

// Rate は取得したレート 1 件。
type Rate struct {
	// Date は API が返した基準日 (YYYY-MM-DD)。
	// 週末や祝日は前営業日の日付が返るため、**取得日とは限らない**。
	Date string
	// Rate は 1 USD = Rate JPY。
	Rate float64
}

// Client は為替 API クライアント。
type Client struct {
	HTTP    *http.Client
	BaseURL string
}

// New はクライアントを作る。
//
// httpClient は **必須**。nil を渡して net/http の既定トランスポートに落ちてはいけない。
// workerd では標準トランスポートが fetch を不正な this で呼び、Illegal invocation で
// panic する（それで cron が本番で毎回死んでいた）。ネイティブの go test は
// この経路を通らないので、既定値へのフォールバックを残すと**静かに再発する**。
func New(httpClient *http.Client) *Client {
	if httpClient == nil {
		panic("fx: httpClient は必須です（workerd では net/http の既定トランスポートが panic する）")
	}
	return &Client{HTTP: httpClient, BaseURL: DefaultBaseURL}
}

type latestResponse struct {
	Date  string             `json:"date"`
	Rates map[string]float64 `json:"rates"`
}

// FetchUSDJPY は最新の USD/JPY を取得する。
func (c *Client) FetchUSDJPY(ctx context.Context) (Rate, error) {
	url := c.BaseURL + "/v1/latest?base=USD&symbols=JPY"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Rate{}, fmt.Errorf("fx: リクエストを作れませんでした: %w", err)
	}

	res, err := c.HTTP.Do(req)
	if err != nil {
		return Rate{}, fmt.Errorf("fx: 取得に失敗しました: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 256))
		return Rate{}, fmt.Errorf("fx: 予期しないステータス %d: %s", res.StatusCode, body)
	}

	var parsed latestResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return Rate{}, fmt.Errorf("fx: レスポンスを解釈できませんでした: %w", err)
	}

	rate, ok := parsed.Rates["JPY"]
	if !ok {
		return Rate{}, fmt.Errorf("fx: JPY のレートが含まれていません")
	}
	// 0 や負のレートで amount_jpy を再計算すると、サブスクの金額が壊れる。
	// DB 側にも rate > 0 制約はあるが、その手前で弾く。
	if rate <= 0 {
		return Rate{}, fmt.Errorf("fx: 不正なレート %v", rate)
	}
	if parsed.Date == "" {
		return Rate{}, fmt.Errorf("fx: 基準日が含まれていません")
	}

	return Rate{Date: parsed.Date, Rate: rate}, nil
}
