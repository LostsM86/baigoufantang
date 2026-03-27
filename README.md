# 白狗饭堂

这是一个基于微信小程序 + Go 后端的订餐示例，现在已经补齐了三条核心链路：

- 用户通过微信 `wx.login` 登录，后端调用 `code2Session` 换取 `openid`
- 小程序和后端都支持本地调试 / 云托管运行
- 管理员可以在小程序里订阅新订单通知，用户下单后后端会调用微信订阅消息接口推送

## 目录

- `main.go`：HTTP 入口
- `service/booking_service.go`：菜单、下单、工单、管理员接口
- `service/wechat_service.go`：微信登录、会话签名、订阅消息发送
- `db/`：MySQL 初始化、模型、种子数据
- `baigoufantang-frontend/`：微信小程序前端

## 后端环境变量

必须配置：

- `MYSQL_ADDRESS`：MySQL 地址，例如 `127.0.0.1:3306`
- `MYSQL_USERNAME`：MySQL 用户名
- `MYSQL_PASSWORD`：MySQL 密码
- `WECHAT_APP_ID`：小程序 AppID
- `WECHAT_APP_SECRET`：小程序 AppSecret

可选配置：

- `MYSQL_DATABASE`：数据库名，默认 `golang_demo`
- `PORT`：监听端口，默认 `80`
- `SESSION_SECRET`：会话签名密钥；不填时回退到 `WECHAT_APP_SECRET`
- `ADMIN_OPENIDS`：管理员微信 `openid`，多个逗号分隔
- `ADMIN_TOKEN`：管理员接口兜底 token，不配置时默认 `baigoufantang-admin`
- `ADMIN_NOTIFY_TEMPLATE_ID`：管理员新订单订阅消息模板 ID
- `ADMIN_NOTIFY_PAGE`：点击通知后跳转的小程序页面，默认可填 `pages/index/index`
- `ADMIN_NOTIFY_MINIPROGRAM_STATE`：消息跳转版本，默认 `formal`
- `ADMIN_NOTIFY_LANG`：消息语言，默认 `zh_CN`
- `ADMIN_NOTIFY_TEMPLATE_DATA`：订阅消息数据模板，JSON 字符串

## 本地启动后端

1. 准备 MySQL，并创建数据库。
2. 参考 [`.env.example`](./.env.example) 填好环境变量。
3. 本地启动：

```bash
PORT=8080 go run .
```

如果你本地不用 root 权限，建议显式指定 `PORT=8080`。

## 小程序配置

小程序配置文件在 [`baigoufantang-frontend/miniprogram/app.js`](./baigoufantang-frontend/miniprogram/app.js)。

云托管调试：

- 填写 `env`
- 填写 `serviceName`

本地联调：

- 保持 `env` 为空
- 把 `serviceBaseUrl` 改成 `http://127.0.0.1:8080`
- 微信开发者工具里打开“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”

## 微信登录链路

当前登录流程是：

1. 小程序调用 `wx.login`
2. 前端把 `code` 发到后端 `/api/wechat/login`
3. 后端调用微信 `code2Session`
4. 后端生成签名会话令牌，前端后续请求通过 `X-User-Session` 传递

这样后端不再直接信任前端传来的裸 `openid`。

## 管理员订单通知

管理员通知依赖微信订阅消息，使用前需要同时完成这几步：

1. 在微信公众平台为小程序添加一个“新订单通知”模板
2. 把模板 ID 配到 `ADMIN_NOTIFY_TEMPLATE_ID`
3. 把管理员的 `openid` 配到 `ADMIN_OPENIDS`
4. 管理员本人进入小程序管理页，点击“订阅新订单通知”

### `ADMIN_NOTIFY_TEMPLATE_DATA` 格式

这个配置是一个 JSON，对应微信订阅消息接口里的 `data` 字段。值里支持以下占位符：

- `{{order_no}}`
- `{{meal_date}}`
- `{{meal_slot}}`
- `{{meal_label}}`
- `{{requester_label}}`
- `{{remark}}`
- `{{item_summary}}`
- `{{created_at}}`
- `{{total_quantity}}`

示例：

```json
{
  "thing1": { "value": "白狗饭堂有新订单" },
  "character_string2": { "value": "{{order_no}}" },
  "thing3": { "value": "{{requester_label}}" },
  "thing4": { "value": "{{meal_date}} {{meal_label}}" },
  "thing5": { "value": "{{item_summary}}" }
}
```

注意：这里的 `thing1`、`character_string2` 这类 key，必须和你在微信公众平台选用的订阅消息模板关键词完全一致。

## 已验证

已在本地执行：

- `go test ./...`
- `go build ./...`
- `node --check baigoufantang-frontend/miniprogram/app.js`
- `node --check baigoufantang-frontend/miniprogram/pages/index/index.js`

## 微信官方文档

- `wx.login`：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html
- `code2Session`：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
- `wx.requestSubscribeMessage`：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html
- 发送订阅消息：https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html
