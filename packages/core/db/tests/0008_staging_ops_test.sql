-- pgTAP — phòng chờ và vận hành (§8, §9)
begin;
select plan(8);
select test_support.seed_basic();

-- ── §8: connector CHỈ được INSERT vào staging ──────────────────────────────
-- Đây là ràng buộc cấp quyền, không phải quy ước code: khóa connector có bị lộ
-- thì kẻ cầm nó cũng không đọc được dữ liệu học sinh, không sửa được kho chính.
select ok(
  has_table_privilege('connector', 'staging.raw_tutor_events', 'INSERT'),
  'connector INSERT được vào staging'
);
select ok(
  not has_table_privilege('connector', 'staging.raw_tutor_events', 'SELECT'),
  'connector KHÔNG đọc lại được cái mình vừa ghi'
);
select ok(
  not has_table_privilege('connector', 'core.students', 'SELECT'),
  'connector KHÔNG đọc được danh sách học sinh (§8)'
);
select ok(
  not has_table_privilege('connector', 'attendance.checkins', 'INSERT'),
  'connector KHÔNG ghi thẳng vào schema nghiệp vụ — chỉ promote() được (§8)'
);

-- ── §9 ở tầng nguồn ngoài ──────────────────────────────────────────────────
select lives_ok(
  $$ insert into staging.raw_tutor_events (external_id, payload)
     values ('evt-1', '{"student":"tut-9911"}') $$,
  'Nhận sự kiện từ Tutor'
);
select throws_ok(
  $$ insert into staging.raw_tutor_events (external_id, payload)
     values ('evt-1', '{"student":"tut-9911"}') $$,
  '23505', null,
  'Gửi lại cùng external_id không tạo bản ghi đôi (§9)'
);

-- ── ADR-017: webhook app ngoài thiếu external_id bị từ chối ────────────────
-- Nếu để lọt, công cụ no-code sinh mã mới mỗi lần gửi lại và §9 chỉ còn trên giấy.
select throws_ok(
  $$ insert into staging.raw_embedded_events (source, external_id, payload)
     values ('embed:fitness', '   ', '{}') $$,
  '23514', null,
  'Webhook app ngoài thiếu external_id bị chặn (ADR-017)'
);

-- ── §9 cho bản tin Zalo ────────────────────────────────────────────────────
select throws_ok(
  $$ insert into ops.outbox_messages (channel, dedup_key, payload)
     values ('zalo', 'week-40-ph-001', '{}'),
            ('zalo', 'week-40-ph-001', '{}') $$,
  '23505', null,
  'Outbox chặn gửi trùng bằng dedup_key (§9)'
);

select * from finish();
rollback;
