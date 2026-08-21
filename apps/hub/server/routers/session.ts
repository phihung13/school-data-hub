// apps/hub/server/routers/session.ts — thông tin phiên + lưới mini app trang chủ +
// tầng dữ liệu của CHUÔNG THÔNG BÁO / CỘT PHẢI (`getPendingWork`).
//
// Danh sách tile nằm ở ../mini-apps.ts (dùng chung với server component trang chủ, để lưới
// có sẵn trong HTML lần đầu thay vì đợi query xong mới hiện).
//
// ═══════════════════════════════════════════════════════════════════════════
// getPendingWork — "việc đang chờ TÔI", và bốn luật nó phải giữ
// ═══════════════════════════════════════════════════════════════════════════
// Bối cảnh: chủ đầu tư mở `/home` bằng tài khoản quản trị rồi tài khoản giáo viên,
// 06/08/2026: "thiếu thiếu gì á". Brief thiết kế mục 5.1 cho phép vẽ chuông với ĐÚNG một
// điều kiện — nêu được nguồn dữ liệu. Thủ tục này là nguồn đó.
//
//  1. ĐẾM ĐI QUA RLS, KHÔNG `security definer`. Không câu nào ở đây gọi một hàm definer để
//     "đếm hộ". Vai nào không đọc được bảng nào thì mục đó KHÔNG TỒN TẠI với vai đó — và
//     đó là hàng rào, không phải thiếu sót. Hệ quả phải nói ra: nhiều mục dưới đây đếm
//     được 0 cho vai sai chứ không ném lỗi (RLS lọc HÀNG, không từ chối câu lệnh — bài học
//     đã trả giá ở đầu `routers/admin.ts`), nên hàng rào THẬT nằm ở cổng vai bằng TypeScript
//     phía dưới, và RLS là tầng thứ hai chặn độc lập. Không tầng nào tin tầng kia tử tế.
//
//  2. KHÔNG TÊN HỌC SINH. `PendingWorkItem` có bốn trường và không trường nào chở được một
//     danh tính. Chuông đưa người dùng TỚI màn; danh tính hiện ở màn đó, nơi RLS đã gác từ
//     trước. Điều 24 hiến pháp UI (không rò nội tình) trùng đúng chỗ này với luật riêng tư
//     của trường: một danh sách tên trong lớp nổi của chuông là một bề mặt lộ dữ liệu MỚI,
//     không policy nào canh riêng cho nó. `tests/unit/chuong-khong-lo-ten.test.ts` quét mã
//     nguồn của chính file này để giữ điều đó.
//
//  3. MỘT TRUY VẤN GỘP MỖI VAI. Chuông nằm trên trang chủ — màn MỌI vai mở đầu tiên mỗi
//     sáng. Bắn năm lượt hỏi cho một cái chuông là nhân năm tải cao điểm 07:30 của cả
//     trường (05-capacity-ops.md). Nên: một câu cho GVCN gộp bốn phép đếm, một câu cho mỗi
//     vai còn lại. Vai kiêm nhiệm (GVCN kiêm tâm lý cụm là chuyện có thật) chạy nhiều câu,
//     nhưng chúng chạy SONG SONG trong cùng một kết nối.
//
//  4. KHÔNG NGƯỠNG VIẾT CHẾT (mệnh lệnh 7 / §6). Cửa sổ nhìn lại của lời "cần gặp thầy cô"
//     và của cờ E_MOOD đọc từ `care.thresholds` qua `readCareRules` — CÙNG hàm mà buồng lái
//     dùng. Đây không phải chuyện hình thức: hai nơi đọc hai ngưỡng khác nhau thì chuông
//     báo "3 việc" mà buồng lái mở ra chỉ có 2, và người dùng học được rằng chuông hay nói
//     dối — sau đó nó có báo thật cũng không ai bấm.
//
// ── VÌ SAO `protectedProcedure` CHỨ KHÔNG PHẢI `roleProcedure(...)` ──────────
// Thủ tục này phục vụ CẢ TÁM vai, kể cả hai vai không có mục nào (`principal`, `board`).
// `roleProcedure` liệt kê tám vai chỉ là `protectedProcedure` viết dài hơn. Cổng vai thật
// nằm ở `readMyScopes` bên dưới: nó đọc `core.v_my_scopes` (bảng phân quyền THẬT) chứ
// không đọc `ctx.roles` từ JWT — token sống 15 phút nên một tài khoản vừa bị thu vai vẫn
// cầm token ghi vai cũ, và 15 phút là quá dài với thứ quyết định "được thấy việc của lớp
// nào". Cùng lý lẽ với `loadMyScopes` trong ../trpc.ts.
import type { PoolClient } from "@hub/core/db";
import type { HubRole } from "@hub/core/contracts";
import { GetPendingWorkOutput, type PendingWorkItem } from "@hub/core/contracts";
import { mondayOf, toLocalIsoDate } from "@/lib/date";
import { readCareRules } from "../care-thresholds";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { buildMiniAppsWithEmbedded } from "../mini-apps";

