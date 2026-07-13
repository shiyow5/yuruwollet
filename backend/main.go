package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/syumai/workers"
	"github.com/syumai/workers/cloudflare"
	"github.com/syumai/workers/cloudflare/cron"

	"github.com/shiyow5/yuruwollet/backend/internal/cronjob"
	"github.com/shiyow5/yuruwollet/backend/internal/fx"
	"github.com/shiyow5/yuruwollet/backend/internal/health"
	"github.com/shiyow5/yuruwollet/backend/internal/supabase"
)

func main() {
	cron.ScheduleTaskNonBlock(runDaily)

	http.HandleFunc("/health", healthHandler)
	workers.Serve(nil)
}

// runDaily は日次 cron (JST 00:00) の本体。
// 為替取得 → サブスクの更新日ロールフォワード → Supabase keep-alive。
// 1 つ落ちても他は実行される (cronjob.Job.Run の責務)。
func runDaily(ctx context.Context) error {
	baseURL := cloudflare.Getenv("SUPABASE_URL")
	serviceKey := cloudflare.Getenv("SUPABASE_SERVICE_ROLE_KEY")
	if baseURL == "" || serviceKey == "" {
		// 黙って何もしないと、fx_rates が空のまま USD サブスクを登録できない状態に気づけない。
		log.Println("cron: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定のため中止します")
		return nil
	}

	httpClient := &http.Client{Timeout: 15 * time.Second}
	job := &cronjob.Job{
		FX:    fx.New(httpClient),
		Store: supabase.New(httpClient, baseURL, serviceKey),
		Now:   time.Now,
	}

	if err := job.Run(ctx); err != nil {
		// 部分失敗も含めてログに出す (Cloudflare の cron ログで追える)
		log.Printf("cron: 一部の処理に失敗しました: %v", err)
		return err
	}
	log.Println("cron: 完了")
	return nil
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(health.PayloadJSON()))
}
