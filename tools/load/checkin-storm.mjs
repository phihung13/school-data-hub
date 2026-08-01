#!/usr/bin/env node
// tools/load/checkin-storm.mjs — bộ đo tải cho giờ cao điểm buổi sáng.
//
// NGHIỆM THU PHẢI ĐẠT (danh-cho-may/05-capacity-ops.md mục 6):
//   3.000 lượt check-in trong 30 phút · p95 < 500ms · 0 bản ghi đôi.
//
// ── Vì sao KHÔNG dùng k6 ─────────────────────────────────────────────────────
// k6 chưa cài trên máy nào của đội, và cài thêm một công cụ để chạy ĐÚNG MỘT phép
// đo trước go-live là thêm một thứ phải bảo trì. Quan trọng hơn: k6 đo được độ trễ
// nhưng KHÔNG kiểm được vế thứ hai của lời nghiệm thu — "0 bản ghi đôi" là câu hỏi
// về CƠ SỞ DỮ LIỆU sau cơn bão, không phải về mã trạng thái HTTP. Một bài đo trả
// lời được nửa câu rồi để người đọc tự suy nốt nửa kia là đúng loại kết luận rút từ
// im lặng mà cả hệ này chống. File này đo cả hai bằng cùng một lần chạy.
//
// ── PHÉP ĐO NÀY KHÔNG CHỨNG MINH ĐIỀU GÌ — đọc trước khi trích số ────────────
// Cơn bão đi qua tầng CƠ SỞ DỮ LIỆU: mở phiên dưới danh tính từng em, để RLS làm việc
// thật, gọi đúng `attendance.resolve_checkin` rồi upsert đúng câu mà `checkin.submitMood`
// chạy. Nó KHÔNG đi qua Next.js, tRPC, lớp phiên, hay mạng.
// Nghĩa là con số p95 ở đây là SÀN, không phải trần: p95 thật của người dùng bằng số này
// CỘNG thời gian của tầng ứng dụng và đường truyền. Ai trích một mình con số này rồi kết
// luận "hệ chịu được giờ cao điểm" là đang nói rộng hơn thứ đã đo.
// Phần còn thiếu — đo qua HTTP với phiên đăng nhập thật — chưa làm được ở mức này vì
// mỗi em cần một phiên riêng, mà cửa đăng nhập thật (Google/Zalo) chưa nối. Ghi ra đây
// thay vì im lặng, để lần sau ai mở file cũng thấy ngay nửa còn nợ.
//
// ── Chạy trên CSDL RIÊNG, không bao giờ trên hub_dev ──────────────────────────
// Cơn bão này ghi vài nghìn dòng check-in và sinh vài nghìn học sinh giả. Chạy trên
// hub_dev là phá bộ dữ liệu demo mà cả chục bài test đang dựa vào, và tệ hơn: số đo
// sẽ lẫn với dữ liệu thật nên không ai biết 3.000 dòng kia của ai. Script tự dựng
// database riêng, tự dọn, và TỪ CHỐI chạy nếu tên database trùng hub_dev.
//
// ── Cách dùng ────────────────────────────────────────────────────────────────
//   node tools/load/checkin-storm.mjs                     # mặc định: 3000 lượt, 60 luồng
//   node tools/load/checkin-storm.mjs --luot 5000 --luong 100
//   node tools/load/checkin-storm.mjs --giu               # giữ lại DB để soi tay
// Biến môi trường: ADMIN_URL (kết nối tới postgres để tạo/xoá DB), mặc định
//   postgres://postgres:postgres@localhost:5434/postgres
// `pg` là dependency của @hub/core chứ không của gốc workspace, và ESM phân giải theo
// VỊ TRÍ FILE — `import pg from "pg"` ở đây ném ERR_MODULE_NOT_FOUND. Neo require vào
// package.json của @hub/core, cùng khuôn mà tools/jobs/run-all.mjs và run-retention.mjs
// đã dùng, để cả ba script chạy đúng một bản `pg`.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const ADMIN_URL = process.env.ADMIN_URL ?? "postgres://postgres:postgres@localhost:5434/postgres";
const DB_NAME = process.env.LOAD_DB ?? "hub_load";

