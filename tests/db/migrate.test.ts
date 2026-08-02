// tests/db/migrate.test.ts
//
// Bộ chạy migration + sổ ghi (`tools/migrate/migrate.mjs` · migration `0050`, nợ
// `DEBT` #23). Bài này chạy CÔNG CỤ THẬT bằng đúng cách người vận hành gõ nó — spawn
// một tiến trình node, đọc mã thoát và chữ in ra — trên các database TỰ DỰNG rồi TỰ
// XOÁ. Không bài nào ở đây chạm `hub_dev`, `hub_test` hay bất kỳ database dùng chung
// nào: một bộ chạy migration mà test của nó áp migration lên database của người khác
// thì chính nó là thứ nguy hiểm nhất trong kho.
//
// Vì sao có cả corpus GIẢ lẫn corpus THẬT:
//   · Corpus giả (3 file bịa) — kiểm LOGIC của bộ chạy: sổ, từ chối áp lại, lệch băm,
//     transaction, nhận nợ. Nhanh, và mỗi ca dựng được đúng tình huống muốn dựng.
//   · Corpus thật (toàn bộ file của kho, đếm từ đĩa) — kiểm rằng LOGIC ĐÓ đúng trên thứ sẽ chạy thật.
//     Một bộ chạy xanh trên ba file bịa mà nghẹn ở file thứ 37 của kho là bộ chạy
//     chưa từng được kiểm.
//
// Ca quan trọng nhất của cả file là "NHẬN NỢ BAN ĐẦU": 48 migration đã áp bằng tay
// lên hub_dev trước khi có sổ, nên sổ TRỐNG không có nghĩa "chưa áp gì". Làm sai bước
// đó thì lần chạy đầu tiên áp lại toàn bộ lên một database đã có sẵn mọi thứ.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
  cpSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const pg = require("pg");

const GOC = new URL("../../", import.meta.url);
const CONG_CU = fileURLToPath(new URL("tools/migrate/migrate.mjs", GOC));
const MIGRATIONS_THAT = fileURLToPath(new URL("packages/core/db/migrations/", GOC));
const SO_GHI_THAT = `${MIGRATIONS_THAT}0050_so_ghi_migration.sql`;

/**
 * Số file migration ĐẾM TỪ ĐĨA, không viết cứng.
 *
 * Trước 02/08/2026 con số này là `50` viết thẳng trong assertion, và migration `0051`
 * làm bài test đỏ — đỏ vì kho lớn thêm, không vì bộ chạy sai. Một cổng đỏ theo cách đó
 * dạy người ta sửa con số cho xanh, tức là dạy đúng thói quen mà cả bộ test sinh ra để
 * chống. Điều đáng khẳng định không phải "có đúng 50 file" mà là **sổ ghi khớp đĩa**:
 * bộ chạy áp hết, không sót, không thừa.
 */
const SO_FILE_THAT = readdirSync(MIGRATIONS_THAT).filter((f) => /^\d{4}_.*\.sql$/.test(f)).length;
const VERSION_CUOI = readdirSync(MIGRATIONS_THAT)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .map((f) => f.slice(0, 4))
  .sort()
  .at(-1)!;

/** Ba database nháp, tự dựng tự xoá. Hậu tố `_test` theo đúng luật đặt tên của kho. */
const DB_GIA = "hub_migrate_gia_test";
const DB_TAY = "hub_migrate_tay_test";
const DB_THAT = "hub_migrate_that_test";

let ready = false;
let urlGoc = "";
let thuMucGia = "";

function doiTenDb(url: string, ten: string): string {
  const u = new URL(url);
  u.pathname = `/${ten}`;
  return u.toString();
}

async function voiKetNoi<T>(url: string, fn: (c: any) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function dungLaiDb(ten: string): Promise<void> {
  await voiKetNoi(doiTenDb(urlGoc, "postgres"), async (c) => {
    await c.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [ten],
    );
    await c.query(`drop database if exists "${ten}"`);
    await c.query(`create database "${ten}"`);
  });
}

async function xoaDb(ten: string): Promise<void> {
  await voiKetNoi(doiTenDb(urlGoc, "postgres"), async (c) => {
    await c.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
      [ten],
    );
    await c.query(`drop database if exists "${ten}"`);
  }).catch(() => {});
}

