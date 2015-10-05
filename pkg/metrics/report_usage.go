package metrics

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Cepave/grafana/pkg/bus"
	"github.com/Cepave/grafana/pkg/log"
	m "github.com/Cepave/grafana/pkg/models"
	"github.com/Cepave/grafana/pkg/setting"
)

func StartUsageReportLoop() chan struct{} {
	M_Instance_Start.Inc(1)

	ticker := time.NewTicker(time.Hour * 24)
	for {
		select {
		case <-ticker.C:
			sendUsageStats()
		}
	}
}

func sendUsageStats() {
	log.Trace("Sending anonymous usage stats to stats.grafana.org")

	version := strings.Replace(setting.BuildVersion, ".", "_", -1)

	metrics := map[string]interface{}{}
	report := map[string]interface{}{
		"version": version,
		"metrics": metrics,
	}

	statsQuery := m.GetSystemStatsQuery{}
	if err := bus.Dispatch(&statsQuery); err != nil {
		log.Error(3, "Failed to get system stats", err)
		return
	}

	UsageStats.Each(func(name string, i interface{}) {
		switch metric := i.(type) {
		case Counter:
			if metric.Count() > 0 {
				metrics[name+".count"] = metric.Count()
				metric.Clear()
			}
		}
	})

	metrics["stats.dashboards.count"] = statsQuery.Result.DashboardCount
	metrics["stats.users.count"] = statsQuery.Result.UserCount
	metrics["stats.orgs.count"] = statsQuery.Result.OrgCount

	out, _ := json.Marshal(report)
	data := bytes.NewBuffer(out)

	client := http.Client{Timeout: time.Duration(5 * time.Second)}
	go client.Post("https://stats.grafana.org/grafana-usage-report", "application/json", data)
}
