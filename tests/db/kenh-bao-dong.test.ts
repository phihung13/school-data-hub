// tests/db/kenh-bao-dong.test.ts
//
// Bài này kiểm ĐƯỜNG THẬT của kênh báo động: `node tools/jobs/run-bao-dong.mjs`,
// chạy như bộ lịch sẽ chạy, trên Postgres thật, ghi ra tệp thật. Không mock tiến
// trình con, không mock hệ tệp — vì thứ hỏng ở gói này chưa bao giờ là thuật toán,
// mà là "bảng có bộ ghi, không có bộ gửi" (nợ #40, đo 01/08/2026: `grep -rn "outbox"
// apps/ tools/ packages/core/src` = 0 hit).
//
// pgTAP (0051_kenh_bao_dong_test.sql) kiểm tầng SQL: ràng buộc, bốn trạng thái, §9 ở
// tầng chỉ mục. Bài này kiểm tầng TIẾN TRÌNH — đúng ba câu hỏi mà SQL không trả lời được:
//
//   1. Chạy hai lượt có ghi hai dòng vào tệp nhật ký không? (§9 xuyên qua tác dụng phụ)
//   2. Bộ gửi HỎNG thì tin có bị đánh dấu "đã gửi" không? (câu quan trọng nhất cả gói)
//   3. Tin chết có NỔI LÊN không, hay nằm im trong hàng đợi?
//
// Câu 2 đã một lần suýt qua mặt tôi: lượt thử ngược đầu tiên (02/08/2026) trỏ
// HUB_ALERT_DIR vào một đường dẫn kiểu POSIX `/tmp/...` trên Windows — Node lại tạo
// được thư mục đó thật, nên "bộ gửi hỏng" hoá ra là "bộ gửi chạy tốt ở chỗ khác" và
// bài thử báo xanh. Bài dưới đây phá bằng cách đặt MỘT TỆP đúng chỗ thư mục cần tạo,
// rồi khẳng định luôn cả nội dung câu lỗi — một phép thử ngược không tự chứng minh
// được là mình có phá thật thì không phải phép thử ngược.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asSystem, databaseAvailable } from "../helpers/db";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = resolve(REPO_ROOT, "tools", "jobs", "run-bao-dong.mjs");

/** Tiền tố riêng cho mọi dòng bài này tạo ra — để dọn sạch không chạm dữ liệu của bài khác. */
const TIEN_TO = "test_kbd:";

let ready = false;
let goc = ""; // thư mục tạm, KHÔNG phải var/ của repo

type KetQua = { ma: number; out: string };

function chay(doiSo: string[], moiTruong: Record<string, string> = {}): Promise<KetQua> {
  return new Promise((xong) => {
    const con = spawn(process.execPath, [RUNNER, ...doiSo], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...moiTruong },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    con.stdout.on("data", (d) => (out += d));
    con.stderr.on("data", (d) => (out += d));
    con.on("error", (err) => xong({ ma: -1, out: `${out}\n${err.message}` }));
    con.on("close", (ma) => xong({ ma: ma === null ? -1 : ma, out }));
  });
}

/** Đọc toàn bộ tệp nhật ký trong một thư mục và đếm số khối tin. */
function docNhatKy(thuMuc: string): string {
  let tat = "";
  let ten: string[] = [];
  try {
    ten = readdirSync(thuMuc);
  } catch {
    return "";
  }
  for (const t of ten.filter((x) => x.endsWith(".log"))) {
    tat += readFileSync(join(thuMuc, t), "utf8");
  }
  return tat;
}

function demKhoi(noiDung: string, dedupKey: string): number {
  return noiDung.split("\n").filter((d) => d.includes(`Mã tin    : ${dedupKey}`)).length;
}

