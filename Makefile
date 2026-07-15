.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash

# ---- Meta -----------------------------------------------------------------
.PHONY: help
help: ## このヘルプを表示
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	 | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---- Setup ----------------------------------------------------------------
.PHONY: setup
setup: ## 依存をすべて導入 (node + go)
	npm install
	cd backend && go mod download

# ---- Local dev ------------------------------------------------------------
.PHONY: dev
dev: ## フロント開発サーバ (Phase 2 以降で supabase + worker も同時起動)
	npm run dev --workspace frontend

.PHONY: dev-db
dev-db: ## ローカル Supabase を起動 (Docker)
	npx supabase start

.PHONY: dev-worker
dev-worker: build-backend ## Go Cron Worker をローカル起動 (wrangler dev)
	cd backend && npx wrangler dev

# ---- Supabase (Phase 1 以降) ----------------------------------------------
.PHONY: db-reset migrate seed gen-types
db-reset: ## ローカル DB をマイグレーション + seed で初期化
	npx supabase db reset
migrate: ## マイグレーションを適用
	npx supabase migration up
seed: ## seed を投入
	npx supabase db reset --no-seed=false
gen-types: ## Supabase から TS 型を生成
	npx supabase gen types typescript --local > frontend/src/lib/database.types.ts

.PHONY: subset-icons
subset-icons: ## アイコンフォントをパレット(#9)だけにサブセット再生成
	python3 scripts/subset_icons.py

# ---- Quality --------------------------------------------------------------
.PHONY: lint fmt fmt-check
lint: ## lint (frontend + backend)
	npm run lint
	cd backend && go vet ./internal/... && GOOS=js GOARCH=wasm go vet . && (command -v golangci-lint >/dev/null 2>&1 && golangci-lint run ./internal/... || echo "golangci-lint 未導入のためスキップ")

fmt: ## フォーマット適用 (prettier + gofmt)
	npm run fmt
	cd backend && gofmt -w . && (command -v goimports >/dev/null 2>&1 && goimports -w . || true)

fmt-check: ## フォーマット差分チェック (CI 用)
	npm run fmt:check
	cd backend && test -z "$$(gofmt -l .)" || (echo "gofmt 差分あり:"; gofmt -l .; exit 1)

# ---- Tests ----------------------------------------------------------------
.PHONY: test test-frontend test-functions test-backend test-e2e test-e2e-fullstack
test: test-frontend test-backend ## 単体/統合テスト一括

test-frontend: ## フロント Vitest (+coverage)
	npm run test:frontend

test-functions: ## Pages Functions のテスト (frontend の vitest に内包)
	npm run test:frontend

test-backend: ## Go テスト (race + coverage)
	cd backend && go test -race -cover ./internal/...

test-e2e: ## Playwright E2E (フロントのみ / 未認証スモーク・CSP)
	npm run test --workspace e2e

test-e2e-fullstack: ## full-stack E2E (supabase + wrangler pages dev)。要 Docker。
	npx supabase status >/dev/null 2>&1 || npx supabase start
	npx supabase db reset
	[ -f frontend/.dev.vars ] || cp frontend/.dev.vars.example frontend/.dev.vars
	npm run test:fullstack --workspace e2e

# ---- Build ----------------------------------------------------------------
.PHONY: build build-frontend build-backend
build: build-frontend build-backend ## 全ビルド

build-frontend: ## フロントを本番ビルド
	npm run build:frontend

build-backend: ## Go Worker を WASM ビルド (gzip サイズも表示)
	cd backend && go run github.com/syumai/workers/cmd/workers-assets-gen -mode=go && \
		GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o ./build/app.wasm . && \
		printf 'WASM gzip: %s bytes (無料枠上限 3145728)\n' "$$(gzip -c ./build/app.wasm | wc -c)"

# ---- Deploy (手動 / CI) ---------------------------------------------------
.PHONY: setup-prod deploy deploy-frontend deploy-backend check-worker-secrets

setup-prod: ## .env を読んで本番を構築する（Supabase / Access / Pages / Cron）
	./scripts/setup-prod.sh

deploy: deploy-frontend deploy-backend ## 本番デプロイ

deploy-frontend: build-frontend ## Cloudflare Pages へデプロイ
	# バンドルと CSP が同じ Supabase を指しているか検算する（#41）。
	# ずれたまま出すと「画面は出るのにデータが読めない」になる。CI と同じスクリプト。
	python3 scripts/verify_csp.py frontend/dist --production
	# service worker が JWT・家計データを precache せず、Access を壊さないか検算する（#55）。
	python3 scripts/verify_sw.py frontend/dist
	cd frontend && npx wrangler pages deploy dist --branch main

deploy-backend: check-worker-secrets build-backend ## Go Cron Worker をデプロイ
	cd backend && npx wrangler deploy

check-worker-secrets: ## cron に必要な secret が登録済みか確認する
	@cd backend && \
	MISSING=""; \
	LIST="$$(npx wrangler secret list 2>/dev/null || echo '[]')"; \
	for name in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do \
		echo "$$LIST" | grep -q "\"$$name\"" || MISSING="$$MISSING $$name"; \
	done; \
	if [ -n "$$MISSING" ]; then \
		echo "cron に必要な secret が未登録です:$$MISSING"; \
		echo "登録してから再実行してください:"; \
		for name in $$MISSING; do echo "  cd backend && npx wrangler secret put $$name"; done; \
		exit 1; \
	fi; \
	echo "worker secrets OK"

# ---- Clean ----------------------------------------------------------------
.PHONY: clean
clean: ## 生成物を削除
	rm -rf frontend/dist frontend/coverage backend/build e2e/playwright-report e2e/test-results
