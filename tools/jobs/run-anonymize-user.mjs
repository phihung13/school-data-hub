#!/usr/bin/env node
// tools/jobs/run-anonymize-user.mjs
//
// Thi hành MỘT yêu cầu xoá dữ liệu cá nhân theo Luật Bảo vệ dữ liệu cá nhân
// 91/2025/QH15: gọi core.anonymize_user() (migration 0033).
//
// Vì sao cần file này: hàm SQL đã bị `revoke execute … from public` — đúng như vậy,
// vì nó là SECURITY DEFINER ghi đè core.users. Hệ quả là không tài khoản ứng dụng
// nào gọi được nó, và nếu không có một đường chạy được review thì "quyền xoá" chỉ
// tồn tại trên giấy: tới lúc phụ huynh yêu cầu thật, ai đó sẽ mở dashboard gõ tay
// UPDATE — đúng thứ §2 cấm.
//
// Đây KHÔNG phải job theo lịch. Nó chạy khi có người yêu cầu, mỗi lần một người,
// và mỗi lần để lại một dòng ops.audit_log (do chính hàm SQL ghi).
//
// Chạy:
//   DATABASE_URL=postgres://... node tools/jobs/run-anonymize-user.mjs \
//       --user=<uuid> --reason="PH Nguyễn Văn A yêu cầu xoá, phiếu số 2026-014" --dry-run
//   DATABASE_URL=postgres://... node tools/jobs/run-anonymize-user.mjs \
//       --user=<uuid> --reason="…"
//
// Mã thoát: 0 = xong, 1 = hỏng / tham số sai.

import { createRequire } from "node:module";

// `pg` là dependency của @hub/core, không của gốc workspace — neo require vào đó,
// giống run-retention.mjs. Xem giải thích dài ở đầu file kia.
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Thiếu DATABASE_URL — xem packages/core/db/migrations/README.md mục Chạy cục bộ.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tham số dòng lệnh
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function lay(ten) {
  const a = argv.find((x) => x.startsWith(`--${ten}=`));
  return a ? a.slice(ten.length + 3) : null;
}

const userId = lay("user");
const reason = lay("reason");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!userId || !UUID_RE.test(userId)) {
  console.error("Thiếu hoặc sai --user=<uuid>. Đây là thao tác KHÔNG HOÀN TÁC ĐƯỢC — không đoán id.");
  process.exit(1);
}

// Bắt buộc có lý do, không cho mặc định rỗng: sổ audit mà cột `reason` toàn NULL thì
// một năm sau không ai trả lời được "vì sao tài khoản này bị ẩn danh" — mà đó chính
// là câu hỏi cơ quan quản lý sẽ hỏi.
if (!reason || reason.trim().length < 10) {
  console.error(
    "Thiếu --reason=\"…\" (tối thiểu 10 ký tự). Ghi rõ ai yêu cầu và theo phiếu nào — dòng này đi thẳng vào ops.audit_log.",
  );
  process.exit(1);
}

const unknown = argv.filter(
  (a) => a !== "--dry-run" && !a.startsWith("--user=") && !a.startsWith("--reason="),
);
if (unknown.length > 0) {
  console.error(`Tham số không hiểu: ${unknown.join(", ")}`);
  process.exit(1);
}

