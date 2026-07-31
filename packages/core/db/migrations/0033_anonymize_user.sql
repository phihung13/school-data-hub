-- 0033_anonymize_user.sql
-- Vòng đời tài khoản: chính sách ON DELETE nhất quán + đường ẨN DANH HOÁ có thật.
--
-- Vì sao cần: Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 cho chủ thể dữ liệu quyền yêu
-- cầu xoá. Giáo viên nghỉ việc, phụ huynh rút hồ sơ, học sinh chuyển trường — đây là
-- việc thường ngày, không phải ngoại lệ. Trước file này repo KHÔNG có đường nào để
-- làm việc đó, và `delete from core.users` thì hỏng nửa vời:
--
--   core.users  --cascade-->  core.teachers  --NO ACTION-->  evidence.value_behaviors
--
-- tức lệnh xoá chạy được một đoạn rồi bị 23503 chặn, người vận hành nhận một mã lỗi
-- Postgres trần và không biết hệ đang ở trạng thái nào. Tệ hơn: 12 cột trỏ về
-- core.users mang BA ngữ nghĩa khác nhau (cascade / no action / không ai quyết định),
-- và sự khác nhau đó là do lịch sử viết file chứ không do ai chọn.
--
-- File này chốt chính sách rồi ghi thẳng vào schema:
--
--   1. KHÔNG xoá cứng core.users. Đường chính thức là core.anonymize_user() — xoá
--      DỮ LIỆU ĐỊNH DANH (tên, email, auth_uid, sổ đăng nhập) nhưng GIỮ dòng và giữ
--      mọi khoá ngoại lịch sử. Đây không phải cách lách luật: cái luật bảo vệ là
--      thông tin cá nhân, còn "ca này ai xử lý, ai ghi can thiệp" là bằng chứng vận
--      hành về một ĐỨA TRẺ — mất nó là mất khả năng trả lời "ai đã làm gì với con
--      tôi", thứ cũng do chính luật đó bảo hộ.
--   2. Cột trỏ NGƯỜI THAO TÁC (ai xác nhận, ai phát mã) -> on delete set null: lệnh
--      xoá không kẹt giữa chừng, và mất tên người thao tác không làm sai dữ liệu.
--   3. Cột BẰNG CHỨNG (audit, can thiệp, ghi chú tư vấn, y tế) -> giữ NO ACTION CÓ
--      CHỦ Ý, kèm comment giải thích. Chúng phải chặn, và phải chặn có tiếng nói.
--   4. Trigger chặn DELETE với thông điệp tiếng Việt chỉ đúng đường thay thế. Có cửa
--      thoát hiểm khai báo tường minh (`hub.allow_user_hard_delete`) cho ca hiếm mà
--      Hội đồng dữ liệu quyết định xoá thật — bật cửa đó vẫn không xoá được người còn
--      bằng chứng, và vẫn báo rõ vì sao thay vì ném 23503.
--
-- Phụ thuộc: 0002 (core.users), 0003–0019 (các bảng tham chiếu), 0031 (trigger
-- core.touch_updated_at trên core.users).

begin;

-- ---------------------------------------------------------------------------
-- 1. Dấu vết "đã ẩn danh"
-- ---------------------------------------------------------------------------
-- Vì sao cần một cột riêng thay vì suy ra từ (auth_uid is null and status='disabled'):
-- một tài khoản MỚI TẠO CHƯA KÍCH HOẠT cũng có auth_uid NULL (0002:41), và một tài
-- khoản bị khoá tạm cũng có status='disabled'. Không phân biệt được ba trạng thái đó
-- thì §9 không thi hành được (gọi anonymize lần hai phải là no-op) và người vận hành
-- không trả lời được câu hỏi pháp lý "yêu cầu xoá của phụ huynh đã thực hiện chưa,
-- lúc nào".
alter table core.users add column if not exists anonymized_at timestamptz;

comment on column core.users.anonymized_at is
  'Luật 91/2025 — mốc thi hành quyền xoá dữ liệu. NULL = chưa ẩn danh. Khác với status=disabled (khoá tạm) và auth_uid IS NULL (chưa kích hoạt).';

create index if not exists users_anonymized_idx on core.users (anonymized_at)
  where anonymized_at is not null;

