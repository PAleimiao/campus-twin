// utils/csv.js —— 课表 CSV 解析（WakeUp 课程表同款格式）
// 列：课程名称,星期,开始节数,结束节数,老师,地点,周数
// 例：高等数学,1,1,2,张三,逸夫楼101,1-16
// 兼容点：表头可有可无；表头中文/英文别名都认；"无" 视作空；星期支持 1-7 / 周一 / Mon。
function splitLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function normWeekday(v) {
  v = String(v || '').trim();
  if (/^\d+$/.test(v)) { const n = parseInt(v, 10); return (n >= 1 && n <= 7) ? n : 0; }
  const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
  for (const k in map) { if (v.indexOf(k) >= 0) return map[k]; }
  const en = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  return en[v.toLowerCase().slice(0, 3)] || 0;
}

function parseCSV(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];

  const head = splitLine(lines[0]);
  // 判断首行是不是表头：数据行的第 2 列是「星期」(数字或周X)、第 3 列是「开始节次」(数字)。
  // 只要这两列能对上，就认为首行是数据（无表头）；否则当表头。
  // 不能只看有没有「老师」等字样——数据里也会有「张老师」。
  const hasHeader = !(normWeekday(head[1]) > 0 && /^\d+$/.test(String(head[2] || '').trim()));

  const idx = { name: 0, weekday: 1, start: 2, end: 3, teacher: 4, location: 5, weeks: 6 };
  let start = 0;
  if (hasHeader) {
    start = 1;
    head.forEach((h, i) => {
      const t = h.toLowerCase();
      if (/课程|名称|course/.test(t)) idx.name = i;
      else if (/星期|周几|weekday/.test(t)) idx.weekday = i;
      else if (/开始|起始|start/.test(t)) idx.start = i;
      else if (/结束|终止|end/.test(t)) idx.end = i;
      else if (/老师|教师|teacher/.test(t)) idx.teacher = i;
      else if (/地点|教室|location|room/.test(t)) idx.location = i;
      else if (/周数|周次|week/.test(t)) idx.weeks = i;
    });
  }

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    if (!c.length) continue;
    const courseName = (c[idx.name] || '').trim();
    const weekday = normWeekday(c[idx.weekday]);
    const startPeriod = parseInt(c[idx.start], 10);
    const endPeriod = parseInt(c[idx.end], 10);
    if (!courseName || !weekday || !(startPeriod >= 1) || !(endPeriod >= startPeriod)) continue;
    const teacherName = (c[idx.teacher] || '').trim();
    const location = (c[idx.location] || '').trim();
    rows.push({
      courseName: courseName,
      weekday: weekday,
      startPeriod: startPeriod,
      endPeriod: endPeriod,
      teacherName: teacherName === '无' ? '' : teacherName,
      location: location === '无' ? '' : location,
      weeks: (c[idx.weeks] || '').trim()
    });
  }
  return rows;
}

const TEMPLATE = [
  '课程名称,星期,开始节数,结束节数,老师,地点,周数',
  '高等数学,1,1,2,张三,逸夫楼101,1-16',
  '程序设计基础,1,3,4,王老师,机房B203,1-16',
  '大学英语,2,1,2,张老师,A205,1-16',
  '网页设计,3,3,4,赵老师,机房B203,1-16'
].join('\n');

module.exports = { parseCSV: parseCSV, normWeekday: normWeekday, TEMPLATE: TEMPLATE };
