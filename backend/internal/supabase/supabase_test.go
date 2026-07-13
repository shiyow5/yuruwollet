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

// RollSubscriptionCycle は「支払いの記録」と「更新日の前進」を 1 つの RPC
// (= 1 トランザクション) で行う。2 回の往復に分けると、その隙間でユーザーが
// 編集/解約したときに **古い金額の支払いだけが台帳に残る**。
func TestRollSubscriptionCycle(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `true`, &cap)

	amount := 3030
	rate := 151.5
	date := "2026-07-13"
	snapshot := Subscription{
		ID: "s1", Currency: "USD", OriginalAmount: 20, Cycle: "monthly",
		NextRenewalDate: "2026-07-13", RenewalAnchorDay: 13,
	}
	applied, err := c.RollSubscriptionCycle(context.Background(), snapshot,
		[]Payment{{OccurredOn: "2026-07-13", Amount: 3030}},
		RenewalUpdate{
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

	if cap.Method != http.MethodPost || cap.Path != "/rest/v1/rpc/roll_subscription_cycle" {
		t.Errorf("%s %s", cap.Method, cap.Path)
	}

	var body map[string]any
	if err := json.Unmarshal([]byte(cap.Body), &body); err != nil {
		t.Fatalf("body: %v", err)
	}
	// CAS: 次の更新日と支払額の計算に使った値をすべて渡す。
	// 更新日だけを見ていると、金額や周期だけ編集された行を古い値で上書きしてしまう。
	for k, want := range map[string]any{
		"p_subscription_id":            "s1",
		"p_expected_next_renewal_date": "2026-07-13",
		"p_expected_currency":          "USD",
		"p_expected_cycle":             "monthly",
		"p_expected_original_amount":   float64(20),
		"p_expected_anchor_day":        float64(13),
		"p_next_renewal_date":          "2026-08-13",
		"p_amount_jpy":                 float64(3030),
	} {
		if body[k] != want {
			t.Errorf("%s = %v, want %v", k, body[k], want)
		}
	}
	if !strings.Contains(cap.Body, `"occurred_on":"2026-07-13"`) {
		t.Errorf("支払いが渡っていない: %s", cap.Body)
	}
}

// 一覧取得後にユーザーが編集していた行は CAS に一致せず false が返る。
// これはレースであってエラーではない（次回の cron が新しい値で拾い直す）。
func TestRollSubscriptionCycle_CASMiss(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `false`, &cap)

	applied, err := c.RollSubscriptionCycle(context.Background(),
		Subscription{ID: "s1", Currency: "JPY", Cycle: "monthly", NextRenewalDate: "2026-07-13"},
		[]Payment{{OccurredOn: "2026-07-13", Amount: 1490}},
		RenewalUpdate{NextRenewalDate: "2026-08-13"})
	if err != nil {
		t.Fatalf("CAS 不一致はエラーにしない: %v", err)
	}
	if applied {
		t.Error("applied = true, want false")
	}
}

// JPY では fx 系を送らない (JPY に fx を混ぜると DB 制約に弾かれる)
func TestRollSubscriptionCycle_JPY_OmitsFX(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `true`, &cap)

	if _, err := c.RollSubscriptionCycle(context.Background(),
		Subscription{ID: "s1", Currency: "JPY", OriginalAmount: 1490, Cycle: "monthly",
			NextRenewalDate: "2026-07-10", RenewalAnchorDay: 10},
		[]Payment{{OccurredOn: "2026-07-10", Amount: 1490}},
		RenewalUpdate{NextRenewalDate: "2026-08-10"}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, forbidden := range []string{"p_amount_jpy", "p_fx_rate", "p_fx_rate_date"} {
		if strings.Contains(cap.Body, forbidden) {
			t.Errorf("JPY の更新に %s を含めてはいけない: %s", forbidden, cap.Body)
		}
	}
}

func TestRollSubscriptionCycle_ErrorIsReported(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusNotFound, `{"code":"PT404","message":"カテゴリがありません"}`, &cap)

	if _, err := c.RollSubscriptionCycle(context.Background(),
		Subscription{ID: "s1"}, []Payment{{OccurredOn: "2026-07-10", Amount: 1}},
		RenewalUpdate{NextRenewalDate: "2026-08-10"}); err == nil {
		t.Fatal("RPC の失敗はエラーにするべき")
	}
}

// USD の遅延ぶんは **その更新日のレート** で確定する必要がある。
// キャッシュ済みのレートをその日以前で探す。
func TestFXRateOn(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[{"rate":142.5,"rate_date":"2026-05-08"}]`, &cap)

	rate, rateDate, found, err := c.FXRateOn(context.Background(), "2026-05-10")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found || rate != 142.5 || rateDate != "2026-05-08" {
		t.Errorf("rate=%v date=%q found=%v", rate, rateDate, found)
	}
	// 週末や祝日はその日の行が無い。**その日以前で最も新しい** レートを使う。
	for _, want := range []string{"rate_date=lte.2026-05-10", "order=rate_date.desc", "limit=1"} {
		if !strings.Contains(cap.Query, want) {
			t.Errorf("query に %q が無い: %q", want, cap.Query)
		}
	}
}

func TestFXRateOn_NotFound(t *testing.T) {
	t.Parallel()

	var cap captured
	c := serverFor(t, http.StatusOK, `[]`, &cap)

	_, _, found, err := c.FXRateOn(context.Background(), "2026-05-10")
	if err != nil {
		t.Fatalf("行が無いのはエラーではない: %v", err)
	}
	if found {
		t.Error("found = true, want false")
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
