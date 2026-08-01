// apps/hub/server/routers/consent.ts — router `consent` (màn điều khoản, 0046/ADR-027).
//
// Router này CỐ Ý không tự quyết định gì. Nó đọc `core.my_consent_status()` và gọi
// `core.record_consent()`; mọi phán quyết — bản nào đang bắt buộc, phiếu cũ còn hiệu
// lực không, tài khoản của con bật hay chờ — nằm trong SQL.
//
// Vì sao đặt hàng rào ở dưới chứ không ở đây: nếu logic hiệu lực nằm ở tầng này thì một
// procedure khác viết sau, hoặc một lời gọi thẳng /api/trpc, đi vòng qua được — mà thứ đi
// vòng qua ở đây là lời hứa hiệu trưởng đã ký.
//
// CHỐT CHẶN THẬT NẰM Ở ĐÂU (đổi ở 0047, ADR-027 bản 2 — đọc kỹ trước khi sửa file này):
// KHÔNG còn là `core.users.status='pending'`. Cách đó tắt DANH TÍNH của đứa trẻ, mà danh
// tính là thứ mọi quyền bám vào — kể cả `help_requests_insert_self`, đường duy nhất để
// chính em bấm "Mình cần gặp thầy cô". Đo được đầu-cuối 01/08/2026: phụ huynh rút lại
// đồng ý là em mất luôn nút kêu cứu. Nay cổng nằm ở RLS của `attendance.checkins`
// (`mood is null or core.has_student_consent(...)`): phiếu đồng ý gác việc XỬ LÝ DỮ LIỆU,
// không gác đứa trẻ.
import { TRPCError } from "@trpc/server";
import {
  ConsentGateOutput,
  RecordConsentInput,
  RecordConsentOutput,
  StudentAccountStatus,
  type ConsentChildStatus,
  type ConsentDecision,
} from "@hub/core/contracts";
import type { PoolClient } from "@hub/core/db";
import { roleProcedure, router } from "../trpc";

/** Một dòng của `core.my_consent_status()` — tên cột giữ nguyên như SQL trả về. */
interface ConsentStatusRow {
  student_id: string;
  student_code: string;
  student_name: string;
  decision: ConsentDecision | null;
  decided_at: string | null;
  terms_version: number | null;
  required_version: number;
  needs_action: boolean;
  account_status: string;
  mood_enabled: boolean;
}

async function readChildren(client: PoolClient): Promise<ConsentChildStatus[]> {
  const { rows } = await client.query<ConsentStatusRow>("select * from core.my_consent_status()");
  return rows.map((r) => ({
    studentId: r.student_id,
    studentCode: r.student_code,
    studentName: r.student_name,
    decision: r.decision,
    decidedAt: r.decided_at,
    termsVersion: r.terms_version,
    requiredVersion: r.required_version,
    needsAction: r.needs_action,
    // Hàm SQL trả 'no_account' cho em chưa có tài khoản (coalesce ở 0046). Parse qua
    // Zod thay vì ép kiểu: nếu ngày nào đó CHECK của core.users thêm giá trị thứ tư mà
    // hợp đồng không biết, ta muốn một lỗi ồn ào ở đây chứ không phải một nhãn trống
    // trên màn hình phụ huynh.
    accountStatus: StudentAccountStatus.parse(r.account_status),
    // Thứ cú bấm của bố mẹ THẬT SỰ điều khiển (0047). Đọc từ SQL chứ không suy từ
    // `needsAction`: nhà hai người đại diện, người kia đã bấm thì phần này đang bật.
    moodEnabled: r.mood_enabled,
  }));
}

