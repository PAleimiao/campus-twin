// app.js —— 教师端小程序入口
// 跑哪套后端由 config.js 的 backend 决定：
//   'local' → 连 campus-twin/local-server（默认，不用开通云环境）
//   'cloud' → 连微信云开发，此时才需要 wx.cloud.init
const config = require('./config.js');

App({
  onLaunch() {
    if (config.backend === 'cloud') {
      wx.cloud.init({
        env: config.cloudEnv,
        traceUser: true
      });
    }
    // 启动时把当前模式打出来，连不上时先看这行对不对
    console.log('[app] 教师端 backend =', config.backend,
      config.backend === 'cloud' ? config.cloudEnv : config.apiBase);
  },
  globalData: {
    userInfo: null
  }
});
