// tests/db/flags-detail.test.ts
//
// Migration `0049` cắt cột `care.flags.detail` khỏi tầm đọc của giáo viên chủ nhiệm
// (ADR-026, nợ `DEBT` #39) và mở lại đúng vai tâm lý cụm qua `care.flags_tam_ly`.
//
// pgTAP (`0049_chi_tiet_co_test.sql`) đã kiểm việc đó trong một transaction rồi
// rollback, trên một database dựng lại từ đầu. File này kiểm thứ pgTAP không chạm
// tới: hành vi trên CƠ SỞ DỮ LIỆU ĐÃ SEED, đi qua ĐÚNG đường mà router thật đi
// (`withUserContext` → `set role authenticated` + `request.jwt.claim.sub`), tức là
// đúng đường mà buồng lái của cô đi mỗi sáng.
//
// Ba câu hỏi, và câu thứ ba mới là câu dễ mất:
//   1. Cô hỏi thẳng cột `detail` thì có bị TỪ CHỐI không (chứ không phải trả NULL)?
//   2. Tâm lý cụm có còn đọc đủ không, hay ta vừa cắt nhầm cả cô Mai?
//   3. Câu SELECT THẬT của buồng lái (`apps/hub/server/routers/care.ts` ~749) có
//      còn chạy không? Cắt quyền mà làm buồng lái trắng trơn thì cô không biết CÓ
//      CHUYỆN, và màn hình sẽ không nói gì cả — hỏng im lặng, tệ hơn khe hở ban đầu.
//
// Dọn sạch sau khi chạy: chỉ xoá đúng những dòng file này ghi vào (nhận diện bằng
// `as_of_date` lùi rất xa, không đụng ngày nào của dữ liệu thật).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";

let ready = false;

/** Ngày lùi xa để không giẫm lên cờ nào của seed hay của bài test khác. */
const NGAY_RIENG = "current_date - 300";

/** Đúng hình dạng `detail` mà `care.run_flag_engine` (0039) ghi cho cờ E_MOOD. */
const CHI_TIET = '{"negative_streak": 7, "negative_days": 9, "mode": "streak", "nguong": 5}';

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query(
      `insert into care.flags (student_id, rule_code, as_of_date, detail, origin)
       values ($1, 'E_MOOD', ${NGAY_RIENG}, $2::jsonb, 'live')
       on conflict (student_id, rule_code, as_of_date) do update set detail = excluded.detail`,
      [FIXTURE.studentMinh, CHI_TIET],
    );
  });
});

afterAll(async () => {
  if (!ready) return;
  await asSystem(async (c) => {
    await c.query(
      `delete from care.flags where student_id = $1 and as_of_date = ${NGAY_RIENG}`,
      [FIXTURE.studentMinh],
    );
  });
});

