// tests/db/mood-rieng-tu.test.ts — gói "mood-rieng-tu" (31/07/2026).
//
// Màn `/checkin` in chữ cho học sinh đọc, ngay tại chỗ em bấm bốn ô cảm xúc:
//
//     "Chỉ thầy cô chủ nhiệm thấy"
//
// DESIGN-GUIDELINES §9 ghi đúng câu đó. Trước migration 0038 câu đó KHÔNG đúng ở
// tầng dữ liệu: `attendance.checkins` nằm trong vòng lặp 16 bảng của 0009:150-176
// nên dùng chung `core.can_see_student()` với danh sách lớp và bảng điểm — hàm hợp
// của sáu nhánh, trong đó có `is_my_child` và `principal_of`. RLS lọc theo DÒNG,
// mà `mood` là một CỘT nằm chung dòng với điểm danh.
//
// Đo lại được trên hub_dev trước khi vá, dưới đúng danh tính từng vai:
//     phiên phụ huynh   → 7 dòng đọc ra mood
//     phiên hiệu trưởng → 8 dòng đọc ra mood
//
// Quyết định nghiệp vụ chủ đầu tư 31/07/2026: mood CHỈ GVCN và tâm lý cụm thấy.
// Phụ huynh và hiệu trưởng KHÔNG thấy mood từng ngày; phụ huynh VẪN thấy điểm danh
// (có mặt/vắng/muộn) và VẪN thấy báo cáo tổng hợp.
//
// Phân công với bài pgTAP song sinh (`0038_checkins_mood_scope_test.sql`): bài kia
// chạy trên fixture `seed_basic()` nên có GIÁO VIÊN BỘ MÔN được phân công đúng lớp
// 6A1 — nhánh đó chỉ chứng minh được ở đó. Dữ liệu seed dev (`seed.mjs`) không có
// phân công bộ môn nào, nên assert ở đây sẽ XANH GIẢ. File này giữ đúng những vai
// mà seed dev dựng được — học sinh, phụ huynh, GVCN, tâm lý cụm, hiệu trưởng/quản
// trị — và thêm chiều mà pgTAP không có: dữ liệu THẬT đang nằm trong hub_dev.
//
// Luật mà file này cưỡng chế: LỜI HỨA IN TRÊN MÀN HÌNH LÀ RÀNG BUỘC KỸ THUẬT. Chỗ
// duy nhất chứng minh được nó là Postgres thật, dưới đúng danh tính từng vai.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";

let ready = false;

/** Ngày riêng của bài này — không giẫm lên dữ liệu seed hay lên bài test khác. */
const NGAY_DO = "2026-01-05";
/** "Buồn". Cố ý chọn giá trị đau nhất: lọt ra ngoài phạm vi là lọt đúng thứ này. */
const MOOD_BUON = 1;

/** Mã lỗi Postgres cho "insufficient_privilege" — cột nằm ngoài GRANT. */
const TU_CHOI_QUYEN = "42501";

/**
 * Đọc thẳng cột `mood` của bảng nền dưới danh tính một người cụ thể.
 * Trả về số dòng đọc được, hoặc mã lỗi Postgres nếu bị từ chối.
 */
async function docMoodTrucTiep(authUid: string): Promise<number | string> {
  try {
    const { rows } = await asUser(authUid, (c) =>
      c.query<{ n: string }>(
        "select count(*)::text as n from attendance.checkins where mood is not null",
      ),
    );
    return Number(rows[0]?.n ?? 0);
  } catch (err) {
    return (err as { code?: string }).code ?? "khong-co-ma-loi";
  }
}

/** Số dòng có mood mà một người đọc được qua đường HỢP LỆ (view phạm vi chăm sóc). */
async function docMoodQuaVienChamSoc(authUid: string): Promise<number> {
  const { rows } = await asUser(authUid, (c) =>
    c.query<{ n: string }>(
      "select count(*)::text as n from attendance.checkins_care where student_id = $1 and mood is not null",
      [FIXTURE.studentMinh],
    ),
  );
  return Number(rows[0]?.n ?? 0);
}

