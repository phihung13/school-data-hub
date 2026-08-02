-- pgTAP — KÊNH BÁO ĐỘNG: bốn sự thật khác nhau không được gộp thành một (0051)
-- Chạy: psql "$DATABASE_URL" -f packages/core/db/tests/0051_kenh_bao_dong_test.sql
--
-- Bài này khoá lại nợ #40, đo 01–02/08/2026 trên hub_dev:
--   select count(*) from ops.outbox_messages;                       →  0
--   grep -rn "outbox" apps/ tools/ packages/core/src                →  0 hit
-- Bảng hàng đợi có bộ GHI (0039) mà chưa có bộ GỬI. Không đường nào tới một con người.
--
-- Phần lớn assertion dưới đây KHÔNG kiểm "gửi có chạy không" — việc đó cần một tiến
-- trình Node và nằm ở tests/db/kenh-bao-dong.test.ts. Ở đây kiểm đúng một câu, câu
-- khó nhất của cả gói:
--
--     HỆ CÓ PHÂN BIỆT ĐƯỢC "CHƯA GỬI" · "ĐÃ GỬI" · "GỬI HỎNG" · "KHÔNG CÓ KÊNH" KHÔNG,
--     VÀ CÓ CHẶN ĐƯỢC VIỆC BỊA RA "ĐÃ GỬI" KHÔNG?
--
-- Gộp bốn thứ đó vào một cờ boolean là dựng sẵn một lời nói dối, và cái nguy hiểm
-- nhất là để "không có kênh nào" đọc thành "đã gửi": lúc đó màn hình khẳng định đã
-- báo cho một tin chưa từng rời khỏi database.

begin;
select plan(39);
select test_support.seed_basic();

-- ═══ 1. BỐN TRẠNG THÁI TỒN TẠI THẬT, VÀ KHÔNG BỊA ĐƯỢC ════════════════════
select has_column('ops', 'outbox_messages', 'status',
  'ops.outbox_messages có cột status — trước 0051 chỉ có sent_at, và một cột NULL/không-NULL gộp bốn sự thật khác hẳn nhau');

select col_not_null('ops', 'outbox_messages', 'status',
  'status không bao giờ NULL — một tin không có trạng thái là một tin không ai biết phải làm gì');

-- Ràng buộc trung tâm của cả migration. Không có nó thì "đã gửi" chỉ là một chuỗi
-- ký tự ai cũng ghi được, và ngày nào đó sẽ có người ghi.
select throws_ok(
  $$ insert into ops.outbox_messages (channel, dedup_key, payload, status)
     values ('nguoi_truc', 'noi_doi_1', '{}', 'da_gui') $$,
  '23514',
  null,
  'KHÔNG ghi được da_gui mà sent_at rỗng — "đã gửi" phải kèm bằng chứng, không phải một nhãn dán');

select throws_ok(
  $$ insert into ops.outbox_messages (channel, dedup_key, payload, status, sent_at)
     values ('nguoi_truc', 'noi_doi_2', '{}', 'khong_co_kenh', now()) $$,
  '23514',
  null,
  'KHÔNG ghi được khong_co_kenh mà lại có sent_at — đây đúng là chỗ "không có đường nào để gửi" bị đọc thành "đã báo rồi"');

select throws_ok(
  $$ insert into ops.outbox_messages (channel, dedup_key, payload, status)
     values ('nguoi_truc', 'noi_doi_3', '{}', 'chac_la_gui_roi') $$,
  '23514',
  null,
  'Trạng thái lạ bị chặn — bộ trạng thái là một danh sách đóng, không phải một ô chữ tự do');

-- ═══ 2. SỔ KHAI KÊNH ══════════════════════════════════════════════════════
select has_table('ops', 'alert_channels',
  'ops.alert_channels tồn tại — có giao diện gửi thì ngày có Zalo OA mới chỉ phải THÊM, không phải viết lại');

select isnt_empty(
  $$ select 1 from ops.alert_channels where channel_id = 'tep_nhat_ky' and enabled $$,
  'Kênh tep_nhat_ky đã khai và đang bật — kênh DUY NHẤT hôm nay có adapter thật (tools/alert/kenh/tep-nhat-ky.mjs)');

