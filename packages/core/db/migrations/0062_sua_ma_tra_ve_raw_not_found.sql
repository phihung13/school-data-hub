-- 0062_sua_ma_tra_ve_raw_not_found.sql
-- SỬA MỘT LỖI TÔI TỰ GÂY RA TRONG `0061`, và sửa bằng đúng cửa mà sổ migration cho phép.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CHUYỆN GÌ ĐÃ XẢY RA
-- ═══════════════════════════════════════════════════════════════════════════
-- `0061` viết lại trọn `core.promote_embedded_event` để đổi tầng định danh (ADR-038).
-- Trong lúc chép lại thân hàm, nhánh "không tìm thấy bản ghi thô" bị đổi từ
-- `'raw_not_found'` thành `'not_found'` — một chữ, không ai gõ có chủ ý.
--
-- Nó KHÔNG phải chuyện nhỏ: `apps/hub/app/api/embed/webhook/route.ts` có một bảng ánh xạ
-- mã trả về → mã HTTP, và `raw_not_found` nằm trong đó (→ 500). Một mã lạ rơi ra ngoài
-- bảng ấy thì app ngoài nhận một phản hồi không có trong hợp đồng.
--
-- BẮT ĐƯỢC BỞI: `0019_embed_generic_capture_test.sql` assertion 12 — bài test đã có sẵn
-- từ trước, canh đúng chỗ này. Đây là lý do bộ test tồn tại, nên ghi lại như một lần nó
-- trả công chứ không phải một phiền toái.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VÌ SAO LÀ MỘT MIGRATION MỚI CHỨ KHÔNG PHẢI SỬA `0061`
-- ═══════════════════════════════════════════════════════════════════════════
-- Tôi ĐÃ sửa thẳng vào file `0061` sau khi nó chạy trên `hub_dev`, và sổ migration
-- (`0050`) chặn lại ở lượt áp kế tiếp: **LỆCH BĂM**. Cổng đó nói đúng một điều — file
-- trong kho không còn mô tả thứ đang chạy trong database, và đó là kiểu sai không lỗi
-- nào nổ ra. Hai cửa nó cho: hoàn nguyên file, hoặc viết migration mới. Chọn cửa thứ
-- hai và hoàn nguyên `0061` về đúng nội dung đã áp, để lịch sử kể đúng chuyện đã xảy ra.
--
-- Chỉ đổi ĐÚNG MỘT DÒNG so với `0061`; phần còn lại của thân hàm chép nguyên.

begin;

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
    -- ĐÂY là dòng được sửa: `0061` trả 'not_found', ngoài hợp đồng của webhook route.
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

  begin
    v_actor := nullif(v_row.payload ->> 'actor_user_id', '')::uuid;
  exception when others then
    return core.record_import_error(v_row, 'actor_user_id không phải UUID hợp lệ');
  end;

  if v_actor is not null and not exists (select 1 from core.users where id = v_actor) then
    return core.record_import_error(v_row, 'actor_user_id không khớp core.users nào');
  end if;

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

    if not exists (
      select 1 from core.identity_links
       where system = 'embed-login:' || v_app_id and user_id = v_nguoi
    ) then
      return core.record_import_error(
        v_row,
        'user_id chưa từng đăng nhập vào app này — app chỉ gửi được dữ liệu của người đã dùng nó');
    end if;

    select s.id into v_student from core.students s where s.user_id = v_nguoi;
  end if;

  if v_event = 'dear_log' then
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

commit;
