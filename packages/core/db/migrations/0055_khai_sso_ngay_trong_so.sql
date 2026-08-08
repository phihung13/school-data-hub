-- 0055_khai_sso_ngay_trong_so.sql
-- Thi hành ADR-032 (duyệt 07/08/2026, chủ đầu tư quyết trực tiếp): đăng ký Relying Party
-- OIDC chuyển từ MÃ NGUỒN vào SỔ ĐĂNG KÝ MINI APP.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ĐO THẬT TRƯỚC KHI VIẾT — "điền một phát" hôm nay đúng được hai phần ba
-- ═══════════════════════════════════════════════════════════════════════════════
-- Đo trên bản đang chạy ngày 06/08/2026 bằng chính API của màn `/quan-tri/mini-app`:
-- khai một app thử (`tin-truong`), cấp vai, bật. Kết quả:
--   · `/embed/tin-truong` → 404 khi tắt, 200 khi bật. Nhúng CHẠY, không cần deploy.
--   · Tile hiện trên lưới trang chủ đúng vai. CHẠY.
--   · `POST /api/embed/webhook` sai secret → 401. Cổng ĐÓNG đúng.
--   · SSO → KHÔNG CÓ GÌ. Khai app trong sổ không sinh ra client OIDC nào.
--
-- Vì sao: `apps/hub/server/oidc/clients.ts` giữ danh sách RP trong một mảng TypeScript,
-- đúng hình dạng mà migration 0052 đã gỡ bỏ cho phần nhúng. Chính file đó tự ghi ở dòng 2
-- là "chưa xây bảng + màn hình quản trị (chỉ cần khi ≥3-4 RP thật)" — ngưỡng ấy đặt lúc
-- chưa ai đấu nối app thứ hai. Hệ quả giống hệt ba hệ quả mà 0052 liệt kê, chỉ đổi chỗ:
--   (a) Thêm một app đăng nhập bằng tài khoản Hub = một lần sửa mã + deploy.
--   (b) THU HỒI cũng thế. Và đây là vế nguy hiểm: hôm nay tắt app trong sổ thì nhúng tắt,
--       webhook tắt — nhưng client OIDC vẫn sống, vẫn đổi được authorization_code lấy
--       token. Công tắc thu hồi thu hồi được hai phần ba, và không chỗ nào nói ra điều đó.
--   (c) Vòng đời RP không có chỗ ghi: không ngày rà lại, không người chịu trách nhiệm.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- MỘT APP = MỘT DÒNG. client_id CHÍNH LÀ app_id
-- ═══════════════════════════════════════════════════════════════════════════════
-- Không thêm bảng `core.oidc_clients` riêng. Mini App và RP không phải hai thực thể —
-- Factory là cùng một app, nhúng bằng iframe VÀ đăng nhập bằng tài khoản Hub. Hai bảng
-- nghĩa là hai sổ cho một app, hai ngày rà lại, hai người chịu trách nhiệm, và một ngày
-- có người tắt bảng này mà quên bảng kia. `client_id = app_id` là ràng buộc mạnh nhất có
-- thể có cho việc đó: nó không thể lệch, vì nó không phải hai cột.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- SECRET VẪN KHÔNG VÀO DATABASE — Y HỆT LÝ LẼ CỦA 0052
-- ═══════════════════════════════════════════════════════════════════════════════
-- `sso_client_secret_env` giữ TÊN biến môi trường, đúng khuôn `webhook_secret_env`. Ba lý
-- do ở đầu 0052 không đổi một chữ nào khi đối tượng là secret OIDC thay vì secret webhook:
-- bản sao lưu đi ra khỏi máy chủ, `pg_dump` nhân bản secret thật, và người được đọc bảng
-- quản trị không đồng nghĩa với người được biết secret. Đổi secret vẫn là việc của người
-- vận hành trên máy chủ; sổ chỉ nói "app đó lấy secret từ biến nào".
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- TẮT APP = TẮT LUÔN SSO (thi hành ở tầng nạp, khai ở đây để không ai đoán)
-- ═══════════════════════════════════════════════════════════════════════════════
-- `clients.ts` chỉ nạp RP thoả `enabled and sso_enabled`. Nghĩa là công tắc "Tắt app" của
-- màn quản trị từ nay thu hồi ĐỦ BA đường: nhúng, webhook, đăng nhập. Đó là vế (b) ở trên,
-- và nó là lý do thật sự khiến gói này đáng làm ngay chứ không phải để tiện tay.
--
-- `sso_enabled` là công tắc RIÊNG, không suy ra từ `enabled`: có app nhúng mà không cần
-- đăng nhập (trang tin của trường), và có app đăng nhập mà không nhúng (Đường A). Suy ra
-- thì mọi app nhúng đều tự nhiên thành một RP có thể xin token — cấp quyền bằng cách quên
-- không khai.
begin;

