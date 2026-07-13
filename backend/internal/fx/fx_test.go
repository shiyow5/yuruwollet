package fx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func clientFor(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	c := New(srv.Client())
	c.BaseURL = srv.URL
	return c
}

func TestFetchUSDJPY(t *testing.T) {
	t.Parallel()

	c := clientFor(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("base"); got != "USD" {
			t.Errorf("base = %q, want USD", got)
		}
		if got := r.URL.Query().Get("symbols"); got != "JPY" {
			t.Errorf("symbols = %q, want JPY", got)
		}
		_, _ = w.Write([]byte(`{"amount":1.0,"base":"USD","date":"2026-07-13","rates":{"JPY":150.23}}`))
	})

	rate, err := c.FetchUSDJPY(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rate.Rate != 150.23 {
		t.Errorf("Rate = %v, want 150.23", rate.Rate)
	}
	// 週末や祝日は前営業日の日付が返る。取得日ではなく **API の基準日** を保存する。
	if rate.Date != "2026-07-13" {
		t.Errorf("Date = %q, want 2026-07-13", rate.Date)
	}
}

func TestFetchUSDJPY_Errors(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		status  int
		body    string
		wantErr string
	}{
		{"非200", http.StatusServiceUnavailable, `{}`, "予期しないステータス"},
		{"壊れた JSON", http.StatusOK, `{not json`, "解釈できませんでした"},
		{"JPY が無い", http.StatusOK, `{"date":"2026-07-13","rates":{"EUR":0.9}}`, "JPY のレート"},
		// 0 や負のレートで amount_jpy を再計算すると、サブスクの金額が壊れる
		{"レート 0", http.StatusOK, `{"date":"2026-07-13","rates":{"JPY":0}}`, "不正なレート"},
		{"レート 負", http.StatusOK, `{"date":"2026-07-13","rates":{"JPY":-1}}`, "不正なレート"},
		{"基準日が無い", http.StatusOK, `{"rates":{"JPY":150}}`, "基準日"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			c := clientFor(t, func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			})

			_, err := c.FetchUSDJPY(context.Background())
			if err == nil {
				t.Fatal("エラーになるべき")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("err = %v, want contains %q", err, tc.wantErr)
			}
		})
	}
}

func TestFetchUSDJPY_ContextCancel(t *testing.T) {
	t.Parallel()

	c := clientFor(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"date":"2026-07-13","rates":{"JPY":150}}`))
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := c.FetchUSDJPY(ctx); err == nil {
		t.Fatal("キャンセル済み context ではエラーになるべき")
	}
}
