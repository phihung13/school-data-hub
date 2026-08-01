-- 0050_so_ghi_migration.sql
-- migrate:so-ghi   ← DẤU HIỆU MÁY ĐỌC. `tools/migrate/migrate.mjs` tìm đúng chuỗi này
--                    để biết file nào dựng sổ ghi, rồi chạy nó TRƯỚC mọi file khác khi
--                    sổ chưa tồn tại. Xoá dòng này là bộ chạy mất đường mồi.
--
-- Sổ ghi migration đã chạy — thi hành nợ `DEBT.md` #23.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁI ĐANG THIẾU, và vì sao nó nguy hiểm đúng vào ngày lên máy chủ thật
-- ═══════════════════════════════════════════════════════════════════════════
-- Hôm nay kho có 48 migration và KHÔNG có sổ nào ghi lại cái nào đã chạy ở đâu.
-- Công cụ duy nhất là một vòng lặp trong `tools/run-db-tests.sh`:
--
--     for f in "$MIG"/*.sql; do psql -f "$f"; done
--
-- Vòng lặp đó đúng cho một database DỰNG LẠI TỪ ĐẦU và chỉ cho ca đó. Trên một
-- database đã sống, nó chạy lại cả 48 file — và "chạy lại" ở đây không phải điều
-- vô hại: `0045` có `create table if not exists` (không sao), nhưng `0031` có
-- `attendance.purge_old_emotion_details()` và `0009` có `revoke`/`grant` hàng loạt;
-- chạy lại một file mà nội dung ĐÃ ĐỔI kể từ lần chạy trước thì thứ chạy ra không
-- phải cái ai đó đã duyệt.
--
-- Ba câu hỏi không ai trả lời được nếu không có bảng này:
--   1. Máy chủ thật đang ở migration số mấy?
--   2. File `0031` trên đĩa hôm nay có còn đúng cái đã áp lên máy chủ tháng trước?
--   3. Ai áp, lúc nào, mất bao lâu?
--
-- Câu 2 là câu im lặng nhất. Một dòng bị sửa trong migration ĐÃ ÁP không gây lỗi
-- nào cả: file mới không được chạy lại (đã có trong sổ), nên máy chủ giữ hành vi
-- cũ trong khi kho mô tả hành vi mới. Cột `checksum` sinh ra chỉ để bắt đúng ca đó.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- BƯỚC "NHẬN NỢ BAN ĐẦU" — chỗ dễ làm sai nhất của cả gói
-- ═══════════════════════════════════════════════════════════════════════════
-- Sự thật phải sống chung: 48 migration ĐÃ được áp bằng tay lên `hub_dev` TRƯỚC
-- khi có sổ. Nếu bộ chạy mở sổ ra thấy trống rồi kết luận "chưa áp gì", lần chạy
-- đầu tiên sẽ áp lại 48 file lên một database đã có sẵn mọi thứ.
--
-- Nên sổ có cột `nhan_no`: dòng ghi bằng lệnh `baseline` mang `nhan_no = true`,
-- nghĩa là "file này ĐÃ ở trong database rồi, sổ chỉ đang nhận nợ chứ chưa từng
-- chạy nó". Ràng buộc `schema_migrations_nhan_no_chk` bên dưới cưỡng chế điều đó
-- ở tầng dữ liệu: dòng nhận nợ KHÔNG được mang `duration_ms`, dòng chạy thật BẮT
-- BUỘC phải có. Không có ràng buộc này thì một dòng nhận nợ trông y hệt một dòng
-- đã chạy, và sổ mất đúng thứ nó sinh ra để giữ: sự phân biệt giữa "tôi đã chạy
-- cái này" và "tôi tin rằng cái này đã có sẵn".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VÌ SAO `create ... if not exists` VÀ `create schema if not exists ops`
-- ═══════════════════════════════════════════════════════════════════════════
-- File này là file DUY NHẤT trong kho được chạy KHÔNG THEO THỨ TỰ: khi sổ chưa
-- tồn tại, `tools/migrate/migrate.mjs` chạy nó trước tiên (kể cả trên một database
-- rỗng, tức trước cả `0001`) rồi mới áp 0001…0049. Không làm vậy thì bộ chạy không
-- có chỗ ghi dòng đầu tiên, và mọi thứ nó làm trước khi tới `0050` là làm mù.
--
-- Hai hệ quả bắt buộc, và cả hai đều ở ngay dưới đây:
--   · `create schema if not exists ops` — trên database rỗng thì `0001` chưa chạy.
--     `0001` cũng dùng `if not exists` nên chạy sau vẫn im lặng, không xung đột.
--   · GRANT cho `backup_reader` phải BỌC trong kiểm tra vai tồn tại — vai đó do
--     `0001` tạo. Grant trần ở đây thì lần mồi trên database rỗng chết ngay dòng
--     đầu, và chết vì một lý do chẳng liên quan gì tới sổ ghi.
--
-- Phụ thuộc: không có. Cố ý — file mồi mà phụ thuộc file khác thì hết là file mồi.

begin;

create schema if not exists ops;

create table if not exists ops.schema_migrations (
  version      text primary key,
  filename     text not null,
  checksum     text not null,
  applied_at   timestamptz not null default now(),
  applied_by   text not null default current_user,
  duration_ms  integer,
  nhan_no      boolean not null default false,
  ghi_chu      text,
  -- Số thứ tự bốn chữ số, đúng quy ước tên file của kho. Chặn ca một công cụ khác
  -- nhét vào đây khoá kiểu 'latest' hay '2026-08-02' rồi thứ tự áp thành thứ tự
  -- chuỗi ngẫu nhiên.
  constraint schema_migrations_version_chk  check (version ~ '^[0-9]{4}$'),
  -- sha256 hex, 64 ký tự thường. Ràng buộc này bắt ca ghi nhầm tên file vào ô băm.
  constraint schema_migrations_checksum_chk check (checksum ~ '^[0-9a-f]{64}$'),
  -- Xem mục "NHẬN NỢ BAN ĐẦU": dòng nhận nợ không có thời gian chạy vì nó chưa
  -- từng chạy; dòng chạy thật luôn có. Đây là thứ giữ hai loại dòng không lẫn nhau.
  constraint schema_migrations_nhan_no_chk  check (
    (nhan_no and duration_ms is null) or (not nhan_no and duration_ms is not null)
  )
);

comment on table ops.schema_migrations is
  'Sổ ghi migration đã áp (DEBT #23). Một dòng = một file đã có mặt trong database này. Bộ chạy: tools/migrate/migrate.mjs. Bảng này KHÔNG cấp cho authenticated — nó là sổ vận hành, không phải dữ liệu nghiệp vụ.';
comment on column ops.schema_migrations.version is
  'Bốn chữ số đầu tên file (0001…). Khoá chính: hai file cùng số là lỗi cấu hình kho, bộ chạy từ chối trước khi chạm database.';
comment on column ops.schema_migrations.filename is
  'Tên file lúc áp. Đổi tên file sau khi áp KHÔNG làm bộ chạy áp lại (khoá là version), nhưng cột này giữ lại tên cũ để đối chiếu — đổi tên là thứ hay xảy ra và hay bị quên.';
comment on column ops.schema_migrations.checksum is
  'sha256 hex NGUYÊN VĂN BYTE của file lúc áp. Đây là cột quan trọng nhất của bảng: sửa một ký tự trong migration ĐÃ ÁP không gây lỗi nào cả — file không được chạy lại nên máy chủ giữ hành vi cũ trong khi kho mô tả hành vi mới. Bộ chạy so cột này mỗi lần và TỪ CHỐI chạy khi lệch.';
comment on column ops.schema_migrations.duration_ms is
  'Thời gian áp thật, mili-giây. NULL ở dòng nhận nợ ban đầu (nhan_no = true) vì dòng đó chưa từng chạy — ràng buộc schema_migrations_nhan_no_chk cưỡng chế.';
comment on column ops.schema_migrations.nhan_no is
  'true = NHẬN NỢ BAN ĐẦU: file đã nằm sẵn trong database từ trước khi có sổ (48 migration của hub_dev, áp bằng tay), sổ chỉ đang ghi nhận chứ chưa từng chạy nó. false = bộ chạy thật sự đã chạy file này. Trộn hai loại vào một là mất đúng thứ sổ sinh ra để giữ.';
comment on column ops.schema_migrations.ghi_chu is
  'Ghi chú tự do của người vận hành — lý do nhận nợ, số phiếu sự cố, v.v. Bộ chạy không đọc cột này.';

-- Tra "database đang ở đâu" theo thứ tự thời gian là câu hỏi của người trực lúc 2 giờ
-- sáng, không phải câu hỏi của báo cáo. Index nhỏ, và nó đúng cho cả hai chiều đọc.
create index if not exists schema_migrations_applied_idx
  on ops.schema_migrations (applied_at desc);

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------
-- KHÔNG cấp cho `authenticated`: sổ vận hành không phải dữ liệu nghiệp vụ, và
-- schema `ops` vốn không nằm trong câu `grant select on all tables …` của `0009`.
-- Ghi ra đây để lần sau không ai "cấp cho đủ bộ".
revoke all on ops.schema_migrations from public;

-- `backup_reader`: ADR-006 đòi bản sao lưu ĐỦ. Một bản khôi phục mà không mang
-- theo sổ ghi là một database không ai biết đang ở migration số mấy — đúng tình
-- cảnh mà cả file này sinh ra để chấm dứt.
--
-- Bọc trong kiểm tra vai tồn tại vì file này chạy được TRƯỚC `0001` (xem đầu file).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    grant usage on schema ops to backup_reader;
    grant select on ops.schema_migrations to backup_reader;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Khai ngoại lệ RLS — cổng `ops.v_rls_gaps` (0024) bắt được bảng này ngay lần đầu
-- ---------------------------------------------------------------------------
-- Đây là một cổng ĐÃ BẮT ĐƯỢC THẬT, không phải thủ tục giấy tờ: bản nháp đầu của
-- file này không có đoạn dưới, và `0024_rls_gaps_test.sql` đỏ ngay ở assertion 14
-- ("ops.v_rls_gaps rỗng") trên database dựng lại từ đầu. Chép lại ở đây vì đó đúng
-- là bằng chứng cổng còn sống.
--
-- Chọn KHAI NGOẠI LỆ chứ không `enable row level security`, và lý do quan trọng:
-- bật RLS mà không policy sẽ chặn luôn `backup_reader` — vai đó không phải chủ bảng
-- nên nó nhận 0 DÒNG, im lặng, và bản sao lưu mất đúng cuốn sổ nói database đang ở
-- đâu. Đường của `ops.audit_log` / `heartbeats` / `outbox_messages` (0024) mới đúng
-- cho bảng nhật ký máy: không RLS, không GRANT cho `authenticated`, khai tường minh.
--
-- Bọc trong kiểm tra bảng tồn tại vì file này chạy được TRƯỚC `0024` (xem đầu file).
-- Khi đó câu này bị bỏ qua, và `tools/migrate/migrate.mjs` chạy lại file mồi ở cuối
-- lượt `up` để đóng nốt — hai đường dựng database phải cho cùng một kết quả.
do $$
begin
  if to_regclass('ops.rls_exemptions') is not null then
    insert into ops.rls_exemptions (schema_name, table_name, reason, allow_authenticated_read)
    values ('ops', 'schema_migrations',
            'Sổ ghi migration — nhật ký máy, không GRANT cho authenticated; backup_reader đọc được (ADR-006) nên KHÔNG bật RLS-không-policy: vai đó sẽ nhận 0 dòng trong im lặng',
            false)
    on conflict (schema_name, table_name) do update
       set reason = excluded.reason,
           allow_authenticated_read = excluded.allow_authenticated_read;
  end if;
end $$;

commit;
