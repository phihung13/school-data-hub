// tests/db/rls-cross-class.test.ts
//
// Tính chất an toàn QUAN TRỌNG NHẤT của hệ thống: giáo viên chủ nhiệm lớp này
// KHÔNG được nhìn thấy học sinh lớp khác. Đây cũng chính là điều kiện để lời hứa
// "bật một hai lớp nhưng xây cho mọi khối" là thật — nếu tính chất này hỏng thì
// mở thêm lớp đồng nghĩa với rò dữ liệu chéo lớp.
//
// Test chạy qua ĐÚNG đường router thật đi (withUserContext → RLS thật trên
// Postgres thật), không mock, không SET ROLE thủ công.
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asSystem, databaseAvailable, seedPresent, DEV, FIXTURE } from "../helpers/db";

let ready = false;

beforeAll(async () => {
  ready = (await databaseAvailable()) && (await seedPresent());
});

describe("RLS · cách ly dữ liệu giữa các lớp", () => {
  it("GVCN 6A1 thấy học sinh lớp mình", async ({ skip }) => {
    if (!ready) return skip();
    const rows = await asUser(DEV.gvcn, async (c) => {
      const r = await c.query<{ id: string }>("select id from core.students where id = $1", [
        FIXTURE.studentMinh,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(1);
  });

  it("GVCN 6A1 KHÔNG thấy học sinh lớp 6A2", async ({ skip }) => {
    if (!ready) return skip();
    const rows = await asUser(DEV.gvcn, async (c) => {
      const r = await c.query<{ id: string }>("select id from core.students where id = $1", [
        FIXTURE.studentBinh,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("GVCN 6A2 KHÔNG thấy học sinh lớp 6A1 — đối xứng, không phải may mắn một chiều", async ({ skip }) => {
    if (!ready) return skip();
    const rows = await asUser(DEV.gvcn2, async (c) => {
      const r = await c.query<{ id: string }>("select id from core.students where id = $1", [
        FIXTURE.studentMinh,
      ]);
      return r.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it("học sinh chỉ thấy chính mình, không thấy bạn cùng khối", async ({ skip }) => {
    if (!ready) return skip();
    const ids = await asUser(DEV.student, async (c) => {
      const r = await c.query<{ id: string }>("select id from core.students order by id");
      return r.rows.map((x) => x.id);
    });
    expect(ids).toContain(FIXTURE.studentMinh);
    expect(ids).not.toContain(FIXTURE.studentBinh);
  });

  it("check-in cảm xúc của lớp khác không lọt sang GVCN không liên quan", async ({ skip }) => {
    if (!ready) return skip();
    // Dựng một check-in cho học sinh lớp 6A2 (bỏ qua RLS, chỉ để tạo dữ liệu).
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, mood, source)
         values ($1, current_date, 'in', 'present', 2, 'app')
         on conflict do nothing`,
        [FIXTURE.studentBinh],
      ),
    );

    const seenByOtherHomeroom = await asUser(DEV.gvcn, async (c) => {
      const r = await c.query<{ n: string }>(
        "select count(*)::text as n from attendance.checkins where student_id = $1",
        [FIXTURE.studentBinh],
      );
      return Number(r.rows[0]!.n);
    });
    expect(seenByOtherHomeroom).toBe(0);

    const seenByOwnHomeroom = await asUser(DEV.gvcn2, async (c) => {
      const r = await c.query<{ n: string }>(
        "select count(*)::text as n from attendance.checkins where student_id = $1",
        [FIXTURE.studentBinh],
      );
      return Number(r.rows[0]!.n);
    });
    expect(seenByOwnHomeroom).toBeGreaterThan(0);
  });
});
