-- 0061_app_ngoai_dung_user_id_that.sql
-- ADR-038 — app nhúng gửi ĐỊNH DANH THẬT (`core.users.id`) thay cho alias.
-- Quyết định chủ đầu tư 21/08/2026: *"user_id thật, như tờ sơ đồ vẽ"*, tái khẳng định
-- qua *"build hết luôn đi, không bỏ ra ngoài cái gì cả"*.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ĐIỀU ÍT AI NHỚ, và nó làm quyết định này nhỏ hơn vẻ ngoài của nó
-- ═══════════════════════════════════════════════════════════════════════════
-- `sub` trong token SSO ĐÃ LÀ `core.users.id` ngay từ đầu (ghi ở dòng 4 của
-- `apps/hub/server/oidc/provider.ts`). App nào đăng nhập được là đã cầm user_id thật
-- trong tay từ 30/07/2026. Tầng alias vì thế chưa bao giờ giấu được định danh — nó chỉ
-- còn che ĐƯỜNG DỮ LIỆU VỀ. Hôm nay đường về nhận thẳng thứ app đã có sẵn.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HAI TRƯỜNG KHÁC VIỆC, KHÔNG GỘP
-- ═══════════════════════════════════════════════════════════════════════════
--   `payload.actor_user_id` — AI LÀM việc này (có thể là thầy cô).
--   `payload.user_id`       — DỮ LIỆU NÀY CỦA AI (em học sinh).
-- Với app của học sinh thì hai cái trùng nhau; với app thầy cô ghi hộ thì khác. Gộp
-- chúng là mất khả năng phân biệt "cô ghi cho em" với "em tự ghi" — đúng phân biệt mà
-- `attendance.checkins.source` đã phải dựng lại một lần rồi.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HÀNG RÀO THAY THẾ: APP CHỈ GỬI ĐƯỢC DỮ LIỆU CỦA NGƯỜI ĐÃ ĐĂNG NHẬP VÀO NÓ
-- ═══════════════════════════════════════════════════════════════════════════
-- Alias có một tính chất mà `user_id` không có: KHÔNG ĐOÁN ĐƯỢC. Bỏ alias mà không bù
-- gì thì bất kỳ ai cầm chuỗi webhook chung đều ghi được dữ liệu dưới tên một em bất kỳ
-- mà họ đọc được id — và id của một em thì lộ ra ở nhiều chỗ hơn hẳn một chuỗi ngẫu
-- nhiên 32 ký tự. Chủ đầu tư chọn bỏ alias, KHÔNG chọn "mọi app ghi được cho mọi em".
--
-- Nên chỗ này bù bằng một điều kiện có sẵn dữ liệu và không đòi app làm gì thêm:
-- **`user_id` phải đã từng đăng nhập vào CHÍNH app đó** — `core.identity_links` với
-- `system = 'embed-login:<app_id>'`, dòng do `provider.ts` ghi mỗi lần cấp token.
--
-- Cái này CHẶN gì: app A đoán id của một em chưa bao giờ dùng app A rồi bơm dữ liệu.
-- Cái này KHÔNG chặn gì: app A ghi bậy cho chính người đang dùng app A — không hàng
-- rào nào ở tầng này chặn được điều đó, vì app đó có quyền hợp lệ với người đó.
-- Cái này LÀM VƯỚNG gì, nói trước: app nào cần ghi cho em CHƯA từng mở nó (thầy cô
-- nhập hộ cả lớp) sẽ nhận lỗi có tên và cần một lượt liên kết trước. Đó là đánh đổi
-- có chủ ý — mở sẵn thì không ai biết lúc nào nó bị lợi dụng, còn chặn thì hỏng ồn ào
-- và sửa được trong một phút.

begin;

-- ---------------------------------------------------------------------------
-- promote(): giải `payload.user_id` → student_id, cho MỌI loại sự kiện
-- ---------------------------------------------------------------------------
create or replace function core.promote_embedded_event(p_raw_id bigint)
returns text
language plpgsql
security definer
set search_path = core, staging, ops, evidence, pg_temp
as $$
declare
  v_row      staging.raw_embedded_events%rowtype;
  v_student  uuid;
  v_actor    uuid;
  v_nguoi    uuid;
  v_app_id   text;
  v_event    text;
