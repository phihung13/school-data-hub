-- 0019_embed_generic_capture.sql
-- Cổng nhận chung cho rổ Xanh (ADR-017 mục 0): app không chạm dữ liệu học sinh nên không có
-- alias/id_mappings nào để map — khác hẳn rổ Vàng (0018, DEAR log qua alias học sinh).
-- Định danh bằng actor_user_id (= core.users.id thật, app đã có sẵn từ lúc người đó đăng nhập
-- qua OIDC bridge) chứ không qua alias ẩn danh, vì đối tượng ở đây là NHÂN VIÊN, không phải trẻ em.
--
-- Quyết định 29/07/2026: chấp nhận đổi "toàn bộ dữ liệu, không chọn lọc, không chờ thiết kế bảng
-- riêng cho từng loại sự kiện" lấy tốc độ — giữ nguyên payload JSON, không ép về cột cứng. Nếu
-- sau này cần báo cáo/thống kê có cấu trúc, trích xuất từ payload qua view, không đổi bảng gốc.

begin;

create table ops.embedded_app_events (
  id             bigserial primary key,
  app_id         text not null,
  actor_user_id  uuid references core.users(id),
  event_type     text not null,
  payload        jsonb not null,
  external_id    text not null,
  occurred_at    timestamptz not null default now(),
  constraint embedded_app_events_uq unique (app_id, external_id)
);
comment on table ops.embedded_app_events is
  'Rổ Xanh — cổng nhận TOÀN BỘ sự kiện nghiệp vụ từ app nhúng ngoài, giữ nguyên payload JSON. Khác evidence.* (luôn FK core.students.id) vì không có học sinh nào liên quan.';

create index embedded_app_events_actor_idx on ops.embedded_app_events (actor_user_id, occurred_at desc);
create index embedded_app_events_app_idx   on ops.embedded_app_events (app_id, occurred_at desc);

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

  v_app_id := replace(v_row.source, 'embed:', '');
  v_event  := v_row.payload ->> 'event_type';

  -- Rổ Vàng: event_type đã có bảng cấu trúc riêng, map qua alias học sinh (0018).
  if v_event = 'dear_log' then
    select student_id into v_student
      from core.id_mappings
     where system = v_row.source and external_id = v_row.external_id;

    if v_student is null then
      insert into staging.import_errors (source, raw_id, external_id, reason, payload)
           values (v_row.source, v_row.id, v_row.external_id, 'alias không map được student_id', v_row.payload);
      return 'import_error';
    end if;

    insert into evidence.dear_logs (student_id, logged_on, minutes, book_title)
         values (
           v_student,
           (v_row.payload ->> 'logged_on')::date,
           coalesce((v_row.payload ->> 'minutes')::smallint, 0),
           v_row.payload ->> 'book_title'
         )
    on conflict (student_id, logged_on)
    do update set minutes = excluded.minutes, book_title = excluded.book_title;

    update staging.raw_embedded_events set promoted_at = now() where id = v_row.id;
    return 'promoted';
  end if;

  -- Rổ Xanh: cổng nhận chung, mọi event_type khác đều rơi vào đây.
  v_actor := nullif(v_row.payload ->> 'actor_user_id', '')::uuid;
  if v_actor is not null and not exists (select 1 from core.users where id = v_actor) then
    insert into staging.import_errors (source, raw_id, external_id, reason, payload)
         values (v_row.source, v_row.id, v_row.external_id, 'actor_user_id không khớp core.users nào', v_row.payload);
    return 'import_error';
  end if;

  insert into ops.embedded_app_events (app_id, actor_user_id, event_type, payload, external_id)
       values (v_app_id, v_actor, coalesce(v_event, 'unknown'), v_row.payload, v_row.external_id)
  on conflict (app_id, external_id)
  do update set payload = excluded.payload, event_type = excluded.event_type;

  update staging.raw_embedded_events set promoted_at = now() where id = v_row.id;
  return 'promoted';
end;
$$;

comment on function core.promote_embedded_event(bigint) is
  'ADR-017 — promote() cho nguồn embed. event_type có bảng riêng (vd dear_log) đi rổ Vàng qua alias; còn lại rơi vào ops.embedded_app_events (rổ Xanh, generic).';

commit;