async function themTin(dedupKey: string, channel = "nguoi_truc", tieuDe = "tin thử") {
  return asSystem(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `insert into ops.outbox_messages (channel, dedup_key, payload)
            values ($1, $2, jsonb_build_object('tieu_de', $3::text, 'muc_do', 'thuong'))
         returning id`,
      [channel, dedupKey, tieuDe],
    );
    return rows[0]?.id ?? "";
  });
}

async function docTin(dedupKey: string) {
  return asSystem(async (c) => {
    const { rows } = await c.query<{
      status: string;
      chua_gui: boolean;
      attempts: number;
      last_error: string | null;
    }>(
      `select status, sent_at is null as chua_gui, attempts, last_error
         from ops.outbox_messages where dedup_key = $1`,
      [dedupKey],
    );
    return rows[0] ?? null;
  });
}

async function donSach() {
  await asSystem(async (c) => {
    await c.query(
      `delete from ops.alert_deliveries
        where message_id in (select id from ops.outbox_messages where dedup_key like $1)`,
      [`${TIEN_TO}%`],
    );
    await c.query("delete from ops.outbox_messages where dedup_key like $1", [`${TIEN_TO}%`]);
    // Dòng lịch sử chạy máy do chính bài test tạo ra phải biến mất cùng bài test —
    // để lại là bịa ra lịch sử chạy máy trên một database dùng chung (nợ #41).
    await c.query("delete from ops.job_runs where job_name = 'kenh_bao_dong'");
    // Dòng lịch thử của bài "job vừa khai thì IM" — xoá lại lần nữa phòng khi bài đó
    // chết giữa chừng: một dòng lịch trỏ vào hư không sẽ làm run-all.mjs đỏ mãi.
    await c.query("delete from ops.job_schedule where job_name = 'thu_bao_dong_chua_chay'");
    await c.query("update ops.alert_channels set enabled = true where channel_id = 'tep_nhat_ky'");
  });
}

beforeAll(async () => {
  ready = await databaseAvailable();
  if (!ready) return;
  goc = mkdtempSync(join(tmpdir(), "hub-bao-dong-"));
  await donSach();
});

afterAll(async () => {
  if (!ready) return;
  await donSach();
  if (goc) rmSync(goc, { recursive: true, force: true });
});

