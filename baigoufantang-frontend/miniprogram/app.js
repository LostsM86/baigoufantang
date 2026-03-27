const SESSION_TOKEN_STORAGE_KEY = "bgft_session_token";
const SESSION_EXPIRES_AT_STORAGE_KEY = "bgft_session_expires_at";

function getTimestamp(value) {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject,
    });
  });
}

function tryParseJSON(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function normalizeResponsePayload(response) {
  const candidates = [
    response && response.data,
    response && response.result,
    response,
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const parsed = tryParseJSON(candidates[i]);
    if (!parsed) {
      continue;
    }

    if (typeof parsed === "object") {
      if (typeof parsed.code === "number") {
        return parsed;
      }

      if (typeof parsed.body !== "undefined") {
        const parsedBody = tryParseJSON(parsed.body);
        if (parsedBody && typeof parsedBody === "object") {
          return parsedBody;
        }
      }
    }

    if (typeof parsed === "string" && parsed.trim()) {
      return parsed;
    }
  }

  return null;
}

function getFileExtension(filePath) {
  const match = /(\.[a-zA-Z0-9]+)(?:\?|$)/.exec(filePath || "");
  return match ? match[1] : "";
}

App({
  onLaunch() {
    this.globalData = {
      // 云托管模式：填写云开发环境 ID 和 serviceName。
      env: "prod-7gpba6iz637cf029",
      serviceName: "golang-npne",

      // 本地或独立域名调试：例如 http://127.0.0.1:8080
      serviceBaseUrl: "",

      // 如果未配置 ADMIN_OPENIDS，也可继续用后端 ADMIN_TOKEN 兜底。
      adminToken: "",
      sessionToken: wx.getStorageSync(SESSION_TOKEN_STORAGE_KEY) || "",
      sessionExpiresAt: wx.getStorageSync(SESSION_EXPIRES_AT_STORAGE_KEY) || "",
    };
    this.fileUrlCache = {};

    if (wx.cloud && this.globalData.env) {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
  },

  hasIdentity() {
    if (!this.globalData.sessionToken) {
      return false;
    }

    const expiresAt = getTimestamp(this.globalData.sessionExpiresAt);
    if (!expiresAt) {
      return true;
    }

    return expiresAt - Date.now() > 60 * 1000;
  },

  clearIdentity() {
    this.globalData.sessionToken = "";
    this.globalData.sessionExpiresAt = "";
    this.identityPromise = null;
    wx.removeStorageSync(SESSION_TOKEN_STORAGE_KEY);
    wx.removeStorageSync(SESSION_EXPIRES_AT_STORAGE_KEY);
  },

  async ensureIdentity(options) {
    const params = options || {};
    if (params.force) {
      this.clearIdentity();
      this.identityPromise = null;
    }

    if (this.hasIdentity()) {
      return {
        sessionToken: this.globalData.sessionToken,
        expiresAt: this.globalData.sessionExpiresAt,
      };
    }

    if (!this.identityPromise) {
      this.identityPromise = this.loginWithWeChat()
        .then((response) => {
          this.identityPromise = null;
          return response;
        })
        .catch((error) => {
          this.identityPromise = null;
          this.clearIdentity();
          throw error;
        });
    }

    return this.identityPromise;
  },

  async loginWithWeChat() {
    const loginResult = await wxLogin();
    if (!loginResult.code) {
      throw new Error("微信登录失败，未获取到 code");
    }

    const response = await this.request({
      path: "/api/wechat/login",
      method: "POST",
      data: {
        code: loginResult.code,
      },
      requireIdentity: false,
      skipSessionRetry: true,
    });

    if (!response.sessionToken) {
      throw new Error(
        "登录接口返回格式异常，请确认前端已拿到最新返回值，且云托管部署的是最新后端"
      );
    }

    this.globalData.sessionToken = response.sessionToken;
    this.globalData.sessionExpiresAt = response.expiresAt || "";
    wx.setStorageSync(SESSION_TOKEN_STORAGE_KEY, this.globalData.sessionToken);
    wx.setStorageSync(
      SESSION_EXPIRES_AT_STORAGE_KEY,
      this.globalData.sessionExpiresAt
    );

    return {
      sessionToken: this.globalData.sessionToken,
      expiresAt: this.globalData.sessionExpiresAt,
      viewer: response.viewer || null,
    };
  },

  async getContainerClient() {
    if (!this.globalData.env) {
      throw new Error("请在 miniprogram/app.js 中配置云开发环境 env");
    }
    if (!this.globalData.serviceName) {
      throw new Error("请在 miniprogram/app.js 中配置云托管 serviceName");
    }
    if (!wx.cloud) {
      throw new Error("当前基础库不支持云能力，请升级微信开发者工具");
    }

    if (!this.containerClientPromise) {
      const client = new wx.cloud.Cloud({
        resourceEnv: this.globalData.env,
      });
      this.containerClientPromise = client.init().then(() => client);
    }
    return this.containerClientPromise;
  },

  canUseCloudFile() {
    return !!(this.globalData.env && wx.cloud);
  },

  async uploadFileToCloud(options) {
    const params = options || {};
    const filePath = params.filePath || "";
    const folder = params.folder || "uploads";

    if (!filePath) {
      throw new Error("缺少上传文件路径");
    }
    if (!this.canUseCloudFile()) {
      throw new Error("当前环境未启用云开发，无法上传图片");
    }

    const ext = getFileExtension(filePath);
    const cloudPath = `${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}${ext}`;
    const response = await wx.cloud.uploadFile({
      cloudPath,
      filePath,
    });

    if (!response.fileID) {
      throw new Error("图片上传失败");
    }

    return response.fileID;
  },

  async resolveFileUrls(fileIDs) {
    const uniqueIDs = Array.from(
      new Set((fileIDs || []).filter((item) => typeof item === "string" && item))
    );
    const result = {};

    uniqueIDs.forEach((fileID) => {
      if (!fileID.startsWith("cloud://")) {
        result[fileID] = fileID;
        return;
      }
      if (this.fileUrlCache[fileID]) {
        result[fileID] = this.fileUrlCache[fileID];
      }
    });

    const pending = uniqueIDs.filter(
      (fileID) => fileID.startsWith("cloud://") && !result[fileID]
    );

    if (!pending.length) {
      return result;
    }
    if (!this.canUseCloudFile()) {
      return result;
    }

    const response = await wx.cloud.getTempFileURL({
      fileList: pending,
    });

    (response.fileList || []).forEach((item) => {
      const resolved = item.tempFileURL || item.fileID;
      this.fileUrlCache[item.fileID] = resolved;
      result[item.fileID] = resolved;
    });

    return result;
  },

  shouldRetryLogin(message) {
    return (
      typeof message === "string" &&
      (message.indexOf("未获取到微信身份") > -1 ||
        message.indexOf("用户会话") > -1)
    );
  },

  async request(options) {
    const params = options || {};
    const path = params.path || "/";
    const method = params.method || "GET";
    const data = params.data;
    const header = Object.assign({}, params.header || {});

    if (params.requireIdentity !== false) {
      const identity = await this.ensureIdentity();
      header["X-User-Session"] = identity.sessionToken;
    } else if (this.hasIdentity()) {
      header["X-User-Session"] = this.globalData.sessionToken;
    }

    if (params.admin && this.globalData.adminToken) {
      header["X-Admin-Token"] = this.globalData.adminToken;
    }

    let response;

    if (this.globalData.env && this.globalData.serviceName) {
      const client = await this.getContainerClient();
      response = await client.callContainer({
        path,
        method,
        data,
        header: Object.assign(
          {
            "X-WX-SERVICE": this.globalData.serviceName,
          },
          header
        ),
      });
    } else if (this.globalData.serviceBaseUrl) {
      response = await new Promise((resolve, reject) => {
        wx.request({
          url: `${this.globalData.serviceBaseUrl}${path}`,
          method,
          data,
          header: Object.assign(
            {
              "content-type": "application/json",
            },
            header
          ),
          success: resolve,
          fail: reject,
        });
      });
    } else {
      throw new Error(
        "请在 miniprogram/app.js 中配置 env + serviceName，或填写 serviceBaseUrl"
      );
    }

    const payload = normalizeResponsePayload(response);
    if (!payload) {
      throw new Error("服务返回为空");
    }

    if (typeof payload === "string") {
      if (payload.indexOf("<html") > -1 || payload.indexOf("<!DOCTYPE html") > -1) {
        throw new Error("服务返回了页面内容，请确认云托管路径和服务部署是否正确");
      }
      throw new Error(`服务返回无法识别: ${payload.slice(0, 120)}`);
    }

    if (typeof payload.code === "number" && payload.code !== 0) {
      const message = payload.errorMsg || "请求失败";
      if (
        params.requireIdentity !== false &&
        !params.skipSessionRetry &&
        this.shouldRetryLogin(message)
      ) {
        this.clearIdentity();
        await this.ensureIdentity({ force: true });
        return this.request(
          Object.assign({}, params, {
            skipSessionRetry: true,
          })
        );
      }
      throw new Error(message);
    }

    return typeof payload.data === "undefined" ? payload : payload.data;
  },
});
