// tests/db/chuong-viec-cho.test.ts — phần máy chủ của CHUÔNG THÔNG BÁO và CỘT PHẢI
// trang chủ (`session.getPendingWork`).
//
// Chạy trên Postgres thật với RLS thật, qua đúng đường trình duyệt đi (tRPC caller →
// withUserContext → `set local role authenticated` + `core.begin_user_context`).
//
// Bốn nhóm câu hỏi:
//
//   1. MỖI VAI THẤY ĐÚNG PHẦN CỦA MÌNH — và chỉ phần của mình. Một cái chuông trộn việc
//      của hai vai là một cái chuông nói cho người này biết chuyện của người kia.
//   2. GVCN LỚP KHÁC KHÔNG LỌT VÀO SỐ ĐẾM. Cô Lan (6A1) và Cô Hạnh (6A2) đếm hai tập rời
//      nhau, kể cả khi cùng một loại việc xảy ra ở cả hai lớp trong cùng một buổi sáng.
//   3. HỌC SINH KHÔNG THẤY MỤC CỦA NGƯỜI LỚN. Đây là ca đã có tiền lệ thật trong kho này:
//      `care.acknowledgeLate` từng là `protectedProcedure` và một học sinh gọi thẳng
//      procedure của GVCN là tự duyệt được mình thành 'present' (0025). `getPendingWork`
//      cũng là `protectedProcedure` — nên phạm vi phải do CÂU HỎI quyết, không do cổng vai.
//   4. VAI `board` TRẢ MẢNG RỖNG. Rỗng ở đây là một CÂU TRẢ LỜI ("hội đồng không có việc
//      phải làm trong hệ"), không phải một lỗi. Bài này khoá nó lại để không ai "sửa cho
//      đầy đủ" bằng một con số tổng hợp nào đó.
//
// ═══════════════════════════════════════════════════════════════════════════
// THỬ NGƯỢC, ĐÃ CHẠY THẬT 06/08/2026 (hai lượt, và lượt đầu KHÔNG đỏ)
// ═══════════════════════════════════════════════════════════════════════════
//
// LƯỢT 1 — xoá hẳn dòng `where e.class_id = any($1::uuid[])` khỏi CTE `roster` trong
// `demViecGvcn` (`apps/hub/server/routers/session.ts`), chạy lại file này:
//
//     Tests  8 failed | 7 passed (15)
//
// Nhưng ĐỌC KỸ tám dòng đỏ đó thì chúng đỏ vì SAI LÝ DO: `$1` không còn được tham chiếu
// trong câu SQL nên Postgres ném `42P08 could not determine data type of parameter $1`, và
// cả thủ tục nổ. Một lượt thử ngược làm câu lệnh không chạy được thì không chứng minh
// được gì về phạm vi — nó chỉ chứng minh rằng ta vừa viết SQL sai cú pháp.
//
// LƯỢT 2 — vô hiệu hoá mệnh đề mà GIỮ tham số, tức đổi thành
// `where ($1::uuid[] is not null)` (câu vẫn chạy, chỉ không lọc theo lớp nữa):
//
//     × thử ngược · mệnh đề lọc theo lớp phải gánh việc thật
//       > người vừa CHỦ NHIỆM vừa kiêm TÂM LÝ CỤM chỉ đếm việc của lớp mình
//       → expected 5 to be 2      // "Lời cần gặp chưa xử"
//     Tests  1 failed | 14 passed (15)
//
// ĐÚNG MỘT bài đỏ, và là bài viết ra để đỏ. Năm lời "cần gặp thầy cô" thay vì hai: nhánh
// `in_my_cluster` mở toàn bộ học sinh cơ sở Quận 7. Cắm mệnh đề đó lại → 15/15 xanh.
//
// Mười bốn bài còn lại XANH ở cả hai lượt, và điều đó đáng ghi hơn cả kết quả: với một tài
// khoản CHỈ mang vai `homeroom`, RLS trên `core.enrollments` (`core.can_see_student` →
// nhánh `is_homeroom_of`) và mệnh đề `class_id` cho CÙNG một đáp số. Không có ca kiêm
// nhiệm thì bộ test không có mẫu số để phân biệt hai tầng — cùng bài học đã trả giá ở
// `tests/db/gv-bo-mon.test.ts`. Một bài test chưa từng đỏ là một bài test chưa ai biết nó
// đo cái gì.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, requireDb, DEV, FIXTURE } from "../helpers/db";
import { sessionRouter } from "@/server/routers/session";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

