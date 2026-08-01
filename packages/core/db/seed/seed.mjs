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
// File kia định nghĩa bốn hàm; file này gieo ĐÚNG cùng bộ dữ liệu đó, cùng UUID,
// cùng mã lớp, cùng mã học sinh:
//     test_support.seed_basic()          ↔  phần "BỘ NỀN" bên dưới
//     test_support.seed_khoi()           ↔  phần "CẢ KHỐI"
//     test_support.seed_khoi_7_8()       ↔  phần "KHỐI 7 VÀ KHỐI 8"
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

// ─────────────────────────────────────────────────────────────────────────────
// KHỐI 7 VÀ KHỐI 8 (01/08/2026) — vì sao phải có
//
// Cho tới hôm nay CSDL chỉ có khối 6: `select grade, count(*) from core.classes`
// trả đúng một dòng `6|5`. Trong thế giới đó, MỌI khẳng định dạng "cô chủ nhiệm
// khối 7 không thấy học sinh khối 6" đều xanh — nhưng xanh vì MẪU SỐ RỖNG, không
// vì hàng rào làm việc: không có khối nào khác để mà thấy. Đúng loại xanh giả mà
// chú thích của chính 000_test_support.sql đã cảnh báo khi nói về giáo viên bộ môn.
//
// Bốn lớp mới, cố ý trải trên HAI cơ sở:
//   · 7A1, 7A2, 8A1 ở Quận 7 — cùng cơ sở với cả khối 6;
//   · 8B1 ở Quận 2  — CÙNG KHỐI 8 với 8A1 nhưng KHÁC CƠ SỞ.
// Cặp 8A1 / 8B1 là chỗ duy nhất trả lời được câu "cụm của tâm lý tính theo cơ sở
// hay theo khối". Nếu cụm tính theo khối thì cô Mai (cụm Q7) sẽ thấy 8B1; nếu tính
// theo cơ sở thì không. Trước khi có cặp này, hai giả thuyết cho ra CÙNG một kết
// quả trên dữ liệu demo, nên không bài test nào phân biệt được chúng.
// ─────────────────────────────────────────────────────────────────────────────

const USER_GVCN5 = "40000000-0000-0000-0000-00000000000b"; // Cô Thu — GVCN 7A1
const USER_GVCN6 = "40000000-0000-0000-0000-00000000000c"; // Thầy Phúc — GVCN 7A2
const USER_GVCN7 = "40000000-0000-0000-0000-00000000000d"; // Cô Yến — GVCN 8A1
const USER_GVCN8 = "40000000-0000-0000-0000-00000000000e"; // Thầy Lộc — GVCN 8B1 (cơ sở Q2)
const USER_GVBOMON3 = "40000000-0000-0000-0000-00000000000f"; // Thầy Sơn — bộ môn Tiếng Anh

const TEACHER_GVCN5 = "50000000-0000-0000-0000-000000000007";
const TEACHER_GVCN6 = "50000000-0000-0000-0000-000000000008";
const TEACHER_GVCN7 = "50000000-0000-0000-0000-000000000009";
const TEACHER_GVCN8 = "50000000-0000-0000-0000-00000000000a";
const TEACHER_GVBOMON3 = "50000000-0000-0000-0000-00000000000b";

/**
 * Bốn lớp mới. `g` là khối, `j` là số thứ tự lớp TRONG khối — hai chữ số đó đi thẳng
 * vào UUID và mã học sinh nên nhìn một id là biết em nào lớp nào, không phải tra bảng.
 * `ho` là họ riêng của lớp, để 48 cái tên mới vẫn phân biệt được bằng mắt khi soi CSDL.
 */
const KHOI_78 = [
  { code: "7A1", g: 7, j: 1, school: SCHOOL_Q7, ho: "Vũ" },
  { code: "7A2", g: 7, j: 2, school: SCHOOL_Q7, ho: "Đặng" },
  { code: "8A1", g: 8, j: 1, school: SCHOOL_Q7, ho: "Bùi" },
  { code: "8B1", g: 8, j: 2, school: SCHOOL_Q2, ho: "Đỗ" },
];