/**
 * Vai + phạm vi THẬT của người đang gọi, kèm ngày của chính cơ sở dữ liệu.
 *
 * `current_date` lấy ở đây, không lấy bằng `new Date()` trên máy chủ Node: mọi phép đếm
 * bên dưới so với `current_date` của Postgres, và hai nguồn ngày thì sẽ có ngày lệch — một
 * tab mở qua nửa đêm sẽ in nhãn ngày hôm qua trên số của hôm nay.
 *
 * `school_id` đi kèm vì ngưỡng cờ khai được RIÊNG TỪNG CƠ SỞ (0026). Không lấy nó thì
 * `readCareRules(client, null)` chỉ thấy dòng toàn hệ, và một cơ sở vừa siết ngưỡng sẽ
 * thấy chuông đếm theo số cũ.
 */
async function readMyScopes(client: PoolClient): Promise<{
  today: string;
  roles: Set<HubRole>;
  homeroomClassIds: string[];
  homeroomSchoolIds: string[];
}> {
  const { rows } = await client.query<{
    role_code: HubRole;
    class_id: string | null;
    school_id: string | null;
    today: string;
  }>("select role_code, class_id, school_id, current_date::text as today from core.v_my_scopes");

  const roles = new Set<HubRole>();
  const homeroomClassIds: string[] = [];
  const homeroomSchoolIds = new Set<string>();
  for (const r of rows) {
    roles.add(r.role_code);
    if (r.role_code === "homeroom" && r.class_id) {
      homeroomClassIds.push(r.class_id);
      if (r.school_id) homeroomSchoolIds.add(r.school_id);
    }
  }

  // Người không có dòng phân quyền nào (chưa gán vai) vẫn phải nhận một ngày đúng, nên
  // `current_date` không đi kèm dòng nào thì hỏi lại. Trường hợp này có thật: tài khoản
  // vừa tạo, chưa ai gán vai — họ mở được `/home` và chuông của họ phải rỗng chứ không nổ.
  let today = rows[0]?.today ?? null;
  if (!today) {
    const { rows: d } = await client.query<{ today: string }>("select current_date::text as today");
    today = d[0]?.today ?? toLocalIsoDate(new Date());
  }

  return { today, roles, homeroomClassIds, homeroomSchoolIds: [...homeroomSchoolIds] };
}

/**
 * Bỏ mục đếm được 0. Đây là hàng rào chống chính cái lỗi đã làm cái chuông cũ bị gỡ ngày
 * 31/07/2026: một chuông luôn có bốn dòng, ba dòng trong đó là số 0, đọc thành bốn việc.
 */
function them(items: PendingWorkItem[], item: PendingWorkItem): void {
  if (item.count > 0) items.push(item);
}

