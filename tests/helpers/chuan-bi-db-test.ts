// tests/helpers/chuan-bi-db-test.ts — dựng (hoặc dùng lại) database riêng cho bộ test.
//
// Mâu thuẫn phải giải (nợ #41):
//   · pgTAP chạy trong transaction rồi rollback → không cần dữ liệu bền.
//   · Test TypeScript chạy qua pool thật, mỗi truy vấn một transaction → CẦN dữ liệu
//     seed BỀN. Mà seed lại nằm trên `hub_dev`, nơi buồng lái đọc sổ vận hành.
// Lối ra: một database riêng `hub_test`, dựng lại từ đúng bộ migration + đúng seed.mjs.
//
// Điều kiện thứ hai, quan trọng ngang điều thứ nhất: ĐỪNG LÀM CHẬM BỘ TEST tới mức
// không ai chạy nữa. Dựng lại cả bộ migration + seed mỗi lượt `vitest run` là cách chắc
// chắn nhất để bộ test bị bỏ. Nên ở đây có DẤU VÂN: băm toàn bộ nội dung thư mục
// migrations + seed.mjs, ghi vào chính database test. Vân khớp → dùng lại, tốn đúng
// một câu truy vấn. Vân lệch (ai đó thêm migration, sửa seed) → dựng lại từ đầu.
//
// Vì sao KHÔNG "thấy database có vẻ đã migrate thì dùng luôn": một `hub_test` cũ, thiếu
// ba migration mới nhất, trông y hệt một `hub_test` đúng. Nhận nhầm nó là xanh giả —
// đúng loại hỏng mà cả gói này sinh ra để chặn. Thà dựng lại.
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tenDatabase, doiTenDatabase, urlDbTest } from "./db-test-url.ts";

// `pg` không resolve được từ thư mục tests/ bằng import thường (tests/ nằm ngoài mọi
// package, node_modules ở gốc chỉ có typescript + vitest). Mượn đường resolve của
// packages/core — đúng cách packages/core/db/client.ts vẫn nạp nó.
const requireTuCore = createRequire(new URL("../../packages/core/package.json", import.meta.url));

interface KetQuaTruyVan {
  rows: Array<Record<string, unknown>>;
}
interface ClientPg {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<KetQuaTruyVan>;
  end(): Promise<void>;
}
interface LoiPg extends Error {
  code?: string;
}

function moClient(url: string): ClientPg {
  const pg = requireTuCore("pg") as { Client: new (cfg: { connectionString: string }) => ClientPg };
  return new pg.Client({ connectionString: url });
}

/**
 * Mở kết nối rồi GHIM MÚI GIỜ ngay, đúng khuôn `packages/core/db/client.ts`.
 *
 * `tests/unit/mui-gio.test.ts` mới chỉ quét `tools/ packages/ apps/` nên file này không
 * bị nó soi — nhưng lý do của luật vẫn áp: Postgres mặc định chạy UTC, còn trường vận
 * hành theo giờ Việt Nam, nên trong khung 00:00–06:59 giờ VN mọi `current_date` là ngày
 * hôm trước. Database test dựng lúc nửa đêm mà chạy giờ UTC thì dữ liệu seed rơi sang
 * ngày khác với dữ liệu do test sinh ra — và bài đỏ kiểu đó tốn cả buổi để hiểu.
 * (Đã cắn thật một lần: xem chú thích trong `mui-gio.test.ts`, 01/08/2026 lúc 00:38.)
 */
async function moVaGhimMuiGio(url: string): Promise<ClientPg> {
  const c = moClient(url);
  await c.connect();
  await c.query("set time zone 'Asia/Ho_Chi_Minh'");
  return c;
}

const GOC = new URL("../../", import.meta.url);
const THU_MUC_MIGRATIONS = fileURLToPath(new URL("packages/core/db/migrations/", GOC));
const DUONG_SEED = fileURLToPath(new URL("packages/core/db/seed/seed.mjs", GOC));

/** Dấu vân của "hình dạng database đúng": mọi migration + chính file seed. */
function tinhDauVan(): string {
  const bam = createHash("sha256");
  const ten = readdirSync(THU_MUC_MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of ten) {
    bam.update(f);
    bam.update(readFileSync(`${THU_MUC_MIGRATIONS}${f}`));
  }
  bam.update(readFileSync(DUONG_SEED));
  return `${ten.length}-${bam.digest("hex").slice(0, 32)}`;
}

async function dauVanHienCo(url: string): Promise<string | undefined | "khong-co-database"> {
  let c: ClientPg;
  try {
    c = await moVaGhimMuiGio(url);
  } catch (err) {
    // 3D000 = database không tồn tại. Mọi mã lỗi khác (sai mật khẩu, Postgres chưa
    // chạy) phải nổi lên nguyên vẹn — nuốt nó thành "chưa có database" rồi đi dựng
    // là cách biến một lỗi hạ tầng rõ ràng thành một lỗi khó hiểu ở bước sau.
    if ((err as LoiPg).code === "3D000") return "khong-co-database";
    throw err;
  }
  try {
    const r = await c.query(`select van from test_meta.dau_van where id = 1`);
    return (r.rows[0]?.van as string | undefined) ?? undefined;
  } catch {
    // Bảng chưa tồn tại → database chưa từng được gói này dựng.
    return undefined;
  } finally {
    await c.end();
  }
}

