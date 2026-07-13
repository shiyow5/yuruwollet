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

func TestUpdateSubscriptionRenewal(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[{"id":"s1"}]`, &cap)

	amount := 3030
	rate := 151.5
	date := "2026-07-13"
	applied, err := c.UpdateSubscriptionRenewal(context.Background(), "s1", "2026-07-13", RenewalUpdate{
		NextRenewalDate: "2026-08-13",
		AmountJPY:       &amount,
		FxRate:          &rate,
		FxRateDate:      &date,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !applied {
		t.Error("applied = false, want true")
	}

	if cap.Method != http.MethodPatch || !strings.Contains(cap.Query, "id=eq.s1") {
		t.Errorf("%s ?%s", cap.Method, cap.Query)
	}
	// CAS: 一覧取得時に読んだ更新日と一致する行だけを更新する。
	// id だけで更新すると、その間にユーザーが編集した課金日を巻き戻してしまう。
	if !strings.Contains(cap.Query, "next_renewal_date=eq.2026-07-13") {
		t.Errorf("CAS 条件が無い: %q", cap.Query)
	}
	// anchor は送らない (送ると丸めた日で上書きされ、月末課金が 28 日に固定化する)
	if strings.Contains(cap.Body, "renewal_anchor_day") {
		t.Errorf("renewal_anchor_day を送ってはいけない: %s", cap.Body)
	}
	if !strings.Contains(cap.Body, `"amount_jpy":3030`) {
		t.Errorf("body = %s", cap.Body)
	}
}

// JPY の更新では fx 系フィールドを送らない (JPY に fx を混ぜると DB 制約に弾かれる)
func TestUpdateSubscriptionRenewal_JPY_OmitsFX(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[{"id":"s1"}]`, &cap)

	if _, err := c.UpdateSubscriptionRenewal(context.Background(), "s1", "2026-07-10",
		RenewalUpdate{NextRenewalDate: "2026-08-10"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, forbidden := range []string{"amount_jpy", "fx_rate", "fx_rate_date"} {
		if strings.Contains(cap.Body, forbidden) {
			t.Errorf("JPY の更新に %s を含めてはいけない: %s", forbidden, cap.Body)
		}
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

// 一覧取得後にユーザーが編集していた行は CAS に一致せず、0 件更新になる。
// これはレースであってエラーではない（次回の cron で拾う）。
func TestUpdateSubscriptionRenewal_CASMiss(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[]`, &cap)

	applied, err := c.UpdateSubscriptionRenewal(context.Background(), "s1", "2026-07-13",
		RenewalUpdate{NextRenewalDate: "2026-08-13"})
	if err != nil {
		t.Fatalf("CAS 不一致はエラーにしない: %v", err)
	}
	if applied {
		t.Error("applied = true, want false")
	}
}