// ───────────────────────────────────────────────────────────────────────────
// GVCN — bốn phép đếm, MỘT câu
// ───────────────────────────────────────────────────────────────────────────
/**
 * Bốn việc buổi sáng của cô chủ nhiệm, đúng bốn thứ buồng lái đang vẽ, đếm lại từ cùng
 * nguồn để chuông và buồng lái không nói hai con số.
 *
 * `roster` lấy `core.enrollments` làm gốc và lọc theo `class_id = any(lớp mình chủ nhiệm)`.
 * Mệnh đề lọc đó KHÔNG thừa dù RLS đã gác: `core.can_see_student` là HỢP của sáu nhánh, nên
 * với một người vừa chủ nhiệm 6A1 vừa kiêm tâm lý cụm, nhánh `in_my_cluster` mở toàn bộ học
 * sinh cơ sở và bốn con số này lặng lẽ phình ra cả cụm — không lỗi, không log, chỉ là mấy
 * con số không đúng chỗ. Lượt thử ngược ghi ở đầu `tests/db/chuong-viec-cho.test.ts` đo
 * đúng ca đó.
 *
 * Bốn nguồn, và mỗi cái là một câu hỏi khác nhau:
 *   · `gui_muon`  — `attendance.checkins.status = 'queued_late'`: em đã gửi, máy KHÔNG tự
 *     kết luận (ADR-007), đang chờ một con người quyết. Đếm DÒNG chứ không đếm em: mỗi dòng
 *     là một ngày phải quyết riêng, và màn `/gvcn/diem-danh` cũng liệt kê theo dòng.
 *   · `can_gap`   — `attendance.help_requests` chưa `handled_at`. Đếm EM (`distinct`): một
 *     em bấm ba lần trong tuần vẫn là một em cần gặp, không phải ba việc.
 *   · `bao_cao`   — em chưa có dòng duyệt tuần này, HOẶC có mà còn `pending`. Hai thứ đó là
 *     cùng một việc với cô (`coalesce(a.status, 'pending')`), và tách ra thành hai con số
 *     chỉ làm cô phải tự cộng.
 *   · `co_uu_tien`— `care.flags` còn trong cửa sổ, `origin = 'live'`. Loại `backfill` vì
 *     dòng nạp bù là kết quả chạy lại cho quá khứ (0039/RULES Rev F điều 8: cờ nạp bù không
 *     tạo case, không leo thang) — đưa nó vào chuông sáng nay là báo động về hôm kia.
 *
 * Câu này KHÔNG chọn cột `mood`, KHÔNG chọn `f.detail`, KHÔNG chọn tên em. `detail` chứa
 * `negative_days`/`nguong`; DESIGN-GUIDELINES §9 cấm ba thứ đó đi ra phía GVCN, và cắt tại
 * đây là cắt tại nguồn — ẩn ở CSS thì số vẫn nằm trong tab Network của máy cô.
 */