const argv = process.argv.slice(2);
const soOf = (ten, mac) => {
  const i = argv.indexOf(ten);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : mac;
};
const SO_LUOT = soOf("--luot", 3000);
const SO_LUONG = soOf("--luong", 60);
const GIU_DB = argv.includes("--giu");

if (/\/hub_dev(\?|$)/.test(ADMIN_URL) || DB_NAME === "hub_dev") {
  console.error("TỪ CHỐI CHẠY: bộ đo tải không được chạm hub_dev (xem chú thích đầu file).");
  process.exit(1);
}

const loadUrl = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, `/${DB_NAME}$1`);

// ---------------------------------------------------------------------------
// Thống kê độ trễ.
//
// p95 tính bằng cách SẮP TOÀN BỘ mẫu rồi lấy phần tử thứ 95% — không dùng công thức
// xấp xỉ trên histogram. Với vài nghìn mẫu thì sắp xếp là chuyện vặt, còn xấp xỉ thì
// sai đúng ở đuôi phân phối, mà đuôi mới là thứ cả phép đo này quan tâm.
// ---------------------------------------------------------------------------
function phanVi(mau, p) {
  if (mau.length === 0) return null;
  const s = [...mau].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
  return s[Math.max(0, i)];
}

function tomTatDoTre(mau) {
  return {
    n: mau.length,
    min: mau.length ? Math.round(Math.min(...mau)) : null,
    p50: Math.round(phanVi(mau, 50) ?? 0),
    p95: Math.round(phanVi(mau, 95) ?? 0),
    p99: Math.round(phanVi(mau, 99) ?? 0),
    max: mau.length ? Math.round(Math.max(...mau)) : null,
  };
}

const admin = new pg.Client({ connectionString: ADMIN_URL });
admin.on?.("error", () => {});

async function dungDatabase() {
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();
}

/** Chạy toàn bộ migration + fixture bằng psql trong container — cùng đường mà pgTAP đi. */
async function napSchema() {
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const path = await import("node:path");
  const chay = (file) => {
    const sql = fs.readFileSync(file);
    execFileSync(
      "docker",
      ["exec", "-i", "pg_hub", "psql", "-U", "postgres", "-d", DB_NAME, "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { input: sql, stdio: ["pipe", "ignore", "pipe"] },
    );
  };
  for (const thu of ["migrations", "fixtures"]) {
    const dir = path.join("packages", "core", "db", thu);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      chay(path.join(dir, f));
    }
  }
}

/**
 * Gieo `n` học sinh CÓ TÀI KHOẢN THẬT, chia đều vào các lớp 35 em.
 *
 * Vì sao phải có tài khoản: cơn bão này đi qua đúng đường mà router thật đi, nghĩa là
 * qua RLS dưới danh tính của CHÍNH EM. Gieo học sinh không có `core.users` rồi đo là
 * đo một đường không ai dùng — nhanh giả, vì RLS chưa phải làm việc gì.
 */
