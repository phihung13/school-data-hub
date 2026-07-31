-- pgTAP — cổng nhận chung rổ Xanh: ops.embedded_app_events + core.promote_embedded_event (0019)
-- Chạy: pg_prove -d "$DATABASE_URL" packages/core/db/tests/0019_embed_generic_capture_test.sql
--
-- Vì sao file này tồn tại: schema-lint của repo chặn merge khi một migration tạo bảng mới mà
-- không có test tương ứng. 0019 tạo ops.embedded_app_events từ 29/07/2026 nhưng test chưa được
-- viết, nên CI đang đỏ sẵn — phát hiện lại ngày 31/07/2026 khi rà toàn hệ thống.
--
-- Điều cần khoá lại, theo thứ tự rủi ro:
--   1. §9 idempotent — promote() gọi lại KHÔNG được ghi bản ghi thứ hai.
--   2. Rổ Xanh và rổ Vàng phải rẽ đúng nhánh: dear_log đi evidence, còn lại đi ops.
--   3. actor_user_id rác không được âm thầm nuốt — phải rơi vào import_errors.

begin;
select plan(12);
select test_support.seed_basic();

-- ── Cấu trúc bảng ───────────────────────────────────────────────────────────
select has_table('ops', 'embedded_app_events', 'ops.embedded_app_events tồn tại');
select col_is_pk('ops', 'embedded_app_events', 'id', 'id là khoá chính');
select has_index(
  'ops', 'embedded_app_events', 'embedded_app_events_uq',
  'Có UNIQUE (app_id, external_id) — nền tảng của §9 cho cổng nhận chung'
);
select fk_ok(
  'ops', 'embedded_app_events', 'actor_user_id',
  'core', 'users', 'id',
  'actor_user_id trỏ về core.users (không phải auth.users — ADR-011/012)'
);

-- ── Rổ Xanh: sự kiện không gắn học sinh nào ─────────────────────────────────
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9001, 'embed:factory', 'ext-xanh-1',
             jsonb_build_object('event_type', 'lesson_planned',
                                'actor_user_id', '40000000-0000-0000-0000-000000000001',
                                'title', 'Giáo án Toán 6'));

select is(
  core.promote_embedded_event(9001),
  'promoted',
  'Sự kiện rổ Xanh promote thành công'
);
select is(
  (select count(*)::int from ops.embedded_app_events where external_id = 'ext-xanh-1'),
  1,
  'Ghi đúng một dòng vào ops.embedded_app_events'
);
select is(
  (select app_id from ops.embedded_app_events where external_id = 'ext-xanh-1'),
  'factory',
  'app_id được bóc đúng từ source "embed:factory"'
);

-- ── §9: gọi lại promote() trên cùng raw_id ──────────────────────────────────
select is(
  core.promote_embedded_event(9001),
  'already_promoted',
  '§9 — gọi lại trả already_promoted, không phải lỗi'
);
select is(
  (select count(*)::int from ops.embedded_app_events where external_id = 'ext-xanh-1'),
  1,
  '§9 — vẫn đúng một dòng sau khi gọi lần hai'
);

-- ── actor_user_id không tồn tại thì phải vào sổ lỗi, không được nuốt ─────────
insert into staging.raw_embedded_events (id, source, external_id, payload)
     values (9002, 'embed:factory', 'ext-xanh-bad-actor',
             jsonb_build_object('event_type', 'lesson_planned',
                                'actor_user_id', '40000000-0000-0000-0000-0000000000ff'));
select is(
  core.promote_embedded_event(9002),
  'import_error',
  'actor_user_id không khớp core.users nào — trả import_error'
);
select is(
  (select count(*)::int from staging.import_errors where external_id = 'ext-xanh-bad-actor'),
  1,
  'Lỗi được ghi vào staging.import_errors thay vì mất im lặng'
);

-- ── raw_id không tồn tại ────────────────────────────────────────────────────
select is(
  core.promote_embedded_event(999999),
  'raw_not_found',
  'raw_id không tồn tại — trả raw_not_found, không ném lỗi'
);

select * from finish();
rollback;
