package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/syumai/workers"
	"github.com/syumai/workers/cloudflare"
	"github.com/syumai/workers/cloudflare/cron"
	"github.com/syumai/workers/cloudflare/fetch"

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
		// **成功扱いにしてはいけない**。設定漏れのまま「正常終了」と記録されると、
		// 為替もサブスクの更新も keep-alive も止まったまま気づけず、
		// やがて Supabase が一時停止してアプリ全体が死ぬ。
		// cron の失敗として表に出す。
		err := errors.New("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です")
		log.Printf("cron: %v", err)
		return err
	}

	// **Go 標準の http.Client を使ってはいけない。**
	// js/wasm の net/http トランスポートはグローバルの fetch を直接呼ぶが、
	// workerd では `this` が不正になり Illegal invocation で panic する
	// （2026-07-13: これで cron が毎回 scriptThrewException で死んでいた。
	//   ネイティブの go test は WASM の fetch 経路を通らないので捕まらない。
	//   CI の scheduled スモークテストが唯一の防波堤）。
	httpClient := fetch.NewClient().HTTPClient(fetch.RedirectModeFollow)
	httpClient.Timeout = 15 * time.Second

	fxClient := fx.New(httpClient)
	// 為替 API のベース URL は差し替え可能にする（CI のスモークテストをスタブに向けるため）。
	// 未設定なら keyless の frankfurter.dev。
	if base := cloudflare.Getenv("FX_BASE_URL"); base != "" {
		fxClient.BaseURL = base
	}

	job := &cronjob.Job{
		FX:    fxClient,
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
