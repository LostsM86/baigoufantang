package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	wechatLoginURL        = "https://api.weixin.qq.com/sns/jscode2session"
	wechatAccessTokenURL  = "https://api.weixin.qq.com/cgi-bin/token"
	wechatSubscribeAPIURL = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"
	sessionTokenTTL       = 7 * 24 * time.Hour
)

type wechatLoginRequest struct {
	Code string `json:"code"`
}

type wechatLoginResponse struct {
	SessionToken string    `json:"sessionToken"`
	ExpiresAt    time.Time `json:"expiresAt"`
	Viewer       viewerDTO `json:"viewer"`
}

type wechatCode2SessionResponse struct {
	OpenID     string `json:"openid"`
	UnionID    string `json:"unionid"`
	SessionKey string `json:"session_key"`
	ErrCode    int    `json:"errcode"`
	ErrMsg     string `json:"errmsg"`
}

type wechatAccessTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	ErrCode     int    `json:"errcode"`
	ErrMsg      string `json:"errmsg"`
}

type wechatErrorResponse struct {
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}

type subscribeMessageRequest struct {
	Touser           string                              `json:"touser"`
	TemplateID       string                              `json:"template_id"`
	Page             string                              `json:"page,omitempty"`
	MiniprogramState string                              `json:"miniprogram_state,omitempty"`
	Lang             string                              `json:"lang,omitempty"`
	Data             map[string]subscribeMessageDataItem `json:"data"`
}

type subscribeMessageDataItem struct {
	Value string `json:"value"`
}

type orderNotificationPayload struct {
	OrderNo        string
	MealDate       string
	MealSlot       string
	MealLabel      string
	RequesterLabel string
	Remark         string
	ItemSummary    string
	TotalQuantity  int
	CreatedAt      time.Time
}

var wechatAccessTokenCache struct {
	sync.Mutex
	Token     string
	ExpiresAt time.Time
}

func WechatLoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, fmt.Errorf("请求方法 %s 不支持", r.Method))
		return
	}

	var req wechatLoginRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, err)
		return
	}

	code := strings.TrimSpace(req.Code)
	if code == "" {
		writeError(w, errors.New("缺少微信登录 code"))
		return
	}

	session, err := exchangeCode2Session(code)
	if err != nil {
		writeError(w, err)
		return
	}
	if strings.TrimSpace(session.OpenID) == "" {
		writeError(w, errors.New("微信登录失败，未返回 openid"))
		return
	}

	token, expiresAt, err := generateSessionToken(session.OpenID)
	if err != nil {
		writeError(w, err)
		return
	}

	writeData(w, wechatLoginResponse{
		SessionToken: token,
		ExpiresAt:    expiresAt,
		Viewer:       buildViewer(session.OpenID),
	})
}

func exchangeCode2Session(code string) (*wechatCode2SessionResponse, error) {
	appID := strings.TrimSpace(os.Getenv("WECHAT_APP_ID"))
	appSecret := strings.TrimSpace(os.Getenv("WECHAT_APP_SECRET"))
	if appID == "" || appSecret == "" {
		return nil, errors.New("服务端未配置 WECHAT_APP_ID / WECHAT_APP_SECRET")
	}

	values := url.Values{}
	values.Set("appid", appID)
	values.Set("secret", appSecret)
	values.Set("js_code", code)
	values.Set("grant_type", "authorization_code")

	endpoint := wechatLoginURL + "?" + values.Encode()
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		return nil, fmt.Errorf("调用微信登录接口失败: %w", err)
	}
	defer resp.Body.Close()

	var result wechatCode2SessionResponse
	if err := decodeJSONBody(resp.Body, &result); err != nil {
		return nil, err
	}
	if result.ErrCode != 0 {
		return nil, fmt.Errorf("微信登录失败: %s(%d)", result.ErrMsg, result.ErrCode)
	}

	return &result, nil
}

func generateSessionToken(openid string) (string, time.Time, error) {
	secret := sessionTokenSecret()
	if secret == "" {
		return "", time.Time{}, errors.New("服务端未配置会话签名密钥")
	}

	expiresAt := time.Now().Add(sessionTokenTTL)
	encodedOpenID := base64.RawURLEncoding.EncodeToString([]byte(openid))
	expireUnix := strconv.FormatInt(expiresAt.Unix(), 10)
	signature := signSessionPayload(secret, encodedOpenID, expireUnix)
	token := strings.Join([]string{encodedOpenID, expireUnix, signature}, ".")

	return token, expiresAt, nil
}

