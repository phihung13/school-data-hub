// packages/core/auth-adapter/google-provider.ts — SSO Google THẬT, qua Supabase Auth.
//
// Kiến trúc đã duyệt (01-architecture.md, ADR-018/019): Google → Supabase Auth →
// `auth_uid` → `core.users` → phần còn lại TÁI DÙNG NGUYÊN đường phiên đang chạy
// (resolveIdentity → createSessionToken → cookie). File này là toàn bộ phần "mới":
// xác minh token Supabase và nối tài khoản Google vào sổ người dùng của trường.
//
// VÌ SAO KHÔNG CÓ SDK SUPABASE: việc duy nhất cần làm phía máy chủ là XÁC MINH một
// JWT bằng JWKS công khai — `jose` (đã là dependency của adapter) làm được trọn. Không
// kéo thêm một SDK cho một lời gọi; và luật kho (mệnh lệnh 9) cấm import SDK Supabase
// ngoài adapter — cách chắc nhất để không ai vi phạm là ngay cả adapter cũng không cần nó.
//
// NỐI TÀI KHOẢN — hai bước, đúng thứ tự:
//   1. Theo `auth_uid` (mọi lần sau): đăng nhập lại là một lượt SELECT, không ghi gì.
//   2. Theo EMAIL TRƯỜNG CẤP (chỉ lần đầu): tài khoản trong sổ do trường tạo sẵn với
//      email @truongvietanh.com, cột `auth_uid` để NULL nghĩa là "chưa kích hoạt"
//      (0002_core_identity.sql). Lần đăng nhập Google đầu tiên gắn auth_uid vào dòng
//      đó + ghi sổ `identity_links` — cùng khuôn "nối một lần, từ đó nhớ theo uid" mà
//      phiếu đấu nối §5.2 bắt các app ngoài tuân theo.
//
// MỘT DOMAIN CHUNG — quyết định chủ đầu tư 25/08/2026: "@truongvietanh.com chung" cho
// cả cán bộ lẫn học sinh. Email ngoài domain bị chặn TRƯỚC khi chạm sổ người dùng:
// màn đăng nhập đã hứa "Tài khoản do Trường Việt Anh cấp", và hàng rào phải đứng ở
// máy chủ chứ không phải ở lời hứa.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { withSystemContext } from "../db/client.ts";

/** Domain email trường phát hành — chủ đầu tư chốt 25/08/2026: MỘT domain chung. */
export const EMAIL_TRUONG_DOMAIN = "@truongvietanh.com";

/** Thuần, test được: email có phải do trường phát hành không. */
export function laEmailTruong(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.length > EMAIL_TRUONG_DOMAIN.length && e.endsWith(EMAIL_TRUONG_DOMAIN);
}

/**
 * DANH SÁCH EMAIL QUẢN TRỊ (27/08/2026, DEMO) — chủ đầu tư: đăng nhập Google bằng email
 * thật của mình phải vào thẳng vai QUẢN TRỊ, không phải nhân viên ("2 cái là 1"). Email
 * trong sổ của Hùng là `admin.hung@va.edu.vn` nên khớp-theo-email không tìm ra; danh sách
 * này nối riêng email Google thật → vai `admin`. Chỉ tác dụng khi DEMO_AUTO_STAFF bật.
 * Ngày dựng thật: nối tài khoản đúng cách (đặt email Google vào sổ), bỏ danh sách này.
 */
const EMAIL_QUAN_TRI = new Set(["hung.nguyen@truongvietanh.com"]);

/** Thuần, test được: email này có được cấp thẳng vai quản trị trong bản trình diễn không. */
export function laEmailQuanTri(email: string): boolean {
  return EMAIL_QUAN_TRI.has(email.trim().toLowerCase());
}

/**
 * CỜ DEMO (26/08/2026): tự tạo tài khoản NHÂN VIÊN (vai `staff`) cho email @truongvietanh
 * chưa có trong sổ, thay vì từ chối "chưa có trong sổ". Mặc định TẮT — thiếu cờ thì code
 * này trơ, `noiTaiKhoanTruong` giữ nguyên hành vi an toàn gốc (trường tạo tài khoản sẵn).
 * Bật cho demo Super App đa phòng ban bằng `DEMO_AUTO_STAFF=1` trong .env.local.
 *
 * RỦI RO đã biết (giống cửa thử): bất kỳ ai có tài khoản Google @truongvietanh đều tự tạo
 * được một tài khoản nhân viên THẬT trong DB — các dòng này NẰM LẠI kể cả sau khi tắt cờ.
 * Tắt cờ trước khi có dữ liệu thật, và dọn các user staff tự tạo nếu cần.
 */
