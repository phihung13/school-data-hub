// tests/db/dieu-khoan.test.ts — màn điều khoản kèm nút đồng ý (migration 0046, ADR-027).
//
// Vì sao có file này BÊN CẠNH bài pgTAP `0046_dieu_khoan_test.sql`: pgTAP chứng minh HÀM
// SQL đúng; file này chứng minh ĐƯỜNG MÀ NGƯỜI DÙNG THẬT ĐI — procedure tRPC, và tầng
// dựng phiên (`resolveIdentity`) mà mọi cửa đăng nhập đều gọi. Lời hứa của gói việc này
// nằm đúng ở chỗ nối giữa hai tầng đó, nên chỉ test một tầng là tự lừa mình.
//
// BA CÂU HỎI, và câu thứ ba mới là câu file này tồn tại vì nó:
//
//   1. §9 — bấm hai lần có sinh hai phiếu đồng ý không?
//   2. CHẶN CÓ THẬT KHÔNG — hay chỉ là một redirect ở giao diện? Bài dưới đây KHÔNG mở
//      một trang nào: nó gọi THẲNG procedure tRPC bằng phiên của em, đúng cách một người
//      giữ cookie sẽ làm. Chặn thật thì đường đó cũng phải đóng.
//   3. CÓ CHẶN NHẦM ĐỨA TRẺ KHÔNG — em còn bấm được "Mình cần gặp thầy cô" không? Một chốt
//      chặn chặn luôn cả đứa trẻ thì đó không phải bảo vệ, đó là bỏ rơi. Test này là test
//      bảo vệ trẻ, đừng bỏ.
//
// SỬA LỚN 01/08/2026 (migration 0047, ADR-027 bản 2). Câu 3 ở bản đầu hỏi CHƯA ĐỦ SÂU: nó
// chỉ kiểm rằng cô còn ghi hộ được, và nhận câu trả lời "còn" nên báo xanh. Nhưng đường ghi
// hộ là đường của NGƯỜI KHÁC — nó đòi đứa trẻ mở lời trực tiếp với một người lớn trước, mà
// cái nút trong máy tồn tại chính vì có những đứa trẻ không làm được điều đó. Đo đầu-cuối
// hôm nay: phụ huynh bấm "rút lại" → `core.users.status='pending'` → `core.current_user_id()`
// trả NULL → CHÍNH EM không ghi được `attendance.help_requests` nữa. Bản đầu của file này
// còn KHẲNG ĐỊNH điều đó là đúng (`expect(accountStatus).toBe("pending")`).
//
// Nay hai ca đó bị LẬT, và thêm ca chưa từng có ai kiểm: sau khi bố mẹ rút lại, CHÍNH EM
// gọi `checkin.requestHelp` qua đúng đường tRPC và lời nhắn phải vào sổ.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, requireDb, DEV, FIXTURE } from "../helpers/db";
import { resolveIdentity } from "@hub/core/auth-adapter";
import { consentRouter } from "@/server/routers/consent";
import { checkinRouter } from "@/server/routers/checkin";
import type { TrpcContext } from "@/server/trpc";

let ready = false;

function ctxFor(authUid: string | null): TrpcContext {
  return { authUid, roles: [], displayName: null, clientIp: null };
}

const guardian = () => consentRouter.createCaller(ctxFor(DEV.guardian));
const studentConsent = () => consentRouter.createCaller(ctxFor(DEV.student));
const studentCheckin = () => checkinRouter.createCaller(ctxFor(DEV.student));

/** Ngày lùi xa để không giẫm lên dữ liệu seed (ràng buộc duy nhất theo (student, ngày)). */
const NGAY_RIENG = "current_date - 60";

