// Package health は Go Cron Worker の稼働確認用ペイロードを提供する。
package health

import "encoding/json"

// Payload は稼働確認レスポンスの構造。
type Payload struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

// New は ok 状態のペイロードを返す。
func New() Payload {
	return Payload{Status: "ok", Service: "yuruwollet-cron"}
}

// PayloadJSON は ok ペイロードを JSON 文字列で返す。
func PayloadJSON() string {
	b, _ := json.Marshal(New())
	return string(b)
}
