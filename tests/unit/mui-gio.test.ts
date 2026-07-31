// tests/unit/mui-gio.test.ts
//
// MỘT câu hỏi duy nhất: có chỗ nào trong repo mở kết nối Postgres mà KHÔNG ghim
// múi giờ Việt Nam không?
//
// Vì sao đáng một bài test riêng. Postgres mặc định chạy UTC. Trường vận hành theo
// giờ Việt Nam (UTC+7). Hai thứ đó chỉ khớp nhau từ 07:00 tới 23:59 giờ VN — trong
// khung 00:00–06:59, `current_date` của một phiên KHÔNG ghim múi giờ trả về NGÀY HÔM
// QUA. Và đó đúng là khung giờ job nền chạy: bộ quét cờ hẹn 01:00 giờ VN = 18:00 UTC
// hôm trước.
//
// Kiểu hỏng: KHÔNG có lỗi, không có log, chỉ có một nhãn ngày lệch đúng một đơn vị.
//   · Cờ sinh đêm 05/09 mang nhãn `as_of_date = 04/09`. Khoá idempotent của
//     `care.flags` là (student, rule, as_of_date) — nên chạy lại lúc 08:00 sáng sinh
//     THÊM một cờ nữa cho cùng một ngày mà con người gọi là 05/09. §9 vỡ mà không
//     ai thấy.
//   · Job xoá chi tiết cảm xúc sau 12 tháng cắt sai một ngày, mỗi lần chạy.
//   · Bắt gặp thật 01/08/2026 lúc 00:38 giờ VN: `seed.mjs` gieo dữ liệu vào 31/07
//     trong khi app (đã ghim, client.ts) hỏi 01/08 — màn Điều hành của BGH gần như
//     trống trơn, không một dòng lỗi nào nói vì sao.
//
// Vì sao là bài test chứ không phải một dòng quy ước trong tài liệu: `client.ts` đã
// ghim từ 30/07/2026 và `run-flag-engine.mjs` cũng ghim, kèm chú thích giải thích rõ
// — vậy mà bốn chỗ mở pool khác vẫn quên. Quy ước không tự đọc chính nó; danh sách
// viết tay thì file sinh sau sẽ lọt. Bài này quét bằng glob nên file mới cũng bị soi.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "coverage"]);

/** Duyệt cây thư mục thay vì đọc một danh sách viết tay: file sinh sau cũng bị soi. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (/\.(mjs|cjs|ts|tsx)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Ba nơi có mã chạy thật chạm Postgres: script vận hành, vùng lõi, và app. */
const SOURCES = ["tools", "packages", "apps"].flatMap((d) => walk(join(ROOT, d)));

/** `new pg.Pool(`, `new Pool(`, `new pg.Client(`, `new Client(` — mọi cách viết. */
const OPENS_CONNECTION = /new\s+(?:pg\.)?(?:Pool|Client)\s*\(/;
/** Ghim múi giờ, bất kể viết bằng `set time zone` hay tham số `options`. */
const PINS_TIMEZONE = /Asia\/Ho_Chi_Minh/;

describe("múi giờ · mọi kết nối Postgres phải chạy theo giờ Việt Nam", () => {
  it("không file nào mở pool/client mà quên ghim Asia/Ho_Chi_Minh", () => {
    const guilty: string[] = [];
    for (const abs of SOURCES) {
      const src = readFileSync(abs, "utf8");
      if (!OPENS_CONNECTION.test(src)) continue;
      if (PINS_TIMEZONE.test(src)) continue;
      guilty.push(relative(ROOT, abs).replace(/\\/g, "/"));
    }
    expect(
      guilty,
      `Các file này mở kết nối Postgres nhưng không ghim múi giờ. Thêm đúng khuôn của\n` +
        `packages/core/db/client.ts:\n` +
        `  pool.on("connect", (c) => { c.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {}); });\n` +
        `Đừng đóng bài test này bằng cách thêm file vào một danh sách miễn trừ — nếu một\n` +
        `script thật sự không cần ngày tháng thì việc ghim múi giờ cũng không hại gì nó.`,
    ).toEqual([]);
  });

  it("bài test này thật sự soi được thứ nó nói — kiểm ngược trên chuỗi giả", () => {
    // Không có ca âm thì một biểu thức chính quy viết sai vẫn "xanh" vĩnh viễn.
    const thieu = `import pg from "pg";\nconst pool = new pg.Pool({ connectionString: URL });\n`;
    const du = thieu + `pool.on("connect", (c) => c.query("set time zone 'Asia/Ho_Chi_Minh'"));\n`;
    expect(OPENS_CONNECTION.test(thieu)).toBe(true);
    expect(PINS_TIMEZONE.test(thieu)).toBe(false); // đúng: bản thiếu bị bắt
    expect(PINS_TIMEZONE.test(du)).toBe(true); // đúng: bản đủ được tha
  });
});