/** Em riêng của bài này, lớp 6A1 (Cô Lan chủ nhiệm) — có tài khoản để tự gọi thủ tục. */
const HS_LAN = "71000000-0000-0000-0000-0000000000d1";
const HS_LAN_USER = "41000000-0000-0000-0000-0000000000d1";
const HS_LAN_AUTH = "91000000-0000-0000-0000-0000000000d1";
/** Em riêng của bài này, lớp 6A2 (Cô Hạnh chủ nhiệm) — mẫu số của "lớp khác không lọt". */
const HS_HANH = "71000000-0000-0000-0000-0000000000d2";

/** Vai `board` chưa có trong seed. Dùng id RIÊNG, không mượn của `bgh-tong-hop.test.ts`. */
const BOARD_USER = "40000000-0000-0000-0000-0000000000c1";
const BOARD_AUTH = "90000000-0000-0000-0000-0000000000c1";

/** Mini App đang TẮT — seed chỉ có một app và nó đang bật, nên mục của quản trị cần mẫu số. */
const APP_TAT = "chuong-test-app-tat";

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const goi = (authUid: string) => sessionRouter.createCaller(ctxFor(authUid)).getPendingWork();

const keysOf = (items: { key: string }[]) => items.map((i) => i.key).sort();
const dem = (items: { key: string; count: number }[], key: string) =>
  items.find((i) => i.key === key)?.count ?? 0;

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;

  await asSystem(async (c) => {
    // Xoá cứng hai tài khoản rác của lượt chạy trước (0033 chặn mặc định — xem `afterAll`).
    await c.query("set local hub.allow_user_hard_delete = 'on'");

    // ── Hai em thử nghiệm, hai lớp khác nhau ────────────────────────────────
    for (const [hs, lop, ma] of [
      [HS_LAN, FIXTURE.classA, "VA-2026-99101"],
      [HS_HANH, FIXTURE.classB, "VA-2026-99102"],
    ] as const) {
      await c.query("delete from core.students where id = $1", [hs]);
      await c.query(
        `insert into core.students (id, student_code, school_id, full_name)
         values ($1, $2, $3, 'Em Thử Nghiệm (chuong-viec-cho.test)')`,
        [hs, ma, FIXTURE.schoolQ7],
      );
      await c.query(
        `insert into core.enrollments (student_id, class_id, valid_from)
         values ($1, $2, current_date - 30)`,
        [hs, lop],
      );
    }

    // Tài khoản học sinh cho HS_LAN. Vì sao không mượn em Minh của seed: bài "chưa
    // check-in hôm nay" phải điều khiển được cả hai chiều, mà xoá rồi dựng lại dòng
    // check-in của một em có thật trong seed là sửa dữ liệu bài khác đang dựa vào.
    await c.query("delete from core.user_role_scopes where user_id = $1", [HS_LAN_USER]);
    await c.query("delete from core.users where id = $1", [HS_LAN_USER]);
    await c.query(
      `insert into core.users (id, auth_uid, full_name, status)
       values ($1, $2, 'Em Thử Nghiệm (chuong-viec-cho.test)', 'active')`,
      [HS_LAN_USER, HS_LAN_AUTH],
    );
    await c.query(
      "insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values ($1,'student',null,null)",
      [HS_LAN_USER],
    );
    await c.query("update core.students set user_id = $2 where id = $1", [HS_LAN, HS_LAN_USER]);

    // ── Tài khoản ban điều hành ─────────────────────────────────────────────
    await c.query("delete from core.user_role_scopes where user_id = $1", [BOARD_USER]);
    await c.query("delete from core.users where id = $1", [BOARD_USER]);
    await c.query(
      `insert into core.users (id, auth_uid, full_name, status)
       values ($1, $2, 'Ban điều hành (chuong-viec-cho.test)', 'active')`,
      [BOARD_USER, BOARD_AUTH],
    );
    await c.query(
      "insert into core.user_role_scopes (user_id, role_code, school_id, class_id) values ($1,'board',null,null)",
      [BOARD_USER],
    );

    // ── Một Mini App đang tắt ───────────────────────────────────────────────
    await c.query("delete from core.embedded_apps where app_id = $1", [APP_TAT]);
    await c.query(
      `insert into core.embedded_apps (app_id, display_name, basket, enabled, owner, review_due_on)
       values ($1, 'App tắt (test)', 'xanh', false, 'chuong-viec-cho.test', current_date + 90)`,
      [APP_TAT],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    // checkins / help_requests / flags CASCADE theo học sinh.
    await c.query("delete from core.students where id = any($1::uuid[])", [[HS_LAN, HS_HANH]]);
    await c.query("delete from core.user_role_scopes where user_id = any($1::uuid[])", [
      [BOARD_USER, HS_LAN_USER],
    ]);
    // Cửa thoát hiểm khai TƯỜNG MINH của 0033: đường chính thức cho một con người thật là
    // `core.anonymize_user`, còn hai tài khoản rác do bài test dựng ra thì phải biến mất
    // hẳn — để lại chúng là để lại hai người dùng ma trong sổ phân quyền.
    await c.query("set local hub.allow_user_hard_delete = 'on'");
    await c.query("delete from core.users where id = any($1::uuid[])", [[BOARD_USER, HS_LAN_USER]]);
    await c.query("delete from core.embedded_apps where app_id = $1", [APP_TAT]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("mỗi vai thấy đúng phần của mình", () => {
  it("GVCN chỉ nhận mục của buồng lái, không nhận mục của vai nào khác", async ({ skip }) => {
    if (!ready) return skip();
    const { items } = await goi(DEV.gvcn); // Cô Lan, GVCN 6A1
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(i.key, i.key).toMatch(/^homeroom\./);
  });

  it("giáo viên bộ môn chỉ nhận mục 'lớp chưa điểm danh' — không cờ, không lời cần gặp", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { items } = await goi(DEV.gvbomon); // Thầy Nam, bộ môn Toán
    for (const i of items) expect(i.key, i.key).toBe("teacher.classes_without_attendance");

    // Khẳng định lại bằng CHUỖI JSON: ba vùng bị chặn cho vai này (mood · care · lời cần
    // gặp) không được xuất hiện dù ở tầng lồng nào. Đo dưới phiên Thầy Nam 06/08/2026:
    // `care.flags` 0 dòng, `attendance.help_requests` 0 dòng — tức là nối nhầm vào đây thì
    // KHÔNG có lỗi nào cả, chỉ có một ô trống đọc thành "lớp mình đang yên".
    const json = JSON.stringify(items).toLowerCase();
    for (const cam of ["mood", "flag", "care", "help", "urgent"]) {
      expect(json.includes(cam), `phản hồi của giáo viên bộ môn có chứa "${cam}"`).toBe(false);
    }
  });

  it("tâm lý cụm chỉ nhận số ca đang mở của cụm", async ({ skip }) => {
    if (!ready) return skip();

    // BÀI NÀY TỰ DỰNG CA CỦA MÌNH — sửa 07/08/2026, và đây là một bài học đắt.
    //
    // Bản đầu gọi thẳng `goi(DEV.counselor)` rồi đòi `["counselor.open_cases"]`. Nó XANH
    // trong bộ đầy đủ suốt nhiều ngày, và ĐỎ khi chạy một mình trên một database vừa dựng.
    // Đo được: `select status, count(*) from care.care_cases` trên bản seed sạch trả về
    // **0 dòng**. Nghĩa là mục này không bao giờ tồn tại nếu chỉ có seed — nó chỉ xuất
    // hiện khi một FILE TEST KHÁC chạy trước và để lại một ca đang mở.
    //
    // Tức là phép kiểm đã xanh vì một lý do không liên quan gì tới thứ nó tưởng mình đo,
    // và nó sẽ đỏ ở đúng nơi đắt nhất: lượt CI đầu tiên trên một database trắng, hoặc ngày
    // ai đó đổi thứ tự file. Đúng họ với nợ #41 ("bộ test bịa được lịch sử chạy máy") —
    // chỉ khác là ở đây bộ test mượn dữ liệu của người khác thay vì tự bịa.
    const CA_THU = "00000000-0000-4000-8000-0000000000c1";
    // `owner_id` là `core.users.id`, KHÔNG phải `auth_uid` — `DEV.counselor` là mã đăng
    // nhập, mã người dùng của Cô Mai là dòng dưới. Nhầm hai mã này thì FK nổ ngay, nên nó
    // không phải loại lỗi im lặng — nhưng ghi ra để người sau khỏi tra lại.
    const COUNSELOR_USER = "40000000-0000-0000-0000-000000000003";
    await asSystem((c) =>
      c.query(
        `insert into care.care_cases (id, student_id, owner_id, tier, status)
         values ($1, $2, $3, 2, 'open')
         on conflict (id) do update set status = 'open', closed_at = null`,
        [CA_THU, FIXTURE.studentMinh, COUNSELOR_USER],
      ),
    );

    try {
      const { items } = await goi(DEV.counselor); // Cô Mai
      expect(keysOf(items)).toEqual(["counselor.open_cases"]);

      // Con số phải khớp chính RLS dưới phiên của cô, không phải một số do câu SQL tự bịa.
      const { withUserContext } = await import("@hub/core/db");
      const thuc = await withUserContext(DEV.counselor, async (c) => {
        const r = await c.query<{ n: number }>(
          "select count(*)::int as n from care.care_cases where status = 'open'",
        );
        return r.rows[0]!.n;
      });
      expect(dem(items, "counselor.open_cases")).toBe(thuc);
    } finally {
      // Dọn trong `finally`: một bài đỏ mà để lại ca đang mở là bài kế tiếp đọc ra một con
      // số không phải của nó — đúng cái bẫy vừa gỡ ở trên, dựng lại theo chiều ngược.
      await asSystem((c) => c.query("delete from care.care_cases where id = $1", [CA_THU]));
    }
  });

  it("quản trị nhận app đang tắt + job cần xem, và KHÔNG nhận gì từ vai principal", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Hùng mang CẢ HAI vai `admin` và `principal` trong seed — đúng ca cần để chứng minh
    // nhánh `principal` không lén thêm mục nào.
    const { items } = await goi(DEV.admin);
    for (const i of items) expect(i.key, i.key).toMatch(/^admin\./);
    expect(dem(items, "admin.apps_disabled")).toBeGreaterThanOrEqual(1);
    expect(dem(items, "admin.jobs_need_attention")).toBeGreaterThanOrEqual(1);
  });

  it("học sinh: chưa check-in thì có đúng một việc, check-in xong thì hết việc", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const truoc = await goi(HS_LAN_AUTH);
    expect(keysOf(truoc.items)).toEqual(["student.checkin_today"]);
    expect(dem(truoc.items, "student.checkin_today")).toBe(1);

    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, current_date, 'in', 'present', 'app')
         on conflict (student_id, occurred_on, kind) do update set status = 'present'`,
        [HS_LAN],
      ),
    );
    try {
      const sau = await goi(HS_LAN_AUTH);
      // Mảng RỖNG, không phải một dòng "0 việc": mục đếm được 0 không được trả ra.
      expect(sau.items).toEqual([]);
    } finally {
      await asSystem((c) =>
        c.query(
          "delete from attendance.checkins where student_id = $1 and occurred_on = current_date",
          [HS_LAN],
        ),
      );
    }
  });

  it("phụ huynh chỉ nhận phiếu đồng ý chưa ký, và số đó bằng số con còn phải bấm", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const { items } = await goi(DEV.guardian);
    for (const i of items) expect(i.key, i.key).toBe("guardian.consent_pending");

    const { withUserContext } = await import("@hub/core/db");
    const thuc = await withUserContext(DEV.guardian, async (c) => {
      const r = await c.query<{ n: number }>(
        "select count(*)::int as n from core.my_consent_status() where needs_action",
      );
      return r.rows[0]!.n;
    });
    expect(dem(items, "guardian.consent_pending")).toBe(thuc);
  });

  it("vai `board` trả MẢNG RỖNG — và asOfDate vẫn là ngày thật của CSDL", async ({ skip }) => {
    if (!ready) return skip();
    const { items, asOfDate } = await goi(BOARD_AUTH);
    expect(items).toEqual([]);

    // Rỗng là một câu trả lời, không phải một lỗi: phần còn lại của phản hồi vẫn đúng.
    const { rows } = await asSystem((c) =>
      c.query<{ d: string }>("select current_date::text as d"),
    );
    expect(asOfDate).toBe(rows[0]!.d);
  });

  it("chưa đăng nhập → UNAUTHORIZED, không phải một chuông rỗng", async ({ skip }) => {
    if (!ready) return skip();
    // Rỗng vì hết việc và rỗng vì chưa đăng nhập là hai chuyện khác nhau; trình bày cái
    // sau thành cái trước là dạy người dùng tin vào một câu trả lời sai.
    const khach = sessionRouter.createCaller(ctxFor(null));
    await expect(khach.getPendingWork()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("GVCN lớp khác KHÔNG lọt vào số đếm", () => {
  it("việc xảy ra ở 6A2 chỉ hiện với Cô Hạnh, không đụng tới số của Cô Lan", async ({ skip }) => {
    if (!ready) return skip();
    const lanTruoc = (await goi(DEV.gvcn)).items;
    const hanhTruoc = (await goi(DEV.gvcn2)).items;

    await asSystem(async (c) => {
      await c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, current_date, 'in', 'queued_late', 'app')
         on conflict (student_id, occurred_on, kind) do update set status = 'queued_late'`,
        [HS_HANH],
      );
      await c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency)
         values ($1, current_date, 'nha', 'today')
         on conflict (student_id, requested_on) do update set handled_at = null`,
        [HS_HANH],
      );
    });

    try {
      const lanSau = (await goi(DEV.gvcn)).items;
      const hanhSau = (await goi(DEV.gvcn2)).items;

      // Cô Hạnh thấy đúng hai việc mới.
      expect(dem(hanhSau, "homeroom.queued_late")).toBe(dem(hanhTruoc, "homeroom.queued_late") + 1);
      expect(dem(hanhSau, "homeroom.help_requests")).toBe(
        dem(hanhTruoc, "homeroom.help_requests") + 1,
      );
      // Cô Lan không thấy gì đổi — kể cả một đơn vị.
      expect(dem(lanSau, "homeroom.queued_late")).toBe(dem(lanTruoc, "homeroom.queued_late"));
      expect(dem(lanSau, "homeroom.help_requests")).toBe(dem(lanTruoc, "homeroom.help_requests"));
      expect(dem(lanSau, "homeroom.report_approvals")).toBe(
        dem(lanTruoc, "homeroom.report_approvals"),
      );
    } finally {
      await asSystem(async (c) => {
        await c.query(
          "delete from attendance.checkins where student_id = $1 and occurred_on = current_date",
          [HS_HANH],
        );
        await c.query("delete from attendance.help_requests where student_id = $1", [HS_HANH]);
      });
    }
  });

  it("lời 'cần gặp thầy cô' của lớp mình là mục DUY NHẤT mang mức khẩn", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency)
         values ($1, current_date, 'nha', 'today')
         on conflict (student_id, requested_on) do update set handled_at = null`,
        [HS_LAN],
      ),
    );
    try {
      const { items } = await goi(DEV.gvcn);
      const khan = items.filter((i) => i.tone === "urgent");
      expect(khan.map((i) => i.key)).toEqual(["homeroom.help_requests"]);
    } finally {
      await asSystem((c) =>
        c.query("delete from attendance.help_requests where student_id = $1", [HS_LAN]),
      );
    }
  });

  it("đánh dấu đã gặp thì việc biến mất — im lặng của bảng là im lặng thật", async ({ skip }) => {
    if (!ready) return skip();
    const truoc = dem((await goi(DEV.gvcn)).items, "homeroom.help_requests");

    await asSystem((c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency)
         values ($1, current_date, 'nha', 'today')
         on conflict (student_id, requested_on) do update set handled_at = null`,
        [HS_LAN],
      ),
    );
    expect(dem((await goi(DEV.gvcn)).items, "homeroom.help_requests")).toBe(truoc + 1);

    try {
      await asSystem((c) =>
        c.query(
          "update attendance.help_requests set handled_at = now() where student_id = $1",
          [HS_LAN],
        ),
      );
      expect(dem((await goi(DEV.gvcn)).items, "homeroom.help_requests")).toBe(truoc);
    } finally {
      await asSystem((c) =>
        c.query("delete from attendance.help_requests where student_id = $1", [HS_LAN]),
      );
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("thử ngược · mệnh đề lọc theo lớp phải gánh việc thật", () => {
  it("người vừa CHỦ NHIỆM vừa kiêm TÂM LÝ CỤM chỉ đếm việc của lớp mình", async ({ skip }) => {
    if (!ready) return skip();
    // ── CA LÀM CHO `class_id = any(...)` TRONG `demViecGvcn` CÓ SỨC NẶNG ──────
    //
    // Với tài khoản CHỈ mang vai `homeroom`, RLS (`core.can_see_student` → nhánh
    // `is_homeroom_of`) và mệnh đề `class_id` cho CÙNG một đáp số, nên gỡ mệnh đề đó đi
    // cũng không bài nào đỏ — đo thật 06/08/2026, xem đầu file.
    //
    // Cấp thêm vai `counselor` (cụm Quận 7) cho chính Cô Lan thì nhánh `in_my_cluster` mở
    // ra MỌI học sinh của cơ sở. Lúc đó bốn con số của buồng lái sẽ lặng lẽ phình ra cả
    // cụm nếu chúng chỉ dựa vào RLS. GVCN kiêm tâm lý cụm là chuyện có thật ở trường liên
    // cấp, nên đây không phải một ca dựng ra cho vui.
    const USER_LAN = "40000000-0000-0000-0000-000000000001";
    const CA_KIEM_NHIEM = "00000000-0000-4000-8000-0000000000c2";

    // Dựng một việc ở lớp 6A1 (của Cô Lan) và một việc ở lớp 6A3 (KHÔNG phải của cô, nhưng
    // NẰM TRONG cụm Quận 7) — hai vế của phép so.
    await asSystem(async (c) => {
      await c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency)
         values ($1, current_date, 'nha', 'today')
         on conflict (student_id, requested_on) do update set handled_at = null`,
        [HS_LAN],
      );
      await c.query(
        `insert into core.user_role_scopes (user_id, role_code, school_id, class_id)
         values ($1, 'counselor', $2, null) on conflict do nothing`,
        [USER_LAN, FIXTURE.schoolQ7],
      );
      // Và MỘT ca chăm sóc đang mở — cùng lý do đã kể dài ở bài "tâm lý cụm chỉ nhận số ca
      // đang mở của cụm": seed sạch có **0 dòng** `care.care_cases`, nên khẳng định ở cuối
      // bài này ("vai kiêm nhiệm VẪN nhận mục của cụm") chỉ đúng khi có người dựng ca ra.
      // Bản đầu không dựng, và nó xanh nhờ một file test khác chạy trước.
      await c.query(
        `insert into care.care_cases (id, student_id, owner_id, tier, status)
         values ($1, $2, $3, 2, 'open')
         on conflict (id) do update set status = 'open', closed_at = null`,
        [CA_KIEM_NHIEM, HS_LAN, USER_LAN],
      );
    });

    try {
      const { items } = await goi(DEV.gvcn);

      // Phép đếm ĐỘC LẬP, tính bằng vai chủ schema và khoá cứng theo lớp 6A1: nếu router
      // đổi sang đếm theo RLS một mình thì hai con số này rời nhau ngay.
      const { rows } = await asSystem((c) =>
        c.query<{ can_gap: number; bao_cao: number }>(
          `with roster as (
             select e.student_id from core.enrollments e
              where e.class_id = $1 and e.valid_to is null
           )
           select
             (select count(distinct h.student_id)::int
                from attendance.help_requests h join roster r on r.student_id = h.student_id
               where h.handled_at is null)                                   as can_gap,
             (select count(*)::int from roster)                              as bao_cao`,
          [FIXTURE.classA],
        ),
      );

      expect(dem(items, "homeroom.help_requests")).toBe(rows[0]!.can_gap);
      // Seed chưa có dòng duyệt nào cho tuần này, nên "chưa duyệt" = sĩ số lớp 6A1.
      expect(dem(items, "homeroom.report_approvals")).toBe(rows[0]!.bao_cao);

      // Và vai kiêm nhiệm VẪN nhận được mục của cụm — cô mất phạm vi rộng ở buồng lái
      // nhưng không mất hộp việc tâm lý.
      expect(items.some((i) => i.key === "counselor.open_cases")).toBe(true);
    } finally {
      await asSystem(async (c) => {
        await c.query(
          "delete from core.user_role_scopes where user_id = $1 and role_code = 'counselor'",
          [USER_LAN],
        );
        await c.query("delete from attendance.help_requests where student_id = $1", [HS_LAN]);
        await c.query("delete from care.care_cases where id = $1", [CA_KIEM_NHIEM]);
      });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("không rò danh tính, không để lại vết", () => {
  it("không phản hồi nào của bất kỳ vai nào chứa tên hay mã học sinh", async ({ skip }) => {
    if (!ready) return skip();
    // Dựng đủ việc cho Cô Lan để phản hồi KHÔNG rỗng — một chuỗi JSON rỗng thì không
    // chứng minh được gì.
    await asSystem(async (c) => {
      await c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency)
         values ($1, current_date, 'nha', 'today')
         on conflict (student_id, requested_on) do update set handled_at = null`,
        [HS_LAN],
      );
      await c.query(
        `insert into care.flags (student_id, rule_code, as_of_date, origin)
         values ($1, 'E_MOOD', current_date, 'live')
         on conflict (student_id, rule_code, as_of_date) do nothing`,
        [HS_LAN],
      );
    });

    try {
      for (const [ten, uid] of [
        ["GVCN", DEV.gvcn],
        ["bộ môn", DEV.gvbomon],
        ["tâm lý cụm", DEV.counselor],
        ["quản trị", DEV.admin],
        ["học sinh", HS_LAN_AUTH],
        ["phụ huynh", DEV.guardian],
      ] as const) {
        const { items } = await goi(uid);
        const json = JSON.stringify(items);
        for (const cam of ["Em Thử Nghiệm", "VA-2026-", HS_LAN, HS_HANH, FIXTURE.studentMinh]) {
          expect(json.includes(cam), `${ten}: phản hồi có chứa "${cam}"`).toBe(false);
        }
        // Mỗi mục đúng năm trường, không hơn — hình dạng thật lúc chạy, không phải kiểu
        // TypeScript (kiểu biến mất lúc chạy).
        for (const i of items) {
          expect(Object.keys(i).sort()).toEqual(["count", "href", "key", "label", "tone"]);
        }
      }

      // Cờ của lớp mình VẪN được đếm — bài trên không xanh vì chẳng có gì để lộ.
      expect(dem((await goi(DEV.gvcn)).items, "homeroom.care_flags")).toBeGreaterThanOrEqual(1);
    } finally {
      await asSystem(async (c) => {
        await c.query("delete from care.flags where student_id = $1", [HS_LAN]);
        await c.query("delete from attendance.help_requests where student_id = $1", [HS_LAN]);
      });
    }
  });

  it("gọi hai lần cho ĐÚNG cùng một kết quả — thủ tục đọc không ghi gì", async ({ skip }) => {
    if (!ready) return skip();
    // §9 nói về mutation, và thủ tục này không phải mutation. Phép kiểm tương đương cho
    // một thủ tục ĐỌC: gọi lại không đổi kết quả, và không sinh dòng nào ở đâu cả.
    const truoc = await asSystem((c) =>
      c.query<{ n: string }>(
        `select (select count(*) from attendance.checkins)
              + (select count(*) from attendance.help_requests)
              + (select count(*) from care.flags)
              + (select count(*) from ops.job_runs) as n`,
      ),
    );
    const a = await goi(DEV.gvcn);
    const b = await goi(DEV.gvcn);
    expect(b).toEqual(a);
    const sau = await asSystem((c) =>
      c.query<{ n: string }>(
        `select (select count(*) from attendance.checkins)
              + (select count(*) from attendance.help_requests)
              + (select count(*) from care.flags)
              + (select count(*) from ops.job_runs) as n`,
      ),
    );
    expect(sau.rows[0]!.n).toBe(truoc.rows[0]!.n);
  });

  it("mọi mục trả về đều có count >= 1 — không mục nào bằng 0", async ({ skip }) => {
    if (!ready) return skip();
    for (const uid of [DEV.gvcn, DEV.gvcn2, DEV.gvbomon, DEV.counselor, DEV.admin, DEV.guardian]) {
      const { items } = await goi(uid);
      for (const i of items) expect(i.count, `${uid} · ${i.key}`).toBeGreaterThanOrEqual(1);
    }
  });
});
