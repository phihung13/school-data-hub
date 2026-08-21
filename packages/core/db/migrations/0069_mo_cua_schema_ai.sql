-- 0069_mo_cua_schema_ai.sql
-- Sửa một chỗ thiếu của `0068`: cấp quyền trên BẢNG mà quên cấp quyền vào SCHEMA.
--
-- Trong Postgres, `grant select on <bảng>` không đủ — người gọi còn phải có `usage` trên
-- schema chứa bảng đó. `0068` làm vế thứ nhất và quên vế thứ hai, nên mọi lượt gọi trạm
-- AI trả `permission denied for schema ai` ngay ở bước 1 (đọc hạn mức).
--
-- Bắt được bởi `tests/db/tram-ai.test.ts` ở lượt chạy ĐẦU TIÊN — 13/13 ca đỏ cùng một
-- câu. Đáng ghi lại vì đây là loại lỗi mà đọc mã không thấy: câu `grant` trông đầy đủ,
-- và cái thiếu là một câu KHÔNG có mặt.
--
-- Kèm theo: cấp cho vai Metabase (ADR-039). `0066` liệt kê 8 schema nghiệp vụ và không
-- có `ai` — lúc đó schema ấy rỗng. Nay nó chứa đúng thứ mà "kiểm định hội thoại AI" cần
-- đọc, và chủ đầu tư đã chọn "đọc được tất cả". Nói rõ hệ quả: từ đây tài khoản Metabase
-- đọc được **mọi câu trẻ hỏi trợ lý** — dưới dạng đã bóc định danh (`0068` cố ý không
-- lưu bản gốc), nhưng nội dung câu hỏi thì nguyên vẹn.

begin;

grant usage on schema ai to authenticated;
grant execute on function ai.con_luot(uuid, text) to authenticated;

grant usage on schema ai to metabase_doc_rong;
grant select on all tables in schema ai to metabase_doc_rong;
alter default privileges in schema ai grant select on tables to metabase_doc_rong;

commit;
