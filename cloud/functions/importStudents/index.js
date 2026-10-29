// importStudents —— 教师批量导入学生云函数
// 教师把「学号 + 姓名 + 班级」表格交给本函数，自动注册学生账号：
//   账号 = 学号，初始密码统一 123456（哈希存储），全部 mustChangePwd=true（首次登录强制改密）
// 入参：{ token, rows:[ {studentNo, name, classId, gradeId?, collegeId?} ] }
// 出参：{ code:'OK', inserted, updated, skipped, errors }
const lib = require('./lib');
const db = lib.db;
const makeSalt = lib.makeSalt;
const hashPassword = lib.hashPassword;
const auth = lib.auth;

// 学生初始默认密码（仅临时可用，首次登录强制改）
const DEFAULT_PWD = '123456';
// 单次最多导入条数，防止一次传太多把云函数拖垮
const MAX_ROWS = 200;

exports.main = async (event) => {
  try {
    const token = event.token;
    const rows = event.rows;

    let ctx;
    try {
      ctx = await auth(token); // 受保护：必须已登录且已改密
    } catch (e) {
      return e;
    }
    if (ctx.role !== 'teacher') {
      return { code: 'FORBIDDEN', msg: '仅教师/管理员可导入学生' };
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return { code: 'PARAM_ERR', msg: '请传入 rows 数组' };
    }
    if (rows.length > MAX_ROWS) {
      return { code: 'TOO_MANY', msg: '单次最多导入 ' + MAX_ROWS + ' 条' };
    }

    const database = db();
    const coll = database.collection('students');

    const result = { inserted: 0, updated: 0, skipped: 0, errors: [] };

    for (const r of rows) {
      const studentNo = String(r.studentNo || '').trim();
      const name = String(r.name || '').trim();
      const classId = String(r.classId || '').trim();

      // 字段校验：学号至少 6 位数字、姓名非空、班级必填
      if (!/^\d{6,}$/.test(studentNo)) {
        result.skipped++; result.errors.push({ studentNo: studentNo, reason: '学号格式错误（至少6位数字）' }); continue;
      }
      if (!name) {
        result.skipped++; result.errors.push({ studentNo: studentNo, reason: '姓名缺失' }); continue;
      }
      if (!classId) {
        result.skipped++; result.errors.push({ studentNo: studentNo, reason: '班级缺失' }); continue;
      }

      // 学号查重：已存在则更新（覆盖姓名/班级），不存在则新增
      const exists = await coll.where({ studentNo: studentNo }).get();
      const salt = makeSalt();
      const hash = hashPassword(DEFAULT_PWD, salt);
      const data = {
        studentNo: studentNo,
        name: name,
        classId: classId,
        passwordHash: hash,
        salt: salt,
        mustChangePwd: true,
        status: 'active',
        createdAt: new Date()
      };
      // 可选：如果表格里带了届/学院，一并写入（方便后续按学院/届筛选）
      if (r.gradeId) data.gradeId = String(r.gradeId).trim();
      if (r.collegeId) data.collegeId = String(r.collegeId).trim();

      if (exists.data.length) {
        await coll.doc(exists.data[0]._id).update({ data: data });
        result.updated++;
      } else {
        await coll.add({ data: data });
        result.inserted++;
      }
    }

    return Object.assign({ code: 'OK' }, result);
  } catch (e) {
    return { code: 'SERVER_ERR', msg: (e && e.message) ? e.message : '服务器错误' };
  }
};