/** Chạy công cụ đúng như người vận hành gõ. Trả mã thoát + toàn bộ chữ in ra. */
function chay(args: string[], ten: string, dir?: string): { ma: number; chu: string } {
  const doiSo = [CONG_CU, ...args, `--url=${doiTenDb(urlGoc, ten)}`];
  if (dir) doiSo.push(`--dir=${dir}`);
  const r = spawnSync(process.execPath, doiSo, { encoding: "utf8" });
  return { ma: r.status ?? -1, chu: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

async function doc<T = any>(ten: string, sql: string): Promise<T[]> {
  return voiKetNoi(doiTenDb(urlGoc, ten), async (c) => (await c.query(sql)).rows);
}

beforeAll(async () => {
  urlGoc = process.env.DATABASE_URL ?? "";
  if (!urlGoc) return;
  try {
    await voiKetNoi(doiTenDb(urlGoc, "postgres"), (c) => c.query("select 1"));
  } catch {
    return;
  }
  ready = true;

  // Corpus GIẢ: hai file bịa + BẢN SAO file sổ ghi thật. Cố ý copy file thật chứ không
  // viết lại một bảng sổ khác: bộ chạy tìm file mồi bằng dấu hiệu `migrate:so-ghi`, và
  // nếu bản sao ở đây lệch với bản thật thì bài test kiểm một công cụ không tồn tại.
  thuMucGia = mkdtempSync(join(tmpdir(), "hub-mig-"));
  writeFileSync(
    join(thuMucGia, "0001_nen.sql"),
    "begin;\ncreate schema if not exists core;\ncreate table if not exists core.users (id int primary key);\ncommit;\n",
  );
  writeFileSync(
    join(thuMucGia, "0002_them.sql"),
    "begin;\ncreate table if not exists ops.thu_hai (i int);\ncommit;\n",
  );
  copyFileSync(SO_GHI_THAT, join(thuMucGia, "0050_so_ghi_migration.sql"));
});

afterAll(async () => {
  if (thuMucGia) rmSync(thuMucGia, { recursive: true, force: true });
  if (!ready) return;
  await xoaDb(DB_GIA);
  await xoaDb(DB_TAY);
  await xoaDb(DB_THAT);
});

describe("bộ chạy migration — biết đã áp tới đâu, và từ chối áp lại (DEBT #23)", () => {
  it("database rỗng: status nói rỗng, up dựng đủ và ghi sổ đủ", async ({ skip }) => {
    if (!ready) return skip();
    await dungLaiDb(DB_GIA);

    const st = chay(["status"], DB_GIA, thuMucGia);
    expect(st.ma).toBe(0);
    expect(st.chu).toContain("Database rỗng");

    const up = chay(["up"], DB_GIA, thuMucGia);
    expect(up.ma).toBe(0);

    const so = await doc<{ version: string; nhan_no: boolean; duration_ms: number }>(
      DB_GIA,
      "select version, nhan_no, duration_ms from ops.schema_migrations order by version",
    );
    expect(so.map((x) => x.version)).toEqual(["0001", "0002", "0050"]);
    // Không dòng nào là "nhận nợ": bộ chạy đã CHẠY THẬT cả ba, nên cả ba phải có
    // thời gian chạy. Đây là chỗ sổ phân biệt "tôi đã chạy" với "tôi tin là đã có".
    expect(so.every((x) => x.nhan_no === false)).toBe(true);
    expect(so.every((x) => typeof x.duration_ms === "number")).toBe(true);
  });

  it("§9 — chạy `up` lần thứ hai là no-op, không dòng sổ nào nhân đôi", async ({ skip }) => {
    if (!ready) return skip();
    const lai = chay(["up"], DB_GIA, thuMucGia);
    expect(lai.ma).toBe(0);
    expect(lai.chu).toContain("Không có gì để áp");
    const n = await doc<{ n: string }>(DB_GIA, "select count(*)::text as n from ops.schema_migrations");
    expect(Number(n[0]!.n)).toBe(3);
  });

  it("SỬA MỘT KÝ TỰ trong migration ĐÃ ÁP → TỪ CHỐI CHẠY (ca im lặng nhất)", async ({ skip }) => {
    if (!ready) return skip();
    const duong = join(thuMucGia, "0002_them.sql");
    const goc = readFileSync(duong, "utf8");
    try {
      writeFileSync(duong, `${goc}-- thêm đúng một dòng chú thích\n`);
      const r = chay(["up"], DB_GIA, thuMucGia);
      expect(r.ma).toBe(1);
      expect(r.chu).toContain("LỆCH BĂM");
      expect(r.chu).toContain("TU CHOI CHAY");
      // `status` cũng phải đỏ, không chỉ `up`: CI dùng `status` như một cổng chỉ-xem,
      // và một cổng chỉ-xem luôn xanh thì không phải cổng.
      expect(chay(["status"], DB_GIA, thuMucGia).ma).toBe(1);
    } finally {
      writeFileSync(duong, goc);
    }
    // HOÀN NGUYÊN: xanh trở lại. Không có nửa này thì không chứng minh được cổng đang
    // bắt đúng thứ nó định bắt, chứ không phải bắt tất cả mọi thứ.
    expect(chay(["up"], DB_GIA, thuMucGia).ma).toBe(0);
  });

  it("XOÁ một migration đã áp khỏi đĩa → TỪ CHỐI CHẠY", async ({ skip }) => {
    if (!ready) return skip();
    const duong = join(thuMucGia, "0002_them.sql");
    const goc = readFileSync(duong, "utf8");
    try {
      rmSync(duong);
      const r = chay(["up"], DB_GIA, thuMucGia);
      expect(r.ma).toBe(1);
      expect(r.chu).toContain("CÓ TRONG SỔ MÀ MẤT FILE");
    } finally {
      writeFileSync(duong, goc);
    }
    expect(chay(["up"], DB_GIA, thuMucGia).ma).toBe(0);
  });

  it("hai file cùng số → từ chối trước khi chạm database", async ({ skip }) => {
    if (!ready) return skip();
    const trung = join(thuMucGia, "0002_ban_sao.sql");
    try {
      copyFileSync(join(thuMucGia, "0002_them.sql"), trung);
      const r = chay(["status"], DB_GIA, thuMucGia);
      expect(r.ma).toBe(1);
      expect(r.chu).toContain("Hai file cùng số 0002");
    } finally {
      rmSync(trung, { force: true });
    }
  });

  it("migration hỏng giữa chừng: không đối tượng nào ở lại, KHÔNG dòng sổ nào ở lại", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const duong = join(thuMucGia, "0003_co_tinh_hong.sql");
    try {
      writeFileSync(duong, "begin;\ncreate table ops.nua_voi (i int);\nselect 1/0;\ncommit;\n");
      const r = chay(["up"], DB_GIA, thuMucGia);
      expect(r.ma).toBe(1);
      expect(r.chu).toContain("division by zero");

      const [x] = await doc<{ bang: string | null; dong: string }>(
        DB_GIA,
        `select to_regclass('ops.nua_voi')::text as bang,
                (select count(*)::text from ops.schema_migrations where version = '0003') as dong`,
      );
      // Hai câu này LÀ định nghĩa của "không để lại nửa vời": bảng không tồn tại VÀ
      // sổ không ghi. Dòng sổ nằm ngay trước `commit;` của chính file nên Postgres
      // cuốn cả hai đi cùng một lượt.
      expect(x!.bang).toBeNull();
      expect(x!.dong).toBe("0");
      // Dấu vết trong ops.job_runs kiểm ở corpus THẬT bên dưới: corpus giả không có
      // `0008` nên không có bảng đó, và dựng một bản `ops.job_runs` giả ở đây là kiểm
      // một cái bảng không tồn tại ngoài đời.
    } finally {
      rmSync(duong, { force: true });
    }
  });

  it("file không có cặp begin;/commit; → từ chối, vì dòng sổ sẽ mất tính nguyên tử", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const duong = join(thuMucGia, "0004_hinh_dang_la.sql");
    try {
      writeFileSync(duong, "create table if not exists ops.hinh_dang_la (i int);\n");
      const r = chay(["up"], DB_GIA, thuMucGia);
      expect(r.ma).toBe(1);
      expect(r.chu).toContain("không tìm thấy cặp");
    } finally {
      rmSync(duong, { force: true });
    }
  });

  it("--dry-run không gửi câu lệnh nào, không ghi dòng sổ nào", async ({ skip }) => {
    if (!ready) return skip();
    const duong = join(thuMucGia, "0005_chua_ap.sql");
    try {
      writeFileSync(duong, "begin;\ncreate table if not exists ops.chua_ap (i int);\ncommit;\n");
      const r = chay(["up", "--dry-run"], DB_GIA, thuMucGia);
      expect(r.ma).toBe(0);
      expect(r.chu).toContain("DRY-RUN");
      const [x] = await doc<{ bang: string | null; dong: string }>(
        DB_GIA,
        `select to_regclass('ops.chua_ap')::text as bang,
                (select count(*)::text from ops.schema_migrations where version = '0005') as dong`,
      );
      expect(x!.bang).toBeNull();
      expect(x!.dong).toBe("0");
    } finally {
      rmSync(duong, { force: true });
    }
  });
});