-- Bài học 0011/0041 chép nguyên: chỉ khai kênh đã có bộ gửi. Khai zalo_oa/smtp hôm
-- nay là tự chế một hàng tin chết sáng vĩnh viễn ngay ngày đầu.
select is(
  (select count(*)::int from ops.alert_channels),
  1,
  'ĐÚNG MỘT kênh được khai — khai kênh chưa có adapter là tự chế một hàng tin chết (bài học 0011/0041)');

select is(
  (select count(*)::int from ops.kenh_cho('nguoi_truc')),
  1,
  'ops.kenh_cho(nguoi_truc) trả về kênh tệp nhật ký — người trực có đúng một đường tới');

select is(
  (select count(*)::int from ops.kenh_cho('care_team')),
  0,
  'ops.kenh_cho(care_team) RỖNG — hôm nay thật sự chưa có đường nào tới care team, và nói thật thì tốt hơn nhét vào tệp của người trực');

select ok(
  ops.co_kenh_khai_bao('nguoi_truc'),
  'nguoi_truc ĐÃ có kênh khai — nên kênh bị tắt là chuyện phải kêu');

select ok(
  not ops.co_kenh_khai_bao('care_team'),
  'care_team CHƯA từng có kênh nào — nợ hạ tầng có tên (DEBT.md #40), không được biến thành đèn sáng vĩnh viễn');

-- ═══ 3. §9 — GỬI HAI LẦN KHÔNG GỬI ĐÔI ════════════════════════════════════
select has_table('ops', 'alert_deliveries',
  'ops.alert_deliveries tồn tại — lý do hỏng thuộc về TỪNG kênh, nhét chung vào last_error là mất câu "Zalo hỏng nhưng tệp vẫn ghi được"');

insert into ops.outbox_messages (id, channel, dedup_key, payload)
     values (900001, 'nguoi_truc', 'thu_s9', '{"tieu_de":"tin thử §9"}');

-- claim phải NHẶT ĐƯỢC tin mới. Nghe hiển nhiên, nhưng đây đúng là chỗ một bộ gửi
-- chết lặng: mệnh đề lọc sai một chữ thì hàng đợi đầy tin mà lượt nào cũng nhặt được
-- 0 dòng, chạy xong báo "xong, không có gì" — im lặng bị đọc thành tin tốt, lần nữa.
select isnt_empty(
  $$ select 1 from ops.claim_bao_dong(50) where dedup_key = 'thu_s9' $$,
  'ops.claim_bao_dong NHẶT ĐƯỢC tin mới — lọc sai một chữ là bộ gửi chạy xong báo "không có gì" trong khi hàng đợi đầy');

select ok(
  ops.ghi_ket_qua_gui(900001, 'tep_nhat_ky', true, 'lần đầu'),
  'Lần ghi thành công ĐẦU TIÊN được nhận');

-- Đây là §9 ở tầng database: không phải một lời hứa trong mã Node, mà một chỉ mục.
select ok(
  not ops.ghi_ket_qua_gui(900001, 'tep_nhat_ky', true, 'lần hai'),
  'Lần ghi thành công THỨ HAI bị từ chối (trả false) — chạy bộ gửi hai lần không gửi đôi được vì database không cho');

select is(
  (select count(*)::int from ops.alert_deliveries
    where message_id = 900001 and channel_id = 'tep_nhat_ky' and status = 'da_gui'),
  1,
  'Vẫn đúng MỘT bản ghi gửi thành công sau hai lần gọi (§9)');

select ok(
  ops.da_gui_qua(900001, 'tep_nhat_ky'),
  'ops.da_gui_qua trả true — lớp hỏi-trước, để lượt gửi thứ hai không ghi thêm một dòng chữ trùng vào tệp nhật ký');

select ok(
  not ops.da_gui_qua(900001, 'kenh_khong_ton_tai'),
  'ops.da_gui_qua trả false cho kênh chưa gửi — không đoán bừa thành đã gửi');