func parseSessionToken(token string) (string, error) {
	secret := sessionTokenSecret()
	if secret == "" {
		return "", errors.New("服务端未配置会话签名密钥")
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", errors.New("用户会话格式非法")
	}

	encodedOpenID := strings.TrimSpace(parts[0])
	expireUnix := strings.TrimSpace(parts[1])
	signature := strings.TrimSpace(parts[2])
	if encodedOpenID == "" || expireUnix == "" || signature == "" {
		return "", errors.New("用户会话格式非法")
	}

	expectedSignature := signSessionPayload(secret, encodedOpenID, expireUnix)
	if !hmac.Equal([]byte(expectedSignature), []byte(signature)) {
		return "", errors.New("用户会话签名校验失败")
	}

	expireAt, err := strconv.ParseInt(expireUnix, 10, 64)
	if err != nil {
		return "", errors.New("用户会话过期时间非法")
	}
	if time.Now().Unix() >= expireAt {
		return "", errors.New("用户会话已过期")
	}

	openIDBytes, err := base64.RawURLEncoding.DecodeString(encodedOpenID)
	if err != nil {
		return "", errors.New("用户会话内容非法")
	}

	return string(openIDBytes), nil
}

func signSessionPayload(secret, encodedOpenID, expireUnix string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(encodedOpenID))
	_, _ = mac.Write([]byte("|"))
	_, _ = mac.Write([]byte(expireUnix))
	return hex.EncodeToString(mac.Sum(nil))
}

func sessionTokenSecret() string {
	if secret := strings.TrimSpace(os.Getenv("SESSION_SECRET")); secret != "" {
		return secret
	}
	return strings.TrimSpace(os.Getenv("WECHAT_APP_SECRET"))
}

func adminNotificationEnabled() bool {
	return strings.TrimSpace(os.Getenv("WECHAT_APP_ID")) != "" &&
		strings.TrimSpace(os.Getenv("WECHAT_APP_SECRET")) != "" &&
		strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_TEMPLATE_ID")) != "" &&
		strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_TEMPLATE_DATA")) != "" &&
		len(adminOpenIDs()) > 0
}

func buildAdminNotificationConfig(requesterID string) adminNotificationDTO {
	if !isAdminRequester(requesterID) || !adminNotificationEnabled() {
		return adminNotificationDTO{}
	}

	return adminNotificationDTO{
		Enabled:             true,
		SubscribeTemplateID: strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_TEMPLATE_ID")),
	}
}

func notifyAdminsForNewOrders(payloads []orderNotificationPayload) {
	if !adminNotificationEnabled() || len(payloads) == 0 {
		return
	}

	for _, payload := range payloads {
		if err := sendAdminNotification(payload); err != nil {
			log.Printf("send admin notification failed for order %s: %v", payload.OrderNo, err)
		}
	}
}

func sendAdminNotification(payload orderNotificationPayload) error {
	accessToken, err := getWechatAccessToken()
	if err != nil {
		return err
	}

	templateID := strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_TEMPLATE_ID"))
	data, err := renderAdminNotificationData(payload)
	if err != nil {
		return err
	}

	page := renderNotificationTemplate(
		strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_PAGE")),
		payload,
	)
	miniprogramState := strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_MINIPROGRAM_STATE"))
	if miniprogramState == "" {
		miniprogramState = "formal"
	}
	lang := strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_LANG"))
	if lang == "" {
		lang = "zh_CN"
	}

	errMessages := make([]string, 0)
	for _, openid := range adminOpenIDs() {
		reqBody := subscribeMessageRequest{
			Touser:           openid,
			TemplateID:       templateID,
			Page:             page,
			MiniprogramState: miniprogramState,
			Lang:             lang,
			Data:             data,
		}
		if err := postSubscribeMessage(accessToken, reqBody); err != nil {
			errMessages = append(errMessages, fmt.Sprintf("%s: %v", openid, err))
		}
	}

	if len(errMessages) > 0 {
		return errors.New(strings.Join(errMessages, "; "))
	}

	return nil
}

