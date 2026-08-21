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
// CỔNG CÓ THẬT SỰ CHẠY KHÔNG — và nó KHÔNG còn là chuyển trang nữa
// ═══════════════════════════════════════════════════════════════════════════
//
// Bốn ca trên chứng minh HÀM trả đúng. Hàm đúng mà không ai gọi thì cổng không tồn tại.
//
// ĐỔI HÌNH 21/08/2026 — chủ đầu tư bác bản chuyển trang ngay khi nhìn thấy: *"nếu lúc
// vào bắt checkin thì phải hiện ra popup checkin, xung quanh mờ, ko thoát được, thì nó
// mới là khóa app, chứ vô trang checkin làm gì"*. Cổng nay là một POPUP dựng ở
// `app/layout.tsx` (phủ MỌI trang), không phải một `redirect` ở `/home`.
//
// Hai ca dưới đây vì thế ĐẢO CHIỀU, không bị xoá:
//   · trang chủ KHÔNG còn đẩy đi đâu — nếu nó còn đẩy thì cổng cũ chưa được gỡ, và
//     người dùng ăn cả hai lớp chặn cùng lúc;
//   · trong khi ĐÓ, hàm cổng vẫn nói "phải dừng" — tức lớp chặn đã chuyển chỗ chứ
//     không biến mất. Thiếu vế thứ hai thì bài này xanh cả khi ai đó gỡ luôn cổng.
//
// Hành vi của chính popup (mở/khoá/đường ra) đo ở `tests/unit/cong-checkin.test.ts` —
// nó là logic thuần, không cần Postgres.
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT ${url}`) as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));
// `headers()` của Next chỉ sống trong ngữ cảnh một request, mà bài này gọi thẳng
// `HomePage()`. Mock `next/headers` KHÔNG ăn (vitest coi `next` là gói ngoài), nên lời
// gọi ấy được tách sang một module của mình — xem `server/kho-man-request.ts`.
// `null` = trình duyệt không khai khổ màn, tức nhánh dự phòng (Safari/Firefox).
vi.mock("@/server/kho-man-request", () => ({ docKhoManTuRequest: () => null }));
vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@hub/core/auth-adapter", () => ({
  resolveIdentity: async () => ({ email: "minh@va.edu.vn", className: "6A1" }),
}));
vi.mock("@/server/mini-apps", () => ({
  buildMiniAppsWithEmbedded: async () => [],
  ghimAppDungNhieu: async (tiles: unknown) => tiles,
}));
vi.mock("@/server/lich", () => ({ docLichHomNay: async () => ({ suKien: [], daNoiGoogle: false }) }));
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

describe("cổng đã CHUYỂN CHỖ, không biến mất (ADR-036 bản popup)", () => {
  it("em chưa check-in mở /home → KHÔNG bị đẩy đi đâu nữa", async ({ skip }) => {
    if (!ready) return skip();
    const { getCurrentSession } = await import("@/lib/session");
    vi.mocked(getCurrentSession).mockResolvedValue({
      authUid: DEV.student,
      roles: ["student"],
      displayName: "Minh",
    } as Awaited<ReturnType<typeof getCurrentSession>>);

    await capPhieuDongY(FIXTURE.studentMinh);
    await xoaCheckinHomNay();
    expect(await trangChuDayDiDau()).toBeNull();
  });

  it("NHƯNG hàm cổng vẫn nói phải dừng — lớp chặn chuyển sang popup ở layout gốc", async ({ skip }) => {
    if (!ready) return skip();
    // Vế này là thứ giữ cho ca trên không xanh vì lý do sai. Không có nó, một người gỡ
    // luôn cả cổng sẽ thấy bài test xanh và tưởng mình vừa dọn dẹp.
    expect(await phaiDungOCheckin(DEV.student)).toBe(true);
  });

  it("GVCN mở /home → vào được, và cổng cũng không đòi gì ở cô", async ({ skip }) => {
    if (!ready) return skip();
    const { getCurrentSession } = await import("@/lib/session");
    vi.mocked(getCurrentSession).mockResolvedValue({
      authUid: DEV.gvcn,
      roles: ["homeroom", "teacher"],
      displayName: "Cô Lan",
    } as Awaited<ReturnType<typeof getCurrentSession>>);
    expect(await trangChuDayDiDau()).toBeNull();
    expect(await phaiDungOCheckin(DEV.gvcn)).toBe(false);
  });
});