-- Bản ghi HỎNG thì được phép nhiều lần: mỗi lượt thử là một sự kiện có thật.
select ok(
  ops.ghi_ket_qua_gui(900001, 'tep_nhat_ky', false, 'hỏng lần 1'),
  'Ghi được nhiều lần HỎNG cho cùng (tin, kênh) — mỗi lượt thử là một sự kiện thật, chỉ THÀNH CÔNG mới bị chặn trùng');

-- ═══ 4. BỐN NGẢ CỦA ops.ket_thuc_gui ══════════════════════════════════════
insert into ops.outbox_messages (id, channel, dedup_key, payload) values
  (900002, 'nguoi_truc', 'thu_khong_kenh', '{}'),
  (900003, 'nguoi_truc', 'thu_hong',       '{}'),
  (900004, 'nguoi_truc', 'thu_thanh_cong', '{}');

select is(
  ops.ket_thuc_gui(900002, 0, 0, null),
  'khong_co_kenh',
  'Không kênh nào ⇒ khong_co_kenh, KHÔNG phải da_gui — đây là dòng phòng thủ cuối trước lời nói dối nguy hiểm nhất');

select ok(
  (select sent_at is null from ops.outbox_messages where id = 900002),
  'Tin khong_co_kenh vẫn có sent_at rỗng — không có bằng chứng gửi thì không được sinh ra bằng chứng giả');

select is(
  (select attempts from ops.outbox_messages where id = 900002),
  0::smallint,
  'khong_co_kenh KHÔNG đốt lượt thử — đốt lượt là sau 5 lượt tin mang lý do SAI ("thử 5 lần đều hỏng") trong khi chưa ai từng thử');

select is(
  ops.ket_thuc_gui(900003, 1, 0, 'kênh chết'),
  'gui_hong',
  'Có kênh mà không gửi được ⇒ gui_hong, còn lượt thử lại');

select is(
  (select last_error from ops.outbox_messages where id = 900003),
  'kênh chết',
  'gui_hong ghi LÝ DO nguyên văn — "hỏng" mà không nói vì sao thì người trực không sửa được gì');

select ok(
  (select next_attempt_at > now() from ops.outbox_messages where id = 900003),
  'Lần thử kế tiếp bị đẩy về tương lai — kênh ngoài đang chết thì thử mỗi phút không làm nó sống lại');

-- Hết lượt: máy bỏ cuộc, và phải NÓI RA là mình bỏ cuộc.
do $$
begin
  for i in 1..4 loop
    perform ops.ket_thuc_gui(900003, 1, 0, 'kênh chết');
  end loop;
end $$;

select is(
  (select status from ops.outbox_messages where id = 900003),
  'het_luot',
  'Hết lượt thử ⇒ het_luot — máy bỏ cuộc phải là một trạng thái NÓI RA, không phải một dòng nằm im mãi mãi');

select isnt_empty(
  $$ select 1 from ops.v_bao_dong_ton where id = 900003 $$,
  'Tin het_luot HIỆN RA ở ops.v_bao_dong_ton — một hàng đợi đầy tin chết mà không ai biết còn tệ hơn không có hàng đợi');

select is(
  ops.ket_thuc_gui(900004, 1, 1, null),
  'da_gui',
  'Gửi được ít nhất một kênh ⇒ da_gui — một tin tới được một con người là một tin đã tới');

select ok(
  (select sent_at is not null from ops.outbox_messages where id = 900004),
  'da_gui đi kèm sent_at — ràng buộc CHECK không cho tách rời hai thứ này');

-- §9 lần nữa, ở tầng tin: một lượt gửi muộn không được lật ngược kết luận cũ.
select is(
  ops.ket_thuc_gui(900004, 0, 0, 'gọi lại sau khi đã gửi'),
  'da_gui',
  'Gọi lại ket_thuc_gui trên tin ĐÃ gửi là no-op — lượt sau không hạ một tin đã tới người xuống khong_co_kenh (§9)');

