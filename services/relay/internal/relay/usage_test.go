package relay_test

import (
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/softmeta/cocurdex/services/relay/internal/relay"
)

func TestCountsRelayedTrafficPerAccount(t *testing.T) {
	harness := startCredentialRelay(t)
	heavy, err := harness.registerAs(t, "invite-heavy", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	light, err := harness.registerAs(t, "invite-light", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	acceptSessions(t, harness.base, heavy, echoUpper)
	acceptSessions(t, harness.base, light, echoUpper)
	ctx := testContext(t)
	exchange := func(host testHost, payload []byte) {
		device := dial(t, harness.base+"/v1/connect/"+host.routeID)
		if err := device.Write(ctx, websocket.MessageBinary, payload); err != nil {
			t.Fatal(err)
		}
		if _, _, err := device.Read(ctx); err != nil {
			t.Fatal(err)
		}
	}
	exchange(heavy, make([]byte, 40_000))
	exchange(heavy, make([]byte, 10_000))
	exchange(light, make([]byte, 100))
	if err := relay.RevokeAccount(harness.dataDir, "invite-heavy", "", harness.clock()); err != nil {
		t.Fatal(err)
	}
	if err := harness.usage.Flush(harness.clock()); err != nil {
		t.Fatal(err)
	}

	summary, err := relay.SummarizeUsage(harness.dataDir, 30, harness.clock())
	if err != nil {
		t.Fatal(err)
	}
	want := []relay.AccountUsage{
		{Account: "invite-heavy", Bytes: 100_000, Sessions: 2, Revoked: true},
		{Account: "invite-light", Bytes: 200, Sessions: 1},
	}
	if len(summary) != len(want) {
		t.Fatalf("summary %+v", summary)
	}
	for index, row := range summary {
		expected := want[index]
		if row.Account != expected.Account || row.Bytes != expected.Bytes ||
			row.Sessions != expected.Sessions || row.Revoked != expected.Revoked ||
			!row.LastSeen.Equal(harness.clock()) {
			t.Fatalf("row %d = %+v, want %+v", index, row, expected)
		}
	}
}

func TestKeepsUsageAcrossRestartsAndSummarizesTheRequestedDays(t *testing.T) {
	dataDir := t.TempDir()
	today := time.Date(2026, 11, 30, 12, 0, 0, 0, time.UTC)
	usage, err := relay.OpenUsage(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	usage.AddBytes("invite-1", 500, today.AddDate(0, 0, -100))
	usage.AddBytes("invite-1", 300, today.AddDate(0, 0, -10))
	usage.AddBytes("invite-1", 200, today)
	if err := usage.Flush(today); err != nil {
		t.Fatal(err)
	}

	reopened, err := relay.OpenUsage(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	reopened.AddBytes("invite-1", 1, today)
	if err := reopened.Flush(today); err != nil {
		t.Fatal(err)
	}
	for days, bytes := range map[int]int64{1: 201, 30: 501, 365: 501} {
		summary, err := relay.SummarizeUsage(dataDir, days, today)
		if err != nil {
			t.Fatal(err)
		}
		if len(summary) != 1 || summary[0].Bytes != bytes {
			t.Fatalf("last %d days: %+v, want %d bytes", days, summary, bytes)
		}
	}
}