export const consentRouter = router({
  /**
   * Bản điều khoản đang trình + trạng thái từng đứa con của người đang đăng nhập.
   *
   * `roleProcedure("guardian")` chứ không phải `protectedProcedure`: vai đọc từ
   * `core.v_my_scopes` (bảng phân quyền thật), không đọc từ JWT — token sống 15 phút
   * nên một tài khoản vừa bị thu vai vẫn cầm token ghi vai cũ.
   *
   * Người không phải phụ huynh nhận FORBIDDEN kèm câu tiếng Việt, KHÔNG nhận danh sách
   * rỗng: rỗng đọc y hệt "bạn không có con nào cần bấm" và đó là một câu nói dối.
   */
  getGate: roleProcedure("guardian").query(async ({ ctx }): Promise<ConsentGateOutput> => {
    return ctx.runWithDb(async (client) => {
      // Bản MỚI NHẤT ĐÃ CÔNG BỐ là bản phụ huynh đọc và ký. Nó có thể cao hơn
      // `core.required_terms_version()` (bản thấp nhất còn được chấp nhận) — ký bản mới
      // hơn luôn hợp lệ. RLS `terms_versions_read_published` đã lọc bản nháp ở tầng dưới;
      // mệnh đề where ở đây chỉ để chọn đúng dòng, không phải để làm hàng rào.
      const { rows: termsRows } = await client.query<{
        id: string;
        version: number;
        title: string;
        body_md: string;
        content_hash: string;
        bat_dong_y_lai: boolean;
        published_at: string;
      }>(
        `select id, version, title, body_md, content_hash, bat_dong_y_lai, published_at
           from core.terms_versions
          where published_at is not null
          order by version desc
          limit 1`,
      );

      const t = termsRows[0];
      const children = await readChildren(client);

      return {
        // `null` = trường chưa công bố bản nào. Màn hình phải nói đúng chừng đó thay vì
        // hiện một ô trống hoặc một nút bấm không ký vào đâu cả.
        terms: t
          ? {
              id: t.id,
              version: t.version,
              title: t.title,
              bodyMd: t.body_md,
              contentHash: t.content_hash,
              requiresReconsent: t.bat_dong_y_lai,
              publishedAt: t.published_at,
            }
          : null,
        children,
        needsAction: children.some((c) => c.needsAction),
      };
    });
  }),

  /**
   * Ghi quyết định của phụ huynh. Một lời gọi có thể mang nhiều con (nhà có hai anh em
   * học cùng trường), nhưng MỖI con là một phiếu riêng — gộp chung một dòng cho hai đứa
   * trẻ thì về sau không tách ra được, mà quyền rút lại là quyền cho TỪNG đứa.
   *
   * §9 — `core.record_consent` idempotent: bấm hai lần trả lại đúng phiếu cũ với
   * `created: false`, không sinh dòng thứ hai. Bài `tests/db/dieu-khoan.test.ts` gọi
   * procedure này hai lần và đếm số dòng trong sổ.
   *
   * KHÔNG bắt lỗi rồi trả `{ ok: false }`: từ chối ở đây (không phải người đại diện của
   * em này, bản điều khoản chưa công bố) là chuyện phải ồn ào. Ánh xạ SQLSTATE sang mã
   * tRPC để màn hình nói đúng câu, chứ không in một chuỗi lỗi Postgres cho phụ huynh đọc.
   */
  decide: roleProcedure("guardian")
    .input(RecordConsentInput)
    .mutation(async ({ ctx, input }): Promise<RecordConsentOutput> => {
      return ctx.runWithDb(async (client) => {
        const results: RecordConsentOutput["results"] = [];

        for (const studentId of input.studentIds) {
          let row: { record_consent: RecordConsentJson } | undefined;
          try {
            const res = await client.query<{ record_consent: RecordConsentJson }>(
              "select core.record_consent($1::uuid, $2::uuid, $3, 'app_button', $4) as record_consent",
              [studentId, input.termsVersionId, input.decision, input.userAgent ?? null],
            );
            row = res.rows[0];
          } catch (err) {
            throw toTrpcError(err);
          }
          const out = row?.record_consent;
          if (!out) {
            // Không bao giờ xảy ra với hàm `returns jsonb` (nó luôn trả một dòng), nhưng
            // im lặng ở đây sẽ thành "đã lưu" trên màn hình — đúng loại hỏng gói này sinh
            // ra để dẹp.
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Không ghi được phiếu đồng ý.",
            });
          }
          results.push({
            studentId,
            consentId: out.consentId,
            created: out.created,
            accountStatus: StudentAccountStatus.parse(out.studentAccountStatus),
            moodEnabled: out.moodEnabled,
          });
        }

        // Đọc lại từ nguồn sự thật thay vì suy từ thao tác vừa bấm: nhà có hai con mà
        // phụ huynh chỉ bấm cho một đứa thì cổng VẪN chưa mở, và màn hình phải biết.
        const children = await readChildren(client);
        return { results, needsAction: children.some((c) => c.needsAction) };
      });
    }),
});

interface RecordConsentJson {
  consentId: string;
  decision: ConsentDecision;
  created: boolean;
  termsVersion: number;
  /** Trạng thái DANH TÍNH — từ 0047 lần bấm này KHÔNG đổi nó nữa, chỉ đọc ra để hiển thị. */
  studentAccountStatus: string;
  /** Hậu quả THẬT của lần bấm: phần mềm còn ghi tâm trạng của em này nữa không. */
  moodEnabled: boolean;
}

/**
 * SQLSTATE → mã tRPC. Đọc bằng MÁY, không so chuỗi tiếng Việt: thông điệp trong hàm SQL
 * viết cho người đọc log, đổi một chữ là kiểm soát này chết im lặng (cùng lý lẽ với
 * `redeemReason` ở /api/auth/invite).
 *
 *   42501 — không phải người đại diện của em này
 *   22023 — bản điều khoản sai hoặc chưa công bố
 *   28000 — chưa đăng nhập (gần như không thể tới đây, roleProcedure đã chặn trước)
 */
function toTrpcError(err: unknown): TRPCError {
  const code = (err as { code?: unknown })?.code;
  if (code === "42501") {
    return new TRPCError({
      code: "FORBIDDEN",
      message: "Tài khoản này không phải người đại diện của học sinh đó.",
    });
  }
  if (code === "22023") {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: "Bản điều khoản không còn hiệu lực. Bố mẹ tải lại trang giúp trường nhé.",
    });
  }
  if (code === "28000") {
    return new TRPCError({ code: "UNAUTHORIZED", message: "Vui lòng đăng nhập lại." });
  }
  // Lỗi ngoài dự kiến đi tiếp nguyên trạng: errorFormatter ở trpc.ts đã lo phần "máy chủ
  // nhận đủ, trình duyệt chỉ nhận một câu chung + mã sự cố".
  return err instanceof TRPCError
    ? err
    : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Không ghi được phiếu đồng ý.", cause: err });
}
