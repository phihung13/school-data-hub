-- 0064_bang_xep_hang_phai_thay_ca_truong.sql
-- SỬA MỘT LỖI CỦA `0063`, đo được ngay ở lượt mở màn đầu tiên.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- TRIỆU CHỨNG
-- ═══════════════════════════════════════════════════════════════════════════
-- Đăng nhập bằng tài khoản em Minh, mở `/thi-dua`: trang trả **200**, bảng vẽ đẹp, và
-- nội dung là **một dòng duy nhất — chính em, hạng 1/1**. Lớp 6A1: tổng 138, trung bình
-- 138. Không lỗi nào nổ ra.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NGUYÊN NHÂN — và vì sao nó là bài học ngược của `0024`
-- ═══════════════════════════════════════════════════════════════════════════
-- `0063` đặt `security_invoker = on` cho cả ba view xếp hạng, theo đúng bài học `0024`:
-- view chạy quyền chủ schema là view vượt mặt RLS. Bài học đó ĐÚNG — nhưng nó đúng cho
-- view chở **dữ liệu riêng của từng người**. Bảng thi đua thì ngược hẳn: nó là **công
-- bố có chủ ý**, và RLS bên dưới (`core.students` chỉ cho em đọc dòng của mình) đang
-- cắt đúng thứ mà tính năng này sinh ra để hiện.
--
-- Nói gọn: `security_invoker` không "an toàn hơn", nó chỉ **đẩy quyết định xuống RLS**.
-- Khi RLS trả lời một câu hỏi KHÁC câu view đang hỏi, kết quả là một màn hình nói dối
-- rất thuyết phục — mỗi em đều thấy mình đứng nhất trường.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CÁCH SỬA — view thành RANH GIỚI CÔNG BỐ, và thu hẹp đúng bằng cái nó cần công bố
-- ═══════════════════════════════════════════════════════════════════════════
-- Ba view chuyển về `security_invoker = off` (mặc định) để chạy bằng quyền chủ schema,
-- và ĐỔI LẠI, chúng phải tự thu hẹp:
--
--   · **BỎ `student_id` khỏi bảng cá nhân.** Bảng xếp hạng cần TÊN và ĐIỂM, không cần
--     khoá chính của một đứa trẻ. Trả id ra cho mọi người là phát cho cả trường một
--     khoá để nối dữ liệu — đúng thứ ADR-038 vừa phải cân nhắc rất kỹ ở app ngoài.
--   · **BỎ `class_id` khỏi bảng lớp**, cùng lý lẽ.
--   · **`la_toi` / `la_lop_toi` tính TRONG view** bằng `core.current_user_id()`. Trước
--     đây tầng ứng dụng so `student_id` để tô đậm dòng của em — chính nhu cầu đó là lý
--     do id phải đi ra ngoài. Tính trong view thì nhu cầu ấy biến mất.
--
-- Sau khi sửa, thứ một người lạ đọc được qua ba view này là: tên · lớp · khối · điểm ·
-- hạng. Đó đúng bằng một tờ giấy dán bảng tin, và đó là thứ chủ đầu tư đã duyệt.

begin;

-- `create or replace view` không bỏ được cột (bài học 0058) — phải drop rồi create.
-- `drop view` cũng xoá quyền đã cấp, nên câu `grant` cuối file là bắt buộc.
drop view if exists evidence.v_xep_hang_ca_nhan;
drop view if exists evidence.v_xep_hang_lop;
drop view if exists evidence.v_xep_hang_khoi;

create view evidence.v_xep_hang_ca_nhan as
  select s.full_name,
         c.code           as lop,
         c.grade          as khoi,
         sum(d.diem)::int as tong_diem,
         rank() over (order by sum(d.diem) desc) as thu_hang,
         bool_or(s.user_id = core.current_user_id()) as la_toi
    from evidence.diem_thi_dua d
    join core.students s    on s.id = d.student_id
    join core.enrollments e on e.student_id = s.id and e.valid_to is null
    join core.classes c     on c.id = e.class_id
   where d.ngay >= current_date - 29
   group by s.id, s.full_name, c.code, c.grade;

create view evidence.v_xep_hang_lop as
  select c.code  as lop,
         c.grade as khoi,
         sum(d.diem)::int as tong_diem,
         count(distinct d.student_id)::int as so_em_co_diem,
         round(sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0), 1) as diem_trung_binh,
         rank() over (
           order by sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0) desc
         ) as thu_hang,
         bool_or(s.user_id = core.current_user_id()) as la_lop_toi
    from core.classes c
    join core.enrollments e on e.class_id = c.id and e.valid_to is null
    join core.students s    on s.id = e.student_id
    left join evidence.diem_thi_dua d
           on d.student_id = e.student_id and d.ngay >= current_date - 29
   group by c.id, c.code, c.grade;

create view evidence.v_xep_hang_khoi as
  select c.grade as khoi,
         sum(d.diem)::int as tong_diem,
         round(sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0), 1) as diem_trung_binh,
         rank() over (
           order by sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0) desc
         ) as thu_hang
    from core.classes c
    join core.enrollments e on e.class_id = c.id and e.valid_to is null
    left join evidence.diem_thi_dua d
           on d.student_id = e.student_id and d.ngay >= current_date - 29
   group by c.grade;

comment on view evidence.v_xep_hang_ca_nhan is
  'ADR-037 — xếp hạng cá nhân toàn trường, 30 ngày. CỐ Ý chạy bằng quyền chủ schema (KHÔNG security_invoker): đây là công bố có chủ ý, và RLS của core.students trả lời một câu hỏi khác — để nó gác thì mỗi em chỉ thấy chính mình và ai cũng đứng nhất trường (đo thật 21/08/2026, migration 0063). Đổi lại, view tự thu hẹp: KHÔNG trả student_id, và tự tính la_toi bằng core.current_user_id(). Thứ đọc được ở đây đúng bằng một tờ giấy dán bảng tin.';
comment on view evidence.v_xep_hang_lop is
  'ADR-037 — xếp hạng lớp theo ĐIỂM TRUNG BÌNH mỗi em (xếp bằng tổng thì bảng đo sĩ số). Không trả class_id, cùng lý lẽ với view cá nhân.';

grant select on evidence.v_xep_hang_ca_nhan, evidence.v_xep_hang_lop, evidence.v_xep_hang_khoi to authenticated;

commit;
