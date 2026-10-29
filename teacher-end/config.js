// config.js —— 全局配置
// ★★★ 想给首页顶部换图片，改这里就行，不用碰业务代码 ★★★
module.exports = {
  appName: '广演校园',

  // ★ 后端模式开关：改这一个值就能在本地后端 / 微信云开发之间切换
  //   'local' —— 跑电脑上的本地服务（campus-twin/local-server，双击 启动本地服务.bat）
  //   'cloud' —— 微信云开发（cloud/functions 里的 6 个云函数，需先开通环境并上传部署）
  backend: 'local',

  // 本地模式的后端地址（backend='local' 时生效）
  //   模拟器 / 开发者工具：'http://localhost:3000/api'
  //   真机调试：把 localhost 换成电脑的局域网 IP（本地服务启动时会打印），
  //            例：'http://192.168.1.20:3000/api'
  apiBase: 'http://localhost:8080/api',

  // 云开发模式的环境 ID（backend='cloud' 时生效，在云开发控制台查看）
  //   注意：学生端和教师端必须填【同一个】环境 ID，才能共用数据库与云函数
  cloudEnv: 'your-env-id',

  // ★ 首页/工作台顶部横幅图片：把图片地址粘到下面引号里
  //   1) 网络图片：'https://xxx.com/banner.jpg'（工具里勾「不校验合法域名」）
  //   2) 云存储：上传后把 cloud:// 开头的 fileID 粘这里（仅 backend='cloud' 时有效）
  //   3) 本地上传：教师端「校园资讯」页上传后得到的 http:// 地址也能直接用
  //   4) 留空 '' → 显示主题色渐变占位
  bannerImage: '',

  bannerTitle: '数创铸魂 · 码承文脉',
  bannerSubtitle: '智慧校园 · 教师后台'
};