const classId78 = (g, j) => `30000000-0000-0000-0000-000000000${g}0${j}`;
const studentId78 = (g, j, n) =>
  `70000000-0000-0000-0000-00000000${g}${j}${String(n).padStart(2, "0")}`;
// CHECK `^VA-\d{4}-\d{5}$` trên core.students.student_code — 5 chữ số, không hơn không kém.
// Khối 6 chiếm khuôn `1<lớp><3 số>`, khối 7/8 lấy khuôn `<khối><lớp><3 số>`: không đụng nhau.
const studentCode78 = (g, j, n) => `VA-2026-${g}${j}${String(n).padStart(3, "0")}`;

/**
 * Phân công BỘ MÔN chéo khối của Thầy Sơn: 6A5 (khối 6) và 7A1 (khối 7).
 *
 * Hai điều kiện phải giữ cùng lúc, và verify() bên dưới chặn nếu mất một trong hai:
 *   · dạy lớp ở NHIỀU khối  — nếu không thì "chéo khối" chỉ là chữ, phép giao rỗng;
 *   · KHÔNG dạy hết         — nếu thầy dạy tất cả thì câu "thầy không thấy em ở lớp
 *     mình không dạy" lại xanh vì mẫu số rỗng, đúng cái bẫy cũ ở mức khối.
 * Khối 8 CỐ Ý không có lớp nào của thầy: nhờ vậy Cô Yến (GVCN 8A1) là một GVCN mà
 * phép giao với thầy đúng bằng rỗng, còn Cô Thu (GVCN 7A1) thì khác rỗng — hai chiều
 * đều có mẫu số thật.
 */
