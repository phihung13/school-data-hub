-- pgTAP — siết đường ingest app ngoài (0028)
-- Chạy: bash tools/run-db-tests.sh
--
-- Ba điều file này khoá lại, theo thứ tự thiệt hại nếu vỡ:
--   1. §8 — payload xấu KHÔNG được làm mất bản ghi thô. Trước 0028, một payload thiếu
--      `logged_on` ném 23502 ra khỏi hàm, kéo theo rollback cả transaction của route:
--      staging trống, import_errors trống, app ngoài nhận 500 và không ai biết đã mất gì.
--   2. §9 — nhánh lỗi cũng phải idempotent. Retry 30 giây/lần của app ngoài không được
--      biến hàng đợi người-xử-tay thành 2880 dòng mỗi ngày.
--   3. §8 ở tầng quyền — vai `connector` ghi được staging và chỉ thế thôi; dữ liệu học
--      sinh (core.students, evidence.dear_logs) vẫn ngoài tầm với kể cả khi khóa bị lộ.

begin;
select plan(35);
select test_support.seed_basic();

-- Alias do Hub cấp cho app ngoài (ADR-017): external_id của sự kiện thô CHÍNH LÀ alias.
-- Mỗi ca lỗi cần một alias riêng vì staging.raw_embedded_events UNIQUE (source, external_id).
insert into core.id_mappings (system, external_id, student_id) values
  ('embed:test-external-app', 'alias-thieu-ngay', '70000000-0000-0000-0000-000000000001'),
  ('embed:test-external-app', 'alias-ngay-rac',   '70000000-0000-0000-0000-000000000001'),
  ('embed:test-external-app', 'alias-phut-999',   '70000000-0000-0000-0000-000000000001'),
  ('embed:test-external-app', 'alias-hop-le',     '70000000-0000-0000-0000-000000000001');

-- ═══ Cấu trúc ════════════════════════════════════════════════════════════════
select has_column(
  'staging', 'raw_embedded_events', 'failed_at',
  'raw_embedded_events có cột failed_at — "đã kết luận hỏng", tách khỏi promoted_at'
);
select has_index(
  'staging', 'import_errors', 'import_errors_dedup_uq',
  'import_errors có UNIQUE (source, external_id, reason) — nền của §9 cho nhánh lỗi'
);
select has_function(
  'staging', 'ingest_embedded_event', ARRAY['text', 'text', 'jsonb'],
  'Có cửa vào staging.ingest_embedded_event để connector không cần quyền đọc bảng thô'
);
select has_function(
  'core', 'issue_embed_alias_for_user', ARRAY['text', 'uuid'],
  'Có core.issue_embed_alias_for_user để connector không cần quyền đọc core.students'
);

-- ═══ CA A — dear_log thiếu logged_on (trước đây: 23502 bay ra ngoài) ═════════
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9101, 'embed:test-external-app', 'alias-thieu-ngay',
             jsonb_build_object('event_type', 'dear_log', 'minutes', 20));

select is(
  core.promote_embedded_event(9101), 'import_error',
  'Thiếu logged_on → import_error, KHÔNG ném lỗi (§8)'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'alias-thieu-ngay'),
  1,
  'Đúng một dòng trong hàng đợi người xử'
);
select is(
  (select count(*)::int from staging.raw_embedded_events where id = 9101 and promoted_at is null),
  1,
  'Bản ghi thô CÒN NGUYÊN trong staging — đây là thứ transaction cũ cuốn mất'
);
select is(
  core.promote_embedded_event(9101), 'already_failed',
  '§9 — gọi lại trả already_failed thay vì diễn lại lỗi cũ'
);
select is(
  core.promote_embedded_event(9101), 'already_failed',
  '§9 — lần thứ ba vẫn already_failed'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'alias-thieu-ngay'),
  1,
  '§9 — ba lần gọi vẫn đúng MỘT dòng import_errors (app ngoài retry không làm ngập hàng đợi)'
);

-- ═══ CA B — logged_on không phải ngày (22007) ═══════════════════════════════
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9102, 'embed:test-external-app', 'alias-ngay-rac',
             jsonb_build_object('event_type', 'dear_log', 'logged_on', 'hôm nay', 'minutes', 20));

select is(
  core.promote_embedded_event(9102), 'import_error',
  'logged_on rác → import_error'
);
select ok(
  (select reason like 'payload không hợp lệ%' from staging.import_errors where external_id = 'alias-ngay-rac'),
  'Lý do lỗi ghi rõ để người xử biết phải sửa gì, không phải "unknown"'
);

-- ═══ CA C — minutes vượt CHECK 0..600 (23514) ═══════════════════════════════
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9103, 'embed:test-external-app', 'alias-phut-999',
             jsonb_build_object('event_type', 'dear_log', 'logged_on', '2026-07-30', 'minutes', 999));

select is(
  core.promote_embedded_event(9103), 'import_error',
  'minutes=999 vi phạm CHECK → import_error'
);
select is(
  (select count(*)::int from evidence.dear_logs
    where student_id = '70000000-0000-0000-0000-000000000001' and logged_on = '2026-07-30'),
  0,
  'Không có dòng rác nào lọt vào kho chính'
);

-- ═══ CA D — đường sạch vẫn phải chạy ════════════════════════════════════════
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9104, 'embed:test-external-app', 'alias-hop-le',
             jsonb_build_object('event_type', 'dear_log', 'logged_on', '2026-07-29',
                                'minutes', 25, 'book_title', 'Dế Mèn phiêu lưu ký'));

