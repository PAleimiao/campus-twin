// seedOrg —— 组织树初始化（一次性种子脚本）
// 用途：比赛演示前先跑一次，把 届 → 学院 → 专业 → 班级 建好，
//       并生成一个管理员教师 T001（密码 123456，强制改密）和几个样例学生，
//       这样你们不用手动录数据就能直接登录演示。
// 入参：{ key }  —— key 等于下面的 SEED_KEY 才放行，防止被外人乱调
// 出参：{ code:'OK', ... } 或 { code:'ALREADY_SEEDED' } 等
const lib = require('./lib');
const db = lib.db;
const makeSalt = lib.makeSalt;
const hashPassword = lib.hashPassword;

// ★ 改成你们自己的种子口令，别用默认值上 production
const SEED_KEY = 'CAMPUS_SEED_2026';
// 学生/教师初始默认密码
const DEFAULT_PWD = '123456';

exports.main = async (event) => {
  try {
    if (event.key !== SEED_KEY) {
      return { code: 'NO_KEY', msg: '缺少或错误的种子口令' };
    }

    const database = db();

    // 幂等：如果学院表已经有数据，说明初始化过了，直接跳过
    const collegeCount = await database.collection('colleges').count();
    if (collegeCount.total > 0) {
      return { code: 'ALREADY_SEEDED', msg: '组织树已初始化，跳过' };
    }

    // 1) 届：26 届
    const grade = await database.collection('grades').add({
      data: { year: 26, name: '26届', createdAt: new Date() }
    });
    const gradeId = grade._id;

    // 2) 学院：信息工程学院
    const college = await database.collection('colleges').add({
      data: { gradeId: gradeId, name: '信息工程学院' }
    });
    const collegeId = college._id;

    // 3) 专业：计算机应用
    const major = await database.collection('majors').add({
      data: { collegeId: collegeId, name: '计算机应用' }
    });
    const majorId = major._id;

    // 4) 班级：3 班
    const cls = await database.collection('classes').add({
      data: { gradeId: gradeId, collegeId: collegeId, majorId: majorId, name: '3班', studentCount: 0 }
    });
    const classId = cls._id;

    // 5) 管理员教师 T001（role=admin，可后续做初始化类操作）
    const tSalt = makeSalt();
    const tHash = hashPassword(DEFAULT_PWD, tSalt);
    await database.collection('teachers').add({
      data: {
        teacherNo: 'T001',
        name: '演示老师',
        collegeId: collegeId,
        classIds: [classId],
        role: 'admin',
        salt: tSalt,
        passwordHash: tHash,
        mustChangePwd: true,
        createdAt: new Date()
      }
    });

    // 6) 几个样例学生（学号 + 123456，强制改密）
    const samples = [
      { studentNo: '20260001', name: '张三' },
      { studentNo: '20260002', name: '李四' },
      { studentNo: '20260003', name: '王五' }
    ];
    for (const s of samples) {
      const sSalt = makeSalt();
      const sHash = hashPassword(DEFAULT_PWD, sSalt);
      await database.collection('students').add({
        data: {
          studentNo: s.studentNo,
          name: s.name,
          classId: classId,
          gradeId: gradeId,
          collegeId: collegeId,
          passwordHash: sHash,
          salt: sSalt,
          mustChangePwd: true,
          status: 'active',
          createdAt: new Date()
        }
      });
    }

    return {
      code: 'OK',
      msg: '种子数据已写入',
      demoTeacher: { teacherNo: 'T001', password: DEFAULT_PWD },
      demoStudents: samples.map(s => ({ studentNo: s.studentNo, password: DEFAULT_PWD })),
      ids: { gradeId: gradeId, collegeId: collegeId, majorId: majorId, classId: classId }
    };
  } catch (e) {
    return { code: 'SERVER_ERR', msg: (e && e.message) ? e.message : '服务器错误' };
  }
};