async function dungLaiDatabase(urlTest: string, van: string, ghi: (s: string) => void): Promise<void> {
  const ten = tenDatabase(urlTest);
  // `drop database` không nhận tham số bind, tên phải ghép thẳng vào câu lệnh. Chặn ở
  // đây thay vì tin vào escape: tên database test do người gõ trong biến môi trường.
  if (!/^[A-Za-z0-9_]+$/.test(ten)) {
    throw new Error(`Tên database test "${ten}" có ký tự lạ — từ chối ghép vào câu lệnh DDL.`);
  }
  // ── HÀNG RÀO THỨ HAI, cố ý viết lại luật thay vì gọi laTenDbTest() ──────────────
  // Chuyện đã xảy ra thật lúc 00:40 ngày 02/08/2026, ngay trong lượt THỬ NGƯỢC của
  // chính gói này: để xem cổng có đỏ không, tôi tạm cho `laTenDbTest()` trả `true` với
  // mọi tên. Lớp kiểm ở `chuanBiDbTest()` gọi đúng hàm vừa bị phá nên nó gật đầu, và
  // hàm này DROP luôn `hub_dev` — database mà Hub đang phục vụ. Server sống lại được
  // vì migrations + seed chạy lại ngay sau đó, nhưng 454 dòng `ops.job_runs` và mọi dữ
  // liệu gõ tay trên máy dev thì mất hẳn.
  // Bài học không phải "đừng thử ngược" mà là: một câu `drop database` không được phép
  // dựa vào một hàm ở file khác. Điều kiện phải nằm ngay cạnh câu lệnh nguy hiểm, viết
  // bằng hằng số, để phá được nó phải sửa ĐÚNG dòng này.
  if (!(ten === "test" || ten.endsWith("_test") || ten.startsWith("test_"))) {
    throw new Error(
      `TU CHOI DROP: "${ten}" không phải database test. Câu drop database chỉ chạy trên ` +
        `tên có dạng _test/test_ — xem lời kể trong tests/helpers/chuan-bi-db-test.ts.`,
    );
  }
  const urlBaoTri = doiTenDatabase(urlTest, "postgres");

  const admin = await moVaGhimMuiGio(urlBaoTri);
  try {
    // Kết nối cũ còn treo thì `drop database` báo lỗi thay vì chạy; ngắt trước.
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [ten],
    );
    await admin.query(`drop database if exists "${ten}"`);
    await admin.query(`create database "${ten}"`);
  } finally {
    await admin.end();
  }

  const c = await moVaGhimMuiGio(urlTest);
  try {
    const files = readdirSync(THU_MUC_MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const sql = readFileSync(`${THU_MUC_MIGRATIONS}${f}`, "utf8");
      try {
        await c.query(sql);
      } catch (err) {
        throw new Error(`Migration ${f} lỗi khi dựng ${ten}: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }
  } finally {
    await c.end();
  }

  // Gọi ĐÚNG seed.mjs chứ không chép lại dữ liệu seed sang đây: hai bản seed lệch nhau
  // là cách bộ test chạy trên một trường không có thật (xem lời cảnh báo đầu seed.mjs).
  const seed = spawnSync(process.execPath, [DUONG_SEED], {
    env: { ...process.env, DATABASE_URL: urlTest },
    encoding: "utf8",
  });
  if (seed.status !== 0) {
    throw new Error(`seed.mjs thất bại trên ${ten}:\n${seed.stdout ?? ""}\n${seed.stderr ?? ""}`);
  }

  const c2 = await moVaGhimMuiGio(urlTest);
  try {
    // Schema riêng, KHÔNG nằm trong bộ migration: bước "diff schema" của CI chỉ so các
    // schema nghiệp vụ, nên dấu vân không bao giờ trở thành một khác biệt giả.
    await c2.query(`create schema if not exists test_meta`);
    await c2.query(
      `create table if not exists test_meta.dau_van (
         id int primary key check (id = 1),
         van text not null,
         dung_luc timestamptz not null default now()
       )`,
    );
    await c2.query(
      `insert into test_meta.dau_van (id, van) values (1, $1)
         on conflict (id) do update set van = excluded.van, dung_luc = now()`,
      [van],
    );
  } finally {
    await c2.end();
  }
  ghi(`   đã dựng lại ${ten}: ${readdirSync(THU_MUC_MIGRATIONS).filter((f) => f.endsWith(".sql")).length} migration + seed`);
}

/**
 * Bảo đảm database test tồn tại, đúng bộ migration hiện tại, đã seed.
 * Trả về chuỗi kết nối tới nó, hoặc `undefined` khi không có DATABASE_URL nào
 * (chạy `vitest run tests/unit` trên máy chưa dựng Postgres — đó là chuyện bình thường).
 */
export async function chuanBiDbTest(
  env: Record<string, string | undefined> = process.env,
  ghi: (s: string) => void = (s) => console.log(s),
): Promise<string | undefined> {
  const urlTest = urlDbTest(env);
  if (!urlTest) return undefined;

  const ten = tenDatabase(urlTest);
  // Hằng số, không gọi laTenDbTest() — xem lời kể ở `dungLaiDatabase` phía trên.
  if (!(ten === "test" || ten.endsWith("_test") || ten.startsWith("test_"))) {
    throw new Error(`Từ chối chạy test trên database "${ten}" — không phải database test (nợ #41).`);
  }

  const van = tinhDauVan();
  const batDau = Date.now();
  const hienCo = await dauVanHienCo(urlTest);
  if (hienCo === van) {
    ghi(`[db-test] dùng lại ${ten} (dấu vân khớp, ${Date.now() - batDau}ms)`);
    return urlTest;
  }
  const lyDo = hienCo === "khong-co-database" ? "chưa có database" : "dấu vân lệch";
  ghi(`[db-test] dựng lại ${ten} — ${lyDo}`);
  await dungLaiDatabase(urlTest, van, ghi);
  ghi(`[db-test] xong ${ten} sau ${Date.now() - batDau}ms`);
  return urlTest;
}