const SON_DAY = [
  { classId: classId(5), ten: "6A5" },
  { classId: classId78(7, 1), ten: "7A1" },
];

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

    // ══ KHỐI 7 VÀ KHỐI 8 — song sinh với test_support.seed_khoi_7_8() ════════
    //
    // Xem chú thích ở đầu file (khối KHOI_78) để biết vì sao bộ này tồn tại.

    await client.query(
      `insert into core.classes (id, school_id, code, academic_year, grade)
       select x.id, x.school, x.code, '2026-2027', x.grade
         from unnest($1::uuid[], $2::uuid[], $3::text[], $4::int[]) as x(id, school, code, grade)
       on conflict (id) do nothing`,
      [
        KHOI_78.map((k) => classId78(k.g, k.j)),
        KHOI_78.map((k) => k.school),
        KHOI_78.map((k) => k.code),
        KHOI_78.map((k) => k.g),
      ],
    );

    await client.query(
      // `do update set full_name` giống bộ nền, và vì cùng lý do — xem chú thích ở đó.
      `insert into core.users (id, auth_uid, email, full_name, status) values
         ($1,'90000000-0000-0000-0000-00000000000b','gvcn5@va.edu.vn','Cô Thu (GVCN 7A1)','active'),
         ($2,'90000000-0000-0000-0000-00000000000c','gvcn6@va.edu.vn','Thầy Phúc (GVCN 7A2)','active'),
         ($3,'90000000-0000-0000-0000-00000000000d','gvcn7@va.edu.vn','Cô Yến (GVCN 8A1)','active'),
         ($4,'90000000-0000-0000-0000-00000000000e','gvcn8@va.edu.vn','Thầy Lộc (GVCN 8B1, cơ sở Quận 2)','active'),
         ($5,'90000000-0000-0000-0000-00000000000f','gvbomon3@va.edu.vn','Thầy Sơn (bộ môn Tiếng Anh)','active')
       on conflict (id) do update set full_name = excluded.full_name`,
      [USER_GVCN5, USER_GVCN6, USER_GVCN7, USER_GVCN8, USER_GVBOMON3],
    );

    // Thầy Lộc thuộc biên chế CƠ SỞ QUẬN 2 — không phải chi tiết trang trí: nếu để thầy
    // ở Q7 thì "giáo viên cơ sở khác" và "giáo viên cùng cơ sở" lại là một, và mọi khẳng
    // định về biên cơ sở đo trên thầy đều không nói lên điều gì.
    await client.query(
      `insert into core.teachers (id, user_id, employee_code, school_id)
       select x.id, x.user_id, x.code, x.school
         from unnest($1::uuid[], $2::uuid[], $3::text[], $4::uuid[]) as x(id, user_id, code, school)
       on conflict (id) do nothing`,
      [
        [TEACHER_GVCN5, TEACHER_GVCN6, TEACHER_GVCN7, TEACHER_GVCN8, TEACHER_GVBOMON3],
        [USER_GVCN5, USER_GVCN6, USER_GVCN7, USER_GVCN8, USER_GVBOMON3],
        ["GV007", "GV008", "GV009", "GV010", "GV011"],
        [SCHOOL_Q7, SCHOOL_Q7, SCHOOL_Q7, SCHOOL_Q2, SCHOOL_Q7],
      ],
    );

    await client.query(
      `insert into core.class_assignments (teacher_id, class_id, assignment_role, subject)
       select x.teacher_id, x.class_id, 'homeroom', null
         from unnest($1::uuid[], $2::uuid[]) as x(teacher_id, class_id)
       on conflict do nothing`,
      [
        [TEACHER_GVCN5, TEACHER_GVCN6, TEACHER_GVCN7, TEACHER_GVCN8],
        [classId78(7, 1), classId78(7, 2), classId78(8, 1), classId78(8, 2)],
      ],
    );

    await client.query(
      `insert into core.class_assignments (teacher_id, class_id, assignment_role, subject)
       select $1, x.class_id, 'subject', 'Tiếng Anh'
         from unnest($2::uuid[]) as x(class_id)
       on conflict do nothing`,
      [TEACHER_GVBOMON3, SON_DAY.map((s) => s.classId)],
    );

    // Bản sao vai trò (sổ B) — PHẢI đi SAU class_assignments: trigger
    // core.guard_homeroom_scope (0023) từ chối dòng homeroom chưa có phân công gốc.
    // Thầy Lộc mang school_id = Q2 vì lớp của thầy ở Q2; đặt nhầm Q7 vào đây là tự tay
    // dựng một cửa mà bản gốc không hề mở.
    await client.query(
      `insert into core.user_role_scopes (user_id, role_code, school_id, class_id)
       select x.user_id, x.role_code, x.school, x.class_id
         from unnest($1::uuid[], $2::text[], $3::uuid[], $4::uuid[])
              as x(user_id, role_code, school, class_id)
       on conflict do nothing`,
      [
        [USER_GVCN5, USER_GVCN6, USER_GVCN7, USER_GVCN8, USER_GVBOMON3, USER_GVBOMON3],
        ["homeroom", "homeroom", "homeroom", "homeroom", "teacher", "teacher"],
        [SCHOOL_Q7, SCHOOL_Q7, SCHOOL_Q7, SCHOOL_Q2, SCHOOL_Q7, SCHOOL_Q7],
        [
          classId78(7, 1),
          classId78(7, 2),
          classId78(8, 1),
          classId78(8, 2),
          SON_DAY[0].classId,
          SON_DAY[1].classId,
        ],
      ],
    );

    // 12 em mỗi lớp mới — cùng hằng PER_CLASS với khối 6, và vì cùng một lý do:
    // dưới report.min_cohort() (= 10) thì màn Điều hành che sạch mọi ô của khối mới,
    // và "che vì nhóm quá nhỏ" trông y hệt "màn hình hỏng".
    for (const k of KHOI_78) {
      for (let n = 1; n <= PER_CLASS; n += 1) {
        await client.query(
          `insert into core.students (id, student_code, school_id, full_name)
           values ($1,$2,$3,$4) on conflict (id) do nothing`,
          [studentId78(k.g, k.j, n), studentCode78(k.g, k.j, n), k.school, `${k.ho} ${TEN[n - 1]}`],
        );
        // `on conflict do nothing` KHÔNG có đích: core.enrollments không có ràng buộc
        // duy nhất thường mà có EXCLUDE chống chồng kỳ (enrollments_no_overlap). Viết
        // `on conflict (student_id, class_id)` ở đây sẽ NÉM LỖI — Postgres không cho một
        // ràng buộc EXCLUDE làm đích. Dạng không đích thì bao được cả EXCLUDE, nên chạy
        // seed lần thứ hai vẫn im lặng bỏ qua đúng như §9 đòi.
        await client.query(
          `insert into core.enrollments (student_id, class_id, valid_from)
           values ($1,$2,'2026-09-05') on conflict do nothing`,
          [studentId78(k.g, k.j, n), classId78(k.g, k.j)],
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

    // Khối 7 và khối 8: 5 ngày điểm danh ĐỦ, tâm trạng LÀNH, KHÔNG em nào mang chuỗi
    // cảm xúc xấu và không em nào bấm "cần gặp thầy cô".
    //
    // Đây là lựa chọn có chủ ý, không phải làm cho xong. Bộ quét cờ đọc care.thresholds:
    // A_ATTENDANCE chỉ dựng cờ cho em CÓ điểm danh mà tỉ lệ dưới min_rate, E_MOOD cần
    // chuỗi ngày mood xấu. Cho khối mới một em "xấu" nào cũng là thêm cờ vào hub_dev, mà
    // hàng loạt bài test đang chốt số cờ tuyệt đối trên bộ seed — đỏ ở đó sẽ là đỏ vì
    // dữ liệu demo đổi, không vì mã hỏng, và đó là loại đỏ dạy người ta bỏ qua màu đỏ.
    // Sân để dựng cờ vẫn là khối 6 (em số 7 của 6A3/6A4/6A5) và các lớp mà từng bài test
    // tự dựng riêng.
    for (const k of KHOI_78) {
      for (let n = 1; n <= PER_CLASS; n += 1) {
        for (let d = 0; d <= 4; d += 1) {
          const mood = n % 3 === 0 ? 3 : 4; // Bình thường / Vui — không có 1, 2
          await client.query(
            `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
             values ($1, current_date - $2::int, 'in', $3, 'present', 'app')
             on conflict (student_id, occurred_on, kind) do nothing`,
            [studentId78(k.g, k.j, n), d, mood],
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
  // Điều cần giữ là "có ÍT NHẤT hai giáo viên bộ môn dạy nhiều lớp trong khối 6", không
  // phải "đúng hai người có mặt". Từ 01/08/2026 Thầy Sơn (bộ môn chéo khối) cũng dạy 6A5
  // nên phép đếm cũ (`subjects.length !== 2`) báo hỏng — mà thứ nó bắt được lại là một
  // thay đổi hợp lệ. Sửa thành đếm số người ĐẠT chuẩn ≥2 lớp: cái này vẫn đỏ đúng lúc
  // ai đó bỏ phân công của Thầy Nam hay Cô Diệp, và không đỏ khi có thêm đồng nghiệp.
  const bomonDayNhieu = subjects.filter((s) => s.n >= 2);
  if (bomonDayNhieu.length < 2) {
    problems.push(
      `phải có ≥2 giáo viên bộ môn dạy ≥2 lớp khối 6: ${
        subjects.map((s) => `${s.full_name}=${s.n}`).join(", ") || "(không có ai)"
      }`,
    );
  }
  // Sổ soi lệch (0030) phải rỗng: bản sao core.user_role_scopes khớp bản gốc.
  if (drift !== 0) problems.push(`ops.v_homeroom_drift có ${drift} dòng lệch, phải là 0`);

  const khoi78 = await verifyKhoi78(client, problems);

  if (problems.length > 0) {
    throw new Error(`SEED KHÔNG ĐẠT — ${problems.join(" · ")}`);
  }
  return { roster, homerooms, subjects, khoi78 };
}

/**
 * Kiểm phần khối 7 / khối 8, và kiểm chính CÁI LÀM CHO NÓ CÓ NGHĨA.
 *
 * Đếm đủ lớp, đủ sĩ số mới chỉ là điều kiện cần. Điều kiện đủ nằm ở ba tính chất dưới
 * đây — mất bất kỳ tính chất nào thì tests/db/cheo-khoi.test.ts vẫn XANH nhưng xanh vì
 * mẫu số rỗng, đúng thứ cả gói này sinh ra để đóng lại:
 *   (1) phải có ≥ 3 khối phân biệt — một khối thì "không thấy khối khác" là câu hỏi
 *       không đặt ra được;
 *   (2) giáo viên bộ môn chéo khối phải dạy ≥ 2 khối và KHÔNG dạy hết;
 *   (3) phải có ≥ 1 GVCN chủ nhiệm lớp thuộc khối mà giáo viên bộ môn đó KHÔNG dạy,
 *       và phải có ≥ 1 lớp ở CƠ SỞ KHÁC — nếu không, "cụm theo cơ sở" và "cụm theo
 *       khối" cho ra cùng một đáp số và không phép đo nào phân biệt được chúng.
 */
async function verifyKhoi78(client, problems) {
  const ids = KHOI_78.map((k) => classId78(k.g, k.j));

  const roster = (
    await client.query(
      `select c.code, c.grade, count(*)::int as n
         from core.enrollments e
         join core.classes c on c.id = e.class_id
        where e.valid_to is null and c.id = any($1::uuid[])
        group by c.code, c.grade order by c.code`,
      [ids],
    )
  ).rows;
  if (roster.length !== KHOI_78.length || roster.some((r) => r.n !== PER_CLASS)) {
    problems.push(
      `khối 7/8 phải có ${KHOI_78.length} lớp, mỗi lớp ${PER_CLASS} em: ${
        roster.map((r) => `${r.code}=${r.n}`).join(", ") || "(không lớp nào)"
      }`,
    );
  }

  // (1) Đếm trên TOÀN BỘ lớp của bộ seed (khối 6 + khối 7/8), vì đây đúng là mẫu số mà
  // bài test chéo khối sẽ dùng.
  const allIds = [...KHOI.map((_, i) => classId(i + 1)), ...ids];
  const { n: grades } = (
    await client.query(
      "select count(distinct grade)::int as n from core.classes where id = any($1::uuid[])",
      [allIds],
    )
  ).rows[0];
  if (grades < 3) {
    problems.push(`phải có ≥3 khối phân biệt để hỏi được "không thấy khối khác", đang có ${grades}`);
  }

  // (2) Thầy Sơn: dạy mấy lớp, thuộc mấy khối, trên tổng bao nhiêu lớp.
  const { day, khoiDay, tong } = (
    await client.query(
      `select (select count(*)::int from core.class_assignments ca
                where ca.teacher_id = $1 and ca.assignment_role = 'subject') as day,
              (select count(distinct c.grade)::int
                 from core.class_assignments ca
                 join core.classes c on c.id = ca.class_id
                where ca.teacher_id = $1 and ca.assignment_role = 'subject') as "khoiDay",
              (select count(*)::int from core.classes where id = any($2::uuid[])) as tong`,
      [TEACHER_GVBOMON3, allIds],
    )
  ).rows[0];
  if (khoiDay < 2) {
    problems.push(`giáo viên bộ môn chéo khối phải dạy lớp ở ≥2 khối, đang có ${khoiDay}`);
  }
  if (day >= tong) {
    problems.push(
      `giáo viên bộ môn chéo khối KHÔNG được dạy hết (${day}/${tong} lớp) — dạy hết thì ` +
        `khẳng định "không thấy lớp mình không dạy" lại rỗng mẫu số`,
    );
  }

  // (3) GVCN ở khối nằm ngoài tầm dạy của thầy + lớp ở cơ sở khác.
  const { n: gvcnNgoaiKhoi } = (
    await client.query(
      `select count(*)::int as n
         from core.class_assignments ca
         join core.classes c on c.id = ca.class_id
        where ca.assignment_role = 'homeroom'
          and c.id = any($2::uuid[])
          and c.grade not in (
            select c2.grade from core.class_assignments ca2
              join core.classes c2 on c2.id = ca2.class_id
             where ca2.teacher_id = $1 and ca2.assignment_role = 'subject')`,
      [TEACHER_GVBOMON3, allIds],
    )
  ).rows[0];
  if (gvcnNgoaiKhoi < 1) {
    problems.push(
      "phải có ≥1 GVCN chủ nhiệm lớp thuộc khối mà giáo viên bộ môn chéo khối KHÔNG dạy",
    );
  }

  const { n: lopCoSoKhac } = (
    await client.query(
      "select count(*)::int as n from core.classes where id = any($1::uuid[]) and school_id <> $2",
      [allIds, SCHOOL_Q7],
    )
  ).rows[0];
  if (lopCoSoKhac < 1) {
    problems.push(
      'phải có ≥1 lớp ở cơ sở ngoài Quận 7 — không có thì "cụm theo cơ sở" và "cụm theo khối" cho cùng một đáp số',
    );
  }

  const { n: drift } = (
    await client.query(
      "select count(*)::int as n from ops.v_homeroom_drift where class_id = any($1::uuid[])",
      [ids],
    )
  ).rows[0];
  if (drift !== 0) {
    problems.push(`ops.v_homeroom_drift có ${drift} dòng lệch ở khối 7/8, phải là 0`);
  }

  return { roster, grades, day, khoiDay, tong };
}

function report({ roster, homerooms, subjects, khoi78 }) {
  console.log("OK — seed xong. Khối 6 cơ sở Quận 7:");
  console.log(`  ${roster.map((r) => `${r.code}: ${r.n} em`).join(" · ")}`);
  console.log(
    `  Chủ nhiệm: ${homerooms.map((h) => `${h.full_name.replace(/\s*\(.*\)$/, "")} (${h.n} lớp)`).join(" · ")}`,
  );
  console.log(
    `  Bộ môn: ${subjects.map((s) => `${s.full_name.replace(/\s*\(.*\)$/, "")} — ${s.subject}, ${s.n} lớp`).join(" · ")}`,
  );
  console.log(`Khối 7 và khối 8 (${khoi78.grades} khối phân biệt trong cả bộ):`);
  console.log(
    `  ${khoi78.roster.map((r) => `${r.code} (khối ${r.grade}): ${r.n} em`).join(" · ")}`,
  );
  console.log(
    `  Bộ môn chéo khối: Thầy Sơn — Tiếng Anh, ${khoi78.day}/${khoi78.tong} lớp thuộc ${khoi78.khoiDay} khối`,
  );
  // Hai danh sách, KHÔNG gộp làm một. Chỗ này từng in một dòng "Tài khoản dev có sẵn"
  // duy nhất, và nếu cứ thế thêm năm cái email mới vào đó thì màn hình sẽ hứa một điều
  // hệ thống không giữ: các tài khoản khối 7/8 CÓ trong CSDL nhưng CHƯA có trong
  // DEV_ACCOUNTS của packages/core/auth-adapter/dev-provider.ts, nên `/api/auth/dev-login`
  // từ chối chúng. Người đọc sẽ mất mười lăm phút tưởng mình gõ sai mật khẩu.
  console.log("Đăng nhập dev được ngay (có trong DEV_ACCOUNTS):");
  console.log("  gvcn@va.edu.vn · gvcn2@va.edu.vn · gvcn3@va.edu.vn · gvcn4@va.edu.vn (chủ nhiệm khối 6)");
  console.log("  gvbomon@va.edu.vn · gvbomon2@va.edu.vn (bộ môn khối 6)");
  console.log("  tamly@va.edu.vn · admin.hung@va.edu.vn · minh@va.edu.vn");
  console.log("CÓ trong CSDL nhưng CHƯA đăng nhập dev được — cần thêm vào DEV_ACCOUNTS:");
  console.log("  gvcn5@va.edu.vn (7A1) · gvcn6@va.edu.vn (7A2) · gvcn7@va.edu.vn (8A1)");
  console.log("  gvcn8@va.edu.vn (8B1, cơ sở Quận 2) · gvbomon3@va.edu.vn (bộ môn dạy chéo khối)");
  console.log("  Mã mời phụ huynh cho Bình (chưa có tài khoản): DEV001");
}

run().catch((err) => {
  console.error("SEED THẤT BẠI:", err);
  process.exit(1);
});