describe("Tâm trạng check-in là chuyện riêng của em và cô chủ nhiệm (0038)", () => {
  beforeAll(async () => {
    ready = await requireDb();
    if (!ready) return;
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, $2::date, 'in', $3, 'present', 'app')
         on conflict (student_id, occurred_on, kind) do update set mood = $3`,
        [FIXTURE.studentMinh, NGAY_DO, MOOD_BUON],
      ),
    );
  });

  afterAll(async () => {
    if (!ready) return;
    await asSystem((c) =>
      c.query("delete from attendance.checkins where student_id = $1 and occurred_on = $2::date", [
        FIXTURE.studentMinh,
        NGAY_DO,
      ]),
    );
  });

  // ═══ CHIỀU TỪ CHỐI — đây là lỗi đang vá ═══════════════════════════════════
  it("phụ huynh KHÔNG đọc được cột mood — Postgres từ chối, không trả về số 0 im lặng", async () => {
    if (!ready) return;
    // Trước 0038 câu này trả về 7. Con số ấy là bảy ngày một đứa trẻ nói
    // "hôm nay con buồn" cho một người mà em được hứa là sẽ không thấy.
    expect(await docMoodTrucTiep(DEV.guardian)).toBe(TU_CHOI_QUYEN);
    expect(await docMoodQuaVienChamSoc(DEV.guardian)).toBe(0);
  });

  it("hiệu trưởng/quản trị KHÔNG đọc được cột mood (§9: BGH chỉ xem tổng hợp theo lô)", async () => {
    if (!ready) return;
    expect(await docMoodTrucTiep(DEV.admin)).toBe(TU_CHOI_QUYEN);
    expect(await docMoodQuaVienChamSoc(DEV.admin)).toBe(0);
  });

  it("GVCN lớp khác KHÔNG đọc được — 'chủ nhiệm' là chủ nhiệm CỦA EM ĐÓ", async () => {
    if (!ready) return;
    expect(await docMoodTrucTiep(DEV.gvcn2)).toBe(TU_CHOI_QUYEN);
    expect(await docMoodQuaVienChamSoc(DEV.gvcn2)).toBe(0);
  });

  // ═══ CHIỀU CHO PHÉP ═══════════════════════════════════════════════════════
  it("GVCN của em đọc được ĐÚNG GIÁ TRỊ mood — lời hứa nói 'chỉ cô thấy', nghĩa là cô PHẢI thấy", async () => {
    if (!ready) return;
    const { rows } = await asUser(DEV.gvcn, (c) =>
      c.query<{ mood: number }>(
        "select mood from attendance.checkins_care where student_id = $1 and occurred_on = $2::date",
        [FIXTURE.studentMinh, NGAY_DO],
      ),
    );
    expect(rows[0]?.mood).toBe(MOOD_BUON);
    expect(await docMoodQuaVienChamSoc(DEV.gvcn)).toBeGreaterThan(0);
  });

  it("tâm lý cụm đọc được mood — cùng phạm vi core.can_see_care() với cờ và hồ sơ chăm sóc", async () => {
    if (!ready) return;
    expect(await docMoodQuaVienChamSoc(DEV.counselor)).toBeGreaterThan(0);
  });

  it("chính em đọc lại được tâm trạng mình đã ghi — màn /checkin hiện 'Con đã ghi: …'", async () => {
    if (!ready) return;
    expect(await docMoodQuaVienChamSoc(DEV.student)).toBeGreaterThan(0);
  });

  // ═══ KHÔNG SIẾT NHẦM ══════════════════════════════════════════════════════
  // Thiếu nhóm này thì một lần siết tay quá đà vẫn xanh, mà phụ huynh mất đường
  // xem con đi học có đủ không, và học sinh mất luôn nút check-in.
  it("phụ huynh VẪN đọc được DÒNG điểm danh của con — 0038 che CỘT, không chặn dòng", async () => {
    if (!ready) return;
    const { rows } = await asUser(DEV.guardian, (c) =>
      c.query<{ n: string; trang_thai: string | null }>(
        `select count(*)::text as n, string_agg(distinct status, ',') as trang_thai
           from attendance.checkins where student_id = $1`,
        [FIXTURE.studentMinh],
      ),
    );
    expect(Number(rows[0]?.n ?? 0)).toBeGreaterThan(0);
    expect(rows[0]?.trang_thai).toBeTruthy();
  });

  it("phụ huynh VẪN lấy được số tổng hợp 'ngày Vui' — Báo cáo Trưởng thành không mất mục Glow", async () => {
    if (!ready) return;
    const { rows } = await asUser(DEV.guardian, (c) =>
      c.query<{ n: number | null }>("select attendance.happy_days($1, $2::date, $3::date) as n", [
        FIXTURE.studentMinh,
        "2020-01-01",
        "2030-01-01",
      ]),
    );
    // Số cụ thể tùy dữ liệu seed; điều phải đúng là NÓ CÓ SỐ, không phải NULL.
    expect(rows[0]?.n).not.toBeNull();
    expect(typeof rows[0]?.n).toBe("number");
  });

  it("happy_days trả NULL cho người không được xem em này — 'không được phép biết' khác 'không có ngày vui nào'", async () => {
    if (!ready) return;
    const { rows } = await asUser(DEV.gvcn2, (c) =>
      c.query<{ n: number | null }>("select attendance.happy_days($1, $2::date, $3::date) as n", [
        FIXTURE.studentMinh,
        "2020-01-01",
        "2030-01-01",
      ]),
    );
    expect(rows[0]?.n).toBeNull();
  });

  it("học sinh VẪN ghi đè được mood trong ngày (§9 idempotent) — đường check-in hằng ngày không gãy", async () => {
    if (!ready) return;
    // Đúng câu mà `checkin.submitMood` chạy, SAU khi đổi `excluded.mood` → tham số
    // (xem khối "VIỆC PHẢI LÀM Ở TẦNG ỨNG DỤNG" cuối migration 0038): `excluded.mood`
    // bị Postgres tính là ĐỌC cột mood của bảng đích nên đòi quyền SELECT.
    await expect(
      asUser(DEV.student, (c) =>
        c.query(
          `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
           values ($1, $2::date, 'in', $3, 'present', 'app')
           on conflict (student_id, occurred_on, kind) do update set mood = $3
           returning id, status`,
          [FIXTURE.studentMinh, NGAY_DO, 3],
        ),
      ),
    ).resolves.toBeTruthy();
  });

  // ═══ KHOÁ HÌNH DẠNG ═══════════════════════════════════════════════════════
  it("cột mood nằm NGOÀI grant SELECT của authenticated, mọi cột khác nằm TRONG", async () => {
    if (!ready) return;
    const { rows } = await asSystem((c) =>
      c.query<{ ten_cot: string; doc_duoc: boolean }>(
        `select a.attname as ten_cot,
                has_column_privilege('authenticated','attendance.checkins', a.attname, 'select') as doc_duoc
           from pg_attribute a
          where a.attrelid = 'attendance.checkins'::regclass
            and a.attnum > 0 and not a.attisdropped`,
      ),
    );
    const thieuQuyen = rows.filter((r) => !r.doc_duoc).map((r) => r.ten_cot);
    // Đúng một cột bị che. Thêm cột mới mà quên grant thì test này đỏ — 0025 đã
    // dạy rằng grant theo cột là danh sách viết tay, và danh sách viết tay thì lệch.
    expect(thieuQuyen).toEqual(["mood"]);
  });
});