begin
  select * into v_row from staging.raw_embedded_events where id = p_raw_id for update;
  if not found then
    return 'raw_not_found';
  end if;
  if v_row.promoted_at is not null then
    return 'already_promoted';
  end if;
  if exists (select 1 from staging.import_errors where source = v_row.source
              and external_id = v_row.external_id) then
    return 'already_failed';
  end if;

  v_app_id := replace(v_row.source, 'embed:', '');
  v_event  := v_row.payload ->> 'event_type';

  -- ── Ai làm việc này (có thể là thầy cô) ──────────────────────────────────
  begin
    v_actor := nullif(v_row.payload ->> 'actor_user_id', '')::uuid;
  exception when others then
    return core.record_import_error(v_row, 'actor_user_id không phải UUID hợp lệ');
  end;

  if v_actor is not null and not exists (select 1 from core.users where id = v_actor) then
    return core.record_import_error(v_row, 'actor_user_id không khớp core.users nào');
  end if;

  -- ── Dữ liệu này CỦA AI (ADR-038, thay cho `alias` của 0056) ──────────────
  --
  -- `alias` bị TỪ CHỐI TƯỜNG MINH, không bỏ qua trong im lặng: app dựng theo bản brief
  -- cũ phải hỏng ỒN ÀO và đọc được lý do. Nuốt nó thì dòng dữ liệu vào kho mà không gắn
  -- em nào, trông y hệt một sự kiện rổ Xanh hợp lệ — và không ai còn cách nào phân biệt.
  if nullif(btrim(v_row.payload ->> 'alias'), '') is not null then
    return core.record_import_error(
      v_row,
      'trường "alias" đã bỏ từ ADR-038 — gửi "user_id" (chính là sub trong token SSO)');
  end if;

  begin
    v_nguoi := nullif(btrim(v_row.payload ->> 'user_id'), '')::uuid;
  exception when others then
    return core.record_import_error(v_row, 'user_id không phải UUID hợp lệ');
  end;

  if v_nguoi is not null then
    if not exists (select 1 from core.users where id = v_nguoi) then
      return core.record_import_error(v_row, 'user_id không khớp core.users nào');
    end if;

    -- Hàng rào thay alias — xem khối lý lẽ ở đầu file.
    if not exists (
      select 1 from core.identity_links
       where system = 'embed-login:' || v_app_id and user_id = v_nguoi
    ) then
      return core.record_import_error(
        v_row,
        'user_id chưa từng đăng nhập vào app này — app chỉ gửi được dữ liệu của người đã dùng nó');
    end if;

    -- Không phải ai cũng là học sinh: thầy cô dùng app thì `student_id` để NULL và dòng
    -- vẫn vào kho, mang `actor_user_id`. Đây KHÔNG phải lỗi.
    select s.id into v_student from core.students s where s.user_id = v_nguoi;
  end if;

  -- ── Rổ Vàng: event_type có bảng cấu trúc riêng ───────────────────────────
  if v_event = 'dear_log' then
    -- Trước 0061 nhánh này tra `core.id_mappings` bằng chính `external_id` CỦA SỰ KIỆN —
    -- di sản 0018, khi external_id còn kiêm luôn vai mã học sinh. Nay nó đi cùng một
    -- đường với mọi loại khác: một chỗ giải danh tính, không phải hai.
    if v_student is null then
      return core.record_import_error(v_row, 'dear_log phải gắn một em: thiếu user_id của học sinh');
    end if;

    begin
      insert into evidence.dear_logs (student_id, logged_on, minutes, book_title)
           values (
             v_student,
             (v_row.payload ->> 'logged_on')::date,
             coalesce((v_row.payload ->> 'minutes')::smallint, 0),
             v_row.payload ->> 'book_title'
           )
      on conflict (student_id, logged_on)
      do update set minutes = excluded.minutes, book_title = excluded.book_title;
    exception when others then
      return core.record_import_error(v_row, 'payload không hợp lệ: ' || sqlerrm);
    end;

    update staging.raw_embedded_events set promoted_at = now() where id = v_row.id;
    return 'promoted';
  end if;

  -- ── Cổng nhận chung: mọi event_type khác ─────────────────────────────────
  begin
    insert into ops.embedded_app_events (app_id, actor_user_id, student_id, event_type, payload, external_id)
         values (v_app_id, v_actor, v_student, coalesce(v_event, 'unknown'), v_row.payload, v_row.external_id)
    on conflict (app_id, external_id)
    do update set payload    = excluded.payload,
                  event_type = excluded.event_type,
                  student_id = excluded.student_id;
  exception when others then
    return core.record_import_error(v_row, 'payload không hợp lệ: ' || sqlerrm);
  end;

  update staging.raw_embedded_events set promoted_at = now() where id = v_row.id;
  return 'promoted';
end;
$$;

comment on function core.promote_embedded_event(bigint) is
  'ADR-038 (21/08/2026) — gắn sự kiện app ngoài vào đúng em bằng `payload.user_id` (chính là `sub` của token SSO), thay cho `alias` của ADR-017. `payload.alias` nay bị TỪ CHỐI tường minh để app dựng theo brief cũ hỏng ồn ào. Hàng rào thay alias: user_id phải đã từng đăng nhập vào chính app đó (core.identity_links, system embed-login:<app_id>). Người không phải học sinh vẫn gửi được — student_id để NULL, dòng mang actor_user_id.';

-- ---------------------------------------------------------------------------
-- Ngừng CẤP alias mới. Dòng cũ (nếu có) giữ nguyên để đọc sử.
-- ---------------------------------------------------------------------------
-- Đo trước khi gỡ, 21/08/2026 trên hub_dev: `core.id_mappings` có **0 dòng** dải
-- `embed:*` — chưa alias nào từng được cấp trong đời hệ này. Nên đây là gỡ một cơ chế
-- CHƯA AI DÙNG, không phải gỡ một cơ chế đang chạy. Nếu ngày nào đó bảng ấy có dòng,
-- chúng vẫn đọc được: `core.id_mappings` không bị đụng tới.
--
-- Hai hàm bị gỡ chứ không để lại: một hàm còn tồn tại là một hàm còn gọi được, và
-- `0052` đã viết sẵn lời cảnh báo cho đúng tình huống này — "để lộ ra một trạng thái
-- hợp lệ trên giấy, và mọi thứ hợp lệ trên giấy rồi sẽ có người thử."
drop function if exists core.issue_embed_alias_for_user(text, uuid);
drop function if exists core.issue_embed_alias(text, uuid);

commit;
