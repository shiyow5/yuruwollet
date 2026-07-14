package cronjob

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/shiyow5/yuruwollet/backend/internal/fx"
	"github.com/shiyow5/yuruwollet/backend/internal/supabase"
)

type fakeFX struct {
	rate fx.Rate
	err  error
	// history[date] = その日の履歴レート。無い日は err を返す。
	history   map[string]fx.Rate
	historyOn []string
}

func (f *fakeFX) FetchUSDJPY(context.Context) (fx.Rate, error) { return f.rate, f.err }

func (f *fakeFX) FetchUSDJPYOn(_ context.Context, date string) (fx.Rate, error) {
	f.historyOn = append(f.historyOn, date)
	if r, ok := f.history[date]; ok {
		return r, nil
	}
	return fx.Rate{}, errors.New("履歴レートが無い")
}

type fakeStore struct {
	upsertErr error
	listErr   error
	settleErr error
	pingErr   error

	subs []supabase.Subscription

	upserted []string
	pinged   int
	listedAt string

	// settleCalls[subID] = 呼ばれた回数
	settleCalls map[string]int
	// needsFX[subID] = その日のレートが揃うまで返し続ける日付
	needsFX map[string]string
	// cached[date] = fx_rates に入っているレート（needsFX の解消判定に使う）
	cached map[string]bool
	// recorded[subID] = 記録した支払い件数
	recorded map[string]int
}

func newStore() *fakeStore {
	return &fakeStore{
		settleCalls: map[string]int{},
		needsFX:     map[string]string{},
		cached:      map[string]bool{},
		recorded:    map[string]int{},
	}
}

func (s *fakeStore) UpsertFXRate(_ context.Context, date string, _ float64) error {
	if s.upsertErr != nil {
		return s.upsertErr
	}
	s.upserted = append(s.upserted, date)
	s.cached[date] = true
	return nil
}

func (s *fakeStore) ListDueSubscriptions(_ context.Context, today string) ([]supabase.Subscription, error) {
	s.listedAt = today
	return s.subs, s.listErr
}

// SettleSubscription は DB 側の精算 RPC の振る舞いを模す。
// needsFX に指定した日のレートが fx_rates に無ければ、その日付を返して止まる。
func (s *fakeStore) SettleSubscription(_ context.Context, id string) (int, string, error) {
	// **呼ばれた事実は、失敗しても記録する。** エラーの後ろで数えると
	// 「1 件目が落ちても 2 件目を試したか」を検証できない（呼ばれたのに 0 件に見える）。
	s.settleCalls[id]++
	if s.settleErr != nil {
		return 0, "", s.settleErr
	}

	if want, ok := s.needsFX[id]; ok && !s.cached[want] {
		return 0, want, nil // レート待ち
	}
	s.recorded[id]++
	return 1, "", nil
}

func (s *fakeStore) Ping(context.Context) error {
	s.pinged++
	return s.pingErr
}

func jobAt(t *testing.T, iso string, f FXFetcher, s Store) *Job {
	t.Helper()
	now, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		t.Fatal(err)
	}
	return &Job{FX: f, Store: s, Now: func() time.Time { return now }}
}

func TestToday_UsesJST(t *testing.T) {
	t.Parallel()

	// UTC 2026-07-13 15:30 = JST 2026-07-14 00:30 → JST の「今日」は 14 日
	j := jobAt(t, "2026-07-13T15:30:00Z", &fakeFX{}, newStore())
	if got := j.Today().Format("2006-01-02"); got != "2026-07-14" {
		t.Errorf("Today() = %s, want 2026-07-14 (JST)", got)
	}
}

func TestRun_HappyPath(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{{ID: "s1", Name: "Netflix"}}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(store.upserted) != 1 || store.upserted[0] != "2026-07-13" {
		t.Errorf("為替を保存していない: %v", store.upserted)
	}
	if store.listedAt != "2026-07-13" {
		t.Errorf("JST の今日で一覧を取っていない: %q", store.listedAt)
	}
	if store.settleCalls["s1"] != 1 {
		t.Errorf("精算 RPC を呼んでいない: %v", store.settleCalls)
	}
	if store.pinged != 1 {
		t.Errorf("keep-alive していない")
	}
}

