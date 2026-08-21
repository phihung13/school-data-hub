// tests/db/cong-checkin.test.ts — cổng check-in cảm xúc chặn cửa trang chủ (ADR-036).
//
// Quyết định chủ đầu tư 21/08/2026 ("Chặn thật"): học sinh đăng nhập lần đầu trong
// ngày phải check-in xong mới vào trang chủ. Bài này đo `phaiDungOCheckin` — câu SQL
// mà app/home/page.tsx dùng để quyết có redirect hay không — dưới danh tính THẬT,
// trên Postgres thật, vì cổng đứng trên RLS: đổi một policy là cổng đổi nghĩa mà
// không dòng TypeScript nào thay đổi.
//
// Ba điều cố ý của cổng (đầu server/checkin-gate.ts), mỗi điều một nhóm ca ở đây:
//   1. CHẶN đúng người đúng lúc — em có phiếu, chưa check-in hôm nay.
//   2. THÔI CHẶN ngay khi em làm xong — kể cả bản ghi tới bằng đường PWA/upsert.
//   3. KHÔNG BẪY — em chưa có phiếu đồng ý (0047 không cho ghi mood) thì không chặn;
//      người không phải học sinh hỏi vào cũng không bao giờ bị chặn.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, capPhieuDongY, goPhieuDongY, requireDb, DEV, FIXTURE } from "../helpers/db";
import { phaiDungOCheckin } from "@/server/checkin-gate";

let ready = false;

async function xoaCheckinHomNay() {
  await asSystem((c) =>
    c.query(
      "delete from attendance.checkins where student_id = $1 and occurred_on = current_date",
      [FIXTURE.studentMinh],
    ),
  );
}

