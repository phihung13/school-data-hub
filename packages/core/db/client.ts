// packages/core/db/client.ts
//
// Adapter tập trung DUY NHẤT chạm kết nối PostgreSQL (01-architecture.md §2,4).
// Không có deployable nào khác được `import { Pool } from "pg"` — luôn đi qua đây.
//
// RLS context: `core.current_auth_uid()` (0001_schemas_and_context.sql) đọc
// session GUC `request.jwt.claim.sub`. Trên Supabase, GUC này được đặt từ JWT của
// người dùng đã đăng nhập. Ở đây ta tự làm y hệt cho mọi kết nối chạy trực tiếp
// qua `pg`, để RLS đúng thật ngay cả khi chưa có Supabase — swap sang Supabase sau
// này chỉ đổi DATABASE_URL, không đổi một dòng nghiệp vụ nào gọi hàm dưới đây.

import { Pool, type PoolClient } from "pg";

// Router ở apps/hub cần kiểu PoolClient để gõ tay các hàm nhận `client` từ
// withUserContext/withServiceRole — export lại ở đây để nơi khác KHÔNG phải tự
// `import ... from "pg"` (giữ đúng luật "chỉ packages/core chạm pg trực tiếp").
export type { PoolClient };

let pool: Pool | undefined;

/**
 * Số kết nối tối đa. 10 (giá trị cũ) là quá ít một cách nguy hiểm: mỗi procedure
 * tRPC giữ TRỌN một kết nối suốt transaction, mà httpBatchLink bắn nhiều procedure
 * SONG SONG — một lần vào /home đã chiếm 2 kết nối cùng lúc. 10 kết nối phục vụ
 * được khoảng 5 người đồng thời, trong khi đích thiết kế là 300 request/giây lúc
 * cao điểm (05-capacity-ops.md). Đặt qua biến môi trường để chỉnh theo max_connections
 * của Postgres thật mà không phải deploy lại.
 */
const POOL_MAX = Number(process.env.PGPOOL_MAX ?? 30);

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Thiếu biến môi trường DATABASE_URL — xem README.md mục Chạy local.");
    }
    pool = new Pool({
      connectionString,
      max: POOL_MAX,
      // Mặc định của node-postgres là 0 = CHỜ VÔ HẠN khi pool cạn. Nghĩa là lúc quá
      // tải, request không lỗi mà TREO — người dùng ngồi nhìn vòng xoay, p95 nổ tung,
      // và không có tín hiệu nào để cảnh báo. Thà trả lỗi nhanh sau 3 giây.
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      // Một câu kẹt (khoá, kế hoạch xấu) giữ luôn kết nối cho tới khi ai đó để ý.
      // Hai mốc: Postgres tự huỷ ở 5s, node-postgres bỏ cuộc ở 6s nếu Postgres im.
      statement_timeout: 5_000,
      query_timeout: 6_000,
      // Hiện trong pg_stat_activity — lúc sự cố, biết kết nối nào của Hub là bước đầu.
      application_name: "hub",
    });

    // Không có handler này thì một socket chết (Postgres restart, mạng rớt) ném lỗi
    // trên EventEmitter và Node kết liễu cả tiến trình — cả trường mất Hub vì một
    // kết nối nhàn rỗi bị đóng.
    pool.on("error", (err) => {
      console.error("[db] kết nối nhàn rỗi trong pool gặp lỗi:", err);
    });
    // Postgres mặc định chạy múi giờ UTC (Etc/UTC) — nhưng trường vận hành theo
    // giờ Việt Nam. Không set múi giờ thì mọi current_date/now()/to_char(...)
    // dùng khắp router (điểm danh, streak, "hôm nay" của GVCN) đều lệch trong
    // khung 00:00–06:59 giờ Việt Nam (UTC ngày hôm trước). Phát hiện khi chạy
    // thật lúc 00:47 giờ VN (30/07/2026): popup check-in mới ghi giờ theo giờ
    // trình duyệt (VN) trong khi cột hiển thị "đã đến trường" đọc từ Postgres lại
    // ra giờ UTC — hai nơi cùng nói "bây giờ" nhưng lệch nhau 7 tiếng.
    pool.on("connect", (client) => {
      client.query("set time zone 'Asia/Ho_Chi_Minh'").catch(() => {});
    });
  }
  return pool;
}

