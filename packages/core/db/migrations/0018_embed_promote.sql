-- 0018_embed_promote.sql
-- ADR-017 mục 1.2/4.3 — promote() cho staging.raw_embedded_events, chạy NGAY theo sự kiện
-- (khác Tutor/Moodle/COR chờ cron đêm). Demo Đường B đầu tiên: DEAR log (rổ Vàng,
-- evidence.dear_logs — bảng đã ghi rõ "app ngoài Tier 2 đầu tiên được phép ghi").
--
-- Không map được alias -> student_id thì rơi vào staging.import_errors chờ NGƯỜI xử,
-- không tự đoán (§8). Idempotent qua UQ (student_id, logged_on) + upsert (§9).

begin;

create or replace function core.promote_embedded_event(p_raw_id bigint)
returns text
language plpgsql
security definer
set search_path = core, evidence, staging, pg_temp
as $$
declare
  v_row      staging.raw_embedded_events%rowtype;
  v_app_id   text;
  v_student  uuid;
  v_event    text;
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

  select student_id into v_student
    from core.id_mappings
   where system = v_row.source and external_id = v_row.external_id;

  if v_student is null then
    insert into staging.import_errors (source, raw_id, external_id, reason, payload)
         values (v_row.source, v_row.id, v_row.external_id, 'alias không map được student_id', v_row.payload);
    return 'import_error';
  end if;

  if v_event = 'dear_log' then
    insert into evidence.dear_logs (student_id, logged_on, minutes, book_title)
         values (
           v_student,
           (v_row.payload ->> 'logged_on')::date,
           coalesce((v_row.payload ->> 'minutes')::smallint, 0),
           v_row.payload ->> 'book_title'
         )
    on conflict (student_id, logged_on)
    do update set minutes = excluded.minutes, book_title = excluded.book_title;
  else
    insert into staging.import_errors (source, raw_id, external_id, reason, payload)
         values (v_row.source, v_row.id, v_row.external_id, 'event_type không hỗ trợ: ' || coalesce(v_event, '(rỗng)'), v_row.payload);
    return 'import_error';
  end if;

  update staging.raw_embedded_events set promoted_at = now() where id = v_row.id;
  return 'promoted';
end;
$$;

comment on function core.promote_embedded_event(bigint) is
  'ADR-017 — promote() cho nguồn embed, chạy theo sự kiện. security definer vì connector không có quyền evidence/core (§8).';

commit;
