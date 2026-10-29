// pages/ai/ai.js —— AI 校园答疑（本地知识库，无 Key 也能用）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

// 气泡右下角的小标记：这一条到底是云端 AI、本机模型，还是本地知识库给的
function tagOf(res) {
  if (res.source === 'llm') return res.provider === 'ollama' ? '本机模型' : 'AI 生成';
  if (res.source === 'kb') return '本地知识库';
  return '';
}

Page({
  data: {
    theme: {},
    messages: [],
    input: '',
    scrollTo: '',
    pending: false,       // 正在等后端回答
    waited: 0             // 已等待秒数（大模型思考要几秒，显示出来免得以为卡死）
  },

  onLoad() {
    this.setData({
      theme: theme.getTheme(),
      messages: [{ role: 'ai', text: '你好，我是校园助手～ 可以问我：请假流程、奖助学金、图书馆、作息时间、宿舍门禁、成绩查询等。' }]
    });
  },

  onInput(e) { this.setData({ input: e.detail.value }); },

  // 点「查看思考过程」展开/收起（默认收起，不打扰正常看答案）
  onToggleThink(e) {
    const i = Number(e.currentTarget.dataset.index);
    const key = 'messages[' + i + '].thinkOpen';
    this.setData({ [key]: !this.data.messages[i].thinkOpen });
  },

  async send() {
    const q = this.data.input.trim();
    if (!q) return;

    // 先把用户的问题显示出来，并给出「正在思考」的占位气泡
    let messages = this.data.messages.concat([{ role: 'user', text: q }]);
    this.setData({ messages: messages, input: '', pending: true, waited: 0, scrollTo: 'msg-' + (messages.length - 1) });

    // 大模型（尤其开着思考过程）要等几秒，给个秒数让用户知道没卡死
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (this.data.pending) this.setData({ waited: Math.round((Date.now() - t0) / 1000) });
    }, 1000);

    // 调后端（配了大模型 Key 时会慢一点，所以上面那个占位气泡是必要的）
    const res = await cloud.call('aiChat', { question: q });
    clearInterval(timer);
    const answer = (res.code === 'OK' && res.answer)
      ? res.answer
      : (res.msg || '抱歉，暂时无法回答，请稍后再试。');

    // thinking = 模型自己说的「思考过程」（只有云端大模型会给，本地知识库/本机小模型没有）
    const thinking = (res.code === 'OK' && res.thinking) ? String(res.thinking) : '';
    messages = this.data.messages.concat([{
      role: 'ai', text: answer, tag: tagOf(res),
      thinking: thinking,
      thinkOpen: false,                       // 默认收起
      thinkLen: thinking ? thinking.length : 0
    }]);
    this.setData({ messages: messages, pending: false, scrollTo: 'msg-' + (messages.length - 1) });
  }
});
