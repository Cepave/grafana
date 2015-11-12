// Copyright 2014 Unknwon
// Copyright 2014 Torkel Ödegaard

package cmd

import (
	"fmt"
	"net/http"
	"path"

	"github.com/Unknwon/macaron"

	"github.com/Cepave/grafana/pkg/api"
<<<<<<< 40884066c2e76363138819a297bc434060a9218b
<<<<<<< 7233bfadf43890ab379f2549dc0945879b423165
<<<<<<< a84f1f0a3df6380f5a6561dd65aca819f7df5e8a
<<<<<<< 70a59f5f003c96f4042de4bf2623b4620c8b6632
=======
>>>>>>> Replace the import path with github.com/Cepave/grafana.
=======
>>>>>>> Replace the import path with github.com/Cepave/grafana.
	"github.com/Cepave/grafana/pkg/api/static"
	"github.com/Cepave/grafana/pkg/log"
	"github.com/Cepave/grafana/pkg/middleware"
	"github.com/Cepave/grafana/pkg/setting"
<<<<<<< 40884066c2e76363138819a297bc434060a9218b
<<<<<<< a84f1f0a3df6380f5a6561dd65aca819f7df5e8a
=======
=======
>>>>>>> OWL-28 refinements
	"github.com/grafana/grafana/pkg/api/static"
	"github.com/grafana/grafana/pkg/log"
	"github.com/grafana/grafana/pkg/middleware"
	"github.com/grafana/grafana/pkg/setting"
<<<<<<< 7233bfadf43890ab379f2549dc0945879b423165
>>>>>>> OWL-28 refinements
=======
>>>>>>> Replace the import path with github.com/Cepave/grafana.
=======
>>>>>>> OWL-28 refinements
=======
>>>>>>> Replace the import path with github.com/Cepave/grafana.
)

func newMacaron() *macaron.Macaron {
	macaron.Env = setting.Env
	m := macaron.New()

	m.Use(middleware.Logger())
	m.Use(macaron.Recovery())

	if setting.EnableGzip {
		m.Use(middleware.Gziper())
	}

	mapStatic(m, "", "public")
	mapStatic(m, "app", "app")
	mapStatic(m, "css", "css")
	mapStatic(m, "img", "img")
	mapStatic(m, "fonts", "fonts")
	mapStatic(m, "robots.txt", "robots.txt")

	m.Use(macaron.Renderer(macaron.RenderOptions{
		Directory:  path.Join(setting.StaticRootPath, "views"),
		IndentJSON: macaron.Env != macaron.PROD,
		Delims:     macaron.Delims{Left: "[[", Right: "]]"},
	}))

	if setting.EnforceDomain {
		m.Use(middleware.ValidateHostHeader(setting.Domain))
	}

	m.Use(middleware.GetContextHandler())
	m.Use(middleware.Sessioner(&setting.SessionOptions))

	return m
}

func mapStatic(m *macaron.Macaron, dir string, prefix string) {
	headers := func(c *macaron.Context) {
		c.Resp.Header().Set("Cache-Control", "public, max-age=3600")
	}

	if setting.Env == setting.DEV {
		headers = func(c *macaron.Context) {
			c.Resp.Header().Set("Cache-Control", "max-age=0, must-revalidate, no-cache")
		}
	}

	m.Use(httpstatic.Static(
		path.Join(setting.StaticRootPath, dir),
		httpstatic.StaticOptions{
			SkipLogging: true,
			Prefix:      prefix,
			AddHeaders:  headers,
		},
	))
}

func StartServer() {

	var err error
	m := newMacaron()
	api.Register(m)

	listenAddr := fmt.Sprintf("%s:%s", setting.HttpAddr, setting.HttpPort)
	log.Info("Listen: %v://%s%s", setting.Protocol, listenAddr, setting.AppSubUrl)
	switch setting.Protocol {
	case setting.HTTP:
		err = http.ListenAndServe(listenAddr, m)
	case setting.HTTPS:
		err = http.ListenAndServeTLS(listenAddr, setting.CertFile, setting.KeyFile, m)
	default:
		log.Fatal(4, "Invalid protocol: %s", setting.Protocol)
	}

	if err != nil {
		log.Fatal(4, "Fail to start server: %v", err)
	}
}
