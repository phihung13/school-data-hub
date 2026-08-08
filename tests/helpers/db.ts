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
  /**
   * Thầy Nam — giáo viên BỘ MÔN Toán, dạy 6A1/6A2/6A3 và KHÔNG dạy 6A4/6A5.
   *
   * Chỗ trống đó là mẫu số của mọi khẳng định "không thấy lớp mình không dạy": thầy dạy
   * hết khối thì câu đó xanh vì rỗng, không phải vì policy chặn (seed.mjs ghi rõ điều này
   * ở khối phân công bộ môn). Thêm vào đây 06/08/2026 cùng gói dựng màn "Lớp tôi dạy".
   */
  gvbomon: "90000000-0000-0000-0000-000000000002",
  /** Cô Diệp — bộ môn Ngữ văn, dạy 6A3/6A4/6A5. Cặp đối xứng của Thầy Nam. */
  gvbomon2: "90000000-0000-0000-0000-00000000000a",
} as const;

export const FIXTURE = {
  classA: "30000000-0000-0000-0000-000000000001", // 6A1
  classB: "30000000-0000-0000-0000-000000000002", // 6A2
  classC: "30000000-0000-0000-0000-000000000003", // 6A3 — Thầy Nam dạy, Cô Vân chủ nhiệm
  classD: "30000000-0000-0000-0000-000000000004", // 6A4 — Thầy Nam KHÔNG dạy
  classE: "30000000-0000-0000-0000-000000000005", // 6A5 — Thầy Nam KHÔNG dạy
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

/**
 * Dựng sẵn một phiếu đồng ý còn hiệu lực cho em, bằng vai chủ schema.
 *
 * Vì sao cần (0047, ADR-027 bản 2): từ `0047` học sinh chỉ GHI được cột `mood` khi nhà đã
 * có phiếu đồng ý của người đại diện — `checkins_insert_self` và `checkins_update_self` đòi
 * `mood is null or core.has_student_consent(student_id)`. Bài nào kiểm ĐƯỜNG GHI tâm trạng
 * (§9 idempotent, phạm vi đọc mood) mà không dựng phiếu trước thì sẽ đỏ vì một lý do KHÁC
 * với thứ nó định kiểm — và đỏ kiểu đó là loại đỏ dạy người ta xoá assertion.
 *
 * Ghi thẳng vào bảng chứ không gọi `core.record_consent()`: hàm đó đòi phiên của đúng người
 * đại diện, còn ở đây ta chỉ cần một tiền đề, không cần diễn lại cảnh phụ huynh bấm nút
 * (cảnh đó có bài riêng: `tests/db/dieu-khoan.test.ts`). `on conflict do nothing` để gọi
 * nhiều lần trong một lượt chạy vẫn im lặng đúng nghĩa §9.
 *
 * `seed.mjs` KHÔNG tạo phiếu cho ai — đó là sự thật của trường hôm nay (chưa gửi phiếu tới
 * phụ huynh nào), nên nó không được giấu bằng cách nhét consent vào seed.
 */
export async function capPhieuDongY(studentId: string): Promise<void> {
  await withSystemContext(async (c) => {
    await c.query(
      `insert into core.consent_records (user_id, student_id, terms_version_id, decision, content_hash)
       select p.user_id, $1::uuid, tv.id, 'granted', tv.content_hash
         from core.parent_students ps
         join core.parents p on p.id = ps.parent_id
        cross join (select id, content_hash from core.terms_versions
                     where published_at is not null
                     order by version desc limit 1) tv
        where ps.student_id = $1::uuid
        limit 1
       on conflict do nothing`,
      [studentId],
    );
  });
}

/** Gỡ phiếu đồng ý của em — dọn đúng thứ `capPhieuDongY` đã dựng, không hơn. */
export async function goPhieuDongY(studentId: string): Promise<void> {
  await withSystemContext(async (c) => {
    // Sổ đồng ý chặn DELETE bằng trigger (0046) — dùng đúng cửa thoát hiểm đã khai báo
    // tường minh cho dữ liệu RÁC do test sinh ra.
    await c.query("set local hub.allow_consent_rewrite = 'on'");
    await c.query("delete from core.consent_records where student_id = $1", [studentId]);
  });
}
