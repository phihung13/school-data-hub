// tests/db/idempotency.test.ts
//
// §9 của hợp đồng kiến trúc: MỌI mutation phải idempotent (unique constraint +
// upsert), và phải có test gọi hai lần. Trước file này, luật đó chỉ nằm trên
// giấy đối với phần TypeScript — pgTAP có kiểm ở tầng SQL, nhưng không ai kiểm
// đường mà router thật đi.
//
// Cách kiểm: chạy đúng câu lệnh của router, hai lần, rồi đếm dòng. Không mock.
import { describe, it, expect, beforeAll } from "vitest";
import { asUser, asSystem, databaseAvailable, seedPresent, DEV, FIXTURE } from "../helpers/db";

let ready = false;

beforeAll(async () => {
  ready = (await databaseAvailable()) && (await seedPresent());
  if (ready) {
    // Dọn dấu vết của lần chạy trước để test lặp lại được (chính nó cũng phải idempotent).
    await asSystem(async (c) => {
      await c.query("delete from attendance.help_requests where student_id = $1", [FIXTURE.studentMinh]);
      await c.query(
        "delete from attendance.checkins where student_id = $1 and occurred_on = current_date",
        [FIXTURE.studentMinh],
      );
    });
  }
});

describe("§9 · mutation gọi hai lần không sinh dòng đôi", () => {
  it("check-in cảm xúc: bấm lại trong ngày chỉ cập nhật, không thêm dòng", async ({ skip }) => {
    if (!ready) return skip();

    const submit = (mood: number) =>
      asUser(DEV.student, async (c) => {
        const r = await c.query<{ id: string }>(
          `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
           values ($1, current_date, 'in', $2, 'present', 'app')
           on conflict (student_id, occurred_on, kind)
           do update set mood = excluded.mood
           returning id`,
          [FIXTURE.studentMinh, mood],
        );
        return r.rows[0]!.id;
      });

    const first = await submit(4);
    const second = await submit(2);

    expect(second).toBe(first); // cùng một dòng, không phải dòng mới

    const { count, mood } = await asSystem(async (c) => {
      const r = await c.query<{ n: string; mood: number }>(
        `select count(*)::text as n, max(mood) as mood
           from attendance.checkins
          where student_id = $1 and occurred_on = current_date and kind = 'in'`,
        [FIXTURE.studentMinh],
      );
      return { count: Number(r.rows[0]!.n), mood: r.rows[0]!.mood };
    });

    expect(count).toBe(1);
    expect(mood).toBe(2); // giá trị lần bấm sau thắng
  });

  it("xin gặp thầy cô: gửi lại trong ngày không tạo yêu cầu thứ hai", async ({ skip }) => {
    if (!ready) return skip();

    const request = (topic: string) =>
      asUser(DEV.student, (c) =>
        c.query(
          `insert into attendance.help_requests (student_id, requested_on, topic, urgency, note)
           values ($1, current_date, $2, 'today', null)
           on conflict (student_id, requested_on)
           do update set topic = excluded.topic, requested_at = now()
           where attendance.help_requests.handled_at is null`,
          [FIXTURE.studentMinh, topic],
        ),
      );

    await request("hoc");
    await request("lop");

    const { count, topic } = await asSystem(async (c) => {
      const r = await c.query<{ n: string; topic: string }>(
        `select count(*)::text as n, max(topic) as topic
           from attendance.help_requests
          where student_id = $1 and requested_on = current_date`,
        [FIXTURE.studentMinh],
      );
      return { count: Number(r.rows[0]!.n), topic: r.rows[0]!.topic };
    });

    expect(count).toBe(1);
    expect(topic).toBe("lop");
  });

  it("xác nhận check-in muộn: bấm hai lần không nhân đôi tác dụng", async ({ skip }) => {
    if (!ready) return skip();

    const checkinId = await asSystem(async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, current_date - 1, 'in', 'queued_late', 'offline_queue')
         on conflict (student_id, occurred_on, kind)
         do update set status = 'queued_late', confirmed_by = null
         returning id`,
        [FIXTURE.studentMinh],
      );
      return r.rows[0]!.id;
    });

    const ack = () =>
      asUser(DEV.gvcn, async (c) => {
        const r = await c.query(
          `update attendance.checkins
              set status = 'present', confirmed_by = core.current_user_id()
            where id = any($1::uuid[]) and status = 'queued_late'`,
          [[checkinId]],
        );
        return r.rowCount ?? 0;
      });

    expect(await ack()).toBe(1);
    expect(await ack()).toBe(0); // lần hai không đổi gì — đúng ý idempotent

    const status = await asSystem(async (c) => {
      const r = await c.query<{ status: string }>(
        "select status from attendance.checkins where id = $1",
        [checkinId],
      );
      return r.rows[0]!.status;
    });
    expect(status).toBe("present");
  });

  it("cổng nhận sự kiện app ngoài: cùng external_id gửi lại không ghi bản ghi đôi", async ({ skip }) => {
    if (!ready) return skip();

    const externalId = "test-idempotency-fixed-id";
    const send = () =>
      asSystem((c) =>
        c.query(
          `insert into staging.raw_embedded_events (source, external_id, payload)
           values ('embed:test', $1, '{"kind":"test"}'::jsonb)
           on conflict (source, external_id) do nothing`,
          [externalId],
        ),
      );

    await asSystem((c) =>
      c.query("delete from staging.raw_embedded_events where external_id = $1", [externalId]),
    );
    await send();
    await send();
    await send();

    const count = await asSystem(async (c) => {
      const r = await c.query<{ n: string }>(
        "select count(*)::text as n from staging.raw_embedded_events where external_id = $1",
        [externalId],
      );
      return Number(r.rows[0]!.n);
    });
    expect(count).toBe(1);

    await asSystem((c) =>
      c.query("delete from staging.raw_embedded_events where external_id = $1", [externalId]),
    );
  });
});
