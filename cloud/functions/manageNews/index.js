// manageNews —— 校园资讯管理（教师端远程维护，需教师/管理员登录）
// 集合 news 一条记录 = 一个资讯元素：
//   { type:'banner'|'article', title, date, image, order, createdAt }
// 入参：{ token, action, ... }
//   action='listAll'     → 返回全部记录（教师端管理页展示）
//   action='addBanner'   { image }              → 新增一张轮播图
//   action='addArticle'  { title, date, image? }→ 新增一条资讯
//   action='delete'      { id }                 → 删除一条
const lib = require('./lib');
const db = lib.db;
const auth = lib.auth;

// 从“教师/管理员”身份校验中拿上下文；失败直接返回错误对象
async function requireTeacher(token) {
  const ctx = await auth(token);
  if (ctx.role !== 'teacher') return { err: { code: 'FORBIDDEN', msg: '仅教师/管理员可管理资讯' } };
  return { ctx: ctx };
}

exports.main = async (event) => {
  try {
    const action = event.action;
    const database = db();
    const coll = database.collection('news');

    let ctx;
    try {
      const r = await requireTeacher(event.token);
      if (r.err) return r.err;
      ctx = r.ctx;
    } catch (e) {
      return e; // auth 抛出的 { code, msg }
    }

    if (action === 'listAll') {
      const res = await coll.orderBy('order', 'asc').get();
      return { code: 'OK', items: res.data || [] };
    }

    if (action === 'addBanner') {
      const image = String(event.image || '').trim();
      if (!image) return { code: 'PARAM_ERR', msg: '请先上传图片' };
      const cnt = await coll.count();
      await coll.add({
        data: { type: 'banner', image: image, title: '', date: '', order: cnt.total, createdAt: new Date() }
      });
      return { code: 'OK' };
    }

    if (action === 'addArticle') {
      const title = String(event.title || '').trim();
      if (!title) return { code: 'PARAM_ERR', msg: '请填写资讯标题' };
      const cnt = await coll.count();
      await coll.add({
        data: {
          type: 'article',
          title: title,
          date: String(event.date || '').trim(),
          image: String(event.image || '').trim(),
          order: cnt.total,
          createdAt: new Date()
        }
      });
      return { code: 'OK' };
    }

    if (action === 'delete') {
      const id = String(event.id || '').trim();
      if (!id) return { code: 'PARAM_ERR', msg: '缺少要删除的 id' };
      await coll.doc(id).remove();
      return { code: 'OK' };
    }

    return { code: 'PARAM_ERR', msg: '未知的 action：' + action };
  } catch (e) {
    return { code: 'SERVER_ERR', msg: (e && e.message) ? e.message : '服务器错误' };
  }
};
