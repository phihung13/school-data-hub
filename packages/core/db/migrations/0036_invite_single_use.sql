-- 0036_invite_single_use.sql
-- Mã mời phụ huynh: từ "chứng danh sống tới ngày hết hạn" thành "dùng một lần".
--
-- ── Lỗi được vá (rà 31/07/2026) ─────────────────────────────────────────────
-- `0013:56-60` trả về đúng `auth_uid` cũ MỖI LẦN được gọi, chừng nào mã chưa hết
-- hạn, và ghi lý do là "§9 idempotent". Đọc kỹ thì đó không phải idempotent — đó
-- là một chứng danh đăng nhập dùng lại được, sống 7–30 ngày, dài đúng 6 ký tự, và
-- được gửi qua Zalo. Hệ quả thật:
--   · ai cuộn lại tin nhắn cũ trong nhóm lớp cũng đăng nhập được;
--   · ai được forward tin nhắn (họ hàng, người giúp việc, phụ huynh khác) cũng vào;
--   · phụ huynh sau ly hôn/chuyển quyền nuôi vẫn vào bằng mã cũ, không có đường cắt.
-- Và cái vào được không phải một trang chung: là báo cáo, mood, sức khoẻ của một
-- đứa trẻ cụ thể.
--
-- Idempotent (§9) nói về MUTATION: gọi hai lần không được sinh ra hai tài khoản.
-- Nó không nói "một chứng danh phải dùng lại được mãi". Hai điều đó bị gộp làm một
-- ở 0013 và đó là chỗ hỏng.
--
-- ── Quyết định (ADR-024) ────────────────────────────────────────────────────
-- Mã dùng MỘT LẦN, kèm CỬA SỔ NHẮC LẠI 15 PHÚT:
--   · Lần đổi đầu tiên  → tạo tài khoản, trả `auth_uid`.
--   · Trong 15 phút sau → trả lại đúng `auth_uid` đó (KHÔNG tạo tài khoản thứ hai).
--   · Sau 15 phút       → mã chết. Muốn thêm thiết bị/người thì GVCN cấp mã mới.
--
-- Vì sao không phải "chết ngay lập tức, không cửa sổ": lời gọi này commit ở
-- Postgres TRƯỚC khi cookie phiên về tới máy phụ huynh. Mạng 4G rớt đúng khoảnh
-- khắc đó — chuyện thường ở cổng trường lúc tan học — thì mã đã chết mà người
-- dùng chưa hề đăng nhập được, và không có đường tự sửa: phải nhắn cô giáo xin mã
-- khác. Cửa sổ 15 phút là thứ nuốt đúng ca đó (và ca bấm nút hai lần), không phải
-- một nhân nhượng về bảo mật: nó rút mặt tấn công từ 7–30 NGÀY xuống 15 PHÚT KỂ TỪ
-- LÚC CHÍNH PHỤ HUYNH VỪA ĐĂNG NHẬP. Một tin nhắn được forward và mở ra sau đó thì
-- mã trong tay đã là mã chết.
--
-- Con số 15 phút không tự nghĩ ra: `DEBT.md` #28 đã ghi sẵn hướng xử lý này
-- ("sau lần redeem đầu chỉ nhận lại trong 15 phút, đủ cho retry §9, rồi khoá hẳn")
-- và nó trùng với `INVITE_CODE_LOCK_MS` của invite-guard.ts — cùng một đơn vị thời
-- gian cho mọi thứ liên quan tới cửa mã mời, đỡ phải nhớ hai con số.
--
-- Cửa sổ KHÔNG được gia hạn: mỗi lần nhận lại chỉ tăng `redeemed_count`, không
-- đụng `redeemed_at`. Gia hạn theo lần dùng cuối là dựng lại đúng cái chứng danh
-- sống mãi mà file này đang xoá.
--
-- ── Kèm theo, cùng một cửa ───────────────────────────────────────────────────
-- 1. `revoked_at`/`revoked_by` — đường THU HỒI. Trước đó gửi nhầm mã vào nhóm chat
--    là không có cách nào rút lại (`DEBT.md` #28, ghi chú đầu invite-guard.ts).
-- 2. `full_name` — tên phụ huynh do GVCN nhập lúc phát mã. `0013:65` viết chết
--    chuỗi 'Phụ huynh' nên MỌI phụ huynh thật trong hệ đều tên là "Phụ huynh":
--    cô giáo nhìn danh sách người nhận báo cáo không phân biệt được ai với ai.
--    NULL vẫn chạy được (rơi về 'Phụ huynh') — cột này không chặn luồng cũ.
-- 3. `redeemed_count` — đếm số lượt nhận lại trong cửa sổ. Không phải số liệu cho
--    vui: >1 nghĩa là mã đó được trình nhiều lần, thứ đáng nhìn khi hậu kiểm.
--
-- ── Cách phía app phân biệt lý do từ chối ────────────────────────────────────
-- Hàm ném lỗi với SQLSTATE + DETAIL cố định để route đọc bằng MÁY, không phải bằng
-- cách so chuỗi tiếng Việt:
--   P0002 (no_data_found của PL/pgSQL)           — mã không tồn tại [giữ nguyên 0013]
--   22000 (data_exception)                       — hết hạn         [giữ nguyên 0013]
--   28000 (invalid_authorization_specification)  — mã đã chết; DETAIL cho biết
--                                                  'already_redeemed' hay 'revoked'
-- Người dùng cuối vẫn chỉ thấy MỘT thông điệp (xem `deny()` ở route): phân biệt ra
-- ngoài là tặng người dò biết "mã này có tồn tại". Phân biệt chỉ đi vào audit/log.
--
-- Phụ thuộc: 0013 (bảng + hàm), 0033 (chính sách ON DELETE cho cột trỏ người).

begin;

-- ---------------------------------------------------------------------------
-- 1. Ba cột mới
-- ---------------------------------------------------------------------------
alter table core.parent_invite_codes
  add column if not exists redeemed_count int not null default 0,
  add column if not exists revoked_at     timestamptz,
  add column if not exists revoked_by     uuid references core.users(id) on delete set null,
  add column if not exists full_name      text;

-- Tên rỗng/toàn khoảng trắng còn tệ hơn NULL: NULL thì hàm biết đường rơi về mặc
-- định, còn '   ' thì thành một dòng tên trống trên màn hình cô giáo.
alter table core.parent_invite_codes
  drop constraint if exists parent_invite_codes_full_name_chk,
  add  constraint parent_invite_codes_full_name_chk
       check (full_name is null or length(btrim(full_name)) between 1 and 120);

-- CỐ Ý KHÔNG thêm ràng buộc "redeemed_by và redeemed_at cùng NULL hoặc cùng có":
-- `0033` đặt `redeemed_by ... on delete set null` (ADR-021, cột trỏ người thao tác),
-- nên trạng thái "đã dùng nhưng người dùng đã bị xoá" là hợp lệ và sẽ xuất hiện
-- thật. Ràng buộc cặp sẽ biến một lần xoá tài khoản thành lỗi Postgres khó hiểu.
-- Mốc quyết định vòng đời mã là `redeemed_at` — hàm dưới đây rẽ nhánh theo đúng
-- cột đó, và ca "redeemed_at có, redeemed_by mất" được xử lý tường minh là mã chết.

comment on column core.parent_invite_codes.redeemed_count is
  'Số lượt đổi mã thành công (kể cả lượt nhận lại trong cửa sổ 15 phút). >1 = mã được trình nhiều lần — đáng xem khi hậu kiểm.';
comment on column core.parent_invite_codes.revoked_at is
  'Thu hồi mã: đặt mốc này là mã chết ngay, kể cả khi chưa hết hạn và chưa ai dùng (ADR-024). Dùng khi gửi nhầm mã vào nhóm chat.';
comment on column core.parent_invite_codes.revoked_by is
  'Ai thu hồi. ON DELETE SET NULL theo ADR-021 — cột trỏ NGƯỜI THAO TÁC, không phải bằng chứng.';
comment on column core.parent_invite_codes.full_name is
  'Tên phụ huynh do GVCN nhập lúc phát mã, dùng làm core.users.full_name khi đổi mã. NULL thì rơi về ''Phụ huynh'' như trước.';

-- ---------------------------------------------------------------------------
-- 2. Hàm đổi mã — dùng một lần + cửa sổ nhắc lại
-- ---------------------------------------------------------------------------
create or replace function core.redeem_parent_invite_code(p_code text)
returns uuid  -- auth_uid để phía app mint session (packages/core/auth-adapter)
language plpgsql
security definer
set search_path = core, pg_temp
as $$
declare
  -- Cửa sổ nhắc lại. Đây KHÔNG phải "ngưỡng cảnh báo" của §7 (những thứ đó nằm ở
  -- care.thresholds); đây là một hằng số vòng đời chứng danh, đổi nó là đổi quyết
  -- định ADR-024 chứ không phải chỉnh cấu hình vận hành — nên để trong mã, cạnh
  -- phần giải thích vì sao có nó.
  c_grace     constant interval := interval '15 minutes';
  v_row       core.parent_invite_codes%rowtype;
  v_user_id   uuid;
  v_parent_id uuid;
  v_auth_uid  uuid;
begin
  select * into v_row from core.parent_invite_codes
   where code = upper(p_code) for update;

  if not found then
    raise exception 'Mã mời không tồn tại' using errcode = 'no_data_found';
  end if;

  -- Thu hồi thắng mọi thứ khác: đó là một người đã cố ý bấm "rút lại mã này".
  if v_row.revoked_at is not null then
    raise exception 'Mã mời đã bị thu hồi'
      using errcode = '28000', detail = 'revoked';
  end if;

  if v_row.expires_at < now() then
    raise exception 'Mã mời đã hết hạn'
      using errcode = 'data_exception', detail = 'expired';
  end if;

  if v_row.redeemed_at is not null then
    -- Ngoài cửa sổ: mã chết. Đây là nhánh vá lỗ hổng của 0013.
    if now() - v_row.redeemed_at > c_grace then
      raise exception 'Mã mời đã được dùng'
        using errcode = '28000', detail = 'already_redeemed';
    end if;

    select auth_uid into v_auth_uid from core.users where id = v_row.redeemed_by;
    -- Tài khoản đã bị ẩn danh hoá (0033 xoá auth_uid) hoặc FK đã set null: không
    -- còn ai để trả về. Trả NULL ra ngoài thì phía app ném một lỗi mù mờ — nói
    -- thẳng đây là mã chết.
    if v_auth_uid is null then
      raise exception 'Mã mời đã được dùng'
        using errcode = '28000', detail = 'already_redeemed';
    end if;

    -- Đếm lượt nhận lại. KHÔNG đụng redeemed_at: cửa sổ không được gia hạn.
    update core.parent_invite_codes
       set redeemed_count = redeemed_count + 1
     where code = v_row.code;

    return v_auth_uid;
  end if;

  v_auth_uid := gen_random_uuid(); -- DEV ONLY — thay bằng auth_uid thật khi nối Zalo OAuth

  insert into core.users (auth_uid, full_name, status)
       values (v_auth_uid,
               coalesce(nullif(btrim(v_row.full_name), ''), 'Phụ huynh'),
               'active')
    returning id into v_user_id;

  insert into core.parents (user_id) values (v_user_id) returning id into v_parent_id;

  insert into core.parent_students (parent_id, student_id, relation)
       values (v_parent_id, v_row.student_id, v_row.relation);

  insert into core.user_role_scopes (user_id, role_code) values (v_user_id, 'guardian');

  update core.parent_invite_codes
     set redeemed_by = v_user_id, redeemed_at = now(), redeemed_count = 1
   where code = v_row.code;

  return v_auth_uid;
end;
$$;

comment on function core.redeem_parent_invite_code(text) is
  'ADR-024 — mã mời DÙNG MỘT LẦN: lần đầu tạo tài khoản phụ huynh, trong 15 phút sau trả lại đúng auth_uid đó (retry mạng/bấm hai lần, §9), sau đó mã chết. Từ chối bằng SQLSTATE: P0002 không tồn tại · 22000 hết hạn · 28000 mã chết (DETAIL = already_redeemed | revoked). DEV: sinh auth_uid giả — xem 0013 khi nối Zalo OAuth thật.';

comment on table core.parent_invite_codes is
  'Mã mời 6 ký tự cho đăng nhập phụ huynh, DÙNG MỘT LẦN (ADR-024, hàm redeem_parent_invite_code). RLS deny-by-default, giống core.id_mappings — chỉ hàm SECURITY DEFINER chạm. Thu hồi bằng revoked_at.';

-- Quyền giữ nguyên 0013 (`anon` execute) — chữ ký hàm không đổi nên GRANT cũ còn
-- nguyên hiệu lực; ghi lại ở đây để lần sau không ai phải đi tìm.

commit;
