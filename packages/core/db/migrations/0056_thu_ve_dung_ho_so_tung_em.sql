-- 0056_thu_ve_dung_ho_so_tung_em.sql
-- Thi hành ADR-033 (duyệt 08/08/2026, chủ đầu tư quyết trực tiếp): dữ liệu Mini App gửi về
-- được GẮN vào đúng em, và có người ĐỌC được.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- ĐO THẬT TRƯỚC KHI VIẾT — ống đã thông, hai khớp cuối chưa nối
-- ═══════════════════════════════════════════════════════════════════════════════
-- Đo 08/08/2026 bằng một Mini App thử gửi một sự kiện thật qua đường hầm công khai:
--
--   POST /api/embed/webhook  →  {"ok":true,"status":"promoted"}
--   gửi lại y hệt            →  already_promoted, vẫn ĐÚNG MỘT dòng
--   loại sự kiện chưa khai   →  403
--   secret sai               →  401
--
-- Mọi van an toàn đóng đúng. Nhưng dữ liệu hạ cánh thế này:
--
--   ops.embedded_app_events
--   app_id | event_type      | payload
--   do-thu | ket_qua_the_luc | {"alias":"…","chay_30m":"5.8s","bat_xa":"1.6m"}
--
-- Hai khớp còn hở, cả hai đo được chứ không suy đoán:
--
--   (a) KHÔNG CỘT NÀO NỐI VỀ HỌC SINH. Mã em nằm CHÌM trong JSON. `promote_embedded_event`
--       có đúng MỘT nhánh biết giải alias — nhánh `dear_log`. Mọi loại khác rơi vào cổng
--       nhận chung nguyên si. Nghĩa là không ai hỏi được "kết quả thể lực của em Minh cả
--       năm" dù dữ liệu đã nằm trong kho.
--   (b) KHÔNG VAI NÀO ĐỌC ĐƯỢC. `has_table_privilege` cho `authenticated`, `connector`,
--       `reporting` đều trả **false**. Bảng là một cái kho chỉ ghi vào: 0 dòng đọc ra,
--       không màn hình, không báo cáo. Dữ liệu về mà không ai đọc thì gần như chưa về.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- MỘT LẦN CHO MỌI APP — không phải một migration cho mỗi app
-- ═══════════════════════════════════════════════════════════════════════════════
-- File này KHÔNG bịa lược đồ nghiệp vụ của app nào (không có `fitness.ket_qua`, không có
-- `canteen.suat_an`). Nó chỉ nhấc lên ĐÚNG BA thứ mà mọi sự kiện đều cần để sống trong hệ
-- này: em nào (`student_id`), loại gì (`event_type`, đã có), lúc nào (`occurred_at`, đã có).
-- Phần còn lại ở lại trong `payload` và tra được bằng chỉ mục GIN — kho đã có 19 cột jsonb
-- và 16 chỉ mục GIN, tức là mô hình tài liệu vốn đã chạy ở đây.
--
-- Bảng này là BÃI ĐÁP, không phải ĐÍCH ĐẾN. Ngày một Mini App đủ chín, nó có schema riêng
-- với bảng có kiểu và khoá ngoại về `core.students` (ADR-011/012) — đó mới là chỗ ở lâu dài.
-- Ghi ra để không ai đọc file này rồi tưởng cổng nhận chung là mô hình dữ liệu.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- AI ĐƯỢC ĐỌC — quyết định của chủ đầu tư 08/08/2026, và hai chốt kèm theo
-- ═══════════════════════════════════════════════════════════════════════════════
-- Câu hỏi đặt ra nguyên văn: "dữ liệu app con gửi về — ai được mở ra xem?". Ba lựa chọn,
-- chủ đầu tư chọn RỘNG NHẤT: **thêm cả phụ huynh và học sinh**, sau khi đã được nói trước
-- rằng đó là lựa chọn dễ lộ nhất nếu app con gửi nhầm thứ không nên gửi.
--
-- Quyết định là của chủ đầu tư và file này thi hành đúng nó. Hai chốt đi kèm, không phải
-- để hãm bớt quyết định mà để nó không thành một cái lỗ:
--
--   CHỐT 1 — chỉ dữ liệu CỦA CHÍNH MÌNH. `core.can_see_student(student_id)`, đúng hàm mà
--     `evidence.dear_logs` đang dùng. Phụ huynh thấy con mình, không thấy danh sách lớp.
--   CHỐT 2 — chỉ app mà TRƯỜNG ĐÃ MỞ CHO VAI ĐÓ. `core.embedded_apps.allowed_roles` từ nay
--     là TRẦN của quyền đọc dữ liệu app đó, không chỉ là quyền bấm vào tile. Một app khai
--     cho `{teacher, homeroom}` thì dữ liệu của nó KHÔNG tới tay phụ huynh, dù nó có gắn
--     tên em và dù phụ huynh đó `can_see_student` em đó.
--
-- Chốt 2 là chỗ đáng đọc kỹ. `can_see_student` là hợp của sáu nhánh, rộng hơn danh sách
-- chủ đầu tư nêu (nó gồm cả giáo viên bộ môn đang dạy em và hiệu trưởng). Bắt nó AND với
-- `allowed_roles` biến câu "ai đọc được dữ liệu app này" thành một ô tích trên màn quản trị
-- — người quyết là nhà trường, cho từng app, và đổi được trong mười giây mà không cần deploy.
--
-- RỔ ĐỎ KHÔNG ĐI QUA ĐÂY: `core.embedded_apps.basket` chỉ nhận 'xanh'/'vang' (0052), nên
-- không app ngoài nào khai được rổ Đỏ ngay từ đầu. Cửa này không nới điều đó một ly.
begin;