async function termsVersionId(): Promise<string> {
  const { rows } = await asSystem((c) =>
    c.query<{ id: string }>(
      "select id from core.terms_versions where published_at is not null order by version desc limit 1",
    ),
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Chưa có bản điều khoản nào được công bố — migration 0046 đã chạy chưa?");
  return id;
}

async function statusCuaMinh(): Promise<string> {
  const { rows } = await asSystem((c) =>
    c.query<{ status: string }>(
      "select u.status from core.users u join core.students s on s.user_id = u.id where s.id = $1",
      [FIXTURE.studentMinh],
    ),
  );
  return rows[0]?.status ?? "no_account";
}

async function soPhieuCuaMinh(): Promise<number> {
  const { rows } = await asSystem((c) =>
    c.query<{ n: string }>("select count(*)::text as n from core.consent_records where student_id = $1", [
      FIXTURE.studentMinh,
    ]),
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Trả CSDL dev về đúng trạng thái trước khi chạy bài. Bắt buộc phải sạch: `core.users`
 * của Minh là tài khoản mà mọi bài test khác (và người dev đang mở trình duyệt) dùng —
 * để lại nó ở 'pending' là làm hỏng phiên làm việc của người khác chứ không chỉ hỏng test.
 */
async function cleanup(): Promise<void> {
  await asSystem(async (c) => {
    // Sổ đồng ý chặn DELETE bằng trigger (0046). Đây là dữ liệu RÁC do chính test sinh
    // ra, nên dùng đúng cửa thoát hiểm đã khai báo tường minh — cùng khuôn
    // `hub.allow_user_hard_delete` mà tests/db/ma-moi.test.ts dùng cho core.users.
    await c.query("set local hub.allow_consent_rewrite = 'on'");
    await c.query("delete from core.consent_records where student_id = $1", [FIXTURE.studentMinh]);
    await c.query(
      `update core.users set status = 'active'
        where id = (select user_id from core.students where id = $1) and status = 'pending'`,
      [FIXTURE.studentMinh],
    );
    await c.query(
      `delete from attendance.checkins where student_id = $1 and occurred_on in (${NGAY_RIENG}, current_date)`,
      [FIXTURE.studentMinh],
    );
    // `current_date` cũng phải dọn: từ 0047 bài này gọi THẲNG `checkin.submitMood` và
    // `checkin.requestHelp` của chính em (đó là điểm mấu chốt của cả file), nên nó để lại
    // dòng của HÔM NAY trong hub_dev — dòng mà buồng lái GVCN sẽ vẽ ra thật.
    await c.query(
      `delete from attendance.help_requests where student_id = $1 and requested_on in (${NGAY_RIENG}, current_date)`,
      [FIXTURE.studentMinh],
    );
  });
}

beforeAll(async () => {
  ready = await requireDb();
  if (ready) await cleanup();
});

afterAll(async () => {
  if (ready) await cleanup();
});

describe("Điều khoản & đồng ý · đường tRPC thật (ADR-027)", () => {
  it("§9 — bấm hai lần chỉ sinh MỘT phiếu đồng ý", async ({ skip }) => {
    if (!ready) return skip();
    const versionId = await termsVersionId();

    const lan1 = await guardian().decide({
      studentIds: [FIXTURE.studentMinh],
      termsVersionId: versionId,
      decision: "granted",
    });
    const lan2 = await guardian().decide({
      studentIds: [FIXTURE.studentMinh],
      termsVersionId: versionId,
      decision: "granted",
    });

    expect(lan1.results[0]?.created).toBe(true);
    expect(lan2.results[0]?.created).toBe(false);
    // Cùng một phiếu, không phải hai phiếu nói cùng một chuyện với hai mốc thời gian.
    expect(lan2.results[0]?.consentId).toBe(lan1.results[0]?.consentId);
    expect(await soPhieuCuaMinh()).toBe(1);
    expect(lan2.needsAction).toBe(false);
  });

  it("cổng đọc đúng trạng thái: bản điều khoản có nội dung, con hết việc phải làm", async ({ skip }) => {
    if (!ready) return skip();
    const gate = await guardian().getGate();

    expect(gate.terms).not.toBeNull();
    // Nội dung đọc từ CSDL, không viết chết trong tsx — nếu rỗng thì màn hình có nút bấm
    // mà không có gì để đọc, tức là một chữ ký vào khoảng trắng.
    expect((gate.terms?.bodyMd.length ?? 0)).toBeGreaterThan(200);
    expect(gate.terms?.contentHash).toMatch(/^[0-9a-f]{64}$/);

    const minh = gate.children.find((c) => c.studentId === FIXTURE.studentMinh);
    expect(minh, "phụ huynh của Minh phải thấy Minh trong danh sách con").toBeTruthy();
    expect(minh?.decision).toBe("granted");
    expect(minh?.needsAction).toBe(false);
    expect(minh?.accountStatus).toBe("active");
    // Cổng phải nói được thứ cú bấm ĐIỀU KHIỂN, không chỉ thứ nó không điều khiển (0047).
    expect(minh?.moodEnabled).toBe(true);
  });

  it("người không phải phụ huynh nhận FORBIDDEN kèm câu tiếng Việt, KHÔNG nhận danh sách rỗng", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Rỗng đọc y hệt "bạn không có con nào cần bấm" — một câu nói dối im lặng.
    await expect(studentConsent().getGate()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rút lại đồng ý CẮT ĐÚNG việc ghi tâm trạng — và KHÔNG cắt gì khác", async ({ skip }) => {
    if (!ready) return skip();
    const versionId = await termsVersionId();

    // Trước khi rút: tài khoản của em dựng được phiên bình thường.
    expect(await resolveIdentity(DEV.student)).not.toBeNull();

    const res = await guardian().decide({
      studentIds: [FIXTURE.studentMinh],
      termsVersionId: versionId,
      decision: "withdrawn",
    });
    // LẬT so với bản đầu (bản đầu đòi 'pending' — tức đòi hệ tắt danh tính của đứa trẻ).
    expect(res.results[0]?.accountStatus).toBe("active");
    expect(res.results[0]?.moodEnabled).toBe(false);
    expect(await statusCuaMinh()).toBe("active");

    // (a) Tầng dựng phiên KHÔNG bị đụng tới: em vẫn đăng nhập được như thường.
    expect(await resolveIdentity(DEV.student)).not.toBeNull();

    // (b) Màn của em vẫn mở. Trước 0047 câu này ném FORBIDDEN — tức phụ huynh bấm một nút
    //     là em mất luôn màn xem chuyên cần của chính mình.
    await expect(studentCheckin().getAttendanceOverview()).resolves.toBeTruthy();

    // (c) Cái BỊ CẮT, đúng một thứ: mức tâm trạng. Procedure KHÔNG ném lỗi — lượt điểm
    //     danh vẫn ghi — nhưng nó nói thẳng là mức tâm trạng không vào kho, để màn hình
    //     đừng ăn mừng một giá trị không tồn tại.
    const bam = await studentCheckin().submitMood({ mood: 4, wantsHelp: false });
    expect(bam.moodSaved).toBe(false);
    expect(bam.moodBlockedReason).toBe("chua_co_phieu_dong_y");
    const moodTrongKho = await asSystem((c) =>
      c.query<{ mood: number | null }>(
        "select mood from attendance.checkins where student_id = $1 and occurred_on = current_date and kind = 'in'",
        [FIXTURE.studentMinh],
      ),
    );
    expect(moodTrongKho.rows[0]?.mood ?? null).toBeNull();

    // Lịch sử giữ nguyên: rút lại là ghi thêm dòng, không sửa dòng cũ.
    expect(await soPhieuCuaMinh()).toBe(2);
  });

  it("TEST BẢO VỆ TRẺ — sau khi bố mẹ RÚT LẠI, chính em vẫn bấm được 'Mình cần gặp thầy cô'", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // Tiếp ngay sau bài trên: phiếu của Minh đang ở trạng thái 'withdrawn'.
    expect(await statusCuaMinh()).toBe("active");

    // ĐÂY LÀ ASSERTION QUAN TRỌNG NHẤT CỦA CẢ FILE. Không phải cô ghi hộ — CHÍNH EM, qua
    // đúng procedure mà nút trên màn hình gọi, ngay sau thao tác của người lớn.
    const gui = await studentCheckin().requestHelp({
      topic: "nha",
      urgency: "urgent",
      note: "Con muốn gặp cô",
    });
    expect(gui.delivered, "em phải gửi được lời nhắn, không phải 'ok' rỗng").toBe(true);

    const daVaoSo = await asSystem((c) =>
      c.query<{ source: string }>(
        "select source from attendance.help_requests where student_id = $1 and requested_on = current_date",
        [FIXTURE.studentMinh],
      ),
    );
    expect(daVaoSo.rows[0]?.source, "lời của em vào sổ đúng nhãn 'self'").toBe("self");

    // Và em đọc lại được trạng thái lời nhắn của mình — màn /can-gap-thay-co không trắng.
    const cuaEm = await studentCheckin().getMyHelpRequests();
    expect(cuaEm.requests.length).toBeGreaterThan(0);

    // (a) Cô vẫn ghi nhận em có mặt. Nghĩa vụ trông giữ trẻ của trường không đứng sau
    //     cái nút của bố mẹ.
    await asUser(DEV.gvcn, (c) =>
      c.query(
        `insert into attendance.checkins (student_id, occurred_on, kind, status, source)
         values ($1, ${NGAY_RIENG}, 'in', 'present', 'teacher')`,
        [FIXTURE.studentMinh],
      ),
    );

    // (b) Kênh "cần gặp thầy cô" còn đường vào: cô ghi hộ.
    await asUser(DEV.gvcn, (c) =>
      c.query(
        `insert into attendance.help_requests (student_id, requested_on, topic, urgency, source, created_by)
         values ($1, ${NGAY_RIENG}, 'nha', 'today', 'staff', core.current_user_id())`,
        [FIXTURE.studentMinh],
      ),
    );

    const { rows } = await asSystem((c) =>
      c.query<{ source: string; created_by: string | null }>(
        `select source, created_by from attendance.help_requests
          where student_id = $1 and requested_on = ${NGAY_RIENG}`,
        [FIXTURE.studentMinh],
      ),
    );
    expect(rows[0]?.source).toBe("staff");
    // Ghi hộ mà không có tên người ghi thì không ai chịu trách nhiệm cho lời nhắn đó.
    expect(rows[0]?.created_by).not.toBeNull();
  });

  it("đồng ý lại sau khi rút: bật lại phần tâm trạng, và lịch sử vẫn còn đủ ba dòng", async ({ skip }) => {
    if (!ready) return skip();
    const versionId = await termsVersionId();

    const res = await guardian().decide({
      studentIds: [FIXTURE.studentMinh],
      termsVersionId: versionId,
      decision: "granted",
    });
    expect(res.results[0]?.moodEnabled).toBe(true);
    expect(res.results[0]?.accountStatus).toBe("active");
    expect(await resolveIdentity(DEV.student)).not.toBeNull();
    // Ghi được thật, không chỉ là một cờ trả về: cùng câu lệnh vừa bị từ chối ở bài trên.
    const bam = await studentCheckin().submitMood({ mood: 3, wantsHelp: false });
    expect(bam.moodSaved).toBe(true);
    // granted → withdrawn → granted: ba dòng, không dòng nào bị ghi đè.
    expect(await soPhieuCuaMinh()).toBe(3);
  });

  it("bấm cho con nhà khác bị từ chối ở tầng DB, không phải ở tầng giao diện", async ({ skip }) => {
    if (!ready) return skip();
    const versionId = await termsVersionId();
    await expect(
      guardian().decide({
        studentIds: [FIXTURE.studentBinh], // Bình — không phải con của tài khoản này
        termsVersionId: versionId,
        decision: "granted",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
