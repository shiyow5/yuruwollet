package supabase

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type captured struct {
	Method string
	Path   string
	Query  string
	Body   string
	Prefer string
	APIKey string
	Auth   string
}

func serverFor(t *testing.T, status int, body string, cap *captured) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		*cap = captured{
			Method: r.Method,
			Path:   r.URL.Path,
			Query:  r.URL.RawQuery,
			Body:   string(raw),
			Prefer: r.Header.Get("Prefer"),
			APIKey: r.Header.Get("apikey"),
			Auth:   r.Header.Get("Authorization"),
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	return New(srv.Client(), srv.URL, "service-key")
}

func TestUpsertFXRate(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusCreated, `[]`, &cap)

	if err := c.UpsertFXRate(context.Background(), "2026-07-13", 150.25); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cap.Method != http.MethodPost || cap.Path != "/rest/v1/fx_rates" {
		t.Errorf("%s %s", cap.Method, cap.Path)
	}
	// 同じ日に再実行しても行が増えないこと (日次 cron は再実行されうる)
	if !strings.Contains(cap.Prefer, "merge-duplicates") {
		t.Errorf("Prefer = %q, want merge-duplicates", cap.Prefer)
	}
	// service_role で認証する
	if cap.APIKey != "service-key" || cap.Auth != "Bearer service-key" {
		t.Errorf("認証ヘッダが正しくない: apikey=%q auth=%q", cap.APIKey, cap.Auth)
	}

	var rows []map[string]any
	if err := json.Unmarshal([]byte(cap.Body), &rows); err != nil {
		t.Fatalf("body: %v", err)
	}
	if rows[0]["rate_date"] != "2026-07-13" || rows[0]["base"] != "USD" || rows[0]["quote"] != "JPY" {
		t.Errorf("body = %v", rows[0])
	}
}

func TestListDueSubscriptions(t *testing.T) {
	t.Parallel()

	var cap captured
	body := `[{"id":"s1","currency":"USD","original_amount":20,"cycle":"monthly",
	           "next_renewal_date":"2026-07-13","renewal_anchor_day":13,"amount_jpy":3000,"fx_rate":150}]`
	c := serverFor(t, http.StatusOK, body, &cap)

	subs, err := c.ListDueSubscriptions(context.Background(), "2026-07-13")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(subs) != 1 || subs[0].ID != "s1" || subs[0].RenewalAnchorDay != 13 {
		t.Errorf("subs = %+v", subs)
	}
	// 更新日が到来したものだけ
	if !strings.Contains(cap.Query, "next_renewal_date=lte.2026-07-13") {
		t.Errorf("query = %q", cap.Query)
	}
	// 解約検討中は課金されない前提なので進めない
	if !strings.Contains(cap.Query, "status=in.%28active%2Ctrial%29") {
		t.Errorf("status フィルタが無い: %q", cap.Query)
	}
}

// SettleSubscription は DB 側の RPC を呼ぶだけ。
// **ロールフォワードの計算は SQL にしかない**（Go にも書くと 2 箇所でズレる）。
func TestSettleSubscription(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[{"recorded":3,"needs_fx_on":null}]`, &cap)

	recorded, needsFX, err := c.SettleSubscription(context.Background(), "s1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if recorded != 3 {
		t.Errorf("recorded = %d, want 3", recorded)
	}
	if needsFX != "" {
		t.Errorf("needsFXOn = %q, want empty", needsFX)
	}
	if cap.Method != http.MethodPost || cap.Path != "/rest/v1/rpc/settle_subscription" {
		t.Errorf("%s %s", cap.Method, cap.Path)
	}
	if !strings.Contains(cap.Body, `"p_subscription_id":"s1"`) {
		t.Errorf("body = %s", cap.Body)
	}
}

// USD でその支払日のレートが無いと、RPC はそこで止めて日付を返す
// （SQL は為替 API を叩けない）。cron がそれを取得して呼び直す。
func TestSettleSubscription_NeedsFX(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[{"recorded":1,"needs_fx_on":"2026-06-13"}]`, &cap)

	recorded, needsFX, err := c.SettleSubscription(context.Background(), "u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if recorded != 1 {
		t.Errorf("recorded = %d, want 1（レートがある日までは記録する）", recorded)
	}
	if needsFX != "2026-06-13" {
		t.Errorf("needsFXOn = %q, want 2026-06-13", needsFX)
	}
}

func TestSettleSubscription_ErrorIsReported(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusNotFound, `{"code":"PT404","message":"カテゴリがありません"}`, &cap)

	if _, _, err := c.SettleSubscription(context.Background(), "s1"); err == nil {
		t.Fatal("RPC の失敗はエラーにするべき")
	}
}

func TestPing(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[]`, &cap)

	if err := c.Ping(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cap.Method != http.MethodGet || cap.Path != "/rest/v1/households" {
		t.Errorf("%s %s", cap.Method, cap.Path)
	}
}

func TestErrorStatus(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusUnauthorized, `{"message":"invalid key"}`, &cap)

	err := c.Ping(context.Background())
	if err == nil {
		t.Fatal("エラーになるべき")
	}
	// 原因を追えるようにステータスと本文を残す
	if !strings.Contains(err.Error(), "401") || !strings.Contains(err.Error(), "invalid key") {
		t.Errorf("err = %v", err)
	}
}
