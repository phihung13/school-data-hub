#!/usr/bin/env node
// packages/core/db/seed/seed.mjs
//
// Dữ liệu demo cho local dev (apps/hub) VÀ cho lớp test TypeScript trong CI.
//
// Đính chính (31/07/2026): bản trước ghi "KHÔNG dùng cho CI" — sai kể từ khi CI
// chạy `vitest run tests/db`. Phân vai đúng là:
//   · pgTAP (packages/core/db/tests/*.sql) dùng test_support.seed_basic(), chạy
//     trong transaction rồi rollback nên KHÔNG để lại dòng nào trong CSDL;
//   · test TypeScript (tests/db/*.test.ts) chạy qua pool thật, mỗi truy vấn một
//     transaction riêng, nên cần dữ liệu BỀN — đúng thứ file này gieo. Vì vậy CI
//     phải chạy `pnpm db:seed` sau migrations, trước vitest (xem .github/workflows/ci.yml).
// Idempotent: chạy lại nhiều lần không sinh dòng đôi (ON CONFLICT DO NOTHING).
//
// Chạy: DATABASE_URL=postgres://... node packages/core/db/seed/seed.mjs

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem README.md mục Chạy local.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Cùng UUID với packages/core/db/fixtures/000_test_support.sql và
// packages/core/auth-adapter/dev-provider.ts (DEV_ACCOUNTS) — để "login as"
// trong dev khớp đúng người có dữ liệu.
const SCHOOL_NETWORK = "10000000-0000-0000-0000-000000000001";
const SCHOOL_Q7 = "20000000-0000-0000-0000-000000000001";
const CLASS_6A1 = "30000000-0000-0000-0000-000000000001";
const CLASS_6A2 = "30000000-0000-0000-0000-000000000002";

const USER_GVCN = "40000000-0000-0000-0000-000000000001";
// …0002 (Thầy Nam, bộ môn 6A1) đã bỏ 31/07/2026 — xem dev-provider.ts. Giữ trống số đó,
// không tái sử dụng cho người khác: UUID cũ còn nằm trong dữ liệu demo đã gieo ở máy khác.
const USER_TAMLY = "40000000-0000-0000-0000-000000000003";
const USER_PH = "40000000-0000-0000-0000-000000000004";
const USER_MINH = "40000000-0000-0000-0000-000000000005";
const USER_GVCN2 = "40000000-0000-0000-0000-000000000006";
const USER_ADMIN = "40000000-0000-0000-0000-000000000007";

const TEACHER_GVCN = "50000000-0000-0000-0000-000000000001";
const TEACHER_GVCN2 = "50000000-0000-0000-0000-000000000003";

