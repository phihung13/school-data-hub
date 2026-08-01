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
// ─────────────────────────────────────────────────────────────────────────────
// SONG SINH VỚI packages/core/db/fixtures/000_test_support.sql
//
// File kia định nghĩa ba hàm; file này gieo ĐÚNG cùng bộ dữ liệu đó, cùng UUID,
// cùng mã lớp, cùng mã học sinh:
//     test_support.seed_basic()          ↔  phần "BỘ NỀN" bên dưới
//     test_support.seed_khoi()           ↔  phần "CẢ KHỐI"
//     test_support.seed_khoi_activity()  ↔  phần "HOẠT ĐỘNG"
//
// Trước hôm nay hai bên LỆCH: fixture có Thầy Nam (giáo viên bộ môn) và em Cường ở
// cơ sở Q2, seed dev thì không. Hậu quả không phải là bất tiện mà là một lỗ kiểm
// chứng: bài TypeScript nào muốn hỏi "giáo viên bộ môn có bị chặn không" đều chạy
// trên một CSDL không có giáo viên bộ môn nào, nên câu trả lời luôn là "0 dòng" —
// xanh vì mẫu số rỗng, không phải vì hàng rào làm việc. Sửa một bên mà quên bên kia
// là mở lại đúng lỗ đó.
//
// KHÔNG gộp bằng cách cho file này nạp fixture rồi gọi hàm: fixture còn định nghĩa
// test_support.login_as() — một hàm đóng vai người khác, cấp cho public. Nạp nó vào
// bất kỳ CSDL nào ngoài máy dev là tự tay dựng cửa hậu.
// ─────────────────────────────────────────────────────────────────────────────
//
// Chạy: DATABASE_URL=postgres://... node packages/core/db/seed/seed.mjs

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem README.md mục Chạy local.");
  process.exit(1);
}