// **cron はロールフォワードを計算しない。** 計算は DB 側（settle_subscription）にある。
// cron の役割は「SQL が要求した日の為替レートを取ってきて渡すこと」だけ。
func TestRun_SuppliesRequestedFXRateAndRetries(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{{ID: "u1", Name: "ChatGPT"}}
	store.needsFX["u1"] = "2026-05-13" // この日のレートが揃うまで止まる

	f := &fakeFX{
		rate:    fx.Rate{Date: "2026-07-13", Rate: 150},
		history: map[string]fx.Rate{"2026-05-13": {Date: "2026-05-13", Rate: 140}},
	}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// SQL が要求した日のレートを取りに行った
	if len(f.historyOn) != 1 || f.historyOn[0] != "2026-05-13" {
		t.Errorf("要求された日のレートを取っていない: %v", f.historyOn)
	}
	// 保存してから呼び直した
	if !contains(store.upserted, "2026-05-13") {
		t.Errorf("取得したレートを保存していない: %v", store.upserted)
	}
	if store.settleCalls["u1"] != 2 {
		t.Errorf("レート補給後に呼び直していない: %d 回", store.settleCalls["u1"])
	}
	if store.recorded["u1"] != 1 {
		t.Errorf("精算できていない: %v", store.recorded)
	}
}

// レートが取れない期があるなら、そこで止める。
// 古い概算のまま「確定した」ことにする方が有害（あとから直せない）。
func TestRun_FXUnavailable_StopsAndReports(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{{ID: "u1", Name: "ChatGPT"}}
	store.needsFX["u1"] = "2026-05-13"

	// 履歴レートが取れない
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "レート") {
		t.Fatalf("レートが取れないことは報告されるべき: %v", err)
	}
	if store.recorded["u1"] != 0 {
		t.Errorf("レートが無いのに記録している: %v", store.recorded)
	}
	// keep-alive は実行される（1 つ落ちても他は走る）
	if store.pinged != 1 {
		t.Error("為替の失敗で keep-alive まで止まっている")
	}
}

// レートが恒久的に「揃わない」と RPC が言い続けると無限ループになる。上限で打ち切る。
func TestRun_FXNeverSatisfied_IsCapped(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{{ID: "u1", Name: "ChatGPT"}}
	store.needsFX["u1"] = "2026-05-13"

	// レートは取れるが、保存しても needsFX が解消しない（cached に入らない）体
	store.upsertErr = nil
	f := &fakeFX{
		rate: fx.Rate{Date: "2026-07-13", Rate: 150},
		// 取得したレートの基準日が要求日と違う（休日で前営業日が返るケースの極端版）
		history: map[string]fx.Rate{"2026-05-13": {Date: "2026-01-01", Rate: 140}},
	}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "超えました") {
		t.Fatalf("上限で打ち切って報告するべき: %v", err)
	}
	if store.settleCalls["u1"] > maxFXFetchPerSubscription {
		t.Errorf("上限を超えて呼んでいる: %d 回", store.settleCalls["u1"])
	}
}

// 為替 API が落ちていても、サブスクの精算（JPY）と keep-alive は実行する。
// keep-alive が止まると Supabase が一時停止してアプリ全体が死ぬ。
func TestRun_FXDown_StillSettlesAndPings(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{{ID: "s1", Name: "Netflix"}}
	f := &fakeFX{err: errors.New("fx down")}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "為替の取得") {
		t.Fatalf("為替の失敗は報告されるべき: %v", err)
	}
	if store.recorded["s1"] != 1 {
		t.Error("為替が落ちても JPY サブスクは精算されるべき")
	}
	if store.pinged != 1 {
		t.Error("為替の失敗で keep-alive まで止まっている")
	}
}

func TestRun_PartialFailures_ContinueAndReportAll(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{{ID: "s1", Name: "A"}, {ID: "s2", Name: "B"}}
	store.settleErr = errors.New("db down")
	store.pingErr = errors.New("ping failed")
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil {
		t.Fatal("エラーになるべき")
	}
	for _, want := range []string{"サブスクの精算", "keep-alive"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("err に %q が無い: %v", want, err)
		}
	}
	// 1 件目が落ちても 2 件目を試す
	// （`&& store.settleErr == nil` を付けていたが、settleErr は上で non-nil にしているので
	//   条件が常に false になり、このアサートは一度も発火していなかった）
	if store.settleCalls["s2"] == 0 {
		t.Error("1 件の失敗で残りを諦めている")
	}
	if store.pinged != 1 {
		t.Error("keep-alive を実行していない")
	}
}

func TestRun_NoDueSubscriptions(t *testing.T) {
	t.Parallel()

	store := newStore()
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(store.settleCalls) != 0 {
		t.Errorf("到来したサブスクが無いのに精算している: %v", store.settleCalls)
	}
	if store.pinged != 1 {
		t.Error("keep-alive していない")
	}
}

func TestRun_ListFails_IsReported(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.listErr = errors.New("list failed")
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "サブスクの精算") {
		t.Fatalf("一覧の失敗は報告されるべき: %v", err)
	}
	if store.pinged != 1 {
		t.Error("keep-alive を実行していない")
	}
}

func contains(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}
