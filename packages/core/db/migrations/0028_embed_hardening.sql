-- 0028_embed_hardening.sql
-- Siết đường ingest app ngoài (Đường B, §8 + §9). Ba việc, cùng một đường đi của dữ liệu:
--
--   1. promote() KHÔNG được ném lỗi vì payload xấu. Trước bản này, `(payload->>'logged_on')::date`
--      trên payload thiếu/sai kiểu ném 23502/22007/23514 ra ngoài hàm. Vì route webhook gói cả
--      "ghi staging" lẫn "gọi promote" trong MỘT transaction, exception rollback sạch: bản ghi thô
--      KHÔNG nằm lại staging, KHÔNG có dòng import_errors, app ngoài nhận 500 rồi retry vô hạn.
--      §8 nói ngược lại: bản ghi hỏng phải nằm trong staging.import_errors chờ NGƯỜI xử.
--
--   2. Nhánh lỗi phải idempotent (§9). Trước bản này mỗi lần gọi lại promote() trên cùng raw row
--      lỗi lại chèn thêm một dòng import_errors — app ngoài retry mỗi 30 giây bơm 2880 dòng/ngày
--      vào đúng hàng đợi mà con người phải xử tay.
--
--   3. Đường ghi phải chạy bằng vai `connector`, không phải vai chủ schema. §8 quy định "role DB
--      của connector chỉ có INSERT trên staging" và 0008 đã cấp đúng vậy, nhưng route lại gọi
--      withSystemContext (không SET ROLE) nên toàn bộ hàng rào đó chưa từng được cưỡng chế.

begin;

-- ---------------------------------------------------------------------------
-- 1. Cột failed_at: "đã thử promote và hỏng vĩnh viễn"
-- ---------------------------------------------------------------------------
-- Cố tình KHÔNG dùng lại promoted_at cho nhánh lỗi: promoted_at phải giữ đúng nghĩa
-- "đã vào được schema nghiệp vụ". Trộn hai nghĩa vào một cột thì mọi báo cáo "bao nhiêu
-- sự kiện đã vào kho" lập tức nói dối.
alter table staging.raw_embedded_events add column if not exists failed_at timestamptz;

comment on column staging.raw_embedded_events.failed_at is
  'Đã gọi promote() và rơi vào staging.import_errors. Lần gọi sau trả ngay ''already_failed'' (§9). Người xử lỗi xong thì set NULL để nạp lại.';

-- ---------------------------------------------------------------------------
-- 2. Sổ lỗi phải chống trùng ở tầng DB, không chỉ ở tầng code
-- ---------------------------------------------------------------------------
-- Dọn trùng đã sinh ra trước khi có ràng buộc (giữ dòng cũ nhất — dòng đầu tiên mới là
-- dòng có ngữ cảnh lúc lỗi thật sự xảy ra).
delete from staging.import_errors a
 using staging.import_errors b
 where a.id > b.id
   and a.source = b.source
   and a.external_id is not distinct from b.external_id
   and a.reason = b.reason;

-- nulls not distinct (PG15+): external_id có thể NULL với nguồn khác embed; không có mệnh đề
-- này thì mọi dòng NULL đều "khác nhau" và ràng buộc mất tác dụng đúng ở chỗ cần nhất.
create unique index if not exists import_errors_dedup_uq
    on staging.import_errors (source, external_id, reason) nulls not distinct;

comment on index staging.import_errors_dedup_uq is
  '§9 — cùng một nguồn + cùng một bản ghi + cùng một lý do chỉ chiếm MỘT dòng trong hàng đợi người xử, dù app ngoài retry bao nhiêu lần.';

-- ---------------------------------------------------------------------------
-- 3. Ghi sổ lỗi: một chỗ duy nhất, dùng lại cho mọi nhánh
-- ---------------------------------------------------------------------------
create or replace function core.record_import_error(
  p_row     staging.raw_embedded_events,
  p_reason  text
) returns text
language plpgsql
security definer
set search_path = core, staging, pg_temp
as $$
begin
  insert into staging.import_errors (source, raw_id, external_id, reason, payload)
       values (p_row.source, p_row.id, p_row.external_id, p_reason, p_row.payload)
  on conflict (source, external_id, reason)
  do update set payload = excluded.payload,
                raw_id  = excluded.raw_id;

  update staging.raw_embedded_events set failed_at = now() where id = p_row.id;
  return 'import_error';