describe("kênh báo động — bộ gửi thật, không phải bộ gửi giả", () => {
  it("gửi được một tin và ghi ra tệp nhật ký đọc được bằng mắt người", async ({ skip }) => {
    if (!ready) return skip();
    const thuMuc = join(goc, "gui-duoc");
    const key = `${TIEN_TO}gui-duoc`;
    await themTin(key, "nguoi_truc", "Bộ quét cờ đêm QUÁ HẠN");

    const kq = await chay(["--chi-gui"], { HUB_ALERT_DIR: thuMuc });
    expect(kq.ma, kq.out).toBe(0);

    const tin = await docTin(key);
    expect(tin?.status).toBe("da_gui");
    expect(tin?.chua_gui).toBe(false); // sent_at đã có — ràng buộc CHECK không cho tách rời

    // Tệp phải đọc được bởi một giáo viên, không phải bởi một dev: có tiêu đề bằng
    // tiếng Việt và có mã tin để đối chiếu với sổ trực.
    const noiDung = docNhatKy(thuMuc);
    expect(noiDung).toContain("Bộ quét cờ đêm QUÁ HẠN");
    expect(demKhoi(noiDung, key)).toBe(1);
  });

  it("§9 — chạy lượt thứ hai KHÔNG ghi thêm dòng nào vào tệp và không ghi thêm bản gửi", async ({ skip }) => {
    if (!ready) return skip();
    const thuMuc = join(goc, "gui-duoc"); // cùng thư mục với bài trên, cố ý
    const key = `${TIEN_TO}gui-duoc`;

    const kq = await chay(["--chi-gui"], { HUB_ALERT_DIR: thuMuc });
    expect(kq.ma, kq.out).toBe(0);

    expect(demKhoi(docNhatKy(thuMuc), key)).toBe(1);

    const soBanGui = await asSystem(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `select count(*) as n from ops.alert_deliveries d
           join ops.outbox_messages m on m.id = d.message_id
          where m.dedup_key = $1 and d.status = 'da_gui'`,
        [key],
      );
      return Number(rows[0]?.n ?? 0);
    });
    expect(soBanGui).toBe(1);
  });

  it("bộ gửi HỎNG thì tin KHÔNG được đánh dấu đã gửi, và lý do được ghi nguyên văn", async ({ skip }) => {
    if (!ready) return skip();
    // Phá thật: đặt MỘT TỆP đúng chỗ adapter cần tạo thư mục ⇒ mkdir ném ENOTDIR.
    // (Lượt thử ngược đầu tiên dùng một đường dẫn POSIX trên Windows và Node tạo
    //  được thư mục đó thật — bài thử báo xanh trong khi không phá được gì.)
    const chan = join(goc, "chan-duong");
    mkdirSync(goc, { recursive: true });
    writeFileSync(chan, "tôi là một TỆP, không phải thư mục", "utf8");
    const thuMuc = join(chan, "ben-trong");

    const key = `${TIEN_TO}bo-gui-hong`;
    await themTin(key);

    const kq = await chay(["--chi-gui"], { HUB_ALERT_DIR: thuMuc });
    // Mã thoát VẪN là 0: bộ gửi chạy trọn vẹn, chỉ là kênh hỏng. Trộn hai thứ vào
    // một con số làm người trực không phân biệt được "bộ gửi hỏng" với "bộ gửi chạy
    // tốt và tìm ra việc" — 0041 đã tách sẵn hai đường đó, dùng lại chứ không dựng mới.
    expect(kq.ma, kq.out).toBe(0);

    const tin = await docTin(key);
    expect(tin?.status).toBe("gui_hong");
    expect(tin?.chua_gui).toBe(true); // KHÔNG có sent_at — đây là câu quan trọng nhất cả bài
    expect(tin?.attempts).toBe(1);
    // Lý do phải là lý do THẬT, không phải "gửi hỏng". Không có nó thì người trực
    // đọc xong vẫn không biết đi sửa cái gì.
    expect(tin?.last_error ?? "").toMatch(/ENOTDIR|not a directory/i);
  });

  it("không còn kênh nào đang bật ⇒ khong_co_kenh, TUYỆT ĐỐI không phải đã gửi", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query("update ops.alert_channels set enabled = false where channel_id = 'tep_nhat_ky'"),
    );

    const key = `${TIEN_TO}khong-co-kenh`;
    await themTin(key);
    const kq = await chay(["--chi-gui"], { HUB_ALERT_DIR: join(goc, "khong-dung-toi") });
    expect(kq.ma, kq.out).toBe(0);

    const tin = await docTin(key);
    expect(tin?.status).toBe("khong_co_kenh");
    expect(tin?.chua_gui).toBe(true);
    // Không có kênh KHÔNG phải là một lượt thử hỏng: đốt lượt ở đây thì sau 5 lượt
    // quét tin rơi sang het_luot mang theo một lý do SAI.
    expect(tin?.attempts).toBe(0);

    // Và nó phải MẮC KẸT nhìn thấy được: nguoi_truc đã khai kênh, nên "không có kênh"
    // ở đây nghĩa là có người vừa tắt một đường báo động.
    const macKet = await asSystem(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        "select count(*) as n from ops.v_bao_dong_ton where dedup_key = $1",
        [key],
      );
      return Number(rows[0]?.n ?? 0);
    });
    expect(macKet).toBe(1);

    await asSystem((c) =>
      c.query("update ops.alert_channels set enabled = true where channel_id = 'tep_nhat_ky'"),
    );
  });

  it("hết lượt thử ⇒ het_luot, NỔI LÊN ở sổ tồn và ở findings của job", async ({ skip }) => {
    if (!ready) return skip();
    const chan = join(goc, "chan-duong-2");
    writeFileSync(chan, "tệp chặn đường ghi", "utf8");
    const thuMuc = join(chan, "ben-trong");

    const key = `${TIEN_TO}het-luot`;
    await themTin(key);

    // 5 lượt = max_attempts mặc định. Giữa các lượt phải kéo next_attempt_at về hiện
    // tại: giãn dần là hành vi ĐÚNG của bộ gửi, ở đây chỉ tua nhanh đồng hồ.
    for (let i = 0; i < 5; i++) {
      await asSystem((c) =>
        c.query("update ops.outbox_messages set next_attempt_at = now() where dedup_key = $1", [key]),
      );
      const kq = await chay(["--chi-gui"], { HUB_ALERT_DIR: thuMuc });
      expect(kq.ma, kq.out).toBe(0);
    }

    const tin = await docTin(key);
    expect(tin?.status).toBe("het_luot");
    expect(tin?.chua_gui).toBe(true);

    const ton = await asSystem(async (c) => {
      const { rows } = await c.query<{ vi_sao_mac_ket: string }>(
        "select vi_sao_mac_ket from ops.v_bao_dong_ton where dedup_key = $1",
        [key],
      );
      return rows[0] ?? null;
    });
    expect(ton?.vi_sao_mac_ket).toContain("bỏ cuộc");

    // Đường để tin chết TỰ TỐ CÁO mình: findings > 0 ⇒ ops.v_job_health bật
    // needs_attention. Dùng lại đúng đường 0041 đã mở, không dựng cơ chế thứ hai.
    const kqDay = await chay([], { HUB_ALERT_DIR: join(goc, "lan-cuoi") });
    expect(kqDay.ma, kqDay.out).toBe(0);

    const sucKhoe = await asSystem(async (c) => {
      const { rows } = await c.query<{ needs_attention: boolean; last_findings: number }>(
        "select needs_attention, last_findings from ops.v_job_health where job_name = 'kenh_bao_dong'",
      );
      return rows[0] ?? null;
    });
    expect(sucKhoe?.last_findings).toBeGreaterThan(0);
    expect(sucKhoe?.needs_attention).toBe(true);
  });

  it("sinh tin từ sức khoẻ job: job vừa khai thì IM, job quá hạn thật thì KÊU", async ({ skip }) => {
    if (!ready) return skip();

    // Dựng MỘT dòng lịch của riêng bài này thay vì mượn tình trạng của job thật.
    // Lượt đo 02/08/2026 dạy đúng chỗ này: bài cũ khẳng định `flag_engine` phải có
    // tin, và nó XANH khi chạy một mình nhưng ĐỎ trong cả bộ — vì `job-schedule.test.ts`
    // chạy trước đã gọi flag_engine thành công, nên nó hết cần chú ý. Một bài test đọc
    // kết quả của bài chạy trước là một bài test không kiểm gì cả.
    //
    // kind='sql' và không có runner: bài này chỉ gọi `--chi-sinh` (đọc view rồi ghi tin),
    // không lượt nào gọi bộ chạy. Dòng bị xoá ngay trong bài, và donSach() xoá lại lần nữa.
    const JOB_THU = "thu_bao_dong_chua_chay";
    await asSystem((c) =>
      c.query(
        `insert into ops.job_schedule (job_name, label, kind, expected_every, grace, updated_at)
              values ($1, 'Job thử của tests/db/kenh-bao-dong', 'sql',
                      interval '1 day', interval '1 hour', now())
         on conflict (job_name) do update set updated_at = now(), enabled = true`,
        [JOB_THU],
      ),
    );

    async function demTin(): Promise<number> {
      return asSystem(async (c) => {
        const { rows } = await c.query<{ n: string }>(
          "select count(*) as n from ops.outbox_messages where dedup_key like $1",
          [`bao_dong:job:${JOB_THU}:%`],
        );
        return Number(rows[0]?.n ?? 0);
      });
    }

    try {
      // ── Vòng 1: vừa khai xong. "Chưa chạy lần nào" lúc này là ĐÚNG, không phải
      // sự cố. Không có cổng chặn thì mỗi migration khai job mới lại đẻ ra một tin
      // báo động ngay trong lúc chạy migration.
      const v1 = await chay(["--chi-sinh"]);
      expect(v1.ma, v1.out).toBe(0);
      expect(await demTin()).toBe(0);

      // ── Vòng 2: cùng tình trạng, chỉ khác là đã khai từ 30 ngày trước. Bây giờ
      // "chưa chạy lần nào" là một sự cố thật và phải có tin.
      await asSystem((c) =>
        c.query("update ops.job_schedule set updated_at = now() - interval '30 days' where job_name = $1", [
          JOB_THU,
        ]),
      );
      const v2 = await chay(["--chi-sinh"]);
      expect(v2.ma, v2.out).toBe(0);
      expect(await demTin()).toBe(1);

      // ── §9: gọi lại trong cùng ngày không đẻ thêm tin nào.
      const v3 = await chay(["--chi-sinh"]);
      expect(v3.ma, v3.out).toBe(0);
      expect(await demTin()).toBe(1);
    } finally {
      await asSystem(async (c) => {
        await c.query(
          `delete from ops.alert_deliveries
            where message_id in (select id from ops.outbox_messages where dedup_key like $1)`,
          [`bao_dong:job:${JOB_THU}:%`],
        );
        await c.query("delete from ops.outbox_messages where dedup_key like $1", [
          `bao_dong:job:${JOB_THU}:%`,
        ]);
        await c.query("delete from ops.job_schedule where job_name = $1", [JOB_THU]);
      });
    }
  });

  it("mức KHẨN dành riêng cho bộ quét cờ đêm (ADR-026)", async ({ skip }) => {
    if (!ready) return skip();

    // Tắt flag_engine ⇒ state 'tat' ⇒ needs_attention (0041 cố ý coi "tắt một thứ
    // đang bảo vệ trẻ con" là chuyện phải kêu). Cách này không phụ thuộc lịch sử chạy
    // của bài nào khác, nên kết quả tất định dù bài này đứng ở đâu trong bộ.
    await asSystem(async (c) => {
      await c.query("update ops.job_schedule set enabled = false where job_name = 'flag_engine'");
      await c.query("delete from ops.outbox_messages where dedup_key like 'bao_dong:job:flag_engine:%'");
    });

    try {
      const kq = await chay(["--chi-sinh"]);
      expect(kq.ma, kq.out).toBe(0);

      const tin = await asSystem(async (c) => {
        const { rows } = await c.query<{ muc_do: string; tieu_de: string }>(
          `select payload ->> 'muc_do' as muc_do, payload ->> 'tieu_de' as tieu_de
             from ops.outbox_messages
            where dedup_key like 'bao_dong:job:flag_engine:%'
            order by id desc limit 1`,
        );
        return rows[0] ?? null;
      });
      expect(tin).not.toBeNull();
      // ADR-026: buồng lái GVCN phụ thuộc HOÀN TOÀN vào lượt quét đêm để có cờ cảm
      // xúc. Bộ quét ngủ một đêm là cô giáo mất khả năng phát hiện sớm mà không tự
      // biết — nên riêng job này mang mức KHẨN, không nằm chung với các job khác.
      expect(tin?.muc_do).toBe("khan");
    } finally {
      await asSystem(async (c) => {
        await c.query("update ops.job_schedule set enabled = true where job_name = 'flag_engine'");
        await c.query(
          `delete from ops.alert_deliveries
            where message_id in (select id from ops.outbox_messages
                                  where dedup_key like 'bao_dong:job:flag_engine:%')`,
        );
        await c.query(
          "delete from ops.outbox_messages where dedup_key like 'bao_dong:job:flag_engine:%'",
        );
      });
    }
  });
});