async function demViecGvcn(
  client: PoolClient,
  classIds: string[],
  schoolIds: string[],
  weekStart: string,
): Promise<{ gui_muon: number; can_gap: number; bao_cao: number; co_uu_tien: number }> {
  // Ngưỡng theo cơ sở của lớp mình chủ nhiệm. Chủ nhiệm ở hai cơ sở khác nhau (hiếm, nhưng
  // trường liên cấp có) thì không có "một" cơ sở để hỏi — lúc đó hỏi dòng toàn hệ bằng
  // `null`, đúng ngữ nghĩa `care.resolve_threshold` đã định nghĩa, thay vì bốc đại một cơ sở.
  const rules = await readCareRules(client, schoolIds.length === 1 ? (schoolIds[0] as string) : null);

  const { rows } = await client.query<{
    gui_muon: number;
    can_gap: number;
    bao_cao: number;
    co_uu_tien: number;
  }>(
    `with roster as (
       select e.student_id
         from core.enrollments e
        where e.class_id = any($1::uuid[])
          and e.valid_to is null
     )
     select
       (select count(*)::int
          from attendance.checkins c
          join roster r on r.student_id = c.student_id
         where c.status = 'queued_late')                                as gui_muon,
       (select count(distinct h.student_id)::int
          from attendance.help_requests h
          join roster r on r.student_id = h.student_id
         where h.handled_at is null
           and h.requested_on >= current_date - $2::int)                as can_gap,
       (select count(*)::int
          from roster r
          left join report.growth_report_approvals a
            on a.student_id = r.student_id and a.week_start = $4::date
         where coalesce(a.status, 'pending') = 'pending')               as bao_cao,
       (select count(distinct f.student_id)::int
          from care.flags f
          join roster r on r.student_id = f.student_id
         where f.origin = 'live'
           and f.as_of_date >= current_date - $3::int)                  as co_uu_tien`,
    [classIds, rules.urgent.windowDays, rules.emotion.windowDays, weekStart],
  );

  return rows[0] ?? { gui_muon: 0, can_gap: 0, bao_cao: 0, co_uu_tien: 0 };
}

// ───────────────────────────────────────────────────────────────────────────
// Giáo viên bộ môn — lớp mình dạy mà hôm nay chưa ai ghi một dòng nào
// ───────────────────────────────────────────────────────────────────────────
/**
 * Đếm LỚP, không đếm em: câu hỏi buổi sáng của thầy cô bộ môn là "lớp nào chưa được điểm
 * danh", và một lớp 40 em chưa ai ghi là MỘT việc chứ không phải 40.
 *
 * Đường đi phải vòng qua `core.teaches(student_id)` chứ không đọc thẳng
 * `core.class_assignments`: bảng đó KHÔNG được GRANT cho `authenticated` (0024 có assertion
 * khoá điều đó). Cùng đường mà `routers/teaching.ts` đã đi, cố ý — hai màn trả lời câu hỏi
 * "thầy dạy lớp nào" bằng hai nguồn khác nhau là hai nguồn sẽ có ngày lệch.
 *
 * `count(k.status) = 0` chứ không phải `count(*) = 0`: `count` bỏ qua NULL, nên vế trái là
 * "số em ĐÃ CÓ trạng thái". Lớp mà mọi em đều `left join` ra NULL = chưa ai ghi gì. Dùng
 * `count(*)` thì nó đếm số em và không bao giờ bằng 0, tức là mục này lặng lẽ biến mất.
 */
