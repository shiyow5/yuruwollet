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

	// **/health は本番からは到達できない。それでも残す。**
	//
	// wrangler.jsonc で workers_dev: false にしてあるので、この Worker は公開 HTTP ルートを
	// 持たない（service_role キーを握る Worker にインターネットから叩ける口を開ける理由がない）。
	// つまり本番でこのハンドラが呼ばれることはない。
	//
	// 消さない理由は 2 つ:
	//  1. `workers.Serve` は syumai/workers の作法として必要で、外すと cron の登録ごと壊れる。
	//     cron は 2026-07-13 に本番で毎回落ちていた（#52）ばかりで、ここは触らない。
	//  2. **ローカルの疎通確認で使う。** scripts/cron_smoke.py が wrangler dev の起動待ちに
	//     叩いている。200 が返ることは「workerd が listen している」だけでなく
	//     「**Go の WASM が起動してコードが動いている**」ことの証明になる。
	//     WASM の初期化に失敗する類のバグ（まさに #52）を、ここが最初に捕まえる。
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
	//
	// **タイムアウトは設定しない。** このトランスポートは workerd の fetch() の
	// Promise を待つだけで、http.Client.Timeout も context の deadline も見ない
	// （jsutil.AwaitPromise が ctx.Done() を select していない）。設定すると
	// 「効いている」と誤解させるだけなので置かない。実行時間の上限は Cloudflare の
	// cron 実行制限に委ねる。
	//
	// **リダイレクトは追わない。** Supabase へのリクエストには service_role キーを
	// Authorization に載せている。別オリジンへリダイレクトされたときに workerd の
	// fetch がこのヘッダを落とす保証が無いので、追わせない。
	// manual なら 3xx がそのまま返り、こちらのコードが非 2xx として弾く。
	// （RedirectModeError は使えない。workerd は "error" を実装しておらず、
	//   "Invalid redirect value" で全リクエストが落ちる。スモークテストで検出した）
	// 正常系では Supabase も frankfurter もリダイレクトしない。
	httpClient := fetch.NewClient().HTTPClient(fetch.RedirectModeManual)

	fxClient := fx.New(httpClient)
	// 為替 API のベース URL は差し替え可能にする（CI のスモークテストをスタブに向けるため）。
	// 未設定なら keyless の frankfurter.dev。
	// 本番で誤って設定されると為替が黙って別のホストから来るので、**必ずログに残す**。
	if base := cloudflare.Getenv("FX_BASE_URL"); base != "" {
		log.Printf("cron: FX_BASE_URL の上書きが有効です: %s", base)
		fxClient.BaseURL = base
	}

	job := &cronjob.Job{
		FX:    fxClient,
		Store: supabase.New(httpClient, baseURL, serviceKey),
		Now:   time.Now,
	}

	if err := job.Run(ctx); err != nil {
		// 部分失敗も含めてログに出す。
		//
		// **ここで err を返すと、syumai/workers の cron スケジューラは panic する**
		// (cloudflare/cron/scheduler.go: `if err != nil { panic(err) }`)。
		// つまり Cloudflare 側では scriptThrewException として記録される。
		// それでよい。cron が黙って失敗し続けるより、失敗として表に出るべきで、
		// **job.Run は 3 つの処理を全部やり終えてから** エラーを束ねて返す
		// （1 つ落ちても他は実行される）。失敗した内容はこのログに出る。
		//
		// 中身を追うには Worker のログが要る。wrangler.jsonc で observability を
		// 有効にしてある（無効のままだと、今回のように例外の中身が一切取れない）。
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
