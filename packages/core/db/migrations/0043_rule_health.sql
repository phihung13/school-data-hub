-- 0043_rule_health.sql
-- LÝ DO BỎ QUA MỘT LUẬT PHẢI ĐỌC ĐƯỢC BẰNG MẮT — và một cái bẫy đang ngủ trong
-- ops.v_stale_sources sẽ nổ đúng ngày connector đầu tiên ra đời.
--
-- Gói việc này mở ra bằng một câu hỏi tưởng là việc vặt: "C_CEFR chưa có nguồn — dựng
-- luôn care.v_signal_cefr và khai ops.source_freshness('tutor_cefr') cho đủ bộ chứ?".
-- Câu trả lời sau khi ĐO là KHÔNG, và gần như cả file này là hệ quả của chữ không đó.
-- Chép phép đo vào đây vì sáu tháng nữa sẽ có người hỏi lại đúng câu ấy, và lúc đó
-- không ai còn nhớ vì sao đã không làm.
--
-- ── Phép đo 1: khai nguồn lúc này mua được gì (hub_dev, 01/08/2026, transaction rồi
--    rollback — không để lại dấu vết, đã kiểm lại sau đó) ──────────────────────────
--      insert into ops.source_freshness values ('tutor_cefr', 'Lộ trình CEFR', '30 days');
--      update care.rules set source_key = 'tutor_cefr' where rule_code = 'C_CEFR';
--      select care.run_flag_engine(current_date, 'live');
--
--    · rules_skipped KHÔNG ĐỔI MỘT CHỮ: C_CEFR vẫn {"ly_do": "chua_cai_dat"}. Vì nhánh
--      ĐẦU TIÊN của CASE trong 0039 xét mảng c_implemented và chặn trước, nhánh
--      source_key nằm sau nó ba dòng, không bao giờ tới lượt.
--    · degraded_sources đổi từ [] thành ["tutor_cefr"] — trên MỌI lượt chạy, vĩnh viễn.
--
--    Tức là khai nguồn hôm nay mua được đúng một thứ: một đèn vàng không bao giờ tắt.
--    Đó đúng là thứ 0011 vừa tự tay gỡ ngày 31/07 (xoá ba dòng 'tutor', 'moodle', 'cor')
--    với lý do viết sẵn ở đó: "cảnh báo lúc nào cũng sáng là cảnh báo đã chết". Làm lại
--    việc ấy cho 'tutor_cefr' là hoàn tác một quyết định mới hai ngày tuổi.
--
--    Và nó còn SAI SỰ THẬT theo hướng tốn kém nhất: người trực đêm đọc "nguồn hết tươi"
--    sẽ đi tìm một cái máy bơm hỏng. Không có máy bơm nào hỏng — chưa có máy bơm nào ra
--    đời. Một cảnh báo chỉ sai chỗ tốn nhiều hơn một khoảng trống được ghi tên.
--
-- ── Phép đo 2: dựng view mà không khai nguồn thì còn tệ hơn ────────────────────────
--    tutor.cefr_results và tutor.cefr_trajectories đang RỖNG (0 dòng trên hub_dev) và
--    KHÔNG có bộ ghi nào trong toàn repo: `grep -rn "insert into tutor."` ra đúng hai
--    hit, cả hai nằm trong 0007_tutor_health_test.sql và đều chèn mastery_snapshots.
--    View đọc bảng rỗng thì GROUP BY trả 0 dòng, và 0 dòng đọc y hệt "không em nào lệch
--    lộ trình" — đúng kiểu hỏng im lặng ADR-016 cấm. DEBT.md #35 đã ghi sẵn câu này.
--
--    Thêm một lý do cứng hơn: hôm nay CHƯA VIẾT ĐƯỢC view cho đúng. `level` và
--    `expected_level` là text trần (pg_constraint trên hai bảng chỉ có PK/UNIQUE/FK,
--    không CHECK; `select proname ... where nspname='tutor'` trả 0 dòng — không có hàm
--    so sánh bậc nào), còn cefr_trajectories không có cột ngày nào để sắp thứ tự kỳ,
--    trong khi ngưỡng lại là {"periods_below_trajectory": 2}. Viết view bây giờ là tự
--    bịa ba quyết định thiết kế rồi khoá chúng vào một migration TRƯỚC khi biết connector
--    thật trả dữ liệu dạng gì. Ba câu hỏi đó đã được ghi thành chữ trong DEBT.md #35.
--
-- ── Vậy nợ trả ở đâu ──────────────────────────────────────────────────────────────
--    Ở chỗ hôm nay đang thiếu thật. Lý do bỏ qua CÓ TỒN TẠI — 0039 ghi nó vào
--    ops.job_runs.metrics->'rules_skipped' rất tử tế — nhưng không màn hình nào đọc:
--    `grep -rl "v_job_health\|jobHealth" apps/hub packages/core` trả về 0 file. Muốn
--    biết đêm qua bộ quét chấm mấy luật thì phải mở psql. Một lời khai trung thực không
--    ai đọc được thì về hiệu lực không khác gì im lặng.
--
--    ĐÍNH CHÍNH khi nghiệm thu, cuối ngày 01/08/2026 — phép grep ở trên đo lúc gói này
--    MỞ, và nó đã hết đúng trong cùng ngày: gói buồng lái GVCN chạy song song hạ cánh
--    sau đó, nay `grep -rl "v_job_health\|jobHealth" apps/hub packages/core` ra 4 file
--    thật (scan-status.ts, gvcn-dashboard.tsx, server/routers/care.ts,
--    contracts/care.ts). Giữ nguyên câu đo ở trên vì nó là lý do lịch sử của quyết định,
--    nhưng đừng đọc nó như hiện trạng. Điều CÒN đúng nguyên: chưa màn hình nào đọc
--    `ops.v_rule_health` (grep = 0 file), nên câu "luật nào đang ngủ, và vì sao" vẫn chỉ
--    tới được mắt người qua psql. Hai bản dịch mã lý do (SQL ở đây · TypeScript trong
--    scan-status.ts) nay cùng tồn tại — nợ có tên: DEBT.md #37.
--
--    Nên migration này làm hai việc, không việc nào dựng thêm vỏ rỗng:
--      1. ops.v_rule_health — luật nào đang được chấm, luật nào đang ngủ, VÌ SAO ngủ,
--         và cái nào trong số đó là việc của người trực ngay bây giờ.
--      2. ops.v_stale_sources — sửa cột `age` nổ tung khi một nguồn có
--         last_success_at IS NULL. Bug đang ngủ, và nó hẹn giờ nổ đúng vào ngày
--         connector đầu tiên khai nguồn mới — tức đúng lúc người ta ít muốn gặp lỗi nhất.
--
-- Phụ thuộc: 0008 (ops.job_runs), 0011 (ops.source_freshness + v_stale_sources),
--            0026 (care.rules), 0039 (care.run_flag_engine ghi metrics), 0041 (v_job_health).