end;
$$;

comment on function core.record_import_error(staging.raw_embedded_events, text) is
  '§8 — bản ghi không dùng được thì nằm lại staging.import_errors chờ người xử, không tự đoán và không mất im lặng. Idempotent qua import_errors_dedup_uq.';

-- ---------------------------------------------------------------------------
-- 4. promote() bản chịu lỗi
-- ---------------------------------------------------------------------------
create or replace function core.promote_embedded_event(p_raw_id bigint)
returns text
language plpgsql
security definer
set search_path = core, evidence, staging, ops, pg_temp
as $$
declare
  v_row     staging.raw_embedded_events%rowtype;
  v_app_id  text;
  v_student uuid;
  v_event   text;
  v_actor   uuid;
begin
  select * into v_row from staging.raw_embedded_events where id = p_raw_id for update;
  if not found then
    return 'raw_not_found';
  end if;
  if v_row.promoted_at is not null then
    return 'already_promoted'; -- §9: gọi lại không làm gì thêm
  end if;
  if v_row.failed_at is not null then
    -- §9 cho nhánh lỗi: đã kết luận hỏng thì retry không sinh thêm dòng nào nữa.
    -- Payload không đổi được (webhook upsert giữ nguyên bản đầu tiên theo external_id),
    -- nên gọi lại chắc chắn hỏng y hệt — trả lời ngay thay vì diễn lại vở kịch cũ.
    return 'already_failed';
  end if;

  v_app_id := replace(v_row.source, 'embed:', '');
  v_event  := v_row.payload ->> 'event_type';

  -- ── Rổ Vàng: event_type đã có bảng cấu trúc riêng, map qua alias học sinh (0018) ──
  if v_event = 'dear_log' then
    select student_id into v_student
      from core.id_mappings
     where system = v_row.source and external_id = v_row.external_id;

    if v_student is null then
      return core.record_import_error(v_row, 'alias không map được student_id');
    end if;

    -- Khối chịu lỗi: mọi phép ép kiểu và mọi CHECK của evidence.dear_logs nằm TRONG đây.
    -- Ba ca thật đã dựng lại được: thiếu logged_on (23502), logged_on='hôm nay' (22007),
    -- minutes=999 (23514). Cả ba trước đây bay ra ngoài và cuốn theo cả transaction.
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

  -- ── Rổ Xanh: cổng nhận chung, mọi event_type khác đều rơi vào đây ──
  begin
    v_actor := nullif(v_row.payload ->> 'actor_user_id', '')::uuid;
  exception when others then
    -- App ngoài gửi actor_user_id không phải UUID: trước đây 22P02 ném thẳng ra ngoài.
    return core.record_import_error(v_row, 'actor_user_id không phải UUID hợp lệ');
  end;

  if v_actor is not null and not exists (select 1 from core.users where id = v_actor) then
    return core.record_import_error(v_row, 'actor_user_id không khớp core.users nào');
  end if;

  begin
    insert into ops.embedded_app_events (app_id, actor_user_id, event_type, payload, external_id)
         values (v_app_id, v_actor, coalesce(v_event, 'unknown'), v_row.payload, v_row.external_id)
    on conflict (app_id, external_id)
    do update set payload = excluded.payload, event_type = excluded.event_type;
  exception when others then
    return core.record_import_error(v_row, 'payload không hợp lệ: ' || sqlerrm);
  end;

  update staging.raw_embedded_events set promoted_at = now() where id = v_row.id;
  return 'promoted';
end;
$$;

comment on function core.promote_embedded_event(bigint) is
  'ADR-017 — promote() cho nguồn embed. Không bao giờ ném lỗi vì payload: mọi hỏng hóc đi vào staging.import_errors (§8) và đánh dấu failed_at để retry không nhân bản (§9).';

