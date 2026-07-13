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
}

func (f *fakeFX) FetchUSDJPY(context.Context) (fx.Rate, error) { return f.rate, f.err }

type fakeStore struct {
	upsertErr error
	listErr   error
	updateErr error
	pingErr   error

	subs []supabase.Subscription

	upserted []string
	updates  map[string]supabase.RenewalUpdate
	pinged   int
	listedAt string
}

func newStore() *fakeStore {
	return &fakeStore{updates: map[string]supabase.RenewalUpdate{}}
}

func (s *fakeStore) UpsertFXRate(_ context.Context, date string, _ float64) error {
	if s.upsertErr != nil {
		return s.upsertErr
	}
	s.upserted = append(s.upserted, date)
	return nil
}

func (s *fakeStore) ListDueSubscriptions(_ context.Context, today string) ([]supabase.Subscription, error) {
	s.listedAt = today
	return s.subs, s.listErr
}

func (s *fakeStore) UpdateSubscriptionRenewal(_ context.Context, id string, u supabase.RenewalUpdate) error {
	if s.updateErr != nil {
		return s.updateErr
	}
	s.updates[id] = u
	return nil
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
	// UTC 2026-07-13 16:00 は JST では 7/14 01:00
	j := jobAt(t, "2026-07-13T16:00:00Z", &fakeFX{}, newStore())
	if got := j.Today().Format("2006-01-02"); got != "2026-07-14" {
		t.Errorf("Today = %s, want 2026-07-14 (JST)", got)
	}
}

func TestRun_HappyPath(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{
		{ID: "jpy1", Currency: "JPY", Cycle: "monthly", NextRenewalDate: "2026-07-10", RenewalAnchorDay: 10, AmountJPY: 1490},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150.0}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(store.upserted) != 1 || store.upserted[0] != "2026-07-13" {
		t.Errorf("fx upsert = %v, want [2026-07-13]", store.upserted)
	}
	if store.listedAt != "2026-07-13" {
		t.Errorf("listed at %s, want 2026-07-13 (JST)", store.listedAt)
	}
	if got := store.updates["jpy1"].NextRenewalDate; got != "2026-08-10" {
		t.Errorf("next renewal = %s, want 2026-08-10", got)
	}
	if store.pinged != 1 {
		t.Errorf("pinged = %d, want 1", store.pinged)
	}
}

func TestRun_USD_SnapshotsActualRateOnRenewal(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{
		{ID: "usd1", Currency: "USD", OriginalAmount: 20, Cycle: "monthly",
			NextRenewalDate: "2026-07-13", RenewalAnchorDay: 13, AmountJPY: 3000},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 151.5}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	u := store.updates["usd1"]
	// 概算 (3000) ではなく、更新日に到来した時点の実レートで確定する
	if u.AmountJPY == nil || *u.AmountJPY != 3030 { // round(20 * 151.5)
		t.Errorf("amount_jpy = %v, want 3030", u.AmountJPY)
	}
	if u.FxRate == nil || *u.FxRate != 151.5 {
		t.Errorf("fx_rate = %v, want 151.5", u.FxRate)
	}
	if u.FxRateDate == nil || *u.FxRateDate != "2026-07-13" {
		t.Errorf("fx_rate_date = %v, want 2026-07-13", u.FxRateDate)
	}
}

// レートが取れない日に USD を進めると、古い概算のまま「確定した」ことになってしまう。
func TestRun_FXDown_SkipsUSDButRollsJPY(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{
		{ID: "usd1", Currency: "USD", OriginalAmount: 20, Cycle: "monthly",
			NextRenewalDate: "2026-07-10", RenewalAnchorDay: 10},
		{ID: "jpy1", Currency: "JPY", Cycle: "monthly",
			NextRenewalDate: "2026-07-10", RenewalAnchorDay: 10},
	}
	f := &fakeFX{err: errors.New("fx down")}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "為替の取得") {
		t.Fatalf("為替の失敗が報告されるべき: %v", err)
	}

	if _, rolled := store.updates["usd1"]; rolled {
		t.Error("レートが無い日に USD を進めてはいけない")
	}
	if got := store.updates["jpy1"].NextRenewalDate; got != "2026-08-10" {
		t.Errorf("JPY は進めるべき: next = %q", got)
	}
	// 為替が落ちていても keep-alive は必ず打つ (打たないと Supabase が一時停止する)
	if store.pinged != 1 {
		t.Errorf("pinged = %d, want 1", store.pinged)
	}
}

// レートの保存に失敗したら、そのレートは信用せず再スナップに使わない。
func TestRun_FXUpsertFails_DoesNotSnapshotUSD(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.upsertErr = errors.New("db down")
	store.subs = []supabase.Subscription{
		{ID: "usd1", Currency: "USD", OriginalAmount: 20, Cycle: "monthly",
			NextRenewalDate: "2026-07-10", RenewalAnchorDay: 10},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil || !strings.Contains(err.Error(), "為替の保存") {
		t.Fatalf("保存失敗が報告されるべき: %v", err)
	}
	if _, rolled := store.updates["usd1"]; rolled {
		t.Error("保存できなかったレートで USD を確定させてはいけない")
	}
}

// 1 件の更新失敗で残りを諦めない
func TestRun_PartialFailures_ContinueAndReportAll(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.updateErr = errors.New("update failed")
	store.pingErr = errors.New("ping failed")
	store.subs = []supabase.Subscription{
		{ID: "a", Currency: "JPY", Cycle: "monthly", NextRenewalDate: "2026-07-10", RenewalAnchorDay: 10},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	err := j.Run(context.Background())
	if err == nil {
		t.Fatal("失敗が報告されるべき")
	}
	// 為替は成功、サブスク更新と keep-alive が失敗 → 両方報告される
	for _, want := range []string{"サブスクの更新", "keep-alive"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("err に %q が含まれるべき: %v", want, err)
		}
	}
	if store.pinged != 1 {
		t.Errorf("サブスク更新が失敗しても keep-alive は打つべき（pinged=%d）", store.pinged)
	}
}

func TestRun_NotDue_IsUntouched(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{
		{ID: "future", Currency: "JPY", Cycle: "monthly", NextRenewalDate: "2026-08-10", RenewalAnchorDay: 10},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(store.updates) != 0 {
		t.Errorf("未到来のサブスクは触らない: %v", store.updates)
	}
}

// 月末課金は本来の課金日 (anchor) から丸め直す
func TestRun_MonthEndUsesAnchor(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{
		{ID: "me", Currency: "JPY", Cycle: "monthly", NextRenewalDate: "2026-01-31", RenewalAnchorDay: 31},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-02-01", Rate: 150}}
	j := jobAt(t, "2026-01-31T15:00:01Z", f, store) // JST 2026-02-01

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := store.updates["me"].NextRenewalDate; got != "2026-02-28" {
		t.Errorf("next = %s, want 2026-02-28", got)
	}
}

func TestRun_BadDate_IsSkipped(t *testing.T) {
	t.Parallel()

	store := newStore()
	store.subs = []supabase.Subscription{
		{ID: "bad", Currency: "JPY", Cycle: "monthly", NextRenewalDate: "not-a-date"},
	}
	f := &fakeFX{rate: fx.Rate{Date: "2026-07-13", Rate: 150}}
	j := jobAt(t, "2026-07-13T03:00:00Z", f, store)

	if err := j.Run(context.Background()); err != nil {
		t.Fatalf("壊れた行で cron 全体を落とさない: %v", err)
	}
	if len(store.updates) != 0 {
		t.Error("壊れた日付の行は触らない")
	}
}