-- ---------------------------------------------------------------------------
-- 1. Cột nối về em
-- ---------------------------------------------------------------------------

alter table ops.embedded_app_events
  add column if not exists student_id uuid references core.students(id) on delete cascade;

comment on column ops.embedded_app_events.student_id is
  'Em nào — giải từ alias trong payload qua core.id_mappings. NULL = sự kiện không gắn em nào '
  '(hợp lệ: thực đơn tuần, lịch CLB). on delete cascade: hồ sơ trẻ em quá hạn phải xoá được, '
  'giữ lại dưới tên "dữ liệu app" là vi phạm Luật 91/2025 chứ không phải cẩn thận.';

create index if not exists embedded_app_events_student_idx
  on ops.embedded_app_events (student_id, occurred_at desc)
  where student_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Rổ Xanh KHÔNG được gắn tên em — cưỡng chế, không phải quy ước
-- ---------------------------------------------------------------------------
-- `08-embedded-apps.md` mục 0 định nghĩa rổ Xanh là "không gắn định danh học sinh". Trước
-- file này, lời hứa đó sống bằng niềm tin vào tầng ứng dụng.
--
-- Bài học vừa trả giá trong chính kho này (nợ #55): quyền ghi `absent` cho dòng gửi muộn
-- được canh bằng QUY ƯỚC, và cái comment canh nó đã SAI suốt nhiều ngày mà không ai biết.
-- Một điều cấm nằm trong tài liệu thì người ta đọc rồi quên; một điều cấm nằm trong máy thì
-- máy từ chối, và lời từ chối không phụ thuộc vào việc ai đang nhớ điều gì.
--
-- Trigger chứ không CHECK: điều kiện phải tra sang `core.embedded_apps` để biết rổ, mà CHECK
-- không nhận truy vấn con.

create or replace function ops.tg_su_kien_ro_xanh_khong_gan_em()
returns trigger
language plpgsql
as $$
declare
  v_ro text;
begin
  if new.student_id is null then
    return new;
  end if;
  select basket into v_ro from core.embedded_apps where app_id = new.app_id;
  if v_ro = 'xanh' then
    raise exception
      'App "%" khai rổ Xanh nên không được gắn tên em nào. Muốn gắn thì khai lại rổ Vàng và xin Hội đồng dữ liệu duyệt.',
      new.app_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function ops.tg_su_kien_ro_xanh_khong_gan_em() is
  'Rổ Xanh = "không gắn định danh học sinh" (08-embedded-apps.md mục 0). Đây là chỗ lời hứa đó '
  'thành máy từ chối thay vì thành một dòng người ta đọc rồi quên.';

drop trigger if exists su_kien_ro_xanh_khong_gan_em on ops.embedded_app_events;
create trigger su_kien_ro_xanh_khong_gan_em
  before insert or update on ops.embedded_app_events
  for each row
  execute function ops.tg_su_kien_ro_xanh_khong_gan_em();

-- ---------------------------------------------------------------------------
-- 3. promote(): giải alias cho MỌI loại sự kiện, không riêng dear_log
-- ---------------------------------------------------------------------------
-- Chỉ đổi nhánh cổng nhận chung. Nhánh `dear_log` giữ NGUYÊN từng chữ — nó có bảng riêng,
-- có hợp đồng riêng với app đang chạy, và trộn hai việc vào một migration là cách chắc nhất
-- để không ai đối chiếu được về sau.

create or replace function core.promote_embedded_event(p_raw_id bigint)
returns text
language plpgsql
security definer
-- GIỮ NGUYÊN TỪNG CHỮ `search_path` của bản cũ (đo bằng `pg_proc.proconfig` trước khi sửa).
-- `create or replace` KHÔNG kế thừa thuộc tính: viết thiếu một schema ở đây là hàm
-- `security definer` này đổi tầm nhìn tên — đúng loại lỗi chỉ lộ ra khi một bảng bỗng
-- "không tồn tại", ở giữa đường ghi dữ liệu. `pg_temp` đứng cuối là bắt buộc cho hàm
-- security definer (chặn kiểu tấn công dựng bảng tạm trùng tên).
set search_path = core, evidence, staging, ops, pg_temp
as $$
declare
  v_row     staging.raw_embedded_events%rowtype;
  v_app_id  text;
  v_student uuid;
  v_event   text;
  v_actor   uuid;
  v_alias   text;
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

  -- ── Cổng nhận chung: mọi event_type khác ──
  begin
    v_actor := nullif(v_row.payload ->> 'actor_user_id', '')::uuid;
  exception when others then
    return core.record_import_error(v_row, 'actor_user_id không phải UUID hợp lệ');
  end;

  if v_actor is not null and not exists (select 1 from core.users where id = v_actor) then
    return core.record_import_error(v_row, 'actor_user_id không khớp core.users nào');
  end if;

  -- MỚI (0056): giải `payload.alias` → student_id.
  --
  -- `alias` là một trường CÓ TÊN trong payload, không phải `external_id`. Hai thứ đó khác
  -- việc: `external_id` là mã của SỰ KIỆN (dùng chống ghi trùng, phải khác nhau giữa hai
  -- lần gửi), còn `alias` là mã của EM (dùng đi dùng lại, giống nhau qua mọi sự kiện của em
  -- đó). Gộp hai vai vào một trường là mỗi em chỉ gửi được đúng một sự kiện trong đời.
  --
  -- Alias do Hub sinh và app xin qua `POST /api/embed/alias` (ADR-017 mục 1.1) — app không
  -- bao giờ tự khai, và không bao giờ biết `student_id` thật.
  v_alias := nullif(btrim(v_row.payload ->> 'alias'), '');
  if v_alias is not null then
    select student_id into v_student
      from core.id_mappings
     where system = v_row.source and external_id = v_alias;

    -- KHÔNG lưu null trong im lặng. App gửi một alias mà Hub không nhận ra là một lỗi thật:
    -- hoặc app tự bịa mã, hoặc nó dùng alias của app khác (mỗi app một dải riêng), hoặc em
    -- đó đã rời trường. Cả ba đều cần người xem. Lưu null thì dòng ấy trông y hệt một sự
    -- kiện không gắn em nào — và không ai còn cách nào phân biệt.
    if v_student is null then
      return core.record_import_error(v_row, 'alias không map được student_id');
    end if;
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

-- ---------------------------------------------------------------------------
-- 4. Đường ĐỌC — hai chốt ở khối chú thích đầu file
-- ---------------------------------------------------------------------------

drop policy if exists embedded_app_events_doc_cua_minh on ops.embedded_app_events;
create policy embedded_app_events_doc_cua_minh on ops.embedded_app_events
  for select to authenticated
  using (
    student_id is not null
    -- CHỐT 1: chỉ em mình / con mình / lớp mình / cụm mình. Cùng hàm với evidence.dear_logs.
    and core.can_see_student(student_id)
    -- CHỐT 2: và chỉ app mà trường đã mở cho vai của chính người đang đọc.
    and exists (
      select 1
        from core.embedded_apps a
       where a.app_id = ops.embedded_app_events.app_id
         and a.enabled
         and exists (select 1 from unnest(a.allowed_roles) r where core.has_role(r))
    )
  );

drop policy if exists embedded_app_events_quan_tri on ops.embedded_app_events;
-- Quản trị đọc CẢ dòng không gắn em nào — nếu không thì không ai trả lời được câu
-- "app này đã gửi về những gì", và cái cổng nhận chung lại thành kho khoá như trước.
create policy embedded_app_events_quan_tri on ops.embedded_app_events
  for select to authenticated
  using (core.has_role('admin'));

grant select on ops.embedded_app_events to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Khung nhìn cho màn quản trị: app này đã gửi về những gì
-- ---------------------------------------------------------------------------
-- `security_invoker` BẮT BUỘC: view mặc định chạy bằng quyền chủ sở hữu, tức là vượt mặt
-- RLS vừa dựng ở trên. Đúng lỗi mà 0024 đã phải đi vá một lượt cho các view của `report`.

create or replace view ops.v_mini_app_da_nhan
with (security_invoker = on) as
  select app_id,
         event_type,
         count(*)::int                          as so_su_kien,
         count(distinct student_id)::int        as so_em,
         max(occurred_at)                       as lan_cuoi
    from ops.embedded_app_events
   group by app_id, event_type;

comment on view ops.v_mini_app_da_nhan is
  'App nào đã gửi về loại gì, bao nhiêu, cho bao nhiêu em, lần cuối lúc nào. Sinh ra để câu '
  '"dữ liệu có thật sự về không" trả lời được bằng một màn hình thay vì bằng một lời hứa.';

grant select on ops.v_mini_app_da_nhan to authenticated;

commit;