export function demoAutoStaffEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.DEMO_AUTO_STAFF ?? "").trim() === "1";
}

export interface DanhTinhSupabase {
  /** `sub` của Supabase Auth = auth.users.id — chính là core.users.auth_uid. */
  authUid: string;
  email: string;
  emailVerified: boolean;
}

/** Bật SSO thật chỉ bằng MỘT biến — thiếu là route trả 404, nút về hành vi dev. */
export function supabaseUrl(): string | null {
  const v = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  return v.startsWith("https://") ? v : null;
}

// JWKS cache theo tiến trình — `createRemoteJWKSet` tự cache và tự refresh khi gặp
// kid lạ, không cần tự chế vòng đời khoá.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCho: string | null = null;

/**
 * Xác minh access_token Supabase bằng JWKS công khai của chính project đó.
 * Trả `null` cho MỌI token không đạt — lý do chi tiết chỉ vào log máy chủ, không
 * bao giờ ra màn người dùng (câu lỗi xác thực càng chi tiết càng là bản đồ cho kẻ dò).
 */
export async function verifySupabaseToken(accessToken: string): Promise<DanhTinhSupabase | null> {
  const goc = supabaseUrl();
  if (!goc) return null;
  try {
    if (!jwks || jwksCho !== goc) {
      jwks = createRemoteJWKSet(new URL(`${goc}/auth/v1/.well-known/jwks.json`));
      jwksCho = goc;
    }
    const { payload } = await jwtVerify(accessToken, jwks, { issuer: `${goc}/auth/v1` });
    const authUid = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!authUid || !email) return null;
    // Supabase đặt cờ xác minh ở `email_verified` trong user_metadata với OAuth;
    // đăng nhập qua Google Workspace thì email luôn đã xác minh phía Google.
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const emailVerified = meta.email_verified === true || payload.email_verified === true;
    return { authUid, email, emailVerified };
  } catch {
    return null;
  }
}

export type KetQuaNoi =
  | { trangThai: "ok"; userId: string }
  | { trangThai: "chua-co-trong-so" }
  | { trangThai: "email-da-noi-tai-khoan-khac" };

/**
 * Nối tài khoản Google (authUid Supabase) vào sổ người dùng của trường.
 * IDEMPOTENT theo đúng nghĩa §6: gọi lại với cùng đầu vào không tạo thêm gì —
 * lần sau rơi vào nhánh SELECT theo auth_uid; `core.link_identity` là upsert.
 */
