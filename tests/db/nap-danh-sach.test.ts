// tests/db/nap-danh-sach.test.ts
//
// Bài này kiểm ĐẦU VÀO THẬT của việc nạp danh sách cả khối:
// `node tools/jobs/run-nap-danh-sach.mjs --file=... --nam-hoc=... --hieu-luc-tu=...`,
// chạy đúng như người vận hành sẽ chạy, trên Postgres thật. Không mock tiến trình
// con, không mock database.
//
// pgTAP (0045_nap_danh_sach_test.sql) đã khoá tầng SQL: từng nhánh của promote(),
// từng lý do trong sổ lỗi, luật EXCLUDE của core.enrollments. Bài này khoá tầng
// TIẾN TRÌNH — thứ mà pgTAP không với tới:
//
//   1. §9 Ở MỨC LỆNH. Chạy CÙNG MỘT LỆNH hai lần phải cho cùng một trạng thái kho
//      dữ liệu. Đây là phép thử thật của một job nạp: người vận hành lỡ tay bấm hai
//      lần, hoặc chạy lại sau khi sửa vài dòng lỗi, là chuyện sẽ xảy ra.
//   2. MÃ THOÁT NÓI ĐÚNG SỰ THẬT. 0 = sạch · 2 = xong nhưng có việc chờ người.
//      Gộp hai cái đó vào một là biến một hàng đợi có người chờ thành màn hình xanh.
//   3. "VẮNG MẶT TRONG FILE" KHÔNG ĐƯỢC ĐỘNG VÀO DỮ LIỆU. Nạp một file chỉ có 2 em
//      cho một lớp đang có 12 em phải ghi ra 12 dòng chờ người — và KHÔNG đóng một
//      kỳ học nào, KHÔNG đổi một status nào.
//   4. BỘ ĐỌC CSV KHÔNG LÀM LỆCH CỘT. Một cái tên có dấu phẩy trong ngoặc kép là
//      chuyện thường của file xuất từ Excel; tách thô bằng split(",") sẽ đẩy mã lớp
//      sang cột bên cạnh và ghi danh em vào một lớp khác — im lặng.
//   5. (thêm 01/08/2026, 0048) BẢN IN RA MÀN HÌNH PHẢI ĐÚNG. Khi màn hình nói
//      "Đã vào kho: 0" thì kho phải không đổi một cột nào. Đo được trước 0048: một
//      lô xếp em sang lớp khác bị TỪ CHỐI đúng thiết kế, màn hình in "Đã vào kho: 0
//      · Vào sổ lỗi: 1", nhưng core.students của em đã bị ghi đè họ tên VÀ ngày
//      sinh theo file. Người vận hành đọc "0" rồi tin là không có gì đổi — ghi một
//      phần trong im lặng. pgTAP khoá tầng SQL của việc này; bài dưới đây khoá đúng
//      cái người vận hành NHÌN THẤY.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asSystem, requireDb } from "../helpers/db";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = resolve(REPO_ROOT, "tools", "jobs", "run-nap-danh-sach.mjs");

/**
 * Tiền tố mã RIÊNG cho bài test. Năm 2099 không đụng bất kỳ dữ liệu seed nào
 * (seed dùng VA-2026-…), nên phần dọn dẹp ở afterAll xoá được sạch mà không cần
 * biết seed đang có bao nhiêu em.
 */
const MA = {
  a: "VA-2099-00001",
  b: "VA-2099-00002",
  c: "VA-2099-00003",
  /** Em dựng sẵn trong kho để đo lại đúng ca hỏng của 0048 (xem điểm 5 ở đầu file). */
  d: "VA-2099-00004",
};
const LOP = "6A1";
const LOP_KHAC = "6A2";
const CO_SO = "VA-Q7";
const NAM_HOC = "2026-2027";
const HIEU_LUC = "2026-09-05";

let ready = false;
let thuMuc = "";
let fileSach = "";

type KetQua = { ma: number; out: string };

/**
 * count(*) luôn trả đúng một dòng, nhưng kiểu của pg nói "có thể rỗng" — và tsc đúng:
 * một câu SQL gõ sai thành 0 dòng rồi `rows[0].n` ném TypeError thì bài test đỏ vì
 * lý do sai. Ép về 0 tường minh, một chỗ.
 */