begin;

-- ---------------------------------------------------------------------------
-- 1. ops.v_stale_sources — `select *` không được chết vì một nguồn chưa chạy lần nào
-- ---------------------------------------------------------------------------
-- Lỗi đo được ngày 01/08/2026 trên hub_dev:
--
--   begin;
--   insert into ops.source_freshness (source, label, max_age)
--        values ('zz_test', 'Nguồn thử', interval '30 days');
--   select source, label from ops.v_stale_sources;   -- CHẠY ĐƯỢC, trả về dòng zz_test
--   select * from ops.v_stale_sources;               -- ERROR: cannot subtract infinite timestamps
--   rollback;
--
-- Nguyên nhân: 0011 tính `now() - coalesce(last_success_at, '-infinity')`. Cái coalesce
-- ấy sinh ra để nói "chưa chạy lần nào thì coi như cũ vô hạn" — ý đúng, nhưng PostgreSQL
-- không trừ được hai mốc vô hạn, nên chính cột diễn đạt ý đó lại là cột làm vỡ câu truy vấn.
--
-- Vì sao hôm nay chưa ai vấp: cả hai nguồn đang khai (attendance, evidence) đều đã có
-- last_success_at thật, và đường đọc duy nhất trong app (care.getDashboard) chỉ
-- `select label`, nên bộ tối ưu của Postgres cắt luôn biểu thức `age` đi trước khi tính.
-- Hai điều kiện may mắn, không phải hai lớp thiết kế. Cả hai cùng mất hiệu lực đúng vào
-- ngày connector đầu tiên khai một nguồn mới: dòng đó có last_success_at NULL, và bất kỳ
-- ai chạy `select *` để xem "nguồn nào đang hỏng" sẽ nhận về một lỗi thay vì một câu trả
-- lời — giữa lúc đang có sự cố thật.
--
-- Sửa: NULL nghĩa là "không tính được tuổi vì chưa từng chạy", và đó là một câu trả lời
-- THẬT THÀ hơn hẳn 'infinity'. Điều kiện WHERE giữ nguyên từng chữ: `last_success_at is
-- null` VẪN tính là hết tươi. Chưa từng chạy ≠ đang ổn — đó là cả lý do 0011 tồn tại, và
-- migration này không đụng tới nó.
create or replace view ops.v_stale_sources as
  select source,
         label,
         last_success_at,
         max_age,
         case
           when last_success_at is null then null
           else now() - last_success_at
         end as age
    from ops.source_freshness
   where last_success_at is null
      or now() - last_success_at > max_age;

