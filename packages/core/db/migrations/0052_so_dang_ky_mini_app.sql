-- 0052_so_dang_ky_mini_app.sql
-- SỔ ĐĂNG KÝ MINI APP — nợ #8, và ADR-015 mục 5 ("App Manifest").
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- CÁI ĐANG THIẾU, ĐO ĐƯỢC 02/08/2026
-- ═══════════════════════════════════════════════════════════════════════════════
-- Danh sách app ngoài nằm trong `apps/hub/server/embed/registry.ts` — một mảng
-- TypeScript. Hệ quả không phải là "hơi bất tiện", mà là ba điều cụ thể:
--
--   (a) THÊM MỘT APP LÀ MỘT LẦN DEPLOY. Đội vibe dựng xong app trên Base44 lúc 10 giờ
--       tối thì phải chờ một trong hai dev lõi mở máy, sửa file, build, khởi động lại.
--       ADR-015 mục 5 viết "tới khi có ≥5 app mới cân nhắc xây màn hình quản trị" —
--       ngưỡng đó đặt lúc chưa ai thử cắm app thật lần nào.
--   (b) TẮT MỘT APP CŨNG LÀ MỘT LẦN DEPLOY. Đây mới là vế nguy hiểm: app ngoài lộ dữ
--       liệu, hoặc domain hết hạn rồi bị người khác mua lại, thì đường thu hồi nhanh
--       nhất hiện nay vẫn phải đi qua một chu trình build. Một cái công tắc phải bấm
--       được trong mười giây.
--   (c) VÒNG ĐỜI APP KHÔNG CÓ CHỖ GHI. Chính 08-embedded-apps.md mục 5 đòi mỗi Manifest
--       một "ngày rà lại, quá hạn không rà thì thu hồi quyền". Trong một mảng TypeScript
--       không có chỗ nào ghi ngày đó, nên luật ấy tồn tại trên giấy và chưa từng chạy.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- CÁI FILE NÀY CỐ Ý KHÔNG LÀM: KHÔNG CẤT SECRET WEBHOOK VÀO ĐÂY
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cột `webhook_secret_env` giữ TÊN BIẾN MÔI TRƯỜNG, không giữ giá trị. Cám dỗ là cất
-- luôn secret vào bảng cho "quản trị đổi được trên màn hình". Không làm, vì ba lý do
-- đều đã thành sự thật ở đâu đó:
--   · Bản sao lưu database đi ra khỏi máy chủ (3-2-1, `06-resilience-security.md`) —
--     secret nằm trong bảng thì nó nằm trong mọi bản sao lưu, kể cả bản gửi ra ngoài.
--   · Mọi lượt `pg_dump` để dựng lại môi trường dev là một lần nhân bản secret thật.
--   · Người có quyền đọc bảng quản trị KHÔNG đồng nghĩa với người được biết secret.
-- Đổi secret vẫn là việc của người vận hành trên máy chủ. Cái bảng này chỉ nói "app đó
-- lấy secret từ biến nào" — đủ để màn quản trị trả lời được câu "app này đã cấp secret
-- chưa", mà không cầm giữ gì cả.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- RỔ ĐỎ KHÔNG CÓ MẶT TRONG BẢNG NÀY — THEO NGHĨA ĐEN
-- ═══════════════════════════════════════════════════════════════════════════════
-- `08-embedded-apps.md` mục 0 xếp ba rổ: Xanh, Vàng, Đỏ. Rổ Đỏ là "cấm tuyệt đối, ở mọi
-- Tier, kể cả read-only — không có đường xin". Ràng buộc CHECK dưới đây chỉ nhận 'xanh'
-- và 'vang'. Nghĩa là không ai — kể cả quản trị, kể cả qua psql — khai được một app rổ
-- Đỏ. Một luật viết trong tài liệu thì người ta đọc rồi quên; một luật là CHECK thì
-- database từ chối, và lời từ chối đó không phụ thuộc vào việc ai đang nhớ điều gì.