-- ---------------------------------------------------------------------------
-- 1. Năm cột SSO
-- ---------------------------------------------------------------------------

alter table core.embedded_apps
  add column if not exists sso_enabled                boolean not null default false,
  add column if not exists sso_redirect_uris          text[]  not null default '{}',
  add column if not exists sso_backchannel_logout_uri text,
  add column if not exists sso_scopes                 text[]  not null default array['openid','profile']::text[],
  add column if not exists sso_client_secret_env      text;

comment on column core.embedded_apps.sso_enabled is
  'App này có phải Relying Party OIDC không. Nạp thành client CHỈ khi enabled AND sso_enabled — '
  'nên công tắc thu hồi của màn quản trị cắt cả đường đăng nhập, không chỉ nhúng và webhook.';
comment on column core.embedded_apps.sso_redirect_uris is
  'redirect_uri CHÍNH XÁC (so khớp tuyệt đối theo OIDC). URI của Embed Bridge (/embed/relay) '
  'KHÔNG khai ở đây — clients.ts tự thêm từ HUB_URL cho app có nhúng, vì nó thuộc về Hub.';
comment on column core.embedded_apps.sso_client_secret_env is
  'TÊN biến môi trường, ví dụ OIDC_CLIENT_SECRET_FACTORY. Giá trị không bao giờ vào database — '
  'xem khối chú thích đầu migration 0052.';

-- ---------------------------------------------------------------------------
-- 2. Ràng buộc
-- ---------------------------------------------------------------------------
-- `add constraint if not exists` không tồn tại trong Postgres — bỏ rồi thêm là cách viết
-- lại-chạy-được duy nhất. `drop ... if exists` để file chạy lại lần hai không nổ.

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_du_bo;
-- Bật SSO thì phải có ĐỦ BỘ: ít nhất một redirect_uri và một tên biến secret. Thiếu bất
-- kỳ vế nào thì client dựng lên sẽ hỏng CÂM — RP gọi /oidc/auth và nhận `invalid_client`
-- hoặc `redirect_uri mismatch`, hai câu lỗi không nói được rằng nguyên nhân nằm ở một ô
-- bỏ trống trên màn quản trị. Bắt ở đây thì người khai biết ngay lúc bấm Lưu.
alter table core.embedded_apps add constraint embedded_apps_sso_du_bo
  check (
    not sso_enabled
    or (cardinality(sso_redirect_uris) >= 1 and sso_client_secret_env is not null)
  );

