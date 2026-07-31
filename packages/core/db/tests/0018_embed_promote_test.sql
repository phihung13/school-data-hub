-- pgTAP — core.promote_embedded_event(), nhánh rổ Vàng "DEAR log qua alias" (0018)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0018_embed_promote_test.sql
--
-- Vì sao file này tồn tại: 0018 đưa vào hệ một hàm SECURITY DEFINER — bề mặt phân
-- quyền rộng nhất trong repo, chạy bằng quyền chủ schema và ghi thẳng vào
-- evidence.dear_logs của trẻ — nhưng thư mục tests/ không có assertion nào cho nó
-- (phát hiện khi rà toàn hệ thống 31/07/2026). 0019 viết đè hàm bằng
-- `create or replace`, nên bài test này soi HÀM ĐANG CHẠY và chỉ khoá phần hợp
-- đồng do 0018 đặt ra: nhánh event_type = 'dear_log'. Nhánh rổ Xanh là việc của 0019.
--
-- Ba điều phải khoá, theo thứ tự rủi ro:
--   1. §8 — alias không map được thì DỪNG và để lại dấu vết cho người xử, không tự đoán,
--           và bản ghi thô phải còn nguyên (promoted_at NULL) để xử lại được sau.
--   2. §9 — gọi lại promote() trên cùng bản ghi thô không sinh dòng thứ hai.
--   3. Dữ liệu bơm vào evidence.dear_logs đúng em, đúng ngày, đúng số phút, đúng sách.

begin;
select plan(11);
select test_support.seed_basic();

-- ── Bề mặt hàm ──────────────────────────────────────────────────────────────
select has_function(
  'core', 'promote_embedded_event', array['bigint'],
  'core.promote_embedded_event(bigint) tồn tại'
);
-- Phải là definer: connector (§8) chỉ có INSERT trên staging, không có quyền nào
-- trên evidence/core. Mất definer là mọi webhook rổ Vàng gãy — im lặng, ở production.
select is_definer(
  'core', 'promote_embedded_event', array['bigint'],
  'Hàm chạy SECURITY DEFINER — connector không cần (và không được có) quyền evidence/core'
);

-- ── §8: alias chưa có trong sổ đối chiếu ────────────────────────────────────
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9101, 'embed:dear-app', 'alias-chua-map',
             jsonb_build_object('event_type', 'dear_log',
                                'logged_on',  '2026-07-30',
                                'minutes',    20,
                                'book_title', 'Sách của em lạ mặt'));

select is(
  core.promote_embedded_event(9101),
  'import_error',
  '§8 — alias không map được student_id thì trả import_error, KHÔNG tự đoán em nào'
);
-- Gộp số dòng và nội dung reason vào một assertion: subquery vô hướng trả nhiều
-- dòng sẽ ném lỗi, nên phép so sánh này cũng chính là phép kiểm "đúng một dòng".
select is(
  (select count(*) || '|' || coalesce(max(reason), '(không có)')
     from staging.import_errors where raw_id = 9101),
  '1|alias không map được student_id',
  '§8 — đúng một dòng staging.import_errors, reason nói rõ người xử phải làm gì'
);
select is(
  (select promoted_at from staging.raw_embedded_events where id = 9101),
  null::timestamptz,
  'Bản ghi thô còn nguyên promoted_at NULL — xử lại được sau khi người gắn alias'
);

-- ── Đường đi đúng: alias đã có trong core.id_mappings ───────────────────────
insert into core.id_mappings (system, external_id, student_id)
     values ('embed:dear-app', 'alias-minh', '70000000-0000-0000-0000-000000000001');

insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9102, 'embed:dear-app', 'alias-minh',
             jsonb_build_object('event_type', 'dear_log',
                                'logged_on',  '2026-07-30',
                                'minutes',    25,
                                'book_title', 'Dế Mèn phiêu lưu ký'));

select is(
  core.promote_embedded_event(9102),
  'promoted',
  'Có alias trong core.id_mappings — sự kiện được promote'
);
select is(
  (select format('%s|%s|%s|%s', student_id, to_char(logged_on, 'YYYY-MM-DD'), minutes, book_title)
     from evidence.dear_logs
    where student_id = '70000000-0000-0000-0000-000000000001'),
  '70000000-0000-0000-0000-000000000001|2026-07-30|25|Dế Mèn phiêu lưu ký',
  'evidence.dear_logs nhận đúng em · đúng ngày · đúng số phút · đúng tên sách'
);

-- ── §9: app ngoài retry, webhook gọi lại promote() trên cùng bản ghi thô ────
select is(
  core.promote_embedded_event(9102),
  'already_promoted',
  '§9 — gọi lại trả already_promoted, không phải lỗi'
);
select is(
  (select count(*)::int from evidence.dear_logs
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  '§9 — vẫn đúng một dòng DEAR log sau lần gọi thứ hai'
);

-- ── Payload xấu: thiếu logged_on (cột NOT NULL của evidence.dear_logs) ──────
-- Hành vi ĐÍCH theo §8: rơi vào staging.import_errors, KHÔNG raise — raise làm
-- rollback cả transaction của webhook nên mất luôn bản ghi thô lẫn dòng sổ lỗi,
-- app ngoài nhận 500 và retry vô hạn một lỗi vĩnh viễn. Block EXCEPTION vá việc
-- này thuộc migration 0028 (gói embed-connector), chưa có trong repo lúc viết file.
--
-- Không khoá cứng một trong hai hành vi: kỳ vọng được suy ra từ chính thân hàm,
-- nên assertion tự chuyển sang đòi 'import_error' ngay khi 0028 đổ vào — và đỏ
-- nếu ai đó gỡ block EXCEPTION đi. Alias thứ hai (app khác) là bắt buộc: khóa
-- duy nhất (source, external_id) không cho gửi hai bản ghi thô cùng một alias.
insert into core.id_mappings (system, external_id, student_id)
     values ('embed:dear-app-2', 'alias-minh-2', '70000000-0000-0000-0000-000000000001');

insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9103, 'embed:dear-app-2', 'alias-minh-2',
             jsonb_build_object('event_type', 'dear_log',
                                'minutes',    20,
                                'book_title', 'Sách quên ghi ngày'));

select is(
  test_support.try_promote(9103),
  case
    when (select bool_or(p.prosrc ~* 'exception[[:space:]]+when')
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'core' and p.proname = 'promote_embedded_event')
    then 'import_error'   -- 0028 đã vào: payload xấu đi vào sổ lỗi
    else 'raised:23502'   -- trước 0028: còn ném not-null violation (nợ đã biết)
  end,
  'Payload thiếu logged_on đi đúng nhánh xử lý đang khai báo trong thân hàm promote()'
);
select is(
  (select count(*)::int from evidence.dear_logs
    where student_id = '70000000-0000-0000-0000-000000000001'),
  1,
  '§8 — dù đi nhánh nào, payload xấu KHÔNG để lại dòng rác trong evidence.dear_logs'
);

select * from finish();
rollback;