export async function noiTaiKhoanTruong(dt: DanhTinhSupabase): Promise<KetQuaNoi> {
  return withSystemContext(async (client) => {
    // Nhánh nhanh — mọi lần sau: đã nối thì thôi.
    const daCo = await client.query<{ id: string }>(
      "select id from core.users where auth_uid = $1 and status = 'active'",
      [dt.authUid],
    );
    if (daCo.rows[0]) {
      // "2 cái là 1" (27/08): nếu email nằm trong danh sách quản trị mà tài khoản đã lỡ
      // được tạo thành `staff` ở lần trước, NÂNG lên `admin` ngay tại đây (idempotent).
      if (laEmailQuanTri(dt.email)) {
        await client.query("insert into core.roles (code, name) values ('admin', 'Quản trị') on conflict (code) do nothing");
        await client.query(
          "insert into core.user_role_scopes (user_id, role_code) values ($1, 'admin') on conflict do nothing",
          [daCo.rows[0].id],
        );
      }
      return { trangThai: "ok", userId: daCo.rows[0].id } as const;
    }

    // EMAIL QUẢN TRỊ (demo "2 cái là 1", 27/08) — xử lý TRƯỚC luồng thường: Hùng phải LUÔN
    // vào được vai quản trị bằng chính email Google của mình. Kể cả khi sổ đã có dòng
    // email này nối một `auth_uid` CŨ (đăng nhập trước, hoặc dòng dựng sẵn) — với CHÍNH CHỦ
    // thì NỐI LẠI về lần đăng nhập hiện tại, KHÔNG báo "đã kích hoạt ở tài khoản khác".
    // An toàn vì nhánh nhanh trên vừa xác nhận KHÔNG dòng nào đang mang `auth_uid` hiện tại,
    // nên gán nó cho dòng email này không đụng ràng buộc duy nhất.
    if (laEmailQuanTri(dt.email)) {
      await client.query("insert into core.roles (code, name) values ('admin', 'Quản trị') on conflict (code) do nothing");
      const qt = await client.query<{ id: string }>(
        `insert into core.users (email, full_name, status, auth_uid)
           values (lower($1), $2, 'active', $3)
         on conflict (email) do update set auth_uid = excluded.auth_uid, status = 'active'
         returning id`,
        [dt.email, "Hùng (Quản trị)", dt.authUid],
      );
      const uid = qt.rows[0]!.id;
      await client.query(
        "insert into core.user_role_scopes (user_id, role_code) values ($1, 'admin') on conflict do nothing",
        [uid],
      );
      await client.query("select core.link_identity('supabase', $1, $2)", [dt.authUid, uid]);
      return { trangThai: "ok", userId: uid } as const;
    }

    // Lần đầu: tìm theo email trường cấp. `lower()` vì Google trả email thường hoá
    // nhưng sổ có thể nhập tay; KHÔNG khớp mờ hơn thế (không bỏ dấu chấm kiểu Gmail —
    // sổ của trường ghi sao thì địa chỉ là vậy).
    const theoEmail = await client.query<{ id: string; auth_uid: string | null }>(
      "select id, auth_uid from core.users where lower(email) = lower($1) and status = 'active'",
      [dt.email],
    );
    const dong = theoEmail.rows[0];
    if (!dong) {
      // DEMO Super App (26/08/2026): email trường mới → tự tạo NHÂN VIÊN vai `staff`.
      // Chỉ khi cờ bật; thiếu cờ giữ nguyên chốt bảo mật gốc. Tất cả IDEMPOTENT (§9):
      // đăng nhập lại rơi vào nhánh SELECT-theo-auth_uid ở trên, không tạo thêm gì.
      if (!demoAutoStaffEnabled()) return { trangThai: "chua-co-trong-so" } as const;

      // (Email quản trị đã được xử lý sớm ở trên — tới đây chỉ còn nhân viên thường.)
      await client.query(
        "insert into core.roles (code, name) values ('staff', 'Nhân viên') on conflict (code) do nothing",
      );
      const tenMac = dt.email.split("@")[0] ?? dt.email; // tên tạm từ phần trước @
      const tao = await client.query<{ id: string }>(
        `insert into core.users (email, full_name, status, auth_uid)
           values (lower($1), $2, 'active', $3)
         on conflict (email) do update
           set auth_uid = coalesce(core.users.auth_uid, excluded.auth_uid)
         returning id`,
        [dt.email, tenMac, dt.authUid],
      );
      const uid = tao.rows[0]!.id;
      // Vai `staff` KHÔNG phạm vi trường/lớp: nhân viên phòng ban không gắn cơ sở học sinh.
      await client.query(
        "insert into core.user_role_scopes (user_id, role_code) values ($1, 'staff') on conflict do nothing",
        [uid],
      );
      await client.query("select core.link_identity('supabase', $1, $2)", [dt.authUid, uid]);
      return { trangThai: "ok", userId: uid } as const;
    }
    if (dong.auth_uid && dong.auth_uid !== dt.authUid) {
      // Email này đã kích hoạt bằng MỘT tài khoản đăng nhập khác — không âm thầm
      // chiếm chỗ: đây hoặc là đổi provider có chủ ý (việc của quản trị) hoặc là
      // một lượt mạo nhận.
      return { trangThai: "email-da-noi-tai-khoan-khac" } as const;
    }

    await client.query("update core.users set auth_uid = $1 where id = $2 and auth_uid is null", [
      dt.authUid,
      dong.id,
    ]);
    // Sổ đăng nhập (0010): hệ 'supabase', mã ngoài = auth uid. Upsert idempotent.
    await client.query("select core.link_identity('supabase', $1, $2)", [dt.authUid, dong.id]);
    return { trangThai: "ok", userId: dong.id } as const;
  });
}
