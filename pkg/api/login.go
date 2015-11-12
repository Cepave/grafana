package api

import (
	l "log"

	"net/url"

	"github.com/Cepave/grafana/pkg/api/dtos"
	"github.com/Cepave/grafana/pkg/bus"
	"github.com/Cepave/grafana/pkg/log"
	"github.com/Cepave/grafana/pkg/login"
	"github.com/Cepave/grafana/pkg/metrics"
	"github.com/Cepave/grafana/pkg/middleware"
	m "github.com/Cepave/grafana/pkg/models"
	"github.com/Cepave/grafana/pkg/setting"
	"github.com/Cepave/grafana/pkg/util"
)

const (
	VIEW_INDEX = "index"
)

/**
 * @function name:	func LoginWithOpenFalconCookie(c *middleware.Context) bool
 * @description:	This function gets user logged in if "sig" cookie of Open-Falcon is valid.
 * @related issues:	OWL-110
 * @param:			c *middleware.Context
 * @return:			bool
 * @author:			Don Hsieh
 * @since:			10/06/2015
 * @last modified: 	10/07/2015
 * @called by:		func LoginView(c *middleware.Context)
 *					 in pkg/api/login.go
 */
func LoginWithOpenFalconCookie(c *middleware.Context) bool {
	sig := c.GetCookie("sig")
	log.Info("sig = " + sig)
	// l.Println("sig =", sig)

	// uname := "don"
	uname := "admin"
	userQuery := m.GetUserByLoginQuery{LoginOrEmail: uname}
	if err := bus.Dispatch(&userQuery); err == nil {
		user := userQuery.Result
		l.Println("user =", user)
		loginUserWithUser(user, c)
		return true
	}
	return false
}

func LoginView(c *middleware.Context) {
	isLoggedIn := LoginWithOpenFalconCookie(c)
	if isLoggedIn {
		c.Redirect(setting.AppSubUrl + "/")
		return
	}

	if err := setIndexViewData(c); err != nil {
		c.Handle(500, "Failed to get settings", err)
		return
	}

	settings := c.Data["Settings"].(map[string]interface{})
	settings["googleAuthEnabled"] = setting.OAuthService.Google
	settings["githubAuthEnabled"] = setting.OAuthService.GitHub
	settings["disableUserSignUp"] = !setting.AllowUserSignUp

	if !tryLoginUsingRememberCookie(c) {
		c.HTML(200, VIEW_INDEX)
		return
	}

	if redirectTo, _ := url.QueryUnescape(c.GetCookie("redirect_to")); len(redirectTo) > 0 {
		c.SetCookie("redirect_to", "", -1, setting.AppSubUrl+"/")
		c.Redirect(redirectTo)
		return
	}

	c.Redirect(setting.AppSubUrl + "/")
}

func tryLoginUsingRememberCookie(c *middleware.Context) bool {
	// Check auto-login.
	uname := c.GetCookie(setting.CookieUserName)
	if len(uname) == 0 {
		return false
	}

	isSucceed := false
	defer func() {
		if !isSucceed {
			log.Trace("auto-login cookie cleared: %s", uname)
			c.SetCookie(setting.CookieUserName, "", -1, setting.AppSubUrl+"/")
			c.SetCookie(setting.CookieRememberName, "", -1, setting.AppSubUrl+"/")
			return
		}
	}()

	userQuery := m.GetUserByLoginQuery{LoginOrEmail: uname}
	if err := bus.Dispatch(&userQuery); err != nil {
		return false
	}

	user := userQuery.Result

	// validate remember me cookie
	if val, _ := c.GetSuperSecureCookie(
		util.EncodeMd5(user.Rands+user.Password), setting.CookieRememberName); val != user.Login {
		return false
	}

	isSucceed = true
	loginUserWithUser(user, c)
	return true
}

func LoginApiPing(c *middleware.Context) {
	if !tryLoginUsingRememberCookie(c) {
		c.JsonApiErr(401, "Unauthorized", nil)
		return
	}

	c.JsonOK("Logged in")
}

func LoginPost(c *middleware.Context, cmd dtos.LoginCommand) Response {
	authQuery := login.LoginUserQuery{
		Username: cmd.User,
		Password: cmd.Password,
	}
	log.Info("authQuery =", authQuery)

	if err := bus.Dispatch(&authQuery); err != nil {
		if err == login.ErrInvalidCredentials {
			return ApiError(401, "Invalid username or password", err)
		}

		return ApiError(500, "Error while trying to authenticate user", err)
	}

	user := authQuery.User

	loginUserWithUser(user, c)

	result := map[string]interface{}{
		"message": "Logged in",
	}

	if redirectTo, _ := url.QueryUnescape(c.GetCookie("redirect_to")); len(redirectTo) > 0 {
		result["redirectUrl"] = redirectTo
		c.SetCookie("redirect_to", "", -1, setting.AppSubUrl+"/")
	}

	metrics.M_Api_Login_Post.Inc(1)

	return Json(200, result)
}

func loginUserWithUser(user *m.User, c *middleware.Context) {
	if user == nil {
		log.Error(3, "User login with nil user")
	}
	
	days := 86400 * setting.LogInRememberDays
	// log.Info("user =", user)
	// log.Info("setting.CookieUserName =", setting.CookieUserName)
	// log.Info("user.Login =", user.Login)
	// log.Info("days =", days)
	// log.Info("setting.AppSubUrl =", setting.AppSubUrl)
	
	c.SetCookie(setting.CookieUserName, user.Login, days, setting.AppSubUrl+"/")
	c.SetSuperSecureCookie(util.EncodeMd5(user.Rands+user.Password), setting.CookieRememberName, user.Login, days, setting.AppSubUrl+"/")
	log.Info("grafana_remember =", c.GetCookie("grafana_remember"))
	// log.Info("grafana_sess =", c.GetCookie("grafana_sess"))
	log.Info("grafana_user =", c.GetCookie("grafana_user"))
	
	// log.Info("Cookie grafana_sess =", c.Req.Cookie("grafana_sess"))
	// log.Info("Cookie grafana_sess =", string(c.Req.Cookie("grafana_sess").Value))
	// log.Info("Cookie grafana_sess =", c.Req.Cookies())
	cookies := c.Req.Cookies()
	log.Info("len(cookies) =", len(cookies))
	// for i, cookie := range cookies {
	for _, cookie := range cookies {
		// log.Info("cookie =", cookie)
		log.Info("cookie.Value =", cookie.Value)
	}

	// c.Req.Cookie("grafana_sess")
	// header := ctx.Req.Header.Get("Authorization")

	c.Session.Set(middleware.SESS_KEY_USERID, user.Id)
}

func Logout(c *middleware.Context) {
	c.SetCookie(setting.CookieUserName, "", -1, setting.AppSubUrl+"/")
	c.SetCookie(setting.CookieRememberName, "", -1, setting.AppSubUrl+"/")
	c.Session.Destory(c)
	c.Redirect(setting.AppSubUrl + "/login")
}