comment on view ops.v_stale_sources is
  'ADR-016 — nguồn quá hạn tươi. last_success_at IS NULL cũng tính là hết tươi: chưa từng chạy ≠ đang ổn. Từ 0043, cột age trả NULL cho nguồn chưa chạy lần nào thay vì trừ hai mốc vô hạn rồi làm vỡ cả câu select *.';

-- 0024 đã bật security_invoker cho view này. `create or replace view` giữ nguyên
-- reloptions, nhưng khai lại tường minh ở đây để lần sau ai đọc file này không phải mở
-- 0024 mới biết view chạy bằng quyền của NGƯỜI GỌI — mất dòng này là mở lại đúng lỗ
-- 0024 đi bịt.
alter view ops.v_stale_sources set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2. ops.v_rule_health — luật nào đang ngủ, và vì sao
-- ---------------------------------------------------------------------------
-- Cùng hình dạng với ops.v_job_health (0041): một dòng một luật, có trạng thái, và
-- "chưa biết gì" là một trạng thái RIÊNG chứ không phải 'ok'.
--
-- ── Vì sao đọc metrics của lượt chạy thật, chứ không tự tính lại ──────────────────
-- Cám dỗ đầu tiên là chép mảng c_implemented của 0039 ra một bảng rồi để view tự suy
-- "luật này lẽ ra chạy được". Không làm, vì như vậy là DỰNG NGUỒN SỰ THẬT THỨ HAI: hôm
-- nào 0039 được sửa mà bảng kia quên sửa theo, view sẽ báo "đang chấm" cho một luật mà
-- đêm qua bộ quét bỏ qua — sai theo đúng hướng nguy hiểm nhất, hướng trấn an.
--
-- Nên view này KHÔNG dự đoán. Nó thuật lại: đêm qua bộ quét đã chấm những luật nào, đã
-- bỏ qua luật nào và khai lý do gì. Chính bộ quét là người khai, view chỉ dịch lời khai
-- đó sang tiếng người. Cái giá phải trả là kết luận luôn thuộc về MỘT LƯỢT CHẠY CỤ THỂ,
-- nên view trả kèm run_id/as_of_date và cột `stale_verdict` — xem phần cuối.
--
-- ── Vì sao needs_attention KHÔNG bật cho mọi luật đang ngủ ────────────────────────
-- Đây là chỗ dễ làm hỏng nhất, và là bài học đắt nhất của 0011. C_CEFR sẽ ngủ nhiều
-- tháng nữa; cho nó bật đèn mỗi đêm là chế tạo đúng cái "cảnh báo lúc nào cũng sáng"
-- mà 0011 vừa gỡ, và người trực sẽ học cách phớt lờ cột này trong tuần đầu.
--
-- Ranh giới: đèn chỉ bật khi có thứ CẦN TAY NGƯỜI ĐÊM NAY.
--   · nguon_het_tuoi           → bật. Máy bơm dữ liệu đang hỏng, đó là sự cố thật.
--   · khong_co_nguong_dang_bat → bật. Ai đó vừa tắt một luật; luật ngừng chấm mà không
--     ai được báo. Cùng lý lẽ với trạng thái 'tat' của v_job_health (0041): tắt một thứ
--     đang bảo vệ trẻ con không được phép nằm im như một lựa chọn bình thường.
--   · chua_cai_dat / chua_khai_nguon_tuoi → KHÔNG bật. Đây là nợ ĐÃ CÓ TÊN và có điều
--     kiện mở trong DEBT.md (#35 cho C_CEFR). Việc đúng với chúng là đi viết luật hoặc
--     đi nối connector — không phải đánh thức người trực lúc 2h sáng.
--   · chua_chay / khong_ro     → bật. Xem ngay dưới.
create or replace view ops.v_rule_health
with (security_invoker = true) as
with luot as (
  -- Lượt quét THÀNH CÔNG gần nhất. Lượt thất bại không mang metrics dùng được, và
  -- trạng thái "đêm qua bộ quét hỏng" đã có chỗ ở rồi: ops.v_job_health, dòng
  -- flag_engine. Hai view không được nói cùng một điều bằng hai giọng khác nhau.
  select id, as_of_date, started_at, finished_at, metrics
    from ops.job_runs
   where job_name = 'flag_engine'
     and status   = 'success'
   order by started_at desc, id desc
   limit 1
)
select r.rule_code,
       r.description,
       r.source_key,
       l.id          as last_run_id,
       l.as_of_date  as last_as_of_date,
       l.finished_at as last_finished_at,

       -- Kết luận này lấy từ lượt quét của NGÀY KHÁC. Không phải lỗi (sáng sớm, trước
       -- lượt chạy trong ngày, cột này đúng là true), nhưng màn hình phải nói ra "theo
       -- lượt quét ngày ..." thay vì để người đọc tưởng đang xem tình trạng lúc này.
       (l.id is null or l.as_of_date is distinct from current_date) as stale_verdict,

       case
         when l.id is null                       then 'chua_chay'
         when sk.ly_do is not null                then 'dang_ngu'
         when jsonb_exists(coalesce(l.metrics -> 'rules_evaluated', '[]'::jsonb),
                           r.rule_code)           then 'dang_cham'
         else 'khong_ro'
       end as state,

       sk.ly_do,

       case
         -- Chưa có lượt quét thành công nào. KHÔNG được đọc thành "mọi luật đều ổn" —
         -- đúng lỗi mà 0041 dựng cả trạng thái 'chua_chay' để chặn.
         when l.id is null then
           'Chưa có lượt quét nào chạy thành công, nên chưa biết gì về luật này. Chưa biết không phải là đang ổn.'
         when sk.ly_do = 'chua_cai_dat' then
           'Chưa ai viết luật này trong bộ quét (care.run_flag_engine chưa có nhánh cho nó). Đây là nợ có tên trong DEBT.md, không phải sự cố: việc đúng là đi viết luật, không phải đi tìm máy hỏng.'
         when sk.ly_do = 'chua_khai_nguon_tuoi' then
           'Luật đã cài nhưng chưa khai nguồn dữ liệu nào (care.rules.source_key còn trống), nên chưa biết dữ liệu của nó còn tươi hay không. Khai nguồn CÙNG LÚC với connector cấp dữ liệu, không sớm hơn — khai sớm là tự bật một cảnh báo sáng vĩnh viễn (0011).'
         when sk.ly_do = 'nguon_het_tuoi' then
           'Nguồn "' || coalesce(r.source_key, '?') || '" đã quá hạn tươi — dữ liệu ngừng chảy vào Hub. Đây là việc của người trực NGAY BÂY GIỜ, không phải nợ kỹ thuật.'
         when sk.ly_do = 'khong_co_nguong_dang_bat' then
           'Không còn dòng ngưỡng nào đang bật cho luật này trong care.thresholds. Ai đó đã tắt nó; luật ngừng chấm mà không ai được báo.'
         when sk.ly_do is not null then
           -- Bộ quét khai một lý do mà view chưa biết dịch. Tuyệt đối không trả NULL và
           -- tuyệt đối không đoán thành 'ok': một mã lạ nghĩa là 0039 đã đi trước file
           -- này, và người đọc cần thấy đúng chữ đó để đi tra.
           'Bộ quét khai lý do "' || sk.ly_do || '" — ops.v_rule_health (0043) chưa có lời giải thích cho mã này. Tra care.run_flag_engine() rồi bổ sung vào view.'
         when jsonb_exists(coalesce(l.metrics -> 'rules_evaluated', '[]'::jsonb), r.rule_code) then
           'Đang được chấm trong lượt quét gần nhất.'
         else
           -- care.rules có luật này, nhưng lượt quét gần nhất không nhắc tới nó ở CẢ HAI
           -- danh sách. Nghĩa là bảng luật và bộ quét đang lệch nhau (luật vừa thêm sau
           -- lượt chạy cuối, hoặc metrics thiếu). Im lặng ở đây trông y hệt "đang chấm" —
           -- nên nó phải là một trạng thái riêng, và phải bật đèn.
           'Lượt quét gần nhất KHÔNG nhắc tới luật này ở cả danh sách đã chấm lẫn danh sách bỏ qua — bảng care.rules và bộ quét đang lệch nhau. Đừng đọc thành "đang chấm".'
       end as giai_thich,

       -- Cột duy nhất màn hình trực cần đọc. Xem lý lẽ về ranh giới ở đầu mục 2.
       --
       -- `coalesce(sk.ly_do, '')` chứ không phải `sk.ly_do in (...)`: trong SQL,
       -- `null in ('a','b')` trả về NULL, và NULL lọt qua `or` sẽ biến cả cột thành NULL.
       -- Một cột cảnh báo mang giá trị NULL là cột không nói gì — ở tầng JavaScript nó
       -- lại falsy, tức là đọc thành "không sao cả". Đúng hình dạng hỏng đang chống.
       (l.id is null
        or coalesce(sk.ly_do, '') in ('nguon_het_tuoi', 'khong_co_nguong_dang_bat')
        or (sk.ly_do is null
            and not jsonb_exists(coalesce(l.metrics -> 'rules_evaluated', '[]'::jsonb),
                                 r.rule_code))
       ) as needs_attention

  from care.rules r
  left join luot l on true
  left join lateral (
    select s ->> 'ly_do' as ly_do
      from jsonb_array_elements(coalesce(l.metrics -> 'rules_skipped', '[]'::jsonb)) s
     where s ->> 'rule_code' = r.rule_code
     limit 1
  ) sk on true;

comment on view ops.v_rule_health is
  'Luật nào của bộ quét đang được chấm, luật nào đang ngủ và VÌ SAO (0043). Thuật lại metrics của lượt care.run_flag_engine thành công gần nhất chứ không tự suy — hai nguồn sự thật thì nguồn thứ hai sẽ trấn an sai. chua_chay và khong_ro là hai trạng thái riêng: im lặng không phải kết luận. needs_attention CỐ Ý không bật cho luật chưa cài đặt/chưa khai nguồn — nợ có tên trong DEBT.md không được phép thành đèn vàng sáng vĩnh viễn (bài học 0011).';

-- Cấu hình + tình trạng vận hành, không có một dòng dữ liệu cá nhân nào: cùng mức mở
-- như ops.v_job_health. security_invoker = true nên người gọi vẫn phải tự có quyền đọc
-- care.rules và ops.job_runs (cả hai đang có policy đọc `using (true)` cho authenticated,
-- 0026 và 0008) — không có cửa nào vòng qua RLS ở đây.
grant select on ops.v_rule_health to authenticated;

commit;
