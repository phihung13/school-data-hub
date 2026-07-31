// tests/db/perf.test.ts
//
// Gói hiệu năng nền (0029 + packages/core/db/client.ts) đụng vào đúng chỗ nguy hiểm
// nhất của hệ: hàm mà MỌI policy RLS gọi để biết "ai đang đăng nhập". Tăng tốc ở đó
// mà sai một dòng là mở cửa dữ liệu trẻ em cho nhầm người, hoặc khoá cửa với đúng
// người mà không ai biết cho tới khi cô giáo gọi điện.
//
// pgTAP (0029_perf_indexes_test.sql) đã khoá phần SQL. File này khoá phần mà pgTAP
// KHÔNG với tới được: đường đi thật của ứng dụng — withUserContext gộp lệnh, pool
// dùng lại socket giữa các người dùng, và số lượt tra core.users trong một request.
import { describe, it, expect, beforeAll } from "vitest";
import { requireDb, asUser, asSystem, DEV, FIXTURE } from "../helpers/db";

let ready = false;

beforeAll(async () => {
  ready = await requireDb();
});

describe("ngữ cảnh phiên có bộ đệm (0029)", () => {
  it("withUserContext dựng đúng danh tính — đệm khớp với bảng", async ({ skip }) => {
    if (!ready) skip();

    const { rows } = await asUser(DEV.gvcn, (c) =>
      c.query<{ uid: string; cached: string; claim: string }>(
        `select core.current_user_id()::text as uid,
                current_setting('request.hub.user_id', true) as cached,
                current_setting('request.jwt.claim.sub', true) as claim`,
      ),
    );

    const expected = await asSystem((c) =>
      c.query<{ id: string }>("select id::text from core.users where auth_uid = $1", [DEV.gvcn]),
    );

    expect(rows[0]?.uid).toBe(expected.rows[0]?.id);
    expect(rows[0]?.cached).toBe(expected.rows[0]?.id);
    expect(rows[0]?.claim).toBe(DEV.gvcn);
  });

  it("đệm KHÔNG rò sang transaction sau trên cùng kết nối pool", async ({ skip }) => {
    if (!ready) skip();

    // Đây là ca hỏng đáng sợ nhất của mọi thiết kế "nhớ sẵn ai đang đăng nhập": pool
    // dùng lại đúng socket đó cho người tiếp theo. GUC đặt bằng set_config(..., true)
    // chết theo commit — test này là bằng chứng, không phải lời hứa.
    await asUser(DEV.gvcn, (c) => c.query("select 1"));

    const { rows } = await asSystem((c) =>
      c.query<{ cached: string | null; claim: string | null }>(
        `select nullif(current_setting('request.hub.user_id', true), '') as cached,
                nullif(current_setting('request.jwt.claim.sub', true), '') as claim`,
      ),
    );

    expect(rows[0]?.cached).toBeNull();
    expect(rows[0]?.claim).toBeNull();
  });

  it("hai người dùng liên tiếp KHÔNG nhìn thấy uid của nhau", async ({ skip }) => {
    if (!ready) skip();

    const readUid = (authUid: string) =>
      asUser(authUid, (c) =>
        c.query<{ uid: string | null }>("select core.current_user_id()::text as uid"),
      ).then((r) => r.rows[0]?.uid ?? null);

    const lan = await readUid(DEV.gvcn);
    const minh = await readUid(DEV.student);
    const lanLai = await readUid(DEV.gvcn);

    expect(lan).not.toBeNull();
    expect(minh).not.toBeNull();
    expect(minh).not.toBe(lan);
    expect(lanLai).toBe(lan);
  });

  it("RLS vẫn lọc đúng qua đường có đệm: GVCN 6A2 không thấy học sinh 6A1", async ({ skip }) => {
    if (!ready) skip();

    const seen = (authUid: string) =>
      asUser(authUid, (c) =>
        c.query<{ n: string }>("select count(*)::text as n from core.students where id = $1", [
          FIXTURE.studentMinh,
        ]),
      ).then((r) => Number(r.rows[0]?.n ?? 0));

    expect(await seen(DEV.gvcn)).toBe(1); // Cô Lan chủ nhiệm Minh
    expect(await seen(DEV.gvcn2)).toBe(0); // Cô Hạnh lớp khác
  });

  it("RLS quét thêm bao nhiêu dòng cũng KHÔNG sinh thêm lượt tra core.users", async ({ skip }) => {
    if (!ready) skip();

    // Đây là chính con số đã bắt được vấn đề: trước 0029, mỗi dòng bị RLS quét kéo
    // theo tới 6 lượt tra core.users (đo trên bộ 3.600 học sinh: 2.241 lượt cho MỘT
    // lần mở buồng lái). Tính chất cần khoá là "không phụ thuộc số dòng", nên đo
    // HIỆU trước–sau trong cùng transaction chứ không đo số tuyệt đối:
    // pg_stat_xact_user_tables còn mang cả phần thống kê chưa kịp đẩy đi của các
    // transaction trước trên cùng backend (Postgres gộp mỗi ~1 giây), mà test chạy
    // hàng chục transaction trong chớp mắt — số tuyệt đối sẽ lẫn, hiệu thì không.
    const usersLookups = (c: import("@hub/core/db").PoolClient) =>
      c
        .query<{ n: string }>(
          `select (coalesce(idx_scan, 0) + coalesce(seq_scan, 0))::text as n
             from pg_stat_xact_user_tables
            where schemaname = 'core' and relname = 'users'`,
        )
        .then((r) => Number(r.rows[0]?.n ?? 0));

    const delta = await asUser(DEV.gvcn, async (c) => {
      const before = await usersLookups(c);
      await c.query("select count(*) from core.students");
      await c.query("select count(*) from attendance.checkins");
      await c.query("select count(*) from core.enrollments");
      await c.query("select count(*) from core.classes");
      return (await usersLookups(c)) - before;
    });

    expect(delta).toBe(0);
  });

  it("authUid không phải UUID bị từ chối trước khi chạm SQL", async ({ skip }) => {
    if (!ready) skip();

    // withUserContext ghép authUid vào câu lệnh gộp (begin + set role + dựng ngữ cảnh)
    // để tiết kiệm lượt đi-về, nên hàng rào UUID là thứ duy nhất đứng giữa chuỗi ngoài
    // và câu SQL đó. Bỏ hàng rào = SQL injection ở đúng chỗ dựng phân quyền.
    await expect(asUser("'; drop table core.users; --", (c) => c.query("select 1"))).rejects.toThrow(
      /UUID/i,
    );
  });
});

describe("index đường nóng (0029)", () => {
  it('"Quét đêm qua" đọc job_runs bằng index, không quét cả bảng', async ({ skip }) => {
    if (!ready) skip();

    const { rows } = await asSystem((c) =>
      c.query<{ "QUERY PLAN": string }>(
        "explain (costs off) select max(finished_at) from ops.job_runs where status = 'success'",
      ),
    );
    const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");

    expect(plan).toMatch(/job_runs_success_finished_idx/);
    expect(plan).not.toMatch(/Seq Scan on job_runs/);
  });

  it("bốn index còn lại tồn tại đúng tên", async ({ skip }) => {
    if (!ready) skip();

    const { rows } = await asSystem((c) =>
      c.query<{ indexname: string }>(
        `select indexname from pg_indexes
          where indexname in ('enrollments_current_class_idx', 'user_role_scopes_class_role_idx',
                              'care_cases_student_idx', 'interventions_recent_idx')
          order by indexname`,
      ),
    );

    expect(rows.map((r) => r.indexname)).toEqual([
      "care_cases_student_idx",
      "enrollments_current_class_idx",
      "interventions_recent_idx",
      "user_role_scopes_class_role_idx",
    ]);
  });
});