select is(
  core.promote_embedded_event(9104), 'promoted',
  'Payload hợp lệ vẫn vào kho bình thường'
);
select is(
  (select minutes::int from evidence.dear_logs
    where student_id = '70000000-0000-0000-0000-000000000001' and logged_on = '2026-07-29'),
  25,
  'Ghi đúng số phút vào evidence.dear_logs'
);

-- ═══ CA E — alias chưa map: cũng phải idempotent ════════════════════════════
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9105, 'embed:test-external-app', 'alias-chua-cap-bao-gio',
             jsonb_build_object('event_type', 'dear_log', 'logged_on', '2026-07-28', 'minutes', 30));

select is(
  core.promote_embedded_event(9105), 'import_error',
  'Alias không map được student_id → import_error, không tự đoán (§8)'
);
select is(
  core.promote_embedded_event(9105), 'already_failed',
  '§9 — nhánh alias không map cũng ghi failed_at'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'alias-chua-cap-bao-gio'),
  1,
  '§9 — vẫn đúng một dòng import_errors'
);

-- ═══ CA F — cửa vào staging: nhận lại cùng external_id là no-op ═════════════
select is(
  staging.ingest_embedded_event('embed:factory', 'ext-f1', jsonb_build_object('event_type', 'lan_dau')),
  staging.ingest_embedded_event('embed:factory', 'ext-f1', jsonb_build_object('event_type', 'lan_hai')),
  '§9 — gọi hai lần cùng (source, external_id) trả về đúng một raw_id'
);
select is(
  (select payload ->> 'event_type' from staging.raw_embedded_events
    where source = 'embed:factory' and external_id = 'ext-f1'),
  'lan_dau',
  'Bản ghi ĐẦU TIÊN là bản có thẩm quyền — retry không sửa được lịch sử (Rev F điều 4)'
);

-- ═══ CA G — §8 ở tầng quyền ═════════════════════════════════════════════════
select ok(
  has_function_privilege('connector', 'staging.ingest_embedded_event(text, text, jsonb)', 'EXECUTE'),
  'connector gọi được cửa vào staging'
);
select ok(
  has_function_privilege('connector', 'core.promote_embedded_event(bigint)', 'EXECUTE'),
  'connector gọi được promote() — đường vào schema nghiệp vụ DUY NHẤT (§8)'
);
select ok(
  not has_table_privilege('connector', 'core.students', 'SELECT'),
  'connector KHÔNG đọc được danh sách học sinh, kể cả sau khi được cấp quyền chạy đường ingest'
);
select ok(
  not has_table_privilege('connector', 'evidence.dear_logs', 'SELECT'),
  'connector KHÔNG đọc được kho nghiệp vụ mình vừa ghi gián tiếp'
);
select ok(
  not has_function_privilege('authenticated', 'core.promote_embedded_event(bigint)', 'EXECUTE'),
  'authenticated (mọi học sinh/phụ huynh) KHÔNG tự gọi được promote() — mặc định Postgres cấp cho PUBLIC'
);
select ok(
  has_table_privilege('connector', 'staging.raw_embedded_events', 'INSERT'),
  'connector vẫn INSERT thẳng được vào staging (§8)'
);

-- ═══ CA H — chạy THẬT dưới vai connector, không chỉ tra bảng quyền ══════════
set local role connector;
select lives_ok(
  $$ insert into staging.raw_embedded_events (source, external_id, payload)
     values ('embed:factory', 'ext-connector-1', '{"event_type":"tu-vai-connector"}') $$,
  'Vai connector INSERT được staging (cần cả USAGE trên sequence của bigserial)'
);
select throws_ok(
  $$ select count(*) from evidence.dear_logs $$,
  '42501', null,
  'Vai connector KHÔNG đọc được evidence.dear_logs'
);
select throws_ok(
  $$ insert into evidence.dear_logs (student_id, logged_on, minutes)
     values ('70000000-0000-0000-0000-000000000001', '2026-07-27', 10) $$,
  '42501', null,
  'Vai connector KHÔNG ghi thẳng evidence.dear_logs — chỉ promote() được (§8)'
);
select lives_ok(
  $$ select staging.ingest_embedded_event('embed:factory', 'ext-connector-2', '{"event_type":"x"}'::jsonb) $$,
  'Vai connector chạy được cửa vào staging'
);
select lives_ok(
  $$ select core.promote_embedded_event(9101) $$,
  'Vai connector gọi được promote() (security definer, không cần quyền evidence/core)'
);
reset role;

-- ═══ CA I — cấp alias theo user_id, không lộ core.students ══════════════════
select isnt(
  core.issue_embed_alias_for_user('quiz-app', '40000000-0000-0000-0000-000000000005'),
  null,
  'Học sinh Minh nhận được alias cho app mới'
);
select is(
  core.issue_embed_alias_for_user('quiz-app', '40000000-0000-0000-0000-000000000005'),
  core.issue_embed_alias_for_user('quiz-app', '40000000-0000-0000-0000-000000000005'),
  '§9 — gọi lại trả đúng alias cũ, không sinh dải mới'
);
select is(
  core.issue_embed_alias_for_user('quiz-app', '40000000-0000-0000-0000-000000000001'),
  null,
  'Cô Lan không phải học sinh → không có alias evidence nào được cấp'
);

select * from finish();
rollback;
