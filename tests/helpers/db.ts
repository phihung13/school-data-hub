// tests/helpers/db.ts — tiện ích dùng chung cho test chạm cơ sở dữ liệu thật.
//
// Nguyên tắc: test KHÔNG dựng schema riêng, KHÔNG mock Postgres. Nó chạy trên
// đúng CSDL đã migrate, bằng đúng đường mà router thật đi (withUserContext →
// SET ROLE authenticated + set request.jwt.claim.sub). Mock RLS là tự lừa mình:
// lỗi phân quyền chỉ lộ ra khi policy thật chạy trên Postgres thật.
import { withSystemContext, withUserContext, type PoolClient } from "@hub/core/db";

/** Tài khoản dev, khớp packages/core/auth-adapter/dev-provider.ts và seed.mjs. */
export const DEV = {
  gvcn: "90000000-0000-0000-0000-000000000001", // Cô Lan, GVCN 6A1
  counselor: "90000000-0000-0000-0000-000000000003", // Cô Mai, tâm lý cụm
  guardian: "90000000-0000-0000-0000-000000000004", // Phụ huynh của Minh
  student: "90000000-0000-0000-0000-000000000005", // Học sinh Minh
  gvcn2: "90000000-0000-0000-0000-000000000006", // Cô Hạnh, GVCN 6A2
  admin: "90000000-0000-0000-0000-000000000007", // Hùng, quản trị
} as const;

export const FIXTURE = {
  classA: "30000000-0000-0000-0000-000000000001", // 6A1
  classB: "30000000-0000-0000-0000-000000000002", // 6A2
  studentMinh: "70000000-0000-0000-0000-000000000001", // lớp 6A1
  studentBinh: "70000000-0000-0000-0000-000000000002", // lớp 6A2
  schoolQ7: "20000000-0000-0000-0000-000000000001",
} as const;

/** Chạy truy vấn dưới danh tính một tài khoản dev, đúng như router thật. */
export function asUser<T>(authUid: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withUserContext(authUid, fn);
}

/** Chạy truy vấn bỏ qua RLS — chỉ dùng để DỰNG hoặc DỌN dữ liệu, không dùng để khẳng định. */
export function asSystem<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withSystemContext(fn);
}

/**
 * Đang chạy trong CI hay trên máy lập trình viên.
 *
 * Ranh giới này là điểm mấu chốt của cả file: trên máy dev, test chạm DB được
 * phép TỰ BỎ QUA khi chưa dựng Postgres (để `pnpm test` vẫn chạy được lớp test
 * thuần, thay vì đỏ toàn bộ rồi không ai buồn chạy nữa). Trong CI thì ngược lại —
 * "bỏ qua" chính là cách một cổng chặn chết âm thầm: `vitest run` in "9 skipped"
 * và trả exit 0, PR xanh, mà KHÔNG một assertion RLS nào từng chạy. Với hệ dữ
 * liệu trẻ em, cổng chặn im lặng còn nguy hiểm hơn không có cổng, vì nó tạo cảm
 * giác đã kiểm.
 */
function inCi(): boolean {
  const v = process.env.CI;
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

/**
 * Bỏ qua cả file test nếu chưa có Postgres — CHỈ trên máy lập trình viên.
 * Trong CI, thiếu DB là lỗi hạ tầng phải nổ ra ngay, không được nuốt.
 */
export async function databaseAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    if (inCi()) {
      throw new Error(
        "CI đang bật nhưng thiếu DATABASE_URL — test chạm DB sẽ bị bỏ qua im lặng. " +
          "Job phải đặt DATABASE_URL trỏ tới Postgres đã chạy migrations.",
      );
    }
    return false;
  }
  try {
    await withSystemContext((c) => c.query("select 1"));
    return true;
  } catch (err) {
    if (inCi()) {
      throw new Error(
        `CI đang bật nhưng không kết nối được DATABASE_URL: ${(err as Error).message}`,
        { cause: err },
      );
    }
    return false;
  }
}

/**
 * Kiểm tra dữ liệu seed đã có mặt — test phân quyền vô nghĩa nếu bảng rỗng.
 *
 * KHÔNG bọc try/catch: trước đây lỗi kết nối/lỗi quyền bị nuốt thành `false` nên
 * một CSDL hỏng trông y hệt một CSDL chưa seed, và cả hai đều dẫn tới "skip".
 * Dữ liệu này do `pnpm db:seed` (seed.mjs) tạo — fixtures/000_test_support.sql
 * chỉ định nghĩa hàm, chạy trong transaction rồi rollback nên KHÔNG để lại dòng nào.
 */
export async function seedPresent(): Promise<boolean> {
  const { rows } = await withSystemContext((c) =>
    c.query<{ n: string }>("select count(*)::text as n from core.students where id = $1", [
      FIXTURE.studentMinh,
    ]),
  );
  const present = Number(rows[0]?.n ?? 0) > 0;
  if (!present && inCi()) {
    throw new Error(
      "CI đang bật nhưng CSDL chưa có dữ liệu seed (học sinh Minh không tồn tại) — " +
        "job phải chạy `pnpm db:seed` sau migrations, trước `vitest run tests/db`.",
    );
  }
  return present;
}

/**
 * Cổng vào chuẩn cho MỌI file test chạm DB viết từ nay về sau.
 *
 * Trả `true` khi CSDL đã migrate VÀ đã seed. Trên máy dev thiếu DB thì trả
 * `false` để file tự `skip`; trong CI thì ném lỗi (xem `inCi`) nên không có
 * đường nào để một file test biến mất khỏi cổng chặn mà vẫn báo xanh.
 */
export async function requireDb(): Promise<boolean> {
  if (!(await databaseAvailable())) return false;
  return seedPresent();
}