async function demLopChuaDiemDanh(client: PoolClient, onDate: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n
       from (
         select e.class_id
           from core.enrollments e
           left join attendance.checkins k
             on k.student_id = e.student_id
            and k.occurred_on = $1::date
            and k.kind = 'in'
          where e.valid_to is null
            and core.teaches(e.student_id)
          group by e.class_id
         having count(k.status) = 0
       ) t`,
    [onDate],
  );
  return rows[0]?.n ?? 0;
}

// ───────────────────────────────────────────────────────────────────────────
// Tâm lý cụm · quản trị · học sinh · phụ huynh — mỗi vai một câu
// ───────────────────────────────────────────────────────────────────────────
/**
 * Ca đang mở trong cụm. Ở ĐÂY phạm vi do RLS quyết một mình, và đó là lựa chọn có ý:
 * `care_cases_scope` gác bằng `core.can_see_care` = `is_homeroom_of ∨ in_my_cluster`, tức
 * đúng tập hợp mà hộp việc `/tam-ly` đang hiển thị. Tự viết thêm một mệnh đề
 * `school_id = any(cụm)` ở tầng này là dựng một định nghĩa "cụm của tôi" thứ hai bên cạnh
 * `core.v_my_scopes`, và hai định nghĩa thì sẽ có ngày trả lời khác nhau — lúc đó chuông và
 * màn `/tam-ly` đếm hai số cho cùng một hộp việc.
 */
async function demCaDangMo(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    "select count(*)::int as n from care.care_cases where status = 'open'",
  );
  return rows[0]?.n ?? 0;
}

/**
 * Hai số của quản trị trong MỘT câu.
 *
 * `app_tat` — `core.embedded_apps` bật RLS với hai policy: mọi người đọc được app ĐANG BẬT,
 * riêng quản trị đọc được tất cả (0052). Nên câu `where not enabled` này tự trả 0 cho người
 * không phải quản trị — RLS là tầng chặn thứ hai, sau cổng vai ở TypeScript.
 *
 * `job_can_xem` — `ops.v_job_health.needs_attention`. Cột này gom bảy trạng thái, trong đó
 * `chua_chay` và `tat` CŨNG tính là cần chú ý (0041): một job xoá chi tiết cảm xúc bị tắt
 * là một lời hứa với phụ huynh đang không được thi hành, và nó không được phép nằm im như
 * một lựa chọn bình thường. View này GRANT cho `authenticated` (0041 dòng 437) nên đọc được
 * — không mục nào của quản trị phải bỏ vì RLS.
 */
async function demViecQuanTri(client: PoolClient): Promise<{ app_tat: number; job_can_xem: number }> {
  const { rows } = await client.query<{ app_tat: number; job_can_xem: number }>(
    `select
       (select count(*)::int from core.embedded_apps where not enabled)          as app_tat,
       (select count(*)::int from ops.v_job_health where needs_attention)        as job_can_xem`,
  );
  return rows[0] ?? { app_tat: 0, job_can_xem: 0 };
}

/**
 * Em đã check-in hôm nay chưa. Trả 1 = CHƯA (còn một việc), 0 = xong.
 *
 * Suy học sinh từ `core.students.user_id = core.current_user_id()`, không nhận tham số:
 * đây là câu hỏi về CHÍNH người đang đăng nhập, và mở một tham số `studentId` ở đây là mở
 * một cửa dò "em đó check-in chưa" cho bất kỳ ai gõ được một UUID.
 *
 * Câu này KHÔNG chọn cột `mood` — chỉ hỏi "có dòng chưa". Chọn `mood` thì với phiên của
 * chính em vẫn qua được `core.can_read_mood()`, nhưng đưa mức cảm xúc vào một payload của
 * trang chủ là mở rộng phạm vi dữ liệu §3 mà không ai quyết.
 */
async function demChuaCheckin(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n
       from core.students s
      where s.user_id = core.current_user_id()
        and not exists (
          select 1 from attendance.checkins c
           where c.student_id = s.id
             and c.occurred_on = current_date
             and c.kind = 'in'
        )`,
  );
  return rows[0]?.n ?? 0;
}

/**
 * Số con còn phiếu đồng ý chưa ký. `core.my_consent_status()` là chỗ DUY NHẤT biết luật
 * "bản nào đang bắt buộc, phiếu cũ còn hiệu lực không" (0046/0047) — router chỉ đếm cột
 * `needs_action` mà hàm đó đã tính, không tự suy lại từ `core.consent_records`. Tự suy là
 * dựng nguồn sự thật thứ hai cho một câu hỏi pháp lý.
 */
async function demPhieuChuaKy(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    "select count(*)::int as n from core.my_consent_status() where needs_action",
  );
  return rows[0]?.n ?? 0;
}