async function gieoHocSinh(client, n) {
  const network = "10000000-0000-0000-0000-000000000001";
  const school = "20000000-0000-0000-0000-000000000001";
  await client.query(
    `insert into core.school_networks (id, code, name) values ($1,'VA','Việt Anh') on conflict do nothing`,
    [network],
  );
  await client.query(
    `insert into core.schools (id, network_id, code, name) values ($1,$2,'VA-Q7','Cơ sở Quận 7') on conflict do nothing`,
    [school, network],
  );

  const soLop = Math.ceil(n / 35);
  const lopIds = [];
  for (let c = 0; c < soLop; c++) {
    const id = `31000000-0000-0000-0000-${String(c).padStart(12, "0")}`;
    lopIds.push(id);
    await client.query(
      `insert into core.classes (id, school_id, code, academic_year, grade)
       values ($1,$2,$3,'2026-2027',6) on conflict (id) do nothing`,
      [id, school, `L${c + 1}`],
    );
  }

  // Gieo theo lô: 3.000 lượt INSERT một-một mất hàng phút và không đo gì cả.
  const LO = 500;
  for (let base = 0; base < n; base += LO) {
    const het = Math.min(base + LO, n);
    const users = [], hs = [], vai = [], gd = [];
    for (let i = base; i < het; i++) {
      const uid = `41000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      const auth = `91000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      const sid = `71000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
      users.push([uid, auth, `load${i}@va.edu.vn`, `Học sinh Tải ${i}`]);
      // Mã học sinh phải khớp `students_code_format_chk` (^VA-d{4}-d{5}$) — cơn bão
      // không được phép nới một ràng buộc của dữ liệu thật để cho mình chạy được.
      hs.push([sid, `VA-9999-${String(i).padStart(5, "0")}`, uid, school, `Học sinh Tải ${i}`]);
      vai.push([uid]);
      gd.push([sid, lopIds[Math.floor(i / 35)]]);
    }
    await client.query(
      `insert into core.users (id, auth_uid, email, full_name, status)
       select * from unnest($1::uuid[],$2::uuid[],$3::text[],$4::text[]) as t(a,b,c,d), lateral (select 'active') s(e)
       on conflict do nothing`,
      [users.map((u) => u[0]), users.map((u) => u[1]), users.map((u) => u[2]), users.map((u) => u[3])],
    );
    await client.query(
      `insert into core.students (id, student_code, user_id, school_id, full_name)
       select * from unnest($1::uuid[],$2::text[],$3::uuid[],$4::uuid[],$5::text[])
       on conflict do nothing`,
      [hs.map((x) => x[0]), hs.map((x) => x[1]), hs.map((x) => x[2]), hs.map((x) => x[3]), hs.map((x) => x[4])],
    );
    await client.query(
      `insert into core.user_role_scopes (user_id, role_code)
       select u, 'student' from unnest($1::uuid[]) as u on conflict do nothing`,
      [vai.map((v) => v[0])],
    );
    // `core.enrollments` KHÔNG có unique thường mà có ràng buộc EXCLUDE chống chồng kỳ
    // (`enrollments_no_overlap`). Postgres KHÔNG cho `on conflict` bám vào ràng buộc
    // EXCLUDE — nên chỗ này phải tự lọc trước khi ghi, và đây cũng đúng là cái bẫy mà
    // job nạp danh sách khối sẽ gặp: `on conflict do nothing` ở đó sẽ NÉM LỖI chứ không
    // im lặng bỏ qua như người viết tưởng.
    await client.query(
      `insert into core.enrollments (student_id, class_id, valid_from)
       select s, c, '2026-09-05'::date
         from unnest($1::uuid[], $2::uuid[]) as t(s, c)
        where not exists (select 1 from core.enrollments e where e.student_id = t.s)`,
      [gd.map((x) => x[0]), gd.map((x) => x[1])],
    );
  }
  return n;
}

/**
 * Một lượt check-in, đi ĐÚNG câu mà `checkin.submitMood` chạy: mở phiên dưới danh tính
 * của em (RLS làm việc thật), gọi `attendance.resolve_checkin` để hệ tự quyết đúng giờ
 * hay muộn, rồi upsert. Trả về mili-giây.
 */
async function motLuot(client, chiSo, mood) {
  const auth = `91000000-0000-0000-0000-${String(chiSo).padStart(12, "0")}`;
  const sid = `71000000-0000-0000-0000-${String(chiSo).padStart(12, "0")}`;
  const t0 = performance.now();
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [auth]);
    const r = await client.query(
      `select occurred_on, status, source from attendance.resolve_checkin($1, now(), $2::inet, false)`,
      [sid, "10.20.0.5"],
    );
    const row = r.rows[0];
    await client.query(
      `insert into attendance.checkins (student_id, occurred_on, kind, mood, status, source)
       values ($1, $2, 'in', $3, $4, $5)
       on conflict (student_id, occurred_on, kind) do update set mood = $3`,
      [sid, row.occurred_on, mood, row.status, row.source],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
  return performance.now() - t0;
}

async function main() {
  console.log(`Bộ đo tải · ${SO_LUOT} lượt check-in · ${SO_LUONG} luồng song song · DB ${DB_NAME}`);
  console.log("Dựng database riêng…");
  await dungDatabase();
  console.log("Nạp migration + fixture…");
  await napSchema();

  const pool = new pg.Pool({ connectionString: loadUrl, max: SO_LUONG + 4 });
  pool.on("connect", (c) => { c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {}); });

  const gieo = await pool.connect();
  console.log(`Gieo ${SO_LUOT} học sinh có tài khoản thật…`);
  await gieoHocSinh(gieo, SO_LUOT);
  gieo.release();

  // ── Cơn bão ───────────────────────────────────────────────────────────────
  const doTre = [];
  const loi = [];
  let ke = 0;
  const batDau = performance.now();

  async function luong() {
    const client = await pool.connect();
    try {
      for (;;) {
        const i = ke++;
        if (i >= SO_LUOT) return;
        try {
          doTre.push(await motLuot(client, i, (i % 4) + 1));
        } catch (e) {
          loi.push(`${i}: ${e.code ?? ""} ${e.message}`);
        }
      }
    } finally {
      client.release();
    }
  }
  await Promise.all(Array.from({ length: SO_LUONG }, luong));
  const tongGiay = (performance.now() - batDau) / 1000;

  // ── Vế thứ hai của lời nghiệm thu: 0 bản ghi đôi ──────────────────────────
  //
  // Chạy LẠI 10% số lượt, đúng những em vừa check-in. Nếu upsert đúng thì số dòng
  // KHÔNG đổi. Không có bước này thì "0 bản ghi đôi" chỉ là hệ quả của việc mỗi em
  // được gọi đúng một lần — tức là chứng minh bằng cách không thử.
  const kiem = await pool.connect();
  const truoc = Number((await kiem.query("select count(*)::text n from attendance.checkins")).rows[0].n);
  const lapLai = Math.max(1, Math.floor(SO_LUOT / 10));
  const doTre2 = [];
  for (let i = 0; i < lapLai; i++) {
    try { doTre2.push(await motLuot(kiem, i, 4)); } catch (e) { loi.push(`lặp ${i}: ${e.message}`); }
  }
  const sau = Number((await kiem.query("select count(*)::text n from attendance.checkins")).rows[0].n);
  const doi = Number(
    (await kiem.query(
      `select coalesce(sum(c - 1), 0)::text n from (
         select count(*) c from attendance.checkins group by student_id, occurred_on, kind having count(*) > 1
       ) t`,
    )).rows[0].n,
  );
  kiem.release();
  await pool.end();

  // ── Kết luận ──────────────────────────────────────────────────────────────
  const d = tomTatDoTre(doTre);
  const d2 = tomTatDoTre(doTre2);
  const nguong = { p95: 500 };
  console.log("\n─────────────── KẾT QUẢ ───────────────");
  console.log(`Thời gian chạy      : ${tongGiay.toFixed(1)}s (${(SO_LUOT / tongGiay).toFixed(1)} lượt/giây)`);
  console.log(`Độ trễ (ms)         : p50 ${d.p50} · p95 ${d.p95} · p99 ${d.p99} · max ${d.max} · min ${d.min}`);
  console.log(`Lượt lặp lại (ms)   : p50 ${d2.p50} · p95 ${d2.p95}`);
  console.log(`Lỗi                 : ${loi.length}`);
  if (loi.length) loi.slice(0, 5).forEach((e) => console.log(`   · ${e}`));
  console.log(`Dòng check-in       : ${truoc} trước khi lặp · ${sau} sau khi lặp lại ${lapLai} lượt`);
  console.log(`Bản ghi đôi         : ${doi}`);

  const dat = [];
  const truot = [];
  (d.p95 !== null && d.p95 < nguong.p95 ? dat : truot).push(`p95 ${d.p95}ms (ngưỡng < ${nguong.p95}ms)`);
  (loi.length === 0 ? dat : truot).push(`${loi.length} lỗi (ngưỡng 0)`);
  (doi === 0 ? dat : truot).push(`${doi} bản ghi đôi (ngưỡng 0)`);
  (sau === truoc ? dat : truot).push(`lặp lại không sinh dòng mới (${truoc} → ${sau})`);

  console.log("\nĐẠT   : " + (dat.join(" · ") || "(không có)"));
  console.log("TRƯỢT : " + (truot.join(" · ") || "(không có)"));

  if (!GIU_DB) {
    const a2 = new pg.Client({ connectionString: ADMIN_URL });
    await a2.connect();
    await a2.query(`drop database if exists ${DB_NAME} with (force)`);
    await a2.end();
    console.log(`\nĐã xoá ${DB_NAME}. Dùng --giu để giữ lại mà soi tay.`);
  }

  process.exit(truot.length ? 1 : 0);
}

main().catch((e) => {
  console.error("BỘ ĐO TẢI HỎNG:", e);
  process.exit(1);
});