// Ghim múi giờ Việt Nam cho MỌI kết nối của pool — cùng một lựa chọn với
// packages/core/db/client.ts:66 và tools/jobs/run-flag-engine.mjs.
//
// Vì sao "set time zone" chứ không phải quy ước: Postgres mặc định chạy UTC, mà job
// nền của trường chạy lúc 01:00 giờ VN = 18:00 UTC HÔM TRƯỚC. Không ghim thì mọi
// current_date trong phiên này lùi đúng một ngày trong khung 00:00–06:59 giờ VN —
// âm thầm, không lỗi, và chỉ lộ ra khi có người ngồi đối chiếu hai cái sổ.
// Bắt gặp thật 01/08/2026 lúc 00:38 giờ VN: seed gieo dữ liệu vào ngày 31/07 trong
// khi app (đã ghim múi giờ) hỏi ngày 01/08 — màn Điều hành của BGH hiện gần như
// trống, và không một dòng lỗi nào nói vì sao.
// Dùng sự kiện "connect" thay vì một câu query sau khi mở: pool có thể mở thêm
// kết nối bất cứ lúc nào, và kết nối mở sau sẽ không chạy câu lệnh viết tay đó.
const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.on("connect", (c) => {
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

// Cùng UUID với packages/core/db/fixtures/000_test_support.sql và
// packages/core/auth-adapter/dev-provider.ts (DEV_ACCOUNTS) — để "login as"
// trong dev khớp đúng người có dữ liệu.
const SCHOOL_NETWORK = "10000000-0000-0000-0000-000000000001";
const SCHOOL_Q7 = "20000000-0000-0000-0000-000000000001";
const SCHOOL_Q2 = "20000000-0000-0000-0000-000000000002";

/** Khối 6 cơ sở Q7. Chỉ số mảng (1..5) là chữ số cuối của UUID lớp — xem `classId`. */
const KHOI = ["6A1", "6A2", "6A3", "6A4", "6A5"];
const classId = (c) => `30000000-0000-0000-0000-00000000000${c}`;

const CLASS_6A1 = classId(1);
const CLASS_6A2 = classId(2);

const USER_GVCN = "40000000-0000-0000-0000-000000000001"; // Cô Lan — GVCN 6A1
const USER_GVBOMON = "40000000-0000-0000-0000-000000000002"; // Thầy Nam — bộ môn Toán
const USER_TAMLY = "40000000-0000-0000-0000-000000000003";
const USER_PH = "40000000-0000-0000-0000-000000000004";
const USER_MINH = "40000000-0000-0000-0000-000000000005";
const USER_GVCN2 = "40000000-0000-0000-0000-000000000006"; // Cô Hạnh — GVCN 6A2
const USER_ADMIN = "40000000-0000-0000-0000-000000000007";
const USER_GVCN3 = "40000000-0000-0000-0000-000000000008"; // Cô Vân — GVCN 6A3 VÀ 6A4
const USER_GVCN4 = "40000000-0000-0000-0000-000000000009"; // Thầy Kiên — GVCN 6A5
const USER_GVBOMON2 = "40000000-0000-0000-0000-00000000000a"; // Cô Diệp — bộ môn Ngữ văn

const TEACHER_GVCN = "50000000-0000-0000-0000-000000000001";
const TEACHER_GVBOMON = "50000000-0000-0000-0000-000000000002";
const TEACHER_GVCN2 = "50000000-0000-0000-0000-000000000003";
const TEACHER_GVCN3 = "50000000-0000-0000-0000-000000000004";
const TEACHER_GVCN4 = "50000000-0000-0000-0000-000000000005";
const TEACHER_GVBOMON2 = "50000000-0000-0000-0000-000000000006";

const PARENT_1 = "60000000-0000-0000-0000-000000000001";
const STUDENT_MINH = "70000000-0000-0000-0000-000000000001"; // 6A1
const STUDENT_BINH = "70000000-0000-0000-0000-000000000002"; // 6A2
const STUDENT_CUONG = "70000000-0000-0000-0000-000000000003"; // cơ sở Q2, chưa vào lớp nào

/** Họ theo lớp + tên theo số thứ tự — cho ra 60 cái tên phân biệt được bằng mắt. */
const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng"];
// Sĩ số 8 → 12 (01/08/2026), song sinh với v_ten trong 000_test_support.sql.
// Lý do không phải "nhiều dữ liệu hơn cho vui": `report.min_cohort()` (`0040`) là 10,
// nên ở sĩ số 8 thì MỌI lớp của bộ demo đều dưới ngưỡng ẩn danh và màn Điều hành của
// BGH hiện "—" ở tất cả các ô. Bộ demo mà mọi ô đều bị che thì không demo được gì, và
// tệ hơn: "che vì nhóm quá nhỏ" trông y hệt "màn hình hỏng" với người mở lần đầu.
const TEN = [
  "Minh An",
  "Gia Bảo",
  "Ngọc Chi",
  "Tiến Dũng",
  "Hương Giang",
  "Thu Hà",
  "Đăng Khôi",
  "Khánh Linh",
  "Hải My",
  "Bảo Nam",
  "Anh Phương",
  "Diễm Quỳnh",
];
/** Sĩ số mỗi lớp của bộ "cả khối". Phải > report.min_cohort() (= 10). */
const PER_CLASS = TEN.length;

/**
 * Học sinh thứ `n` (1..PER_CLASS) của lớp thứ `c` (1..5).
 * UUID suy ra được từ (lớp, số thứ tự) nên bài test viết thẳng được id của
 * "em thứ 3 lớp 6A4" mà không phải tra bảng.
 */
const studentId = (c, n) =>
  `70000000-0000-0000-0000-000000001${c}${String(n).padStart(2, "0")}`;
const studentCode = (c, n) => `VA-2026-1${c}${String(n).padStart(3, "0")}`;
/** 6A1/6A2 bắt đầu từ số 2: Minh và Bình đã giữ chỗ số 1. */
const firstSeat = (c) => (c <= 2 ? 2 : 1);

async function run() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // ══ BỘ NỀN — song sinh với test_support.seed_basic() ══════════════════════
    await client.query(
      `insert into core.school_networks (id, code, name) values ($1,'VA','Hệ thống Trường Việt Anh')
       on conflict (id) do nothing`,
      [SCHOOL_NETWORK],
    );
    // Q2 tồn tại để phạm vi theo CƠ SỞ có biên thật: em Cường ở đây, hiệu trưởng Q7
    // không được thấy. Một cơ sở duy nhất thì mọi khẳng định "ngoài phạm vi" đều rỗng.
    await client.query(
      `insert into core.schools (id, network_id, code, name) values
         ($1,$2,'VA-Q7','Cơ sở Quận 7'),
         ($3,$2,'VA-Q2','Cơ sở Quận 2')
       on conflict (id) do nothing`,
      [SCHOOL_Q7, SCHOOL_NETWORK, SCHOOL_Q2],
    );

    // Cả khối 6: năm lớp, cùng cơ sở Q7, cùng năm học.
    await client.query(
      `insert into core.classes (id, school_id, code, academic_year, grade)
       select x.id, $1, x.code, '2026-2027', 6
         from unnest($2::uuid[], $3::text[]) as x(id, code)
       on conflict (id) do nothing`,
      [SCHOOL_Q7, KHOI.map((_, i) => classId(i + 1)), KHOI],
    );

    await client.query(
      // CHỖ DUY NHẤT dùng `do update` thay vì `do nothing`, và chỉ cho `full_name`.
      // Lý do: tên là thứ HIỂN THỊ, và với `do nothing` thì tên gieo lần đầu sống mãi
      // trên CSDL dev — đổi tên trong file này xong chạy lại seed vẫn thấy tên cũ, rồi
      // người đọc CSDL và người đọc mã nguồn nói về hai người khác nhau. `email` và
      // `auth_uid` CỐ Ý không nằm trong danh sách cập nhật: chúng là khoá định danh,
      // lệch thì phải nổ ra để có người nhìn, không được im lặng ghi đè.
      `insert into core.users (id, auth_uid, email, full_name, status) values
         ($1,'90000000-0000-0000-0000-000000000001','gvcn@va.edu.vn','Cô Lan (GVCN 6A1)','active'),
         ($2,'90000000-0000-0000-0000-000000000002','gvbomon@va.edu.vn','Thầy Nam (bộ môn Toán)','active'),
         ($3,'90000000-0000-0000-0000-000000000003','tamly@va.edu.vn','Cô Mai (tâm lý cụm)','active'),
         ($4,'90000000-0000-0000-0000-000000000004','ph@va.edu.vn','Phụ huynh của Minh','active'),
         ($5,'90000000-0000-0000-0000-000000000005','minh@va.edu.vn','Học sinh Minh','active'),
         ($6,'90000000-0000-0000-0000-000000000006','gvcn2@va.edu.vn','Cô Hạnh (GVCN 6A2)','active'),
         ($7,'90000000-0000-0000-0000-000000000007','admin.hung@va.edu.vn','Hùng (Quản trị)','active'),
         ($8,'90000000-0000-0000-0000-000000000008','gvcn3@va.edu.vn','Cô Vân (GVCN 6A3 và 6A4)','active'),
         ($9,'90000000-0000-0000-0000-000000000009','gvcn4@va.edu.vn','Thầy Kiên (GVCN 6A5)','active'),
         ($10,'90000000-0000-0000-0000-00000000000a','gvbomon2@va.edu.vn','Cô Diệp (bộ môn Ngữ văn)','active')
       on conflict (id) do update set full_name = excluded.full_name`,
      [
        USER_GVCN,
        USER_GVBOMON,
        USER_TAMLY,
        USER_PH,
        USER_MINH,
        USER_GVCN2,
        USER_ADMIN,
        USER_GVCN3,
        USER_GVCN4,
        USER_GVBOMON2,
      ],
    );

    await client.query(
      `insert into core.teachers (id, user_id, employee_code, school_id)
       select x.id, x.user_id, x.code, $1
         from unnest($2::uuid[], $3::uuid[], $4::text[]) as x(id, user_id, code)
       on conflict (id) do nothing`,
      [
        SCHOOL_Q7,
        [TEACHER_GVCN, TEACHER_GVBOMON, TEACHER_GVCN2, TEACHER_GVCN3, TEACHER_GVCN4, TEACHER_GVBOMON2],
        [USER_GVCN, USER_GVBOMON, USER_GVCN2, USER_GVCN3, USER_GVCN4, USER_GVBOMON2],
        ["GV001", "GV002", "GV003", "GV004", "GV005", "GV006"],
      ],
    );

    await client.query(
      `insert into core.parents (id, user_id) values ($1,$2) on conflict (id) do nothing`,
      [PARENT_1, USER_PH],
    );

    await client.query(
      `insert into core.students (id, student_code, user_id, school_id, full_name) values
         ($1,'VA-2026-00417',$2,$3,'Nguyễn Văn Minh'),
         ($4,'VA-2026-00418',null,$3,'Trần Thị Bình'),
         ($5,'VA-2026-00419',null,$6,'Lê Văn Cường')
       on conflict (id) do nothing`,
      [STUDENT_MINH, USER_MINH, SCHOOL_Q7, STUDENT_BINH, STUDENT_CUONG, SCHOOL_Q2],
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

    // ══ CẢ KHỐI — song sinh với test_support.seed_khoi() ══════════════════════
    //
    // Phân công CHỦ NHIỆM. Đây là NGUỒN SỰ THẬT của quan hệ GVCN ↔ lớp (0030):
    // core.is_homeroom_of() và mọi view core.v_my_* đọc từ bảng này.
    //
    // Cô Vân nhận HAI lớp — đó là điểm cả bộ này sinh ra để có. Trước hôm nay hub_dev
    // có đúng 2 dòng class_assignments, cả hai đều homeroom và mỗi cô một lớp; trong
    // thế giới đó `homeroomClassIds[0]` luôn "đúng" vì mảng chỉ có một phần tử, và
    // câu SELECT thiếu ORDER BY cũng luôn "đúng" vì chỉ có một dòng để trả.
    //
    // Cô Lan CỐ Ý vẫn đúng một lớp: tests/db/gvcn-screens.test.ts và
    // 0030_homeroom_source_test.sql đọc lớp chủ nhiệm của cô bằng truy vấn một dòng.
    await client.query(
      `insert into core.class_assignments (teacher_id, class_id, assignment_role, subject)
       select x.teacher_id, x.class_id, 'homeroom', null
         from unnest($1::uuid[], $2::uuid[]) as x(teacher_id, class_id)
       on conflict do nothing`,
      [
        [TEACHER_GVCN, TEACHER_GVCN2, TEACHER_GVCN3, TEACHER_GVCN3, TEACHER_GVCN4],
        [classId(1), classId(2), classId(3), classId(4), classId(5)],
      ],
    );

    // Phân công BỘ MÔN. Mỗi thầy cô dạy vài lớp nhưng KHÔNG dạy hết khối — chỗ trống
    // là cố ý. Nó là mẫu số của mọi khẳng định "giáo viên bộ môn không thấy em ở lớp
    // mình không dạy": thầy không dạy lớp nào thì câu đó xanh vì rỗng, không phải vì
    // policy chặn (đúng chỗ đã hỏng trên hub_dev trước 31/07/2026).
    //   · Thầy Nam (Toán):    6A1, 6A2, 6A3   → KHÔNG dạy 6A4, 6A5
    //   · Cô Diệp (Ngữ văn): 6A3, 6A4, 6A5   → KHÔNG dạy 6A1, 6A2
    await client.query(
      `insert into core.class_assignments (teacher_id, class_id, assignment_role, subject)
       select x.teacher_id, x.class_id, 'subject', x.subject
         from unnest($1::uuid[], $2::uuid[], $3::text[]) as x(teacher_id, class_id, subject)
       on conflict do nothing`,
      [
        [
          TEACHER_GVBOMON,
          TEACHER_GVBOMON,
          TEACHER_GVBOMON,
          TEACHER_GVBOMON2,
          TEACHER_GVBOMON2,
          TEACHER_GVBOMON2,
        ],
        [classId(1), classId(2), classId(3), classId(3), classId(4), classId(5)],
        ["Toán", "Toán", "Toán", "Ngữ văn", "Ngữ văn", "Ngữ văn"],
      ],
    );

    await client.query(
      // Tài khoản quản trị mang HAI vai, có lý do: "admin" là chức danh (điều §? chưa gắn
      // policy RLS nào — xem 0009_rls_and_views.sql, can_see_student() không hỏi tới nó), còn
      // "principal" mới là vai THẬT SỰ mở được dữ liệu, phạm vi đúng một cơ sở (Q7). Chỉ gắn
      // "admin" thì đăng nhập được nhưng nhìn đâu cũng trống — không phải lỗi, mà là RLS làm
      // đúng việc của nó (31/07/2026).
      //
      // Sáu dòng `homeroom` PHẢI đi sau core.class_assignments ở trên: trigger
      // core.guard_homeroom_scope (0023) từ chối bản sao chưa có bản gốc. Đủ cả sáu thì
      // ops.v_homeroom_drift vẫn rỗng — sổ soi lệch không báo động giả.
      `insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values
         ($1,'homeroom',$2,$3),
         ($4,'counselor',$2,null),
         ($5,'guardian',null,null),
         ($6,'student',null,null),
         ($7,'homeroom',$2,$8),
         ($9,'admin',$2,null),
         ($9,'principal',$2,null),
         ($10,'homeroom',$2,$11),
         ($10,'homeroom',$2,$12),
         ($13,'homeroom',$2,$14),
         ($15,'teacher',$2,$3),
         ($15,'teacher',$2,$8),
         ($15,'teacher',$2,$11),
         ($16,'teacher',$2,$11),
         ($16,'teacher',$2,$12),
         ($16,'teacher',$2,$14)
       on conflict do nothing`,
      [
        USER_GVCN,
        SCHOOL_Q7,
        classId(1),
        USER_TAMLY,
        USER_PH,
        USER_MINH,
        USER_GVCN2,
        classId(2),
        USER_ADMIN,
        USER_GVCN3,
        classId(3),
        classId(4),
        USER_GVCN4,
        classId(5),
        USER_GVBOMON,
        USER_GVBOMON2,
      ],
    );

    // 12 học sinh mỗi lớp — xem chú thích PER_CLASS.
    for (let c = 1; c <= 5; c += 1) {
      for (let n = firstSeat(c); n <= PER_CLASS; n += 1) {
        await client.query(
          `insert into core.students (id, student_code, school_id, full_name)
           values ($1,$2,$3,$4) on conflict (id) do nothing`,
          [studentId(c, n), studentCode(c, n), SCHOOL_Q7, `${HO[c - 1]} ${TEN[n - 1]}`],
        );
        await client.query(
          `insert into core.enrollments (student_id, class_id, valid_from)
           values ($1,$2,'2026-09-05') on conflict do nothing`,
          [studentId(c, n), classId(c)],
        );
      }
    }

    // ══ HOẠT ĐỘNG — song sinh với test_support.seed_khoi_activity() ═══════════
    //
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

    // 5 ngày gần nhất cho cả khối. Em số 7 của 6A3/6A4/6A5 mang chuỗi cảm xúc xấu
    // liên tiếp — đủ để bộ quét dựng cờ. CỐ Ý không đặt em nào như vậy ở 6A1/6A2:
    // hai lớp đó là sân của loạt bài test hiện có, thêm cờ vào đó là đổi kết quả của
    // bài không liên quan.
    for (let c = 1; c <= 5; c += 1) {
      for (let n = firstSeat(c); n <= PER_CLASS; n += 1) {
        for (let d = 0; d <= 4; d += 1) {
          const mood = c >= 3 && n === 7 ? 1 + (d % 2) : n % 3 === 0 ? 3 : 4;
          await client.query(
            `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
             values ($1, current_date - $2::int, 'in', $3, 'present', 'app')
             on conflict (student_id, occurred_on, kind) do nothing`,
            [studentId(c, n), d, mood],
          );
        }
        if (c >= 3 && n === 4) {
          await client.query(
            `insert into attendance.help_requests (student_id, requested_on)
             values ($1, current_date) on conflict do nothing`,
            [studentId(c, n)],
          );
        }
        if (c >= 3 && n === 2) {
          // "gửi muộn ≠ vắng" — buồng lái mỗi lớp mới phải có gì để chờ xác nhận.
          await client.query(
            `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
             values ($1, current_date, 'out', null, 'queued_late', 'offline_queue')
             on conflict (student_id, occurred_on, kind) do nothing`,
            [studentId(c, n)],
          );
        }
      }
    }

    // Mã mời phụ huynh mẫu cho Bình — thử luồng "Zalo + mã mời" trong dev.
    await client.query(
      `insert into core.parent_invite_codes (code, student_id, expires_at, created_by)
       values ('DEV001', $1, now() + interval '30 days', $2)
       on conflict (code) do nothing`,
      [STUDENT_BINH, USER_GVCN],
    );

    const summary = await verify(client);
    await client.query("commit");
    report(summary);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Đếm lại chính thứ vừa gieo, TRONG cùng transaction, và ném nếu lệch.
 *
 * Không phải nghi thức: một `on conflict do nothing` đặt sai chỗ, một trigger 0023 từ
 * chối im lặng, hay một dòng phân công thiếu — tất cả đều để lại CSDL trông "seed
 * xong" mà thiếu đúng phần làm cho bài test có nghĩa. Đây là bài học đắt nhất của
 * đợt trước: hub_dev có 2 dòng class_assignments, không ai để ý, và mọi khẳng định
 * về giáo viên bộ môn xanh vì mẫu số rỗng suốt nhiều tuần.
 */
async function verify(client) {
  // Mọi phép đếm đều BÓ trong đúng 5 lớp file này gieo, không phải "mọi lớp khối 6".
  // Lý do rất thực tế: tests/db dựng thêm lớp tạm (6A0-TEST…) và một lần chạy bị ngắt
  // giữa chừng để lại lớp đó. Đếm toàn cục thì seed sẽ báo hỏng vì rác của bài test —
  // một lời báo động sai, và báo động sai thì lần sau không ai đọc nữa.
  const ids = KHOI.map((_, i) => classId(i + 1));
  const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];

  const { n: classes } = await one(
    "select count(*)::int as n from core.classes where id = any($1::uuid[])",
    [ids],
  );
  const roster = (
    await client.query(
      `select c.code, count(*)::int as n
         from core.enrollments e
         join core.classes c on c.id = e.class_id
        where e.valid_to is null and c.id = any($1::uuid[])
        group by c.code order by c.code`,
      [ids],
    )
  ).rows;
  const homerooms = (
    await client.query(
      `select u.full_name, count(*)::int as n
         from core.class_assignments ca
         join core.teachers t on t.id = ca.teacher_id
         join core.users u on u.id = t.user_id
        where ca.assignment_role = 'homeroom' and ca.class_id = any($1::uuid[])
        group by u.full_name order by u.full_name`,
      [ids],
    )
  ).rows;
  const subjects = (
    await client.query(
      `select u.full_name, ca.subject, count(*)::int as n
         from core.class_assignments ca
         join core.teachers t on t.id = ca.teacher_id
         join core.users u on u.id = t.user_id
        where ca.assignment_role = 'subject' and ca.class_id = any($1::uuid[])
        group by u.full_name, ca.subject order by u.full_name`,
      [ids],
    )
  ).rows;
  const { n: drift } = await one(
    "select count(*)::int as n from ops.v_homeroom_drift where class_id = any($1::uuid[])",
    [ids],
  );

  const problems = [];
  if (classes !== 5) problems.push(`khối 6 phải có 5 lớp, đang có ${classes}`);
  // Ngưỡng kép có chủ ý: đúng PER_CLASS em, VÀ phải trên ngưỡng ẩn danh của 0040.
  // Vế thứ hai không thừa — nó là thứ bắt được ngày ai đó hạ sĩ số demo xuống dưới 10
  // rồi tưởng màn Điều hành hỏng, trong khi hệ đang che đúng luật.
  if (roster.length !== 5 || roster.some((r) => r.n !== PER_CLASS) || PER_CLASS <= 10) {
    problems.push(
      `mỗi lớp phải có ${PER_CLASS} em (và ${PER_CLASS} phải > 10 = report.min_cohort): ${
        roster.map((r) => `${r.code}=${r.n}`).join(", ") || "(không lớp nào)"
      }`,
    );
  }
  if (homerooms.length !== 4) {
    problems.push(`phải có 4 GVCN khác nhau, đang có ${homerooms.length}`);
  }
  if (!homerooms.some((h) => h.n === 2)) {
    problems.push("phải có một GVCN chủ nhiệm HAI lớp — không có ai");
  }
  if (subjects.length !== 2 || subjects.some((s) => s.n < 2)) {
    problems.push(
      `phải có 2 giáo viên bộ môn, mỗi người dạy ≥2 lớp: ${
        subjects.map((s) => `${s.full_name}=${s.n}`).join(", ") || "(không có ai)"
      }`,
    );
  }
  // Sổ soi lệch (0030) phải rỗng: bản sao core.user_role_scopes khớp bản gốc.
  if (drift !== 0) problems.push(`ops.v_homeroom_drift có ${drift} dòng lệch, phải là 0`);

  if (problems.length > 0) {
    throw new Error(`SEED KHÔNG ĐẠT — ${problems.join(" · ")}`);
  }
  return { roster, homerooms, subjects };
}

function report({ roster, homerooms, subjects }) {
  console.log("OK — seed xong. Khối 6 cơ sở Quận 7:");
  console.log(`  ${roster.map((r) => `${r.code}: ${r.n} em`).join(" · ")}`);
  console.log(
    `  Chủ nhiệm: ${homerooms.map((h) => `${h.full_name.replace(/\s*\(.*\)$/, "")} (${h.n} lớp)`).join(" · ")}`,
  );
  console.log(
    `  Bộ môn: ${subjects.map((s) => `${s.full_name.replace(/\s*\(.*\)$/, "")} — ${s.subject}, ${s.n} lớp`).join(" · ")}`,
  );
  console.log("Tài khoản dev có sẵn:");
  console.log("  gvcn@va.edu.vn · gvcn2@va.edu.vn · gvcn3@va.edu.vn · gvcn4@va.edu.vn (chủ nhiệm)");
  console.log("  gvbomon@va.edu.vn · gvbomon2@va.edu.vn (bộ môn)");
  console.log("  tamly@va.edu.vn · admin.hung@va.edu.vn · minh@va.edu.vn");
  console.log("  Mã mời phụ huynh cho Bình (chưa có tài khoản): DEV001");
}

run().catch((err) => {
  console.error("SEED THẤT BẠI:", err);
  process.exit(1);
});
