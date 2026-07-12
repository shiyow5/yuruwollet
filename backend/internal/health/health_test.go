package health

import (
	"encoding/json"
	"testing"
)

func TestNew(t *testing.T) {
	p := New()
	if p.Status != "ok" {
		t.Errorf("Status = %q, want ok", p.Status)
	}
	if p.Service != "yuruwollet-cron" {
		t.Errorf("Service = %q, want yuruwollet-cron", p.Service)
	}
}

func TestPayloadJSON(t *testing.T) {
	var p Payload
	if err := json.Unmarshal([]byte(PayloadJSON()), &p); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if p.Status != "ok" {
		t.Errorf("Status = %q, want ok", p.Status)
	}
	if p.Service != "yuruwollet-cron" {
		t.Errorf("Service = %q, want yuruwollet-cron", p.Service)
	}
}