-- ---------------------------------------------------------------------------
-- 2. Cột NGƯỜI THAO TÁC -> on delete set null
-- ---------------------------------------------------------------------------
-- Tất cả đều đang là nullable nên đổi sang SET NULL không phá dữ liệu hiện có.
-- Dùng drop-if-exists rồi add lại để file chạy lại được (bộ test dựng DB từ đầu
-- mỗi lần, nhưng người vận hành thì hay chạy tay một file trên DB đã có).
alter table attendance.checkins
  drop constraint if exists checkins_confirmed_by_fkey,
  add  constraint checkins_confirmed_by_fkey
       foreign key (confirmed_by) references core.users(id) on delete set null;
comment on column attendance.checkins.confirmed_by is
  'NGƯỜI THAO TÁC — GVCN xác nhận bản gửi muộn (ADR-007). Xoá tài khoản thì về NULL: dòng điểm danh vẫn đúng, chỉ mất tên người bấm.';

alter table attendance.help_requests
  drop constraint if exists help_requests_handled_by_fkey,
  add  constraint help_requests_handled_by_fkey
       foreign key (handled_by) references core.users(id) on delete set null;

alter table care.thresholds
  drop constraint if exists thresholds_updated_by_fkey,
  add  constraint thresholds_updated_by_fkey
       foreign key (updated_by) references core.users(id) on delete set null;

-- owner_id là "ai đang cầm ca", không phải bằng chứng: ca vẫn tồn tại, vẫn đọc được
-- lịch sử can thiệp: mất tên người phụ trách không làm hồ sơ sai.
alter table care.care_cases
  drop constraint if exists care_cases_owner_id_fkey,
  add  constraint care_cases_owner_id_fkey
       foreign key (owner_id) references core.users(id) on delete set null;

alter table core.parent_invite_codes
  drop constraint if exists parent_invite_codes_created_by_fkey,
  add  constraint parent_invite_codes_created_by_fkey
       foreign key (created_by) references core.users(id) on delete set null;

alter table core.parent_invite_codes
  drop constraint if exists parent_invite_codes_redeemed_by_fkey,
  add  constraint parent_invite_codes_redeemed_by_fkey
       foreign key (redeemed_by) references core.users(id) on delete set null;

-- core.students.user_id: cột này đã CÓ NGHĨA khi NULL ("em chưa có tài khoản" —
-- 0002:60), nên SET NULL đưa hàng về đúng một trạng thái hợp lệ đã tồn tại. Để
-- NO ACTION thì xoá tài khoản một em là kẹt, mà §1 lại cấm xoá dòng học sinh
-- (student_code bất biến 12 năm) — hai luật khoá nhau.
alter table core.students
  drop constraint if exists students_user_id_fkey,
  add  constraint students_user_id_fkey
       foreign key (user_id) references core.users(id) on delete set null;

-- evidence.value_behaviors.confirmed_by trỏ core.teachers, mà core.teachers lại
-- CASCADE từ core.users (0003:12). Đây chính là mắt xích làm lệnh xoá hỏng nửa vời:
-- cascade chạy tới core.teachers rồi bị FK này chặn. Cùng ngữ nghĩa "người thao tác"
-- nên xử cùng cách.
alter table evidence.value_behaviors
  drop constraint if exists value_behaviors_confirmed_by_fkey,
  add  constraint value_behaviors_confirmed_by_fkey
       foreign key (confirmed_by) references core.teachers(id) on delete set null;

-- ops.embedded_app_events là bản ghi THÔ từ app ngoài; định danh thật của lượt gửi
-- nằm trong payload/external_id, actor_user_id chỉ là tiện ích tra ngược.
alter table ops.embedded_app_events
  drop constraint if exists embedded_app_events_actor_user_id_fkey,
  add  constraint embedded_app_events_actor_user_id_fkey
       foreign key (actor_user_id) references core.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Cột BẰNG CHỨNG — giữ NO ACTION, và nói rõ vì sao