const PARENT_1 = "60000000-0000-0000-0000-000000000001";
const STUDENT_MINH = "70000000-0000-0000-0000-000000000001";
const STUDENT_BINH = "70000000-0000-0000-0000-000000000002";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into core.school_networks (id, code, name) values ($1,'VA','Hệ thống Trường Việt Anh')
       on conflict (id) do nothing`,
      [SCHOOL_NETWORK],
    );
    await client.query(
      `insert into core.schools (id, network_id, code, name) values
         ($1,$2,'VA-Q7','Cơ sở Quận 7')
       on conflict (id) do nothing`,
      [SCHOOL_Q7, SCHOOL_NETWORK],
    );
    await client.query(
      `insert into core.classes (id, school_id, code, academic_year, grade) values
         ($1,$2,'6A1','2026-2027',6),
         ($3,$2,'6A2','2026-2027',6)
       on conflict (id) do nothing`,
      [CLASS_6A1, SCHOOL_Q7, CLASS_6A2],
    );

    await client.query(
      `insert into core.users (id, auth_uid, email, full_name, status) values
         ($1,'90000000-0000-0000-0000-000000000001','gvcn@va.edu.vn','Cô Lan (GVCN 6A1)','active'),
         ($2,'90000000-0000-0000-0000-000000000003','tamly@va.edu.vn','Cô Mai (tâm lý cụm)','active'),
         ($3,'90000000-0000-0000-0000-000000000004','ph@va.edu.vn','Phụ huynh của Minh','active'),
         ($4,'90000000-0000-0000-0000-000000000005','minh@va.edu.vn','Học sinh Minh','active'),
         ($5,'90000000-0000-0000-0000-000000000006','gvcn2@va.edu.vn','Cô Hạnh (GVCN 6A2)','active'),
         ($6,'90000000-0000-0000-0000-000000000007','admin.hung@va.edu.vn','Hùng (Quản trị)','active')
       on conflict (id) do nothing`,
      [USER_GVCN, USER_TAMLY, USER_PH, USER_MINH, USER_GVCN2, USER_ADMIN],
    );

    await client.query(
      `insert into core.teachers (id, user_id, employee_code, school_id) values ($1,$2,'GV001',$3)
       on conflict (id) do nothing`,
      [TEACHER_GVCN, USER_GVCN, SCHOOL_Q7],
    );
    await client.query(
      `insert into core.teachers (id, user_id, employee_code, school_id) values ($1,$2,'GV003',$3)
       on conflict (id) do nothing`,
      [TEACHER_GVCN2, USER_GVCN2, SCHOOL_Q7],
    );

    await client.query(
      `insert into core.parents (id, user_id) values ($1,$2) on conflict (id) do nothing`,
      [PARENT_1, USER_PH],
    );

    await client.query(
      `insert into core.students (id, student_code, user_id, school_id, full_name) values
         ($1,'VA-2026-00417',$2,$3,'Nguyễn Văn Minh'),
         ($4,'VA-2026-00418',null,$3,'Trần Thị Bình')
       on conflict (id) do nothing`,
      [STUDENT_MINH, USER_MINH, SCHOOL_Q7, STUDENT_BINH],
    );

    await client.query(
      `insert into core.parent_students (parent_id, student_id) values ($1,$2)
       on conflict do nothing`,
      [PARENT_1, STUDENT_MINH],
    );

    await client.query(
      `insert into core.enrollments (student_id, class_id, valid_from) values
         ($1,$2,'2026-09-05'),($3,$4,'2026-09-05')
       on conflict do nothing`,
      [STUDENT_MINH, CLASS_6A1, STUDENT_BINH, CLASS_6A2],
    );

    await client.query(
      `insert into core.class_assignments (teacher_id, class_id, assignment_role, subject) values
         ($1,$2,'homeroom',null),
         ($3,$4,'homeroom',null)
       on conflict do nothing`,
      [TEACHER_GVCN, CLASS_6A1, TEACHER_GVCN2, CLASS_6A2],
    );

    await client.query(
      // Tài khoản quản trị mang HAI vai, có lý do: "admin" là chức danh (điều §? chưa gắn
      // policy RLS nào — xem 0009_rls_and_views.sql, can_see_student() không hỏi tới nó), còn
      // "principal" mới là vai THẬT SỰ mở được dữ liệu, phạm vi đúng một cơ sở (Q7). Chỉ gắn
      // "admin" thì đăng nhập được nhưng nhìn đâu cũng trống — không phải lỗi, mà là RLS làm
      // đúng việc của nó (31/07/2026).
      `insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values
         ($1,'homeroom',$2,$3),
         ($4,'counselor',$2,null),
         ($5,'guardian',null,null),
         ($6,'student',null,null),
         ($7,'homeroom',$2,$8),
         ($9,'admin',$2,null),
         ($9,'principal',$2,null)
       on conflict do nothing`,
      [USER_GVCN, SCHOOL_Q7, CLASS_6A1, USER_TAMLY, USER_PH, USER_MINH, USER_GVCN2, CLASS_6A2, USER_ADMIN],
    );

    // Ngưỡng care (0005 đã seed sẵn qua migration — không lặp lại ở đây).

    // Lịch sử check-in 5 ngày gần nhất cho Minh, để buồng lái + báo cáo có gì mà hiện.
    const today = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const mood = [4, 4, 3, 4, 2][4 - i]; // Vui, Vui, BT, Vui, Mệt
      await client.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1,$2,'in',$3,'present','app')
         on conflict (student_id, occurred_on, kind) do nothing`,
        [STUDENT_MINH, dateStr, mood],
      );
    }
    // Một bản gửi muộn hôm nay để buồng lái có gì "chờ xác nhận".
    await client.query(
      `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
       values ($1, current_date, 'out', null, 'queued_late', 'offline_queue')
       on conflict (student_id, occurred_on, kind) do nothing`,
      [STUDENT_BINH],
    );

    // Mã mời phụ huynh mẫu cho Bình — thử luồng "Zalo + mã mời" trong dev.
    await client.query(
      `insert into core.parent_invite_codes (code, student_id, expires_at, created_by)
       values ('DEV001', $1, now() + interval '30 days', $2)
       on conflict (code) do nothing`,
      [STUDENT_BINH, USER_GVCN],
    );

    await client.query("commit");
    console.log("OK — seed xong. Tài khoản dev có sẵn:");
    console.log("  gvcn@va.edu.vn / tamly@va.edu.vn / minh@va.edu.vn / gvcn2@va.edu.vn / admin.hung@va.edu.vn");
    console.log("  Mã mời phụ huynh cho Bình (chưa có tài khoản): DEV001");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("SEED THẤT BẠI:", err);
  process.exit(1);
});