/**
 * Mọi lệnh mở transaction đi qua đây, gộp thành MỘT lượt đi-về.
 *
 * Trước 31/07/2026 mỗi transaction tốn 4 lượt: begin · set local role · set_config ·
 * commit. Với care.getDashboard (9 truy vấn) là 13 lượt nối tiếp; khi Postgres đặt
 * xa (RTT 20–40ms) thì riêng phần đi lại trên mạng đã 260–520ms, vượt ngân sách p95
 * 500ms trước khi Postgres kịp làm gì. Gộp `begin` + `set local role` + dựng ngữ
 * cảnh vào một câu simple-query cắt xuống 2 lượt (mở + commit).
 *
 * Chuỗi này ghép chuỗi vào SQL nên KHÔNG được nhận dữ liệu tự do: `role` là union
 * đóng do TypeScript kiểm, `authUid` phải qua UUID_RE ở dưới.
 */
async function beginTransaction(client: PoolClient, setup: string): Promise<void> {
  await client.query(`begin; ${setup}`);
}

/** Chỉ chấp nhận đúng dạng UUID — chặn mọi khả năng chuỗi lạ lọt vào câu gộp ở trên. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vô danh (chưa đăng nhập) — dùng cho endpoint xác thực/mã mời, KHÔNG có quyền đọc dữ liệu học sinh. */
export async function withAnonContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await beginTransaction(client, "set local role anon;");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Mọi truy vấn nghiệp vụ đều phải đi qua đây, kèm `authUid` lấy từ session đã
 * xác thực (packages/core/auth-adapter). RLS + hàm `core.can_see_*` tự lo phần
 * còn lại — domain service ở apps/hub không được tự viết điều kiện quyền.
 */
export async function withUserContext<T>(
  authUid: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(authUid)) {
    // Không bao giờ xảy ra với token do chính ta ký; nhưng đây là hàng rào duy nhất
    // giữa chuỗi ngoài và câu SQL gộp bên dưới, nên kiểm tường minh và ném rõ ràng.
    throw new Error("authUid không phải UUID hợp lệ — từ chối dựng ngữ cảnh RLS.");
  }
  const client = await getPool().connect();
  try {
    // core.begin_user_context (0029) vừa đặt claim.sub vừa giải sẵn core.users.id
    // cho core.current_user_id() — nếu không, mỗi dòng được RLS quét lại tra
    // core.users một lần (đo được 2.241 lượt cho MỘT lần mở buồng lái).
    await beginTransaction(
      client,
      `set local role authenticated; select core.begin_user_context('${authUid}'::uuid);`,
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * CHỈ dùng cho job nền/seed/backfill chạy phía máy chủ (không có người dùng đứng
 * sau request). Không export ra tRPC router — domain service không được gọi thẳng.
 */
export async function withServiceRole<T>(
  role: "connector" | "reporting" | "backup_reader",
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await beginTransaction(client, `set local role ${role};`);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Không SET ROLE — chạy bằng vai đăng nhập của pool (chủ schema, dùng cho
 * migration/seed). Bỏ qua RLS theo đúng cách Postgres cho phép chủ bảng bỏ qua
 * RLS khi không có `FORCE ROW LEVEL SECURITY`. Ngoại lệ duy nhất hiện nay:
 * `ops.embedded_app_events` bật FORCE ở 0024 nên cả hàm này cũng không đọc được —
 * đó là chủ ý (fail-closed cho payload thô của app ngoài).
 *
 * CHỈ dùng cho auth-adapter lúc dựng phiên đăng nhập (chưa có ai đứng sau
 * request để mang RLS context) và các job nền thật sự cần đọc xuyên schema.
 * KHÔNG import trong router/domain service nghiệp vụ — nơi đó luôn phải qua
 * `withUserContext` để RLS thật sự lọc dữ liệu.
 */
export async function withSystemContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