-- ---------------------------------------------------------------------------
-- Không đổi ràng buộc, chỉ ghi lại quyết định vào chính schema: người đọc schema sau
-- này sẽ thấy "NO ACTION" là một lựa chọn, không phải chỗ ai đó quên gõ mệnh đề.
comment on column ops.audit_log.actor_id is
  'BẰNG CHỨNG — NO ACTION có chủ ý. Sổ audit mà xoá được người thao tác thì chính nó hết giá trị làm bằng chứng. Xoá tài khoản: dùng core.anonymize_user().';
comment on column care.interventions.actor_id is
  'BẰNG CHỨNG — NO ACTION có chủ ý. "Ai đã làm gì cho con tôi" là câu hỏi trường phải trả lời được nhiều năm sau.';
comment on column care.counselor_notes.author_id is
  'BẰNG CHỨNG — NO ACTION có chủ ý. Ghi chú tư vấn không có tác giả là ghi chú không ai chịu trách nhiệm.';
comment on column health.logs.recorded_by is
  'BẰNG CHỨNG — NOT NULL nên không thể SET NULL. Ai cho trẻ uống thuốc lúc mấy giờ là dữ kiện y tế, không được mất (ADR-009).';

-- ---------------------------------------------------------------------------
-- 4. Ẩn danh hoá — đường chính thức
-- ---------------------------------------------------------------------------
create or replace function core.anonymize_user(
  p_user_id uuid,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor  uuid := core.current_user_id();
  v_row    core.users;
  v_links  integer := 0;
begin
  -- FOR UPDATE: hai yêu cầu xoá đến cùng lúc (rất thật khi có cả email lẫn điện
  -- thoại) không được cùng đi qua nhánh "chưa ẩn danh" rồi cùng ghi audit hai lần.
  select * into v_row from core.users where id = p_user_id for update;

  if not found then
    raise exception 'core.anonymize_user: không có tài khoản %', p_user_id
      using errcode = 'no_data_found',
            hint    = 'Kiểm tra lại core.users.id. Đừng đoán — không có tài khoản thì không có gì để ẩn danh.';
  end if;

  -- §9 — gọi lại là no-op. Vẫn ghi audit (result='noop'): một lần thử ẩn danh lại
  -- cũng là thông tin cần thấy, im lặng thì không phân biệt được "đã làm rồi" với
  -- "lệnh không chạy tới nơi".
  if v_row.anonymized_at is not null then
    insert into ops.audit_log (actor_id, action, object_type, object_id, scope, result)
         values (v_actor, 'core.anonymize_user', 'core.users', p_user_id::text,
                 jsonb_build_object('reason', p_reason), 'noop');

    return jsonb_build_object(
      'user_id',                p_user_id,
      'already_anonymized',     true,
      'anonymized_at',          v_row.anonymized_at,
      'identity_links_removed', 0
    );
  end if;

  -- Sổ ĐĂNG NHẬP phải đi hẳn (Rev F điều 6). Giữ lại một dòng identity_links là giữ
  -- đường để lần đăng nhập SSO kế tiếp nối người cũ vào tài khoản đã ẩn danh — lúc
  -- đó việc "ẩn danh" chỉ còn là đổi tên hiển thị.
  delete from core.identity_links where user_id = p_user_id;
  get diagnostics v_links = row_count;

  -- auth_uid = NULL và status = 'disabled' làm CÙNG một việc theo hai đường độc lập:
  -- core.current_user_id() (0001) tra theo auth_uid VÀ lọc status='active', nên hỏng
  -- một trong hai cột cũng không mở lại được cửa. full_name NOT NULL nên phải có giá
  -- trị — dùng hằng số, không nhét id vào tên: id đã nằm ngay trên cùng hàng rồi.
  update core.users
     set full_name     = 'Người dùng đã ẩn danh',
         email         = null,
         auth_uid      = null,
         status        = 'disabled',
         anonymized_at = now()
   where id = p_user_id;

  insert into ops.audit_log (actor_id, action, object_type, object_id, scope, result)
       values (v_actor, 'core.anonymize_user', 'core.users', p_user_id::text,
               jsonb_build_object('reason', p_reason, 'identity_links_removed', v_links),
               'ok');

  return jsonb_build_object(
    'user_id',                p_user_id,
    'already_anonymized',     false,
    'anonymized_at',          now(),
    'identity_links_removed', v_links
  );
end;
$$;

comment on function core.anonymize_user(uuid, text) is
  'Luật 91/2025 — thi hành quyền xoá: bỏ tên/email/auth_uid + sổ đăng nhập, GIỮ mọi FK lịch sử. Idempotent (§9). Ghi ops.audit_log. KHÔNG chạm core.students (mã học sinh bất biến 12 năm — §1).';

-- ---------------------------------------------------------------------------
-- 5. Chặn xoá cứng, và chặn cho ra chặn
-- ---------------------------------------------------------------------------
create or replace function core.tg_block_user_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_audit  bigint;
  v_interv bigint;
  v_notes  bigint;
  v_health bigint;
begin
  -- Cửa thoát hiểm phải được BẬT TƯỜNG MINH trong chính phiên đó. Không phải cấu
  -- hình toàn cục: một biến trong postgresql.conf thì bật xong quên tắt, còn
  -- set_local trong transaction thì tự tắt khi commit. `authenticated` không có
  -- quyền DELETE trên core.users (0009 chỉ cấp SELECT) nên biến này không phải bề
  -- mặt tấn công của người dùng cuối — nó là phanh tay cho người vận hành.
  if coalesce(current_setting('hub.allow_user_hard_delete', true), '') <> 'on' then
    raise exception
      'Không xoá cứng core.users (id=%). Đường chính thức là ẩn danh hoá.', old.id
      using errcode = 'restrict_violation',
            hint    = 'Chạy: select core.anonymize_user(''' || old.id || '''::uuid, ''lý do''); '
                   || 'Nếu Hội đồng dữ liệu thật sự quyết định xoá cứng: set local hub.allow_user_hard_delete = ''on'';';
  end if;

  -- Cửa mở rồi vẫn phải trả lời trước: xoá người này có làm mất BẰNG CHỨNG không?
  -- Nếu không kiểm ở đây thì Postgres sẽ tự chặn bằng 23503 ở một FK ngẫu nhiên nào
  -- đó — đúng thứ "nửa vời" mà file này sinh ra để dẹp: người vận hành nhận một tên
  -- constraint và không biết còn bao nhiêu chỗ nữa đang chặn.
  select count(*) into v_audit  from ops.audit_log        where actor_id  = old.id;
  select count(*) into v_interv from care.interventions   where actor_id  = old.id;
  select count(*) into v_notes  from care.counselor_notes where author_id = old.id;
  select count(*) into v_health from health.logs          where recorded_by = old.id;

  if (v_audit + v_interv + v_notes + v_health) > 0 then
    raise exception
      'Không xoá cứng core.users (id=%): còn bằng chứng — audit %, can thiệp %, ghi chú tư vấn %, y tế %.',
      old.id, v_audit, v_interv, v_notes, v_health
      using errcode = 'restrict_violation',
            hint    = 'Bằng chứng phải giữ được người thao tác. Dùng core.anonymize_user() thay vì xoá dòng.';
  end if;

  return old;
end;
$$;

comment on function core.tg_block_user_hard_delete() is
  'Chặn DELETE trên core.users bằng thông điệp tiếng Việt chỉ đúng đường thay thế. Mở phanh: set local hub.allow_user_hard_delete = ''on'' — vẫn không xoá được người còn bằng chứng.';

drop trigger if exists users_block_hard_delete on core.users;
create trigger users_block_hard_delete
  before delete on core.users
  for each row
  execute function core.tg_block_user_hard_delete();

-- ---------------------------------------------------------------------------
-- 6. Quyền: hàm ẩn danh KHÔNG được để mặc định PUBLIC
-- ---------------------------------------------------------------------------
-- Postgres cấp EXECUTE cho PUBLIC với mọi hàm mới, và hàm này là SECURITY DEFINER
-- ghi đè core.users. Để nguyên mặc định thì một tài khoản học sinh gọi được
-- core.anonymize_user('<uuid hiệu trưởng>') và khoá tài khoản người khác. Cùng loại
-- lỗi mà 0031 đã bịt cho job xoá dữ liệu cảm xúc.
revoke execute on function core.anonymize_user(uuid, text) from public;
-- core.tg_block_user_hard_delete() trả `trigger` nên không gọi trực tiếp bằng SQL được.

commit;