func renderAdminNotificationData(payload orderNotificationPayload) (map[string]subscribeMessageDataItem, error) {
	rawTemplate := strings.TrimSpace(os.Getenv("ADMIN_NOTIFY_TEMPLATE_DATA"))
	if rawTemplate == "" {
		return nil, errors.New("服务端未配置 ADMIN_NOTIFY_TEMPLATE_DATA")
	}

	var template map[string]subscribeMessageDataItem
	if err := json.Unmarshal([]byte(rawTemplate), &template); err != nil {
		return nil, fmt.Errorf("解析 ADMIN_NOTIFY_TEMPLATE_DATA 失败: %w", err)
	}

	data := make(map[string]subscribeMessageDataItem, len(template))
	for key, item := range template {
		data[key] = subscribeMessageDataItem{
			Value: renderNotificationTemplate(item.Value, payload),
		}
	}

	return data, nil
}

func renderNotificationTemplate(template string, payload orderNotificationPayload) string {
	replacements := map[string]string{
		"{{order_no}}":        payload.OrderNo,
		"{{meal_date}}":       payload.MealDate,
		"{{meal_slot}}":       payload.MealSlot,
		"{{meal_label}}":      payload.MealLabel,
		"{{requester_label}}": payload.RequesterLabel,
		"{{remark}}":          emptyFallback(payload.Remark, "无备注"),
		"{{item_summary}}":    emptyFallback(payload.ItemSummary, "订单详情请进小程序查看"),
		"{{created_at}}":      payload.CreatedAt.Format("2006-01-02 15:04"),
		"{{total_quantity}}":  strconv.Itoa(payload.TotalQuantity),
	}

	for placeholder, value := range replacements {
		template = strings.ReplaceAll(template, placeholder, value)
	}

	return template
}

func emptyFallback(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func adminOpenIDs() []string {
	parts := strings.Split(os.Getenv("ADMIN_OPENIDS"), ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		openid := strings.TrimSpace(part)
		if openid == "" {
			continue
		}
		result = append(result, openid)
	}
	return result
}

func getWechatAccessToken() (string, error) {
	wechatAccessTokenCache.Lock()
	if wechatAccessTokenCache.Token != "" && time.Until(wechatAccessTokenCache.ExpiresAt) > 5*time.Minute {
		token := wechatAccessTokenCache.Token
		wechatAccessTokenCache.Unlock()
		return token, nil
	}
	wechatAccessTokenCache.Unlock()

	appID := strings.TrimSpace(os.Getenv("WECHAT_APP_ID"))
	appSecret := strings.TrimSpace(os.Getenv("WECHAT_APP_SECRET"))
	if appID == "" || appSecret == "" {
		return "", errors.New("服务端未配置 WECHAT_APP_ID / WECHAT_APP_SECRET")
	}

	values := url.Values{}
	values.Set("grant_type", "client_credential")
	values.Set("appid", appID)
	values.Set("secret", appSecret)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(wechatAccessTokenURL + "?" + values.Encode())
	if err != nil {
		return "", fmt.Errorf("获取微信 access_token 失败: %w", err)
	}
	defer resp.Body.Close()

	var result wechatAccessTokenResponse
	if err := decodeJSONBody(resp.Body, &result); err != nil {
		return "", err
	}
	if result.ErrCode != 0 {
		return "", fmt.Errorf("获取微信 access_token 失败: %s(%d)", result.ErrMsg, result.ErrCode)
	}

	wechatAccessTokenCache.Lock()
	wechatAccessTokenCache.Token = result.AccessToken
	wechatAccessTokenCache.ExpiresAt = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	wechatAccessTokenCache.Unlock()

	return result.AccessToken, nil
}

func postSubscribeMessage(accessToken string, reqBody subscribeMessageRequest) error {
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Post(
		wechatSubscribeAPIURL+"?access_token="+url.QueryEscape(accessToken),
		"application/json",
		bytes.NewReader(payload),
	)
	if err != nil {
		return fmt.Errorf("发送订阅消息失败: %w", err)
	}
	defer resp.Body.Close()

	var result wechatErrorResponse
	if err := decodeJSONBody(resp.Body, &result); err != nil {
		return err
	}
	if result.ErrCode != 0 {
		return fmt.Errorf("发送订阅消息失败: %s(%d)", result.ErrMsg, result.ErrCode)
	}

	return nil
}

func decodeJSONBody(reader io.Reader, target interface{}) error {
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("解析微信接口返回失败: %w", err)
	}
	return nil
}