-- ---------------------------------------------------------------------------
-- 5. Đường ghi của connector — cưỡng chế §8 ở tầng quyền, không chỉ ở tầng code
-- ---------------------------------------------------------------------------
-- Vì sao cần hàm bọc thay vì cấp thêm quyền bảng cho connector:
--   · `insert ... on conflict do update ... returning id` đòi UPDATE + SELECT trên bảng thô;
--   · alias route đòi đọc core.students để đổi user_id → student_id.
-- Cấp hai thứ đó cho connector là mở đúng cánh cửa §8 sinh ra để đóng (connector rò khóa thì
-- không được đọc dữ liệu học sinh, không được sửa kho). Nên: connector giữ nguyên "chỉ INSERT
-- trên staging", còn hai thao tác trên đi qua hàm SECURITY DEFINER có phạm vi hẹp, xem được
-- toàn bộ trong file này.

create or replace function staging.ingest_embedded_event(
  p_source       text,
  p_external_id  text,
  p_payload      jsonb
) returns bigint
language plpgsql
security definer
set search_path = staging, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into staging.raw_embedded_events (source, external_id, payload)
       values (p_source, p_external_id, p_payload)
  on conflict (source, external_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Đã nhận sự kiện này rồi (§9): trả đúng raw_id cũ, KHÔNG ghi đè payload.
    -- external_id là lời hứa "cùng một sự kiện" của app ngoài (Rev F điều 4) — bản đầu tiên
    -- là bản có thẩm quyền, retry không được sửa lịch sử.
    select id into v_id from staging.raw_embedded_events
     where source = p_source and external_id = p_external_id;
  end if;

  return v_id;
end;
$$;

comment on function staging.ingest_embedded_event(text, text, jsonb) is
  '§8/§9 — cửa vào duy nhất của webhook app ngoài. Upsert theo (source, external_id), trả raw_id để gọi promote(). Connector không cần SELECT/UPDATE trên bảng thô nhờ hàm này.';

create or replace function core.issue_embed_alias_for_user(
  p_app_id   text,
  p_user_id  uuid
) returns text
language plpgsql
security definer
set search_path = core, pg_temp
as $$
declare
  v_student uuid;
begin
  select id into v_student from core.students where user_id = p_user_id;
  if v_student is null then
    return null;  -- người này không phải học sinh ⇒ không có alias evidence nào để cấp
  end if;
  return core.issue_embed_alias(p_app_id, v_student);
end;
$$;

comment on function core.issue_embed_alias_for_user(text, uuid) is
  'ADR-017 — bọc issue_embed_alias cho đường /api/embed/alias: đổi core.users.id (sub OIDC) sang student_id BÊN TRONG database, để connector không cần quyền đọc core.students (§8).';

-- Deny-by-default cho cả bốn hàm: mặc định Postgres cấp EXECUTE cho PUBLIC, nghĩa là vai
-- `authenticated` (mọi học sinh/phụ huynh đã đăng nhập) gọi được promote() và tự cấp alias.
-- Chỉ connector được lái đường ingest (§8).
revoke all on function core.record_import_error(staging.raw_embedded_events, text) from public;
revoke all on function staging.ingest_embedded_event(text, text, jsonb)            from public;
revoke all on function core.issue_embed_alias_for_user(text, uuid)                 from public;
revoke all on function core.promote_embedded_event(bigint)                         from public;

grant usage on schema core to connector;   -- chỉ để gọi được hàm core.*, không kèm quyền bảng nào
grant execute on function staging.ingest_embedded_event(text, text, jsonb) to connector;
grant execute on function core.promote_embedded_event(bigint)             to connector;
grant execute on function core.issue_embed_alias(text, uuid)              to connector;
grant execute on function core.issue_embed_alias_for_user(text, uuid)     to connector;

-- Lỗ hổng lặng phát hiện 31/07/2026: 0008 cấp INSERT trên 4 bảng thô nhưng các bảng đó dùng
-- `bigserial`, và Postgres đòi USAGE trên sequence riêng cho serial (khác GENERATED AS IDENTITY).
-- Nghĩa là vai connector chưa từng insert nổi một dòng nào — §8 "đúng trên giấy" vì chưa ai
-- chạy thật bằng vai này (route dùng vai chủ schema). Cấp nốt để hàng rào thật sự dùng được.
grant usage on sequence staging.raw_tutor_events_id_seq    to connector;
grant usage on sequence staging.raw_moodle_id_seq          to connector;
grant usage on sequence staging.raw_cor_imports_id_seq     to connector;
grant usage on sequence staging.raw_embedded_events_id_seq to connector;

commit;
