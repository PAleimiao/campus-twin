// getNews —— 读取「校园资讯」（学生端首页用，公开可读）
// 数据来自云数据库 news 集合，由教师端 manageNews 远程维护。
// 出参：{ code:'OK', banners:[{image}], list:[{title,date,image}] }
const lib = require('./lib');

exports.main = async () => {
  try {
    const database = lib.db();
    // 按 order 升序（数字小的排前面）
    const res = await database.collection('news').orderBy('order', 'asc').get();
    const docs = res.data || [];

    const banners = docs
      .filter(d => d.type === 'banner' && d.image)
      .map(d => ({ image: d.image }));

    const list = docs
      .filter(d => d.type === 'article')
      .map(d => ({ title: d.title, date: d.date, image: d.image || '' }));

    return { code: 'OK', banners: banners, list: list };
  } catch (e) {
    // 集合还没建 / 云端异常 → 返回空，学生端自动用本地预设兜底
    return { code: 'OK', banners: [], list: [] };
  }
};