// Ghim múi giờ Việt Nam cho MỌI kết nối của pool — cùng một lựa chọn với
// packages/core/db/client.ts:66 và tools/jobs/run-flag-engine.mjs.
//
// Vì sao "set time zone" chứ không phải quy ước: Postgres mặc định chạy UTC, mà job
// nền của trường chạy lúc 01:00 giờ VN = 18:00 UTC HÔM TRƯỚC. Không ghim thì mọi
// current_date trong phiên này lùi đúng một ngày trong khung 00:00–06:59 giờ VN —
// âm thầm, không lỗi, và chỉ lộ ra khi có người ngồi đối chiếu hai cái sổ.
// Bắt gặp thật 01/08/2026 lúc 00:38 giờ VN: seed gieo dữ liệu vào ngày 31/07 trong
// khi app (đã ghim múi giờ) hỏi ngày 01/08 — màn Điều hành của BGH hiện gần như
// trống, và không một dòng lỗi nào nói vì sao.
// Dùng sự kiện "connect" thay vì một câu query sau khi mở: pool có thể mở thêm
// kết nối bất cứ lúc nào, và kết nối mở sau sẽ không chạy câu lệnh viết tay đó.
const pool = new pg.Pool({ connectionString: DATABASE_URL });
pool.on("connect", (c) => {
  c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const truoc = await client.query(
      `select u.full_name, u.email, u.status, u.anonymized_at,
              (select count(*) from core.identity_links il where il.user_id = u.id)        as so_dang_nhap,
              (select count(*) from care.interventions   i  where i.actor_id  = u.id)      as so_can_thiep,
              (select count(*) from care.counselor_notes n  where n.author_id = u.id)      as so_ghi_chu,
              (select count(*) from ops.audit_log        a  where a.actor_id  = u.id)      as so_audit
         from core.users u
        where u.id = $1`,
      [userId],
    );

    if (truoc.rowCount === 0) {
      throw new Error(`Không có tài khoản ${userId} trong core.users.`);
    }
    const t = truoc.rows[0];

    // In tên thật CHỈ trong dry-run. Dry-run tồn tại để người vận hành xác nhận đã
    // chọn đúng người; lần chạy thật thì bản ghi log của chính lệnh xoá không được
    // trở thành nơi cái tên vừa xoá sống tiếp.
    if (dryRun) {
      console.log("Tài khoản        :", t.full_name, `<${t.email ?? "không có email"}>`);
    }
    console.log("User id          :", userId);
    console.log("Trạng thái hiện  :", t.status, t.anonymized_at ? `(đã ẩn danh ${t.anonymized_at.toISOString()})` : "");
    console.log("Sổ đăng nhập     :", t.so_dang_nhap, "→ sẽ bị gỡ");
    console.log("Sẽ GIỮ NGUYÊN    :", `${t.so_can_thiep} can thiệp · ${t.so_ghi_chu} ghi chú tư vấn · ${t.so_audit} dòng audit`);

    const { rows } = await client.query(
      "select core.anonymize_user($1::uuid, $2::text) as ket_qua",
      [userId, reason.trim()],
    );
    const kq = rows[0].ket_qua;

    if (dryRun) {
      await client.query("rollback");
      console.log("\nDRY-RUN — đã hoàn tác, KHÔNG có gì bị thay đổi.");
    } else {
      await client.query("commit");
    }

    console.log("\nĐã ẩn danh trước :", kq.already_anonymized ? "CÓ (lệnh này là no-op — §9)" : "chưa");
    console.log("Sổ đăng nhập gỡ  :", kq.identity_links_removed);

    // Ba câu kết khác nhau cho ba tình huống khác nhau. Dùng chung một câu
    // "OK — đã ẩn danh hoá" cho cả lần no-op là nói sai về việc vừa xảy ra, và
    // người đọc log sẽ tin lần chạy này mới là lần thi hành yêu cầu xoá.
    if (dryRun) {
      console.log("OK — dry-run xong, chưa thi hành gì.");
    } else if (kq.already_anonymized) {
      console.log(`OK — không có gì để làm: tài khoản đã ẩn danh từ ${kq.anonymized_at} (§9).`);
    } else {
      console.log("OK — đã ẩn danh hoá, xem ops.audit_log action='core.anonymize_user'.");
    }
  } catch (err) {
    await client.query("rollback").catch(() => {});
    // Khác run-retention.mjs: KHÔNG tự ghi một dòng job_runs 'failed' ở đây. Hàm SQL
    // đã ghi audit trong cùng transaction nên lần hỏng bị cuốn theo rollback — và đó
    // là hành vi đúng: một lần ẩn danh KHÔNG thành công mà để lại dòng audit
    // 'core.anonymize_user' sẽ làm người hậu kiểm tin rằng dữ liệu đã được xoá.
    // Thà không có dấu vết còn hơn có dấu vết sai về một việc chưa xảy ra.
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("ẨN DANH HOÁ THẤT BẠI:", err && err.message ? err.message : err);
  process.exit(1);
});
