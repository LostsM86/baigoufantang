# 白狗饭堂小程序前端

前端入口在 [`miniprogram/app.js`](./miniprogram/app.js) 和 [`miniprogram/pages/index/index.js`](./miniprogram/pages/index/index.js)。

## 你需要改的配置

云托管调试：

- `env`
- `serviceName`

本地调试：

- `serviceBaseUrl = "http://127.0.0.1:8080"`
- 微信开发者工具关闭合法域名校验

## 当前能力

- 启动时调用 `wx.login`，走后端微信登录接口
- 登录后可查看自己的订单并下单
- 管理员可进入管理页处理工单
- 管理员可点击“订阅新订单通知”开通微信消息提醒

完整环境变量和订阅消息配置说明见根目录 [`README.md`](../README.md)。