export const sessionRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.authUid) return null;
    return { displayName: ctx.displayName, roles: ctx.roles };
  }),

  miniApps: protectedProcedure.query(({ ctx }) => buildMiniAppsWithEmbedded(ctx.roles)),

  /**
   * Việc đang chờ CHÍNH người đang đăng nhập — nguồn dữ liệu của chuông thông báo và của
   * cột phải trang chủ. CHỈ ĐỌC: không mutation nào ở đây, nên §9 không có gì để làm và
   * gọi lại nhiều lần cho đúng cùng một kết quả (bài test khẳng định điều đó bằng cách đếm
   * số dòng trong ba bảng trước và sau).
   *
   * `principal` và `board` KHÔNG có nhánh nào bên dưới — cố ý, và đây là chỗ dễ bị "sửa cho
   * đầy đủ" nhất. Hai vai đó xem số tổng hợp ở `/dieu-hanh` và không có thao tác nào phải
   * làm trong hệ hôm nay; nhét một con số vào cho có là dựng lại đúng cái chuông rỗng đã bị
   * gỡ khỏi trang chủ ngày 31/07/2026.
   */
  getPendingWork: protectedProcedure.query(async ({ ctx }) => {
    return ctx.runWithDb(async (client) => {
      const { today, roles, homeroomClassIds, homeroomSchoolIds } = await readMyScopes(client);
      const items: PendingWorkItem[] = [];

      // ── GVCN ─────────────────────────────────────────────────────────────
      // `homeroomClassIds.length > 0` chứ không chỉ `roles.has("homeroom")`: từ 0030 vai
      // homeroom suy thẳng từ `core.class_assignments`, nên có vai mà không có lớp nào là
      // một trạng thái dữ liệu hỏng chứ không phải một cô không lớp. Chạy câu SQL với mảng
      // rỗng chỉ tốn một lượt hỏi để nhận về bốn số 0.
      if (roles.has("homeroom") && homeroomClassIds.length > 0) {
        // Thứ Hai do MÁY CHỦ nắn, không nhận từ client: `growth_report_approvals` khoá duy
        // nhất theo (em, tuần), nên hai cách tính tuần khác nhau là hai câu trả lời khác
        // nhau cho cùng một câu hỏi "tuần này ký chưa".
        const weekStart = toLocalIsoDate(mondayOf(new Date(`${today}T00:00:00`)));
        const d = await demViecGvcn(client, homeroomClassIds, homeroomSchoolIds, weekStart);

        // Giọng nghiệp vụ (§8 brief): người lớn được phép đọc "cờ", "gửi muộn", "duyệt".
        // Thứ tự cố định và KHÔNG sắp theo số: một danh sách tự đổi thứ tự mỗi lần tải là
        // một danh sách người dùng phải đọc lại từ đầu mỗi sáng.
        them(items, {
          key: "homeroom.help_requests",
          label: "Lời cần gặp chưa xử",
          count: d.can_gap,
          href: "/gvcn",
          // Mức duy nhất mang `urgent` trong cả thủ tục: tín hiệu do chính đứa trẻ phát ra,
          // đi ngay không chờ quét đêm ([QĐ-2]), và chưa ai bấm "cô đã gặp em rồi".
          tone: "urgent",
        });
        them(items, {
          key: "homeroom.queued_late",
          label: "Check-in chờ xác nhận",
          count: d.gui_muon,
          href: "/gvcn/diem-danh",
          tone: "normal",
        });
        them(items, {
          key: "homeroom.care_flags",
          label: "Em cần để ý",
          count: d.co_uu_tien,
          href: "/gvcn",
          tone: "normal",
        });
        them(items, {
          key: "homeroom.report_approvals",
          label: "Báo cáo tuần chưa duyệt",
          count: d.bao_cao,
          href: "/gvcn/duyet-bao-cao",
          tone: "normal",
        });
      }

      // ── Giáo viên bộ môn ─────────────────────────────────────────────────
      // Chỉ vai `teacher`, KHÔNG cộng thêm `homeroom`. GVCN cũng dạy môn và cũng có
      // `/lop-toi-day` (xem `routers/teaching.ts`), nhưng lớp chủ nhiệm của cô đã có mục
      // "Check-in chờ xác nhận" ở trên rồi — thêm một dòng nữa cho cùng một lớp là đếm hai
      // lần một việc. Cô vừa chủ nhiệm vừa dạy môn ở lớp khác vẫn nhận mục này, vì
      // `core.v_my_scopes` khai đủ cả hai vai.
      if (roles.has("teacher")) {
        them(items, {
          key: "teacher.classes_without_attendance",
          label: "Lớp chưa điểm danh",
          count: await demLopChuaDiemDanh(client, today),
          href: "/lop-toi-day",
          tone: "normal",
        });
      }

      // ── Tâm lý cụm ───────────────────────────────────────────────────────
      if (roles.has("counselor")) {
        them(items, {
          key: "counselor.open_cases",
          label: "Hồ sơ đang mở",
          count: await demCaDangMo(client),
          href: "/tam-ly",
          tone: "normal",
        });
      }

      // ── Quản trị ─────────────────────────────────────────────────────────
      if (roles.has("admin")) {
        const q = await demViecQuanTri(client);
        them(items, {
          key: "admin.apps_disabled",
          label: "Mini App đang tắt",
          count: q.app_tat,
          // Chưa có màn nào xem job nền — xem chú thích href ở contract. Trỏ tạm sang sổ
          // Mini App là dẫn người ta sang nhầm chỗ, nên để null: hiện ra để biết, không bấm.
          href: null,
          tone: "normal",
        });
        // Đích của mục này là màn quản trị đang có, KHÔNG phải một màn "sức khoẻ job" riêng
        // — hệ chưa có màn đó. Vẫn TRẢ VỀ mục này thay vì lặng lẽ bỏ, và lý do là luật chứ
        // không phải tiện: RULES Rev F điều 8 cấm suy tin tốt từ im lặng, mà thứ đang im ở
        // đây có thể là job xoá chi tiết cảm xúc sau 12 tháng (§3) đã chết từ tuần trước.
        // Giấu con số đó cho khỏi "nút dẫn tới màn chưa có" là đổi một lỗi giao diện lấy
        // một lời hứa thất hứa không ai biết. Màn riêng cho nó là việc của gói sau.
        them(items, {
          key: "admin.jobs_need_attention",
          label: "Job nền cần xem",
          count: q.job_can_xem,
          href: "/quan-tri/mini-app",
          tone: "normal",
        });
      }

      // ── Học sinh ─────────────────────────────────────────────────────────
      // Giọng Glow & Grow (§8): không "chưa hoàn thành", không "thiếu", không nhắc nhở.
      // Từ vựng vận hành (cờ, ngưỡng, leo thang, GVCN) tuyệt đối không xuất hiện ở đây.
      // MỤC "Hôm nay chưa check-in" ĐÃ BỎ 21/08/2026 — giữ khối chú thích này để lần
      // sau không ai dựng lại vì thấy chuông của học sinh trống.
      //
      // Từ ADR-036 bản popup, một em chưa khai tâm trạng thì **đang bị popup khoá app
      // chặn ngay trước mặt**. Một dòng chuông nhắc lại đúng việc em đang không thể
      // tránh khỏi là tiếng ồn, không phải lời nhắc.
      //
      // Còn với em nhà CHƯA ký phiếu đồng ý (0047 — không ghi được `mood`, nên cổng cố
      // ý miễn cho em), dòng chuông ấy còn tệ hơn: nó chỉ tới một việc em KHÔNG LÀM
      // ĐƯỢC. Một lời nhắc không có hành động phía sau là một lời hứa suông.

      // ── Phụ huynh ────────────────────────────────────────────────────────
      if (roles.has("guardian")) {
        them(items, {
          key: "guardian.consent_pending",
          label: "Phiếu đồng ý chờ ký",
          count: await demPhieuChuaKy(client),
          href: "/dieu-khoan",
          tone: "normal",
        });
      }

      // `principal` / `board`: không nhánh nào. Xem chú thích của thủ tục.
      return GetPendingWorkOutput.parse({ asOfDate: today, items });
    });
  }),
});
