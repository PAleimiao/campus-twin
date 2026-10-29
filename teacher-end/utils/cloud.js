// utils/cloud.js —— 统一调用后端接口的封装（本地 / 云开发 双模式）
// 页面层用法永远不变：cloud.call('login', { account, password, role })
// 走哪条路只由 config.js 里的 backend 决定：
//   backend='local' → wx.request        打 campus-twin/local-server
//   backend='cloud' → wx.cloud.callFunction  打 cloud/functions 里的同名云函数
// 两条分支的入参、出参、错误码完全一致，换模式不用改任何业务代码。
const config = require('../config.js');

function isCloudMode() {
  return config.backend === 'cloud';
}

// 后端返回的可能是对象也可能是字符串（比如网关错误页），统一兜一层
function parseResult(data) {
  if (!data) return {};
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return { code: 'BAD_RESPONSE', msg: '后端返回内容不是 JSON' };
    }
  }
  return data;
}

// 本地模式：HTTP 打本地服务
function requestLocal(funcName, payload) {
  return new Promise((resolve) => {
    wx.request({
      url: String(config.apiBase || '').replace(/\/+$/, '') + '/' + funcName,
      method: 'POST',
      data: payload,
      header: { 'content-type': 'application/json' },
      timeout: 10000,
      success: (res) => resolve(parseResult(res.data)),
      fail: (err) => {
        // 连不上就当「网络错误」返回，不让页面 Promise 抛异常崩掉
        console.warn('[cloud.call] 请求失败：' + funcName, err);
        resolve({
          code: 'NETWORK_ERR',
          msg: isCloudMode() ? '调用云函数失败' : '连不上本地服务，请确认 local-server 已启动'
        });
      }
    });
  });
}

// 云开发模式：调云函数
function requestCloud(funcName, payload) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: funcName,
      data: payload
    }).then((res) => {
      resolve((res && res.result) ? res.result : {});
    }).catch((err) => {
      console.warn('[cloud.call] 云函数调用失败：' + funcName, err);
      resolve({ code: 'NETWORK_ERR', msg: '调用云函数失败，请检查云函数是否已部署' });
    });
  });
}

function call(funcName, data) {
  const token = wx.getStorageSync('token') || '';
  // 合并 token 到请求参数（后端 auth 要用）
  const payload = Object.assign({ token: token }, data || {});

  const task = isCloudMode()
    ? requestCloud(funcName, payload)
    : requestLocal(funcName, payload);

  return task.then((result) => {
    // 统一处理登录态失效：清掉本地 token，跳登录页
    if (result.code === 'AUTH_FAIL' || result.code === 'TOKEN_EXPIRED' || result.code === 'NO_TOKEN') {
      wx.removeStorageSync('token');
      wx.reLaunch({ url: '/pages/login/login' });
    }
    return result;
  });
}

module.exports = {
  call: call,
  isCloudMode: isCloudMode
};