-- MỘT hàm thay cho một câu con. CHECK trong Postgres KHÔNG nhận subquery
-- (`cannot use subquery in check constraint`), mà điều cần kiểm lại là "mọi phần tử của
-- mảng đều thoả" — đúng thứ chỉ viết được bằng `unnest`. Bọc vào hàm IMMUTABLE là đường
-- duy nhất còn lại, và nó có lợi thêm: hai ràng buộc dưới dùng chung một định nghĩa "URI
-- hợp lệ", nên chúng không thể lệch nhau về sau.
create or replace function core.moi_uri_la_https(uris text[])
returns boolean
language sql
immutable
strict
as $$
  -- `coalesce(..., true)`: mảng rỗng cho `bool_and` = NULL, mà CHECK trả NULL là ĐẠT.
  -- Viết thẳng ra thay vì dựa vào ngữ nghĩa ba trạng thái của SQL — chỗ này đã đủ tinh vi.
  select coalesce(bool_and(u ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?(/[^#]*)?$'), true)
    from unnest(uris) u
$$;

comment on function core.moi_uri_la_https(text[]) is
  'Mọi phần tử là URI https tuyệt đối, không fragment (OIDC Core 3.1.2.1). Mảng rỗng = đạt.';

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_redirect_https;
-- MỌI redirect_uri phải là https, không dấu # (fragment bị cấm theo OIDC Core 3.1.2.1).
-- http:// ở đây là authorization_code đi qua đường không mã hoá — người ngồi cùng wifi đọc
-- được mã rồi đổi lấy token của chính người vừa đăng nhập.
alter table core.embedded_apps add constraint embedded_apps_sso_redirect_https
  check (core.moi_uri_la_https(sso_redirect_uris));

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_backchannel_https;
alter table core.embedded_apps add constraint embedded_apps_sso_backchannel_https
  check (sso_backchannel_logout_uri is null
         or core.moi_uri_la_https(array[sso_backchannel_logout_uri]));

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_secret_env_hoa;
alter table core.embedded_apps add constraint embedded_apps_sso_secret_env_hoa
  check (sso_client_secret_env is null or sso_client_secret_env ~ '^[A-Z][A-Z0-9_]*$');

alter table core.embedded_apps drop constraint if exists embedded_apps_sso_scope_biet_truoc;
-- Scope phải nằm trong đúng bốn cái provider.ts công bố, và BẮT BUỘC có `openid` — thiếu
-- nó thì đây không còn là OIDC, chỉ là OAuth2 trần, và `id_token` sẽ không được cấp.
-- Khai một scope provider không biết thì oidc-provider im lặng bỏ qua nó: RP xin
-- `hub_profil` (thiếu chữ e) sẽ đăng nhập được nhưng không bao giờ nhận được vai — đúng
-- kiểu hỏng lặng mà cả kho này tồn tại để chặn.
alter table core.embedded_apps add constraint embedded_apps_sso_scope_biet_truoc
  check (
    not sso_enabled
    or (
      sso_scopes <@ array['openid','profile','hub_profile','offline_access']::text[]
      and 'openid' = any (sso_scopes)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Nạp đúng những gì clients.ts đang khai — một-đổi-một, không thêm app nào
-- ---------------------------------------------------------------------------
-- Cùng nguyên tắc với mục 5 của 0052: bảng này thay một mảng đang có nội dung cụ thể, nên
-- bước chuyển phải là một-đổi-một. Sai một ký tự ở đây là Factory mất đăng nhập.
--
-- `test-external-app` KHÔNG nạp — nó nằm sau `NODE_ENV !== "production"` trong clients.ts,
-- tức chỉ tồn tại trên máy dev, và secret của nó ghi trần trong kho. Đưa vào migration là
-- đưa lên cả máy chủ thật; nó ở lại clients.ts, đúng chỗ cũ.
--
-- `https://hub.truongvietanh.com/embed/relay` CỐ Ý không nạp vào cột này dù clients.ts
-- đang khai nó: URI đó thuộc về Hub chứ không thuộc về Factory, và nó dựng được từ HUB_URL.
-- Nạp vào bảng là ghi cứng một tên miền của chính mình vào dữ liệu — hôm đổi tên miền thì
-- Embed Bridge chết mà không ai nghĩ tới việc đi sửa một hàng trong CSDL.

update core.embedded_apps
   set sso_enabled                = true,
       sso_redirect_uris          = array['https://factory.vietanh.org/api/auth/oidc/callback']::text[],
       sso_backchannel_logout_uri = 'https://factory.vietanh.org/api/auth/oidc/backchannel-logout',
       sso_scopes                 = array['openid','profile']::text[],
       sso_client_secret_env      = 'OIDC_CLIENT_SECRET_FACTORY'
 where app_id = 'factory';

-- ---------------------------------------------------------------------------
-- 4. Khung nhìn cho tầng nạp
-- ---------------------------------------------------------------------------
-- Đặt phép lọc `enabled and sso_enabled` Ở ĐÂY, một chỗ, thay vì để clients.ts tự nhớ.
-- Lý do: đây chính là chỗ vế (b) ở đầu file hỏng lần trước — một tầng quên một điều kiện
-- thì app đã thu hồi vẫn cấp được token, và không có gì trong hệ nói ra điều đó.

create or replace view core.v_oidc_clients as
  select app_id                     as client_id,
         display_name,
         sso_redirect_uris          as redirect_uris,
         sso_backchannel_logout_uri as backchannel_logout_uri,
         sso_scopes                 as scopes,
         sso_client_secret_env      as client_secret_env,
         origin,
         owner,
         review_due_on
    from core.embedded_apps
   where enabled and sso_enabled;

comment on view core.v_oidc_clients is
  'RP OIDC đang hiệu lực. Điều kiện enabled AND sso_enabled nằm ở đây, một chỗ duy nhất — '
  'tắt app trong sổ là cắt luôn đường đăng nhập, không chỉ nhúng và webhook.';

grant select on core.v_oidc_clients to authenticated;

commit;