describe("care.flags.detail — GVCN bị cắt, tâm lý cụm giữ nguyên (0049 · ADR-026 · DEBT #39)", () => {
  it("GVCN hỏi thẳng cột detail → Postgres TỪ CHỐI (42501), không trả NULL", async ({ skip }) => {
    if (!ready) return skip();
    // 42501 chứ không phải "0 dòng" hay "NULL": một lời hứa bị phá phải hỏng THÀNH
    // TIẾNG. NULL im lặng là thứ khiến người viết câu SQL sau tưởng dữ liệu rỗng.
    await expect(
      asUser(DEV.gvcn, (c) =>
        c.query(`select detail from care.flags where student_id = $1`, [FIXTURE.studentMinh]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("GVCN gõ `select *` cũng bị TỪ CHỐI — sao (*) nở ra cả cột detail", async ({ skip }) => {
    if (!ready) return skip();
    await expect(
      asUser(DEV.gvcn, (c) => c.query("select * from care.flags limit 1")),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("GVCN VẪN đọc được cờ — cô biết CÓ CHUYỆN (0049 cắt CỘT, không chặn DÒNG)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const n = await asUser(DEV.gvcn, async (c) => {
      const r = await c.query<{ n: string }>(
        `select count(*)::text as n from care.flags
          where student_id = $1 and rule_code = 'E_MOOD' and as_of_date = ${NGAY_RIENG}`,
        [FIXTURE.studentMinh],
      );
      return Number(r.rows[0]!.n);
    });
    expect(n).toBe(1);
  });

  it("câu SELECT THẬT của buồng lái (care.ts ~749) vẫn chạy dưới phiên GVCN", async ({ skip }) => {
    if (!ready) return skip();
    // Chép đúng hình dạng câu thật: roster của lớp JOIN care.flags, chọn as_of_date,
    // lọc rule_code + origin. Nếu một trong các cột ấy bị revoke nhầm thì bảng cờ của
    // cô trắng trơn — và trắng trơn đọc y hệt "lớp mình đang ổn".
    const rows = await asUser(DEV.gvcn, async (c) => {
      const r = await c.query<{ student_id: string; as_of_date: string }>(
        `with roster as (
           select e.student_id from core.enrollments e
            where e.class_id = $1 and e.valid_to is null
         )
         select distinct on (r.student_id) r.student_id, f.as_of_date::text as as_of_date
           from roster r
           join care.flags f
             on f.student_id = r.student_id
            and f.rule_code = 'E_MOOD'
            and f.origin = 'live'
          order by r.student_id, f.as_of_date desc`,
        [FIXTURE.classA],
      );
      return r.rows;
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.some((x) => x.student_id === FIXTURE.studentMinh)).toBe(true);
  });

  it("GVCN đọc care.flags_tam_ly ra 0 DÒNG — cửa của tâm lý cụm, đóng bằng 0 dòng chứ không bằng lỗi", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const n = await asUser(DEV.gvcn, async (c) => {
      const r = await c.query<{ n: string }>("select count(*)::text as n from care.flags_tam_ly");
      return Number(r.rows[0]!.n);
    });
    // 0 dòng, KHÔNG phải lỗi: màn hình hiện "không có" thay vì hiện "hỏng".
    expect(n).toBe(0);
  });

  it("TÂM LÝ CỤM đọc đủ detail qua care.flags_tam_ly — ADR-026 hứa cô Mai không mất gì", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const detail = await asUser(DEV.counselor, async (c) => {
      const r = await c.query<{ detail: Record<string, unknown> }>(
        `select detail from care.flags_tam_ly
          where student_id = $1 and rule_code = 'E_MOOD' and as_of_date = ${NGAY_RIENG}`,
        [FIXTURE.studentMinh],
      );
      return r.rows[0]?.detail;
    });
    expect(detail).toEqual({
      negative_streak: 7,
      negative_days: 9,
      mode: "streak",
      nguong: 5,
    });
  });

  it("TÂM LÝ CỤM gõ thẳng bảng cũng bị TỪ CHỐI — cô mất một CÁCH GÕ, không mất dữ liệu", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Grant theo cột không phân biệt vai; cửa hợp lệ của cô là view. Ca này ghi lại
    // để lần sau không ai "sửa cho tiện" bằng cách grant lại cột cho authenticated.
    await expect(
      asUser(DEV.counselor, (c) => c.query("select detail from care.flags limit 1")),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("bộ quét (vai hệ thống) KHÔNG bị đụng — vẫn đọc và ghi được detail", async ({ skip }) => {
    if (!ready) return skip();
    // `care.run_flag_engine` chạy vai `postgres`; vai chủ schema bỏ qua cả RLS lẫn
    // grant theo cột. Đây là điều kiện khiến "cắt quyền mà bộ quét không gãy" còn
    // đúng — mất nó thì cờ E_MOOD ngừng sinh và buồng lái trống trong im lặng.
    const detail = await asSystem(async (c) => {
      const r = await c.query<{ detail: Record<string, unknown> }>(
        `select detail from care.flags
          where student_id = $1 and as_of_date = ${NGAY_RIENG}`,
        [FIXTURE.studentMinh],
      );
      return r.rows[0]?.detail;
    });
    expect(detail).toMatchObject({ negative_days: 9 });
  });
});