describe("NHẬN NỢ BAN ĐẦU — 48 migration đã áp bằng tay trước khi có sổ", () => {
  it("sổ trống + database ĐÃ SỐNG → `up` TỪ CHỐI và chỉ sang baseline", async ({ skip }) => {
    if (!ready) return skip();
    await dungLaiDb(DB_TAY);
    // Dựng đúng tình huống của hub_dev: migration đầu đã áp BẰNG TAY, không qua sổ.
    await voiKetNoi(doiTenDb(urlGoc, DB_TAY), (c) =>
      c.query(readFileSync(join(thuMucGia, "0001_nen.sql"), "utf8")),
    );

    const r = chay(["up"], DB_TAY, thuMucGia);
    expect(r.ma).toBe(1);
    expect(r.chu).toContain("TU CHOI CHAY");
    expect(r.chu).toContain("baseline");
    // Cổng này là cổng quan trọng nhất của cả công cụ: thiếu nó, lần chạy đầu tiên
    // trên hub_dev áp lại 48 file lên một database đã có sẵn mọi thứ.
    const [x] = await doc<{ co: boolean }>(
      DB_TAY,
      "select to_regclass('ops.schema_migrations') is not null as co",
    );
    expect(x!.co).toBe(false);
  });

  it("baseline --to=0001 nhận nợ ĐÚNG một file, không chạy nó, và không đụng file sau", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const r = chay(["baseline", "--to=0001", "--ghi-chu=áp tay trước khi có sổ"], DB_TAY, thuMucGia);
    expect(r.ma).toBe(0);

    const so = await doc<{ version: string; nhan_no: boolean; duration_ms: number | null }>(
      DB_TAY,
      "select version, nhan_no, duration_ms from ops.schema_migrations order by version",
    );
    // 0001 = nhận nợ (không có thời gian chạy). 0050 = chạy thật (file mồi, có thời
    // gian chạy). 0002 chưa có mặt — nhận nợ KHÔNG được lấn sang file chưa áp.
    expect(so.map((x) => x.version)).toEqual(["0001", "0050"]);
    expect(so.find((x) => x.version === "0001")!.nhan_no).toBe(true);
    expect(so.find((x) => x.version === "0001")!.duration_ms).toBeNull();
    expect(so.find((x) => x.version === "0050")!.nhan_no).toBe(false);

    // `ops.thu_hai` là bảng của 0002 — chưa áp, nên chưa được tồn tại.
    const [x] = await doc<{ bang: string | null }>(
      DB_TAY,
      "select to_regclass('ops.thu_hai')::text as bang",
    );
    expect(x!.bang).toBeNull();
  });

  it("sau nhận nợ, `up` chạy ĐÚNG phần còn thiếu", async ({ skip }) => {
    if (!ready) return skip();
    const r = chay(["up"], DB_TAY, thuMucGia);
    expect(r.ma).toBe(0);
    const [x] = await doc<{ bang: string | null; n: string }>(
      DB_TAY,
      `select to_regclass('ops.thu_hai')::text as bang,
              (select count(*)::text from ops.schema_migrations) as n`,
    );
    expect(x!.bang).toBe("ops.thu_hai");
    expect(x!.n).toBe("3");
  });

  it("baseline lần hai là no-op (§9)", async ({ skip }) => {
    if (!ready) return skip();
    const r = chay(["baseline", "--to=0001"], DB_TAY, thuMucGia);
    expect(r.ma).toBe(0);
    expect(r.chu).toContain("Không có gì để nhận nợ");
  });

  it("baseline trên database RỖNG bị TỪ CHỐI — nhận nợ mình không có là tự bịt mắt", async ({
    skip,
  }) => {
    if (!ready) return skip();
    await dungLaiDb(DB_GIA);
    const r = chay(["baseline", "--to=0002"], DB_GIA, thuMucGia);
    expect(r.ma).toBe(1);
    expect(r.chu).toContain("TU CHOI NHAN NO");
  });

  it("baseline thiếu --to bị từ chối — nhận nợ tới đâu không phải thứ công cụ được đoán", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const r = chay(["baseline"], DB_TAY, thuMucGia);
    expect(r.ma).toBe(1);
    expect(r.chu).toContain("--to=");
  });
});

