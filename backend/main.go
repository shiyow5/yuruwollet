package main

import (
	"context"
	"net/http"

	"github.com/syumai/workers"
	"github.com/syumai/workers/cloudflare/cron"

	"github.com/shiyow5/yuruwollet/backend/internal/health"
)

func main() {
	// Phase 10 で実装: 日次 USD/JPY 取得 → fx_rates upsert /
	// サブスク next_renewal_date ロールフォワード + amount_jpy 再スナップ /
	// Supabase keep-alive ping。cron スケジュールは wrangler.jsonc (JST 24日 = 15:00 UTC 23日)。
	cron.ScheduleTaskNonBlock(func(_ context.Context) error {
		return nil
	})

	http.HandleFunc("/health", healthHandler)
	workers.Serve(nil)
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(health.PayloadJSON()))
}