-- ═══ 5. SỔ TRỰC NÓI TIẾNG NGƯỜI ═══════════════════════════════════════════
-- Người trực là giáo viên hoặc nhân viên văn phòng, không phải dev. Bắt họ tra mã
-- trạng thái lúc 7 giờ sáng là bắt họ bỏ qua.
select isnt_empty(
  $$ select 1 from ops.v_bao_dong
      where id = 900002 and noi_bang_tieng_viet like 'KHÔNG CÓ KÊNH NÀO%' $$,
  'ops.v_bao_dong nói thẳng "KHÔNG CÓ KÊNH NÀO ĐỂ GỬI" bằng tiếng Việt, không bắt người trực tra mã');

-- Ranh giới đèn, chép nguyên từ 0043: nợ ĐÃ CÓ TÊN không được thành đèn vàng sáng
-- vĩnh viễn. `care_team` chưa từng có kênh nào được khai — đó là "chưa mua hạ tầng"
-- (DEBT.md #40), không phải sự cố đêm nay.
insert into ops.outbox_messages (id, channel, dedup_key, payload)
     values (900005, 'care_team', 'thu_care_team', '{}');
do $$ begin perform ops.ket_thuc_gui(900005, 0, 0, null); end $$;

select isnt_empty(
  $$ select 1 from ops.v_bao_dong_ton where id = 900002 $$,
  'Tin khong_co_kenh gửi cho nguoi_truc CÓ mắc kẹt — nguoi_truc đã khai kênh, nên "không có kênh" ở đây nghĩa là có người vừa TẮT một đường báo động');

select is_empty(
  $$ select 1 from ops.v_bao_dong_ton where id = 900005 $$,
  'Tin khong_co_kenh gửi cho care_team KHÔNG mắc kẹt — care_team chưa từng có kênh nào, đó là nợ có tên chứ không phải sự cố (ranh giới 0011/0043)');

-- ═══ 6. SỨC KHOẺ KÊNH ≠ SỨC KHOẺ TIN ══════════════════════════════════════
-- Lỗ hổng tìm ra bằng thử ngược 02/08/2026: tin gửi được qua kênh A vẫn là da_gui
-- dù kênh B hỏng, và tin đã da_gui thì không bao giờ được thử lại — kênh B chết
-- trong im lặng nếu chỉ nhìn trạng thái của tin.
select has_view('ops', 'v_suc_khoe_kenh',
  'ops.v_suc_khoe_kenh tồn tại — trạng thái của TIN không nói lên trạng thái của KÊNH');

select is(
  (select needs_attention from ops.v_suc_khoe_kenh where channel_id = 'tep_nhat_ky'),
  false,
  'Kênh đã gửi được sau lượt hỏng thì KHÔNG kêu — hỏng một lượt rồi tự khỏi không đánh thức ai (luật 0011)');

-- ═══ 7. JOB ĐÃ CẮM VÀO BỘ LỊCH ════════════════════════════════════════════
select isnt_empty(
  $$ select 1 from ops.job_schedule
      where job_name = 'kenh_bao_dong' and runner = 'run-bao-dong.mjs' and enabled $$,
  'Job kenh_bao_dong đã khai và trỏ đúng bộ chạy đã tồn tại — luật 0041: khai job trước khi có bộ chạy là tự bật cảnh báo giả vĩnh viễn');

-- ═══ 8. AI KHÔNG ĐƯỢC BỊA RA "ĐÃ GỬI" ═════════════════════════════════════
select test_support.login_as('90000000-0000-0000-0000-000000000001');  -- cô Lan, GVCN 6A1

select throws_ok(
  $$ select ops.ket_thuc_gui(900002, 1, 1, null) $$,
  '42501',
  null,
  'Người dùng KHÔNG gọi được ket_thuc_gui — xoá được đúng cái báo động đang nói về mình là lỗ hổng, không phải tiện ích');

select throws_ok(
  $$ select ops.sinh_bao_dong() $$,
  '42501',
  null,
  'Người dùng KHÔNG gọi được sinh_bao_dong — bơm hàng đợi báo động là một đường tấn công rẻ tiền');

select test_support.logout();

select * from finish();
rollback;