describe(`corpus THẬT — ${SO_FILE_THAT} migration của kho, dựng từ database rỗng`, () => {
  it(
    "up dựng đủ số file trên đĩa, ghi đủ chừng ấy dòng sổ, và backup_reader đọc được sổ (ADR-006)",
    async ({ skip }) => {
      if (!ready) return skip();
      await dungLaiDb(DB_THAT);
      const r = chay(["up"], DB_THAT, MIGRATIONS_THAT);
      expect(r.ma).toBe(0);

      const [x] = await doc<{ n: string; nhan_no: string; v_max: string }>(
        DB_THAT,
        `select count(*)::text as n,
                count(*) filter (where nhan_no)::text as nhan_no,
                max(version) as v_max
           from ops.schema_migrations`,
      );
      expect(x!.n).toBe(String(SO_FILE_THAT));
      expect(x!.nhan_no).toBe("0");
      expect(x!.v_max).toBe(VERSION_CUOI);

      // Đây là hệ quả của việc file mồi phải chạy TRƯỚC 0001 (nơi tạo vai
      // backup_reader): GRANT trong nó bị bỏ qua ở lần đầu, và bộ chạy phải chạy lại
      // file mồi ở cuối lượt. Không có bước đó thì database dựng bằng `up` thiếu đúng
      // một quyền so với database dựng bằng tools/run-db-tests.sh — hai đường dựng ra
      // hai kết quả khác nhau là loại lệch tệ nhất.
      const [q] = await doc<{ co: boolean }>(
        DB_THAT,
        "select has_table_privilege('backup_reader', 'ops.schema_migrations', 'select') as co",
      );
      expect(q!.co).toBe(true);

      const [job] = await doc<{ status: string }>(
        DB_THAT,
        "select status from ops.job_runs where job_name = 'migrate' order by id desc limit 1",
      );
      expect(job!.status).toBe("success");
    },
    120_000,
  );

  it("chạy lại trên chính nó: no-op, và cột detail của care.flags vẫn đóng (0049)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const r = chay(["up"], DB_THAT, MIGRATIONS_THAT);
    expect(r.ma).toBe(0);
    expect(r.chu).toContain("Không có gì để áp");
    // Một câu kiểm chéo: database dựng bằng bộ chạy phải mang đúng phân quyền mà
    // database dựng bằng đường cũ mang. Nếu 0049 không được áp thì câu này xanh giả.
    const [x] = await doc<{ co_cot: boolean; co_view: string | null }>(
      DB_THAT,
      `select has_column_privilege('authenticated', 'care.flags', 'detail', 'select') as co_cot,
              to_regclass('care.flags_tam_ly')::text as co_view`,
    );
    expect(x!.co_cot).toBe(false);
    expect(x!.co_view).toBe("care.flags_tam_ly");
  });

  it(
    "migration hỏng trên database THẬT: không nửa vời, và ops.job_runs ghi 'failed'",
    async ({ skip }) => {
      if (!ready) return skip();
      // Chép cả thư mục thật rồi thêm một file hỏng: đây là chỗ duy nhất kiểm được
      // "job chết để lại dấu vết", vì `ops.job_runs` chỉ tồn tại trên corpus thật.
      // Một job chết mà không để lại dấu trông y hệt một job chưa tới lịch.
      const banSao = mkdtempSync(join(tmpdir(), "hub-mig-that-"));
      try {
        cpSync(MIGRATIONS_THAT, banSao, { recursive: true });
        writeFileSync(
          join(banSao, "9999_co_tinh_hong.sql"),
          "begin;\ncreate table ops.nua_voi (i int);\nselect 1/0;\ncommit;\n",
        );
        const r = chay(["up"], DB_THAT, banSao);
        expect(r.ma).toBe(1);

        const [x] = await doc<{ bang: string | null; dong: string }>(
          DB_THAT,
          `select to_regclass('ops.nua_voi')::text as bang,
                  (select count(*)::text from ops.schema_migrations where version = '9999') as dong`,
        );
        expect(x!.bang).toBeNull();
        expect(x!.dong).toBe("0");

        const [job] = await doc<{ status: string; loi: string }>(
          DB_THAT,
          `select status, metrics->>'error' as loi from ops.job_runs
            where job_name = 'migrate' order by id desc limit 1`,
        );
        expect(job!.status).toBe("failed");
        expect(job!.loi).toContain("division by zero");
      } finally {
        rmSync(banSao, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