function soDem(rows: { n: string }[]): number {
  return Number(rows[0]?.n ?? 0);
}

function chayNap(doiSo: string[]): Promise<KetQua> {
  return new Promise((xong) => {
    const con = spawn(process.execPath, [RUNNER, ...doiSo], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    con.stdout.on("data", (d) => (out += d));
    con.stderr.on("data", (d) => (out += d));
    con.on("error", (err) => xong({ ma: -1, out: `${out}\n${err.message}` }));
    con.on("close", (ma) => xong({ ma: ma === null ? -1 : ma, out }));
  });
}

/** Ảnh chụp trạng thái kho — dùng để so TRƯỚC và SAU lần chạy thứ hai (§9). */
async function anhChup() {
  return asSystem(async (c) => {
    const { rows } = await c.query(
      `select
         (select count(*) from core.students  where student_code like 'VA-2099-%')::int as so_em,
         (select count(*) from core.enrollments e
            join core.students s on s.id = e.student_id
           where s.student_code like 'VA-2099-%')::int as so_ky,
         (select count(*) from core.enrollments e
            join core.classes c on c.id = e.class_id
           where c.code = $1 and e.valid_to is null)::int as so_ky_mo_6a1,
         (select count(*) from staging.import_errors where source = 'cor')::int as so_loi,
         (select count(*) from staging.raw_cor_imports)::int as so_dong_tho`,
      [LOP],
    );
    return rows[0] as {
      so_em: number;
      so_ky: number;
      so_ky_mo_6a1: number;
      so_loi: number;
      so_dong_tho: number;
    };
  });
}

async function donDep() {
  await asSystem(async (c) => {
    await c.query(
      `delete from core.enrollments e using core.students s
        where s.id = e.student_id and s.student_code like 'VA-2099-%'`,
    );
    await c.query("delete from core.students where student_code like 'VA-2099-%'");
    await c.query("delete from staging.import_errors where source = 'cor'");
    await c.query("delete from staging.raw_cor_imports");
    await c.query("delete from ops.job_runs where job_name = 'nap_danh_sach'");
  });
}

beforeAll(async () => {
  ready = await requireDb();
  if (!ready) return;
  thuMuc = mkdtempSync(join(tmpdir(), "hub-nap-"));
  fileSach = join(thuMuc, "danh-sach.csv");
  writeFileSync(
    fileSach,
    [
      "ma_hoc_sinh,ho_ten,ngay_sinh,ma_co_so,ma_lop,khoi",
      // Dấu phẩy TRONG ngoặc kép: bẫy của mọi bộ đọc CSV viết vội.
      `${MA.a},"Nguyễn Văn A, Jr",2015-02-10,${CO_SO},${LOP},6`,
      `${MA.b},Trần Thị B,,${CO_SO},${LOP},6`,
      "",
    ].join("\n"),
    "utf8",
  );
  await donDep();
}, 60_000);

afterAll(async () => {
  if (ready) await donDep();
  if (thuMuc) rmSync(thuMuc, { recursive: true, force: true });
}, 60_000);

describe("nạp danh sách cả khối — tầng tiến trình", () => {
  it("lần nạp đầu: hai em vào kho, và mã thoát 2 vì lớp còn em chưa có trong file", async ({ skip }) => {
    if (!ready) return skip();
    const truoc = await anhChup();

    const kq = await chayNap([
      `--file=${fileSach}`,
      `--nam-hoc=${NAM_HOC}`,
      `--hieu-luc-tu=${HIEU_LUC}`,
    ]);

    // Lớp 6A1 của seed đang có 12 em; file chỉ nhắc 2 em mới. Nên chắc chắn có
    // dòng "vắng mặt" chờ người, và mã thoát PHẢI là 2 chứ không phải 0.
    expect(kq.out).toContain("Đã vào kho          : 2");
    expect(kq.ma).toBe(2);

    const sau = await anhChup();
    expect(sau.so_em).toBe(truoc.so_em + 2);
    expect(sau.so_ky).toBe(truoc.so_ky + 2);
    // Đây là assertion quan trọng nhất của cả file: 12 em cũ vẫn còn kỳ học MỞ.
    // Một job tự kết luận "em này nghỉ học" từ việc file thiếu tên em là đúng dạng
    // hỏng mà cả hệ này chống.
    expect(sau.so_ky_mo_6a1).toBe(truoc.so_ky_mo_6a1 + 2);
  }, 60_000);

  it("ghi ra danh sách chờ người cho từng em vắng mặt, KHÔNG đổi status của em nào", async ({ skip }) => {
    if (!ready) return skip();
    const { vang, khongActive } = await asSystem(async (c) => {
      const a = await c.query<{ n: string }>(
        `select count(*) as n from staging.import_errors
          where source = 'cor' and reason like 'vắng mặt%'`,
      );
      const b = await c.query<{ n: string }>(
        `select count(*) as n from core.students s
           join core.enrollments e on e.student_id = s.id and e.valid_to is null
           join core.classes c on c.id = e.class_id
          where c.code = $1 and s.status <> 'active'`,
        [LOP],
      );
      return { vang: soDem(a.rows), khongActive: soDem(b.rows) };
    });

    expect(vang).toBeGreaterThan(0);
    expect(khongActive).toBe(0);
  }, 60_000);

  it("đọc đúng cột dù họ tên có dấu phẩy trong ngoặc kép", async ({ skip }) => {
    if (!ready) return skip();
    const row = await asSystem(async (c) => {
      const { rows } = await c.query<{ full_name: string; lop: string }>(
        `select s.full_name, cl.code as lop
           from core.students s
           join core.enrollments e on e.student_id = s.id and e.valid_to is null
           join core.classes cl on cl.id = e.class_id
          where s.student_code = $1`,
        [MA.a],
      );
      return rows[0] ?? null;
    });
    expect(row?.full_name).toBe("Nguyễn Văn A, Jr");
    // Tách thô bằng split(",") sẽ đẩy mọi cột sau họ tên sang một ô, và em này
    // ghi danh vào lớp lấy từ ô ngày sinh — sai IM LẶNG, không có lỗi nào nổi lên.
    expect(row?.lop).toBe(LOP);
  }, 60_000);

  it("§9 — chạy LẠI đúng lệnh đó cho đúng trạng thái kho, không đẻ thêm dòng nào", async ({ skip }) => {
    if (!ready) return skip();
    const truoc = await anhChup();

    const kq = await chayNap([
      `--file=${fileSach}`,
      `--nam-hoc=${NAM_HOC}`,
      `--hieu-luc-tu=${HIEU_LUC}`,
    ]);
    expect(kq.out).toContain("Đã có sẵn (bỏ qua)  : 2");
    expect(kq.out).toContain("Đã vào kho          : 0");

    const sau = await anhChup();
    // Từng con số một, không gộp: gộp thành một expect thì lúc đỏ không biết
    // tầng nào vỡ — kho, sổ lỗi, hay bảng thô.
    expect(sau.so_em).toBe(truoc.so_em);
    expect(sau.so_ky).toBe(truoc.so_ky);
    expect(sau.so_ky_mo_6a1).toBe(truoc.so_ky_mo_6a1);
    expect(sau.so_loi).toBe(truoc.so_loi);
    expect(sau.so_dong_tho).toBe(truoc.so_dong_tho);
  }, 60_000);

  it("mỗi lần nạp để lại một dòng ops.job_runs, dù job này KHÔNG có trong ops.job_schedule", async ({ skip }) => {
    if (!ready) return skip();
    const { soDong, coLich } = await asSystem(async (c) => {
      const a = await c.query<{ n: string }>(
        "select count(*) as n from ops.job_runs where job_name = 'nap_danh_sach' and status = 'success'",
      );
      const b = await c.query<{ n: string }>(
        "select count(*) as n from ops.job_schedule where job_name = 'nap_danh_sach'",
      );
      return { soDong: soDem(a.rows), coLich: soDem(b.rows) };
    });
    expect(soDong).toBe(2);
    // Có sổ mà không có lịch — cùng hình dạng với run-anonymize-user.mjs (0033).
    // Khai nó vào bảng lịch là bật một dòng qua_han vĩnh viễn giữa hai đợt tuyển sinh.
    expect(coLich).toBe(0);
  }, 60_000);

  it("--dry-run không để lại dấu vết nào, kể cả trong sổ chạy job", async ({ skip }) => {
    if (!ready) return skip();
    const fileMoi = join(thuMuc, "them-mot-em.csv");
    writeFileSync(
      fileMoi,
      [
        "ma_hoc_sinh,ho_ten,ngay_sinh,ma_co_so,ma_lop,khoi",
        `${MA.c},Lê Thử Nghiệm,,${CO_SO},${LOP},6`,
        "",
      ].join("\n"),
      "utf8",
    );
    const truoc = await anhChup();

    const kq = await chayNap([
      `--file=${fileMoi}`,
      `--nam-hoc=${NAM_HOC}`,
      `--hieu-luc-tu=${HIEU_LUC}`,
      "--dry-run",
    ]);
    expect(kq.out).toContain("DRY-RUN");

    const sau = await anhChup();
    expect(sau).toEqual(truoc);
    const soDong = await asSystem(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        "select count(*) as n from ops.job_runs where job_name = 'nap_danh_sach'",
      );
      return soDem(rows);
    });
    expect(soDong).toBe(2); // vẫn đúng hai dòng của hai lần chạy thật ở trên
  }, 60_000);

  it("thiếu cột bắt buộc thì DỪNG CẢ JOB, không nạp một dòng nào", async ({ skip }) => {
    if (!ready) return skip();
    const fileHong = join(thuMuc, "thieu-cot.csv");
    writeFileSync(
      fileHong,
      ["ma_hoc_sinh,ho_ten,ma_lop", `VA-2099-00099,Không Đủ Cột,${LOP}`, ""].join("\n"),
      "utf8",
    );
    const truoc = await anhChup();

    const kq = await chayNap([
      `--file=${fileHong}`,
      `--nam-hoc=${NAM_HOC}`,
      `--hieu-luc-tu=${HIEU_LUC}`,
    ]);
    expect(kq.ma).toBe(1);
    expect(kq.out).toContain("thiếu cột bắt buộc");

    // Hỏng ở mức CẢ LÔ thì không được nạp nửa vời: đoán hộ một cột thiếu là đoán
    // hộ cho cả nghìn em.
    const sau = await anhChup();
    expect(sau).toEqual(truoc);
  }, 60_000);

  it("dòng bị TỪ CHỐI không đổi một cột nào — 'Đã vào kho: 0' phải là sự thật", async ({ skip }) => {
    if (!ready) return skip();

    // Dựng đúng cảnh đo được: em có thật, có họ tên VÀ ngày sinh sẵn trong sổ, đang
    // học 6A1. Chỉ khi em ĐÃ CÓ hai cột đó thì việc ghi đè mới quan sát được.
    await asSystem(async (c) => {
      await c.query(
        `insert into core.students (student_code, school_id, full_name, date_of_birth)
         select $1, s.id, $2, $3::date from core.schools s where s.code = $4`,
        [MA.d, "Bùi Thị Lan, Jr", "2015-02-02", CO_SO],
      );
      await c.query(
        `insert into core.enrollments (student_id, class_id, valid_from)
         select st.id, cl.id, $1::date
           from core.students st
           join core.schools sc on sc.code = $2
           join core.classes cl on cl.school_id = sc.id and cl.code = $3 and cl.academic_year = $4
          where st.student_code = $5`,
        [HIEU_LUC, CO_SO, LOP, NAM_HOC, MA.d],
      );
    });

    // File xếp em sang LỚP KHÁC, đồng thời mang theo họ tên khác và ngày sinh khác.
    // Chuyển lớp phải có người duyệt nên cả dòng bị từ chối — và phần hồ sơ đi theo.
    const fileTuChoi = join(thuMuc, "chuyen-lop.csv");
    writeFileSync(
      fileTuChoi,
      [
        "ma_hoc_sinh,ho_ten,ngay_sinh,ma_co_so,ma_lop,khoi",
        `${MA.d},TÊN TRONG FILE,2016-12-31,${CO_SO},${LOP_KHAC},6`,
        "",
      ].join("\n"),
      "utf8",
    );

    const kq = await chayNap([
      `--file=${fileTuChoi}`,
      `--nam-hoc=${NAM_HOC}`,
      "--hieu-luc-tu=2027-01-05",
    ]);

    // Bản in ra màn hình — đúng hai dòng người vận hành đọc để kết luận.
    expect(kq.out).toContain("Đã vào kho          : 0");
    expect(kq.out).toContain("Vào sổ lỗi          : 1");
    expect(kq.ma).toBe(2);
    // Và lời hứa đi kèm con số 0 đó, in ngay dưới nó.
    expect(kq.out).toContain("KHÔNG đổi một cột nào trong kho");

    const sau = await asSystem(async (c) => {
      const { rows } = await c.query<{
        full_name: string;
        date_of_birth: string | null;
        lop: string;
        so_ky: string;
      }>(
        // to_char chứ không lấy cột `date` trần: node-postgres dựng kiểu `date` thành
        // một Date của JavaScript theo múi giờ tiến trình, và so chuỗi trên đó là một
        // bài test đỏ lúc nửa đêm vì lý do không liên quan gì tới việc đang kiểm.
        `select s.full_name, to_char(s.date_of_birth, 'YYYY-MM-DD') as date_of_birth, cl.code as lop,
                (select count(*) from core.enrollments e2 where e2.student_id = s.id) as so_ky
           from core.students s
           join core.enrollments e on e.student_id = s.id and e.valid_to is null
           join core.classes cl on cl.id = e.class_id
          where s.student_code = $1`,
        [MA.d],
      );
      return rows[0] ?? null;
    });

    // Bốn assertion tách rời, không gộp: lúc đỏ phải biết ngay cột nào bị chạm.
    expect(sau?.full_name).toBe("Bùi Thị Lan, Jr");
    expect(sau?.date_of_birth).toBe("2015-02-02");
    expect(sau?.lop).toBe(LOP);
    expect(Number(sau?.so_ky)).toBe(1);

    // Từ chối thì không được im: sổ lỗi phải nói ra thứ file định đổi mà hệ không đổi.
    const hoSo = await asSystem(async (c) => {
      const { rows } = await c.query<{ trong_so: string; trong_file: string }>(
        `select ho_so_chua_ap_dung ->> 'ho_ten_trong_so'   as trong_so,
                ho_so_chua_ap_dung ->> 'ho_ten_trong_file' as trong_file
           from staging.v_loi_nap_danh_sach
          where ma_hoc_sinh = $1 and ly_do like 'em đang học lớp khác%'`,
        [MA.d],
      );
      return rows[0] ?? null;
    });
    expect(hoSo?.trong_so).toBe("Bùi Thị Lan, Jr");
    expect(hoSo?.trong_file).toBe("TÊN TRONG FILE");

    // §9 ở mức lệnh, trên nhánh LỖI: chạy lại đúng lệnh đó không đổi gì thêm.
    const lanHai = await chayNap([
      `--file=${fileTuChoi}`,
      `--nam-hoc=${NAM_HOC}`,
      "--hieu-luc-tu=2027-01-05",
    ]);
    expect(lanHai.out).toContain("Đã hỏng từ trước    : 1");
    const sauLanHai = await asSystem(async (c) => {
      const { rows } = await c.query<{ full_name: string }>(
        "select full_name from core.students where student_code = $1",
        [MA.d],
      );
      return rows[0]?.full_name ?? null;
    });
    expect(sauLanHai).toBe("Bùi Thị Lan, Jr");
  }, 120_000);

  it("tham số ngày/năm học sai thì dừng TRƯỚC khi chạm database", async ({ skip }) => {
    if (!ready) return skip();
    const truoc = await anhChup();

    const namLech = await chayNap([
      `--file=${fileSach}`,
      "--nam-hoc=2026-2028",
      `--hieu-luc-tu=${HIEU_LUC}`,
    ]);
    expect(namLech.ma).toBe(1);
    expect(namLech.out).toContain("hai năm liền nhau");

    // 31/02 KHÔNG tồn tại, nhưng `new Date('2026-02-31')` trong JavaScript không
    // ném lỗi mà trượt sang 03/03. Không chặn ở đây thì cả lô ghi danh từ một
    // ngày không có thật.
    const ngayMa = await chayNap([
      `--file=${fileSach}`,
      `--nam-hoc=${NAM_HOC}`,
      "--hieu-luc-tu=2026-02-31",
    ]);
    expect(ngayMa.ma).toBe(1);
    expect(ngayMa.out).toContain("không phải một ngày có thật");

    const sau = await anhChup();
    expect(sau).toEqual(truoc);
  }, 60_000);
});