-- `begin;` … `commit;` bọc CẢ FILE: bộ chạy migration (`tools/migrate/migrate.mjs`) chèn
-- dòng ghi sổ vào ngay trước `commit;` để migration và sổ nằm chung một transaction —
-- thiếu cặp này thì nó TỪ CHỐI CHẠY và nói rõ vì sao. (Tôi quên nó ở bản đầu; file vẫn
-- chạy ngon qua psql nên không có gì báo, và chỉ `tests/db/migrate.test.ts` — bài dựng
-- lại cả kho từ database rỗng — mới bắt được. Ghi lại vì đó đúng là loại lỗi chỉ lộ ra
-- trên đường triển khai thật.)
begin;

-- ---------------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------------

create table if not exists core.embedded_apps (
  -- Mã app đi thẳng vào URL `/embed/<app_id>` nên phải là chuỗi an toàn cho đường dẫn.
  app_id            text primary key
                    check (app_id ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
  display_name      text not null check (length(btrim(display_name)) between 1 and 60),

  -- Rổ dữ liệu (mục 0). Xem khối chú thích ở đầu file về việc thiếu 'do'.
  basket            text not null check (basket in ('xanh', 'vang')),

  -- MẶC ĐỊNH TẮT. App vừa khai xong chưa ai duyệt, chưa ai đo `curl -I`, chưa ai đọc
  -- Manifest. Mặc định bật là biến một lần gõ nhầm thành một cánh cửa mở.
  enabled           boolean not null default false,

  -- Vai được mở app. MẢNG RỖNG = KHÔNG AI — cùng ngữ nghĩa fail-closed với
  -- `canOpenEmbedApp()` trong registry.ts, chép sang đây bằng CHECK để hai bên không
  -- lệch nghĩa. Không dùng NULL: NULL trong so sánh mảng cho ra NULL chứ không cho ra
  -- false, và một hàng rào trả về NULL là một hàng rào không ai biết nó nói gì.
  allowed_roles     text[] not null default '{}'
                    check (allowed_roles <@ array['student','guardian','teacher','homeroom','counselor','principal','board','admin']::text[]),

  -- Loại sự kiện app được gửi qua webhook. '{*}' = mọi loại.
  allowed_event_types text[] not null default '{}',

  -- ── Phần NHÚNG (Tier 2). Bỏ trống nếu app chỉ đi Đường B (webhook), không có UI. ──
  -- `origin` là origin CHÍNH XÁC, không path, không dấu / cuối: nó đi thẳng vào header
  -- CSP `frame-src` và vào phép so `event.origin` của postMessage. Một dấu / thừa ở đây
  -- làm phép so origin trượt, và hậu quả là app không nhận được token — im lặng.
  origin            text check (origin ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$'),
  iframe_url        text check (iframe_url ~ '^https://'),
  icon_image_url    text,
  -- Một câu nói app này LÀM GÌ, hiện trong lúc chờ app ngoài nạp (embed-intro.tsx).
  intro             text check (intro is null or length(intro) <= 200),

  -- ── Vòng đời (mục 5) ──
  owner             text not null check (length(btrim(owner)) >= 2),
  -- Ngày rà lại. NOT NULL có chủ ý: mục 5 đòi mỗi Manifest có ngày này, và cho phép
  -- NULL là cho phép khai một app "không bao giờ đến hạn rà".
  review_due_on     date not null,

  -- TÊN biến môi trường chứa secret webhook — KHÔNG phải secret. Xem đầu file.
  webhook_secret_env text check (webhook_secret_env ~ '^[A-Z][A-Z0-9_]*$'),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references core.users(id),

  -- Nhúng thì phải có ĐỦ BỘ. Có origin mà thiếu iframe_url thì `/embed/<app>` dựng một
  -- khung trống; có iframe_url mà thiếu origin thì CSP không có gì để allowlist và
  -- trình duyệt chặn — cả hai đều là hỏng câm.
  constraint embedded_apps_nhung_du_bo
    check ((origin is null) = (iframe_url is null)),

  -- iframe_url phải nằm TRONG origin đã khai. Không có ràng buộc này thì một dòng
  -- `origin='https://a.vn', iframe_url='https://b.vn/x'` sẽ khai báo một allowlist cho
  -- a.vn trong khi nạp nội dung của b.vn — CSP chặn, app trắng, và không ai hiểu vì sao.
  constraint embedded_apps_iframe_thuoc_origin
    check (iframe_url is null or iframe_url like origin || '/%' or iframe_url = origin),

  -- '{*}' CHỈ hợp lệ cho rổ Xanh. Rổ Vàng có gắn định danh từng em, nên "nhận mọi loại
  -- sự kiện" ở đó là ký một tờ giấy trắng: app được gửi bất kỳ loại dữ liệu nào về từng
  -- em mà không ai khai trước đó là loại gì (mục 0 + mục 4).
  constraint embedded_apps_sao_chi_cho_ro_xanh
    check (not ('*' = any (allowed_event_types)) or basket = 'xanh')
);

comment on table core.embedded_apps is
  'Sổ đăng ký Mini App ngoài (App Manifest, ADR-015 mục 5). Thay apps/hub/server/embed/registry.ts. '
  'KHÔNG chứa secret — cột webhook_secret_env chỉ giữ TÊN biến môi trường.';
comment on column core.embedded_apps.enabled is
  'Công tắc thu hồi. Tắt ở đây là app biến khỏi lưới trang chủ, khỏi /embed/<id> và khỏi cổng webhook '
  'ngay lượt request kế tiếp — không cần deploy.';
comment on column core.embedded_apps.allowed_roles is
  'Mảng RỖNG = không ai mở được (fail-closed). Đây là hàng rào thật, không phải chuyện ẩn/hiện tile.';
comment on column core.embedded_apps.review_due_on is
  'Ngày rà lại Manifest (mục 5). Quá hạn thì màn quản trị bật đèn — xem core.v_mini_app_can_ra_lai.';
comment on column core.embedded_apps.webhook_secret_env is
  'TÊN biến môi trường, ví dụ EMBED_WEBHOOK_SECRET_FACTORY. Giá trị không bao giờ vào database.';

create index if not exists embedded_apps_enabled_idx
  on core.embedded_apps (enabled) where enabled;

-- ---------------------------------------------------------------------------
-- 2. `updated_at` tự đi theo, không nhờ người gọi nhớ
-- ---------------------------------------------------------------------------

create or replace function core.tg_embedded_apps_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function core.tg_embedded_apps_touch() is
  'Đặt updated_at ở tầng database. Để người gọi tự đặt thì lần quên đầu tiên làm sổ nói dối '
  'về thời điểm ai đó bật/tắt một app — đúng cột người ta sẽ tra khi có sự cố.';

drop trigger if exists embedded_apps_touch on core.embedded_apps;
create trigger embedded_apps_touch
  before update on core.embedded_apps
  for each row
  execute function core.tg_embedded_apps_touch();

-- ---------------------------------------------------------------------------
-- 3. RLS — ai thấy gì
-- ---------------------------------------------------------------------------

alter table core.embedded_apps enable row level security;

drop policy if exists embedded_apps_doc_app_dang_bat on core.embedded_apps;
-- Người đăng nhập bất kỳ đọc được app ĐANG BẬT. Cần thế để trang chủ dựng được lưới
-- tile mà không phải đi vòng qua một hàm SECURITY DEFINER.
--
-- Chú ý điều policy này KHÔNG làm: nó không lọc theo `allowed_roles`. Cố ý. Việc "vai
-- này có mở được app kia không" là hàng rào ở tầng route (`/embed/<id>` và OIDC
-- findAccount), và gộp nó vào đây sẽ tạo ra hai chỗ trả lời cùng một câu hỏi — hai chỗ
-- rồi sẽ lệch, và chỗ lệch sẽ là chỗ không ai kiểm. Danh sách app đang bật không phải
-- bí mật; quyền MỞ chúng mới là.
create policy embedded_apps_doc_app_dang_bat on core.embedded_apps
  for select to authenticated
  using (enabled);

drop policy if exists embedded_apps_quan_tri_toan_quyen on core.embedded_apps;
-- Quản trị thấy CẢ app đang tắt — nếu không thì màn quản trị không bật lại được thứ
-- chính nó vừa tắt, và app tắt biến mất khỏi hệ như chưa từng tồn tại.
create policy embedded_apps_quan_tri_toan_quyen on core.embedded_apps
  for all to authenticated
  using (core.has_role('admin'))
  with check (core.has_role('admin'));

grant select on core.embedded_apps to authenticated;
grant insert, update, delete on core.embedded_apps to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hai khung nhìn cho màn quản trị
-- ---------------------------------------------------------------------------

-- App quá hạn rà lại. Tách thành view chứ không để màn hình tự tính: ngày hết hạn là
-- một luật nghiệp vụ (mục 5), và luật nghiệp vụ tính ở tầng hiển thị thì mỗi màn hình
-- sẽ tính một kiểu.
create or replace view core.v_mini_app_can_ra_lai as
  select app_id,
         display_name,
         owner,
         review_due_on,
         (current_date - review_due_on) as qua_han_ngay,
         enabled
    from core.embedded_apps
   where review_due_on <= current_date + 30;

comment on view core.v_mini_app_can_ra_lai is
  'App tới hạn rà trong 30 ngày tới, hoặc đã quá hạn (qua_han_ngay > 0). Mục 5 nói quá hạn thì thu hồi '
  'quyền — view này là thứ nói cho người biết, việc thu hồi vẫn do người bấm.';

grant select on core.v_mini_app_can_ra_lai to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Nạp lại đúng những app đang có trong registry.ts
-- ---------------------------------------------------------------------------
--
-- KHÔNG bịa thêm app nào. Bảng này thay một mảng đang có nội dung cụ thể, nên bước
-- chuyển phải là một-đổi-một; thêm bớt ở đây là trộn hai việc vào một migration và
-- không ai đối chiếu được nữa.
--
-- `test-external-app` KHÔNG nạp: trong registry.ts nó nằm sau `NODE_ENV !== "production"`,
-- tức là một app chỉ tồn tại trên máy dev. Đưa nó vào migration là đưa nó vào CẢ máy chủ
-- thật — đúng cái cửa hậu mà chú thích trong registry.ts kể lại là đã từng mở. Nó thuộc
-- về seed dev (packages/core/db/seed/seed.mjs), không thuộc về migration.

insert into core.embedded_apps (
  app_id, display_name, basket, enabled, allowed_roles, allowed_event_types,
  origin, iframe_url, icon_image_url, intro, owner, review_due_on, webhook_secret_env
) values (
  'factory',
  'Factory',
  'xanh',
  true,
  array['teacher','homeroom','counselor','principal','board','admin']::text[],
  array['*']::text[],
  'https://factory.vietanh.org',
  'https://factory.vietanh.org/embed',
  -- ?v = 8 ký tự đầu sha256 của apps/hub/public/factory-icon.svg. Đổi file thì đổi cả
  -- chuỗi này: next.config.mjs phục vụ ảnh trong public/ với Cache-Control immutable 1 năm.
  '/factory-icon.svg?v=36a33380',
  'Xưởng nội dung của trường — soạn và quản lý học liệu, dùng chung tài khoản Hub.',
  'Đội Factory + dev lõi bảo trợ',
  -- Sáu tháng kể từ ngày app lên (29/07/2026), đúng nhịp mục 5 đòi.
  date '2027-01-29',
  'EMBED_WEBHOOK_SECRET_FACTORY'
)
on conflict (app_id) do nothing;

commit;
