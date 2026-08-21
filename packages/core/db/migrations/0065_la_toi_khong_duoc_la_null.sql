-- 0065_la_toi_khong_duoc_la_null.sql
-- Sửa nốt một lỗi của `0064` — lỗi thứ hai của cùng một tính năng, ghi cả hai lại vì
-- chúng là hai loại khác nhau và cùng đáng nhớ.
--
--   `0063` → `0064`: view HIỆN QUÁ ÍT (RLS cắt mất cả trường, mỗi em thấy mình hạng 1).
--                    Không lỗi nào nổ ra — màn hình nói dối rất thuyết phục.
--   `0064` → `0065`: view trả NULL ở một cột `boolean`. Lỗi NỔ ngay, và nổ ở đúng chỗ
--                    nên sửa được trong một phút.
--
-- Cái thứ hai dễ chịu hơn hẳn cái thứ nhất, và đó chính là lý do hợp đồng (`zod` ở tầng
-- `output`) đáng giá: nó biến một dữ liệu sai hình dạng thành một lỗi có địa chỉ
-- (`caNhan[2].laToi: Expected boolean, received null`) thay vì một ô trống trên màn.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- NGUYÊN NHÂN
-- ═══════════════════════════════════════════════════════════════════════════
-- `bool_or(s.user_id = core.current_user_id())` trả **NULL** khi MỌI giá trị trong nhóm
-- là NULL — và `s.user_id` là NULL một cách hợp lệ: `core.students.user_id` có chú thích
-- ngay tại cột "NULL: em chưa có tài khoản (mầm non)". Vậy mọi lớp toàn em chưa có tài
-- khoản cho ra `la_lop_toi = NULL`.
--
-- `coalesce(..., false)` là câu trả lời đúng về NGHĨA, không chỉ về kiểu: "không xác
-- định được đây có phải lớp của tôi không" và "đây không phải lớp của tôi" cho ra cùng
-- một hành vi màn hình (không tô đậm), nên gộp chúng KHÔNG mất thông tin nào cả.

begin;

create or replace view evidence.v_xep_hang_ca_nhan as
  select s.full_name,
         c.code           as lop,
         c.grade          as khoi,
         sum(d.diem)::int as tong_diem,
         rank() over (order by sum(d.diem) desc) as thu_hang,
         coalesce(bool_or(s.user_id = core.current_user_id()), false) as la_toi
    from evidence.diem_thi_dua d
    join core.students s    on s.id = d.student_id
    join core.enrollments e on e.student_id = s.id and e.valid_to is null
    join core.classes c     on c.id = e.class_id
   where d.ngay >= current_date - 29
   group by s.id, s.full_name, c.code, c.grade;

create or replace view evidence.v_xep_hang_lop as
  select c.code  as lop,
         c.grade as khoi,
         sum(d.diem)::int as tong_diem,
         count(distinct d.student_id)::int as so_em_co_diem,
         round(sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0), 1) as diem_trung_binh,
         rank() over (
           order by sum(d.diem)::numeric / nullif(count(distinct e.student_id), 0) desc
         ) as thu_hang,
         coalesce(bool_or(s.user_id = core.current_user_id()), false) as la_lop_toi
    from core.classes c
    join core.enrollments e on e.class_id = c.id and e.valid_to is null
    join core.students s    on s.id = e.student_id
    left join evidence.diem_thi_dua d
           on d.student_id = e.student_id and d.ngay >= current_date - 29
   group by c.id, c.code, c.grade;

commit;