describe("cổng check-in cảm xúc ở trang chủ (ADR-036)", () => {
  beforeAll(async () => {
    ready = await requireDb();
    if (!ready) return;
    await capPhieuDongY(FIXTURE.studentMinh);
    await xoaCheckinHomNay();
  });

  afterAll(async () => {
    if (!ready) return;
    await xoaCheckinHomNay();
    // Seed không có phiếu đồng ý nào — trả kho về đúng sự thật đó (cùng lý do đã ghi
    // ở mood-rieng-tu.test.ts).
    await goPhieuDongY(FIXTURE.studentMinh);
  });

  it("em có phiếu + CHƯA check-in hôm nay → phải dừng", async ({ skip }) => {
    if (!ready) return skip();
    expect(await phaiDungOCheckin(DEV.student)).toBe(true);
  });

  it("dòng cô GHI HỘ (điểm danh, không mood) KHÔNG tính là đã check-in — nhịp là của em, không của sổ điểm danh", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, current_date, 'in', 'present', 'teacher')
         on conflict (student_id, occurred_on, kind) do update set mood = null, source = 'teacher'`,
        [FIXTURE.studentMinh],
      ),
    );
    expect(await phaiDungOCheckin(DEV.student)).toBe(true);
  });

  it("em check-in xong (mood có giá trị) → thôi chặn NGAY, kể cả khi bản ghi tới bằng upsert", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, current_date, 'in', 3, 'present', 'app')
         on conflict (student_id, occurred_on, kind) do update set mood = 3, source = 'app'`,
        [FIXTURE.studentMinh],
      ),
    );
    expect(await phaiDungOCheckin(DEV.student)).toBe(false);
  });

  it("em CHƯA CÓ PHIẾU đồng ý → không chặn — 0047 không cho ghi mood, chặn là nhốt em ngoài cửa vĩnh viễn", async ({ skip }) => {
    if (!ready) return skip();
    await xoaCheckinHomNay();
    await goPhieuDongY(FIXTURE.studentMinh);
    try {
      expect(await phaiDungOCheckin(DEV.student)).toBe(false);
    } finally {
      // Trả lại phiếu cho các ca sau (afterAll sẽ gỡ lần cuối).
      await capPhieuDongY(FIXTURE.studentMinh);
    }
  });

  it("giáo viên và phụ huynh không bao giờ bị cổng này hỏi tới", async ({ skip }) => {
    if (!ready) return skip();
    expect(await phaiDungOCheckin(DEV.gvcn)).toBe(false);
    expect(await phaiDungOCheckin(DEV.guardian)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CỔNG CÓ THẬT SỰ CHẠY KHÔNG — đo HÀNH VI của trang, không đo chữ trong file
// ═══════════════════════════════════════════════════════════════════════════
//
// Bốn ca trên chứng minh HÀM trả đúng. Hàm đúng mà không ai gọi thì cổng không tồn
// tại, và cả bốn ca vẫn xanh — đúng bài học `DEBT` #63: hàng rào `DEV_LOGIN_SECRET`
// xây từ 02/08 nhưng CHƯA TỪNG được bật, năm ngày không ai thấy.
//
// Bản đầu của khối này là một bài quét mã nguồn (`tests/unit/…`) hỏi "file trang chủ
// có chứa chữ phaiDungOCheckin và redirect('/checkin') không". Nó bị VỨT ĐI ngay khi
// thử ngược: sửa lời gọi thành `if (false && await phaiDungOCheckin(...))` — cổng tắt
// hoàn toàn — bài vẫn XANH, vì cả hai chuỗi còn nguyên trong file. Một bài canh xanh
// khi hàng rào đã tắt thì tệ hơn không có: nó đọc thành "đã có người canh".
//
// Nên chỗ này gọi thẳng Server Component `HomePage()` với phiên giả và cơ sở dữ liệu
// THẬT. `redirect()` của Next chạy bằng cách NÉM một lỗi mang `digest`, nên "có
// chuyển hướng không" đo được chính xác: bắt lỗi, đọc URL trong digest.
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT ${url}`) as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@hub/core/auth-adapter", () => ({
  resolveIdentity: async () => ({ email: "minh@va.edu.vn", className: "6A1" }),
}));
// Cả HAI hàm trang chủ gọi — thiếu một là `vi.mock` ném "No export is defined",
// và đó chính là cách bài này bắt được lượt thêm `ghimAppDungNhieu` ngày 21/08/2026:
// nó chạy trang THẬT nên mọi phụ thuộc mới của trang đều lộ ra ở đây.
vi.mock("@/server/mini-apps", () => ({
  buildMiniAppsWithEmbedded: async () => [],
  ghimAppDungNhieu: async (tiles: unknown) => tiles,
}));
vi.mock("@/components/home-view", () => ({ HomeView: () => null }));

/** Trang chủ đẩy đi đâu — `null` nghĩa là cho vào, không chuyển hướng. */
async function trangChuDayDiDau(): Promise<string | null> {
  const { default: HomePage } = await import("@/app/home/page");
  try {
    await HomePage();
    return null;
  } catch (err) {
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2] ?? "khong-doc-duoc-url";
    }
    throw err;
  }
}

describe("cổng có THẬT SỰ chạy trên trang chủ không (ADR-036)", () => {
  it("em chưa check-in mở /home → BỊ ĐẨY về /checkin", async ({ skip }) => {
    if (!ready) return skip();
    const { getCurrentSession } = await import("@/lib/session");
    vi.mocked(getCurrentSession).mockResolvedValue({
      authUid: DEV.student,
      roles: ["student"],
      displayName: "Minh",
    } as Awaited<ReturnType<typeof getCurrentSession>>);

    await capPhieuDongY(FIXTURE.studentMinh);
    await xoaCheckinHomNay();
    expect(await trangChuDayDiDau()).toBe("/checkin");
  });

  it("em đã check-in mở /home → VÀO ĐƯỢC, không chuyển hướng", async ({ skip }) => {
    if (!ready) return skip();
    await asSystem((c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
         values ($1, current_date, 'in', 3, 'present', 'app')
         on conflict (student_id, occurred_on, kind) do update set mood = 3`,
        [FIXTURE.studentMinh],
      ),
    );
    expect(await trangChuDayDiDau()).toBeNull();
  });

  it("GVCN mở /home → VÀO ĐƯỢC kể cả khi chính cô chưa check-in gì", async ({ skip }) => {
    if (!ready) return skip();
    const { getCurrentSession } = await import("@/lib/session");
    vi.mocked(getCurrentSession).mockResolvedValue({
      authUid: DEV.gvcn,
      roles: ["homeroom", "teacher"],
      displayName: "Cô Lan",
    } as Awaited<ReturnType<typeof getCurrentSession>>);
    expect(await trangChuDayDiDau()).toBeNull();
  });
});
