---
ban-doi-ung: ../danh-cho-nguoi/ho-so-he-thong.html
sync-version: 5
---

# Resilience & Security — chịu lỗi, backup đơn giản 2 lớp, chống gian lận, hardening

Nguyên tắc gốc: tách bạch hai loại rủi ro. **Downtime** (tạm ngưng vài phút–vài giờ) là chấp nhận được và có kịch bản; **mất dữ liệu** là KHÔNG chấp nhận được ở bất kỳ mức nào. Mọi quyết định dưới đây tối ưu cho vế thứ hai trước.

## 1. Mục tiêu đo được

| Chỉ tiêu | Giá trị | Nghĩa |
|---|---|---|
| RPO — lỗi trong Supabase (xóa nhầm, migration hỏng) | ≤ 24h (backup hằng ngày mặc định của Supabase Pro) | Không mua PITR — quyết định chốt 28/07/2026 (ADR-019), xem đánh đổi ở `10-mua-sam-ha-tang.md` §4 |
| RPO — thảm họa cấp nhà cung cấp (mất tài khoản, Supabase biến mất) | ≤ 7 ngày (bản pg_dump tuần trên ổ cứng trường là bản độc lập duy nhất) | Tụt so với thiết kế trước đây (từng là ≤24h nhờ có lớp R2); đã ghi `DEBT.md` #18 và báo BGH |
| RTO (thời gian dựng lại hệ) | ≤ 4 giờ | có diễn tập đo thật, không ước chừng |
| Downtime chấp nhận được | ≤ vài giờ/lần, lớp học không dừng | nhờ chế độ suy giảm có kiểm soát (mục 3) |

## 2. Backup — 2 lớp đơn giản (chốt 28/07/2026, ADR-019, sửa ADR-006)

**Đã bỏ so với thiết kế trước:** PITR (point-in-time recovery) và lớp kho trung gian ngoài nhà cung cấp (Cloudflare R2/Backblaze B2). Lý do: ưu tiên đơn giản — ít dịch vụ phải quản lý với 2 dev — hơn là RPO tối ưu nhất có thể mua được. Đây là quyết định có chủ đích, không phải bỏ sót.

1. **Lớp 1 — backup hằng ngày mặc định của Supabase Pro.** Không cấu hình thêm, không mua add-on. Giữ khoảng 7 ngày, quản lý tự động trong Supabase — lo sự cố xóa nhầm, migration hỏng, miễn là phát hiện trong vòng một ngày.
2. **Lớp 2 — pg_dump hằng tuần, chép trực tiếp vào ổ cứng vật lý tại trường**, cất két. File dump **mã hóa bằng age/gpg, khóa do trường giữ** (backup chứa toàn bộ dữ liệu nên bắt buộc mã hóa file, độc lập với quyết định không mã hóa trong DB). Đây là bản chống kịch bản "nhà cung cấp bốc hơi / khóa tài khoản / thiên tai vùng" — và bây giờ là **bản độc lập duy nhất** ngoài Supabase, không còn lớp R2 đứng giữa.

**Luật vàng: backup chưa từng restore thử = chưa có backup.** Diễn tập phục hồi **mỗi quý**: restore dump mới nhất (từ ổ cứng trường) vào một Postgres trống, chạy smoke test (đếm học sinh, mở buồng lái), đo thời gian, ghi biên bản. Trượt diễn tập = sự cố mức cao, xử trước mọi feature.

**Cải thiện rẻ, chưa quyết:** có thể chạy pg_dump mã hóa hằng ngày lên VPS ứng dụng (đã dư ổ đĩa) rồi mỗi tuần mới mang ra ổ cứng vật lý — giảm RPO cấp "mất Supabase" xuống ≤24h mà không tốn thêm hạ tầng. Chưa nằm trong quyết định đã chốt, để ngỏ nếu BGH thấy 7 ngày là rủi ro cao.

## 3. Ma trận sự cố — hệ phản ứng thế nào

| Sự cố | Hệ phản ứng | Mất gì |
|---|---|---|
| Mất wifi/mạng tại lớp | PWA xếp hàng check-in offline (IndexedDB), tự gửi lại khi có mạng — an toàn nhờ §9 idempotent. **Từ 02/08/2026:** lượt không gửi được rời hàng đợi kèm dấu vết em đọc được, không nằm im (mục 6b–6c) | không mất gì, và ca không gửi được thì em được báo |
| Supabase down vài giờ | check-in offline queue; lớp học tiếp tục; bộ quét đêm chạy bù khi DB trở lại; bản tin Zalo lùi giờ gửi | không mất gì, chỉ trễ |
| Supabase down nhiều ngày | kích hoạt kịch bản restore: backup hằng ngày Supabase → Postgres dự phòng (VPS bất kỳ), đổi connection string qua env | RTO ≤ 4h, RPO ≤ 24h |
| Nhà cung cấp mất sạch dữ liệu / khóa tài khoản | restore từ bản pg_dump tuần trên ổ cứng trường — bản độc lập duy nhất | RTO ≤ 4h, RPO ≤ 7 ngày |
| Connector chết ngầm | `ops_heartbeats` báo đỏ cho data champion trong ngày | không mất (nguồn còn giữ) |
| Dữ liệu ngoài bẩn/lệch mã | chặn ở staging (§8), vào `import_errors` chờ người xử | không lây vào core |
| Migration hỏng trên prod | migration bắt buộc qua staging trước (§2); tệ nhất restore từ backup hằng ngày Supabase | ≤ 24h |
| GVCN quên xử lý cờ | tự leo thang 7 ngày lên care team | không em nào bị rơi |
| Trường mất điện / sự cố toàn diện | fallback phi kỹ thuật đã ghi trong hồ sơ: bảng 4 màu + điểm danh giấy, nhập bù sau | văn hóa không chờ hạ tầng |

## 4. Thoát vendor — vì sao đây KHÔNG phải bom nổ chậm

- Toàn bộ dữ liệu là **Postgres chuẩn mở** — `pg_dump` mang đi bất cứ đâu (Supabase khác, RDS, VPS tự host). Cấm dùng tính năng độc quyền của nhà cung cấp ngoài Postgres chuẩn + RLS + pg_cron (đều là Postgres/extension mở).
- App là Next.js + tRPC chuẩn, chạy trên VPS tự quản (ADR-018/019) — vẫn deploy được sang Vercel/Cloud Run/Docker khác nếu cần, không khóa chặt vào một cách host.
- Kịch bản chuyển nhà cung cấp = restore dump + đổi 3 biến env. Với dữ liệu 10–30 GB: nửa ngày. **Lưu ý:** bản dump gần nhất có thể cũ tới 7 ngày (mục 2) — kịch bản này được diễn tập chung với restore drill quý để biết chính xác mất bao nhiêu.
- "Quả bom" thật sự chỉ tồn tại khi: (a) dữ liệu có một bản duy nhất trong tay một vendor, hoặc (b) code dính chặt tính năng độc quyền. Kiến trúc này cấm cả hai bằng văn bản.

## 5. Chống gian lận check-in / điểm danh

Check-in cảm xúc là tự khai — gian lận không phá được gì. **Điểm danh (chuyên cần)** mới cần chống gian lận:

1. **Server-side kiểm nguồn mạng:** bảng `core.school_networks` chứa IP WAN của từng cơ sở; request điểm danh chỉ được tính `on_campus=true` khi source IP khớp — **server kiểm, client không tự khai được**.
2. **Khung giờ:** điểm danh chỉ tính trong cửa sổ cấu hình (vd 06:45–07:30) theo cơ sở.
3. **Check-in ngoài trường vẫn nhận** (giá trị chăm sóc) nhưng gắn nhãn `off_campus`, KHÔNG tính chuyên cần, hiện rõ trên buồng lái.
4. **GVCN xác nhận danh sách lệch** (5 giây, đã có trong nhịp vận hành) — chốt chặn con người.
5. **Nâng cấp có sẵn thiết kế (bật khi cần): QR động trong lớp** — mã HMAC(classroom_id, time_bucket_30s) chiếu/dán trong phòng, đổi mỗi 30 giây; quét mới được tính điểm danh → chứng minh "ở trong phòng này". Chống nhờ-bạn-bấm-hộ tốt hơn IP.
6. **Giới hạn nói thẳng (đã ghi từ bản Final):** mọi điểm danh tự phục vụ chứng minh *thiết-bị-ở-trường*, không chứng minh *em-ngồi-trong-lớp*. Không kỹ thuật hóa thêm (GPS, camera, sinh trắc buộc) — xâm phạm, trái Hiến chương điều 2. Chốt cuối là con người.

## 6. Bảo mật nhiều lớp (defense in depth)

| Lớp | Biện pháp |
|---|---|
| Biên | Toàn bộ sau Cloudflare: WAF, chống DDoS, ẩn IP gốc; HTTPS + HSTS bắt buộc; security headers (CSP, X-Frame-Options, nosniff) |
| Đăng nhập | **MFA bắt buộc cho mọi tài khoản CBGV/admin** và cho Supabase dashboard/GitHub của dev; khóa tạm sau N lần sai; phiên hết hạn hợp lý; HS dùng tài khoản trường cấp |
| Ứng dụng | Zod validate mọi input; rate limit per-user; không secret ở client (§4); upload (nếu có) kiểm type + size |
| Dữ liệu | RLS từng dòng (§4–§5): một tài khoản bị chiếm chỉ lộ đúng phạm vi tài khoản đó — **blast radius nhỏ theo thiết kế**; audit log cho truy cập care/y tế/admin |
| Backup | dump mã hóa, khóa trường giữ (mục 2) |
| Con người | rủi ro số 1 của trường học là phishing lấy mật khẩu giáo viên → MFA + 30 phút tập huấn nhận diện lừa đảo trong tuần tập huấn |
| Quy trình | secret-scan + dependency-scan (npm audit/Dependabot) trong CI; cập nhật vá định kỳ; **pentest thuê ngoài trước vườn ươm và trước khi lên store** |

## 6b. Cửa đăng nhập tạm (`dev-login`) đã khoá — 02/08/2026, ADR-028, nợ #19

**Cái hỏng thật, đo hai lần.** `apps/hub/app/api/auth/dev-login/route.ts` dài 34 dòng và **không có một phép kiểm môi trường nào** — không `NODE_ENV`, không địa chỉ, không mật khẩu. Nó nhận một `authUid` bất kỳ trong danh sách tài khoản mẫu rồi cấp cookie phiên đúng vai đó. Route nằm sau tên miền công khai `hub.truongvietanh.com`, và dãy UUID mẫu (`90000000-0000-0000-0000-0000000000NN`) đoán được bằng mắt.

| Phép thử | Trước 02/08/2026 | Từ 02/08/2026 |
|---|---|---|
| `POST https://hub.truongvietanh.com/api/auth/dev-login` không mã | **200** + cookie phiên vai `principal` | **401** |
| cùng lời gọi, mã sai | **200** | **401** |
| cùng lời gọi, mã đúng (header `x-hub-dev-secret`) | 200 | 200 |
| chưa đặt `DEV_LOGIN_SECRET` | 200 (cửa mở) | **503, đóng với tất cả** |
| `NODE_ENV=production` | 200 | **404 — route không tồn tại** |

Ô "200" ở cột trái không phải suy luận: nó được **đo lại lần nữa hôm 02/08/2026** trong bước thử ngược (gỡ tạm bản vá ⇒ cả `http://localhost:3000` lẫn tên miền công khai đều trả 200 kèm `Set-Cookie: hub_session`, rồi hoàn nguyên).

| Đối tượng (không phải đối tượng CSDL) | Nơi tạo | Nói gì |
|---|---|---|
| `DEV_LOGIN_SECRET` | biến môi trường; giá trị thật **chỉ** ở `apps/hub/.env.local` (đã gitignore), `.env.example` khai tên và **để trống** | Bí mật dùng chung. Trống hoặc ngắn hơn `DEV_SECRET_MIN_LENGTH` (12) ⇒ coi như **chưa đặt** ⇒ cửa đóng với tất cả. Đổi giá trị = thu hồi mọi máy đã mở khoá |
| `packages/core/auth-adapter/dev-gate.ts` | mới | Toàn bộ phán quyết, **thuần** — không `next/*`, không Postgres, nên test chạy thẳng. `evaluateDevGate()` trả một trong bốn trạng thái `absent` / `misconfigured` / `locked` / `open`; hai route và màn đăng nhập nói cùng thứ tiếng này |
| Cookie `hub_dev_gate` | `POST /api/auth/dev-gate` | Vé `<hạn epoch giây>.<HMAC-SHA256>`, khoá ký **là chính bí mật** (nên đổi bí mật là mọi vé chết ngay, không cần bảng thu hồi). 30 ngày · `HttpOnly` · `SameSite=Lax` · `Secure` **chỉ khi request đi https** |
| `GET /api/auth/dev-gate` | mới | Màn đăng nhập hỏi trạng thái cửa để vẽ đúng thứ cần vẽ. `404` production · `503` chưa cấu hình · `200 {state}` còn lại |
| `POST /api/auth/dev-gate` | mới | Nhập mã. 5 lần/phút/IP (`checkRateLimit`, cùng khuôn `/api/auth/invite`). Một thông điệp từ chối duy nhất, không phân biệt lý do |
| `tools/start-local.sh` bước 2c | sửa | Tự gõ cửa **không cầm mã** rồi đòi bị từ chối; nhận 200 là **dừng script**. Bước 3 lặp lại đúng phép thử đó **từ Internet** qua tên miền công khai |
| `tests/unit/dev-login-gate.test.ts` | mới, 19 ca | Bốn lời hứa, mỗi lời cả hai chiều; cộng hai cổng nguồn: cửa còn được mắc trong `dev-login` **trước** khi đọc thân request, và mã thật không rò sang file nào git theo dõi |

Màn `/login` hỏi trạng thái cửa **một lần** lúc mở trang rồi vẽ đúng thứ cần vẽ: production bỏ hẳn khối tài khoản thử · chưa cấu hình hiện lời giải thích · chưa mở khoá hiện ô nhập mã (`label htmlFor` thật, `type=password`). Bấm tài khoản trước khi cửa hiện ra thì màn hình nhớ lại và tự đăng nhập sau khi mở khoá ⇒ **đúng một lần nhập mã**.

**Vì sao KHÔNG chặn theo địa chỉ máy** — phần dễ làm sai nhất, và là lý do ADR-028 tồn tại:

1. **Nó cắt đúng người cần đi qua.** Chủ đầu tư demo bằng điện thoại, qua chính tên miền công khai, và hôm 01/08/2026 đã phàn nàn "tôi không vào được bằng điện thoại". Một cửa "chỉ cho localhost" đóng lỗ hổng bằng cách đóng luôn người dùng chính.
2. **Nó không chặn được ai.** `~/.cloudflared/config.yml` trỏ `hub.truongvietanh.com → http://localhost:3000`, nên **mọi request từ Internet đi qua đường hầm tới Node đều mang địa chỉ nguồn 127.0.0.1**. Phép kiểm loopback ở đây **xanh cho cả thế giới**, đồng thời làm cả nhóm tin rằng cửa đã khoá — **cổng tệ hơn không có cổng**. Có một bài test canh không file route nào nhắc tới `localhost`/`127.0.0.1`.

Hệ quả: `x-forwarded-for` chỉ được dùng để **đếm số lần thử**, không bao giờ để **cấp quyền**; bộ đếm 5 lần/phút của người vào từ localhost gom chung một xô (`loopback`) — chấp nhận được, vì cái nó bảo vệ là bí mật chứ không phải địa chỉ.

**Bốn cái bẫy đã gặp, ghi ra để không ai vấp lại:**

- **Cookie `Secure` bật cứng là hỏng im lặng.** Chủ đầu tư vào bằng https (phải có `Secure`); dev và `tools/start-local.sh` vào bằng `http://localhost:3000`, ở đó một cookie `Secure` đặt xong rồi **không bao giờ được gửi lại** — nhập mã đúng mà vẫn đứng nguyên tại chỗ, không một dòng lỗi. Nên cờ `Secure` đọc từ `x-forwarded-proto` của chính request; đã đo: qua tên miền công khai cookie có `Secure`, qua localhost không.
- **`timingSafeEqual` ném lỗi khi hai buffer lệch độ dài** — và chính việc ném lỗi đó là một kênh rò "mã bạn nhập dài bao nhiêu". Băm SHA-256 cả hai vế trước khi so.
- **Cửa phải đặt TRƯỚC khi parse thân request.** Nếu đọc `authUid` trước, route trả `404 "Tài khoản dev không tồn tại"` cho người chưa qua cửa — tức tự biến mình thành một **cửa dò danh sách tài khoản có thật, miễn phí**. Có test canh đúng thứ tự này.
- **Cổng chống rò bí mật suýt thành cổng rỗng.** Bản đầu của bài test quét kho theo phần mở rộng, mà `extname(".env.example")` trả `".example"` — nên nó **không** quét chính file dễ bị dán mã nhất. Phát hiện lúc thử ngược (cố ý dán mã thật vào `.env.example`, cổng vẫn xanh); đã sửa để quét mọi file `.env*` trừ chính `.env.local`, và sau khi sửa thì phép thử ngược đó đỏ và gọi tên đúng file.

**Còn nợ, nói thẳng (`DEBT.md` #19 đã ghi).** Đây là **mật khẩu dùng chung**, không phải danh tính: `ops.audit_log` biết "một phiên vai hiệu trưởng đã mở", **không biết ai mở**; thu hồi chỉ ở mức tất-cả-hoặc-không. Nợ #19 **chưa xoá**, chỉ hạ từ "cửa mở" xuống "chưa có danh tính từng người". Đường trả: bọc Cloudflare Access lên tên miền, hoặc bỏ hẳn `dev-login` khi Google/Zalo OAuth thật lên.

## 6c. Hàng đợi offline không được im lặng (nợ #31, 02/08/2026)

Mục 3 ghi "mất wifi/mạng tại lớp ⇒ không mất gì". Câu đó đúng ở đường sung sướng và **sai ở ba ca đo được**, cho tới 02/08/2026. `flushQueuedCheckins` cũ `break` ngay ở lỗi đầu tiên, nên một bản ghi hỏng vĩnh viễn (401 hết phiên) **chặn luôn mọi check-in xếp sau, mãi mãi**; và nó gọi `dequeue` mà không đọc `moodSaved`, nên một lượt trả 2xx với `moodSaved=false` (`0047`, nhà em chưa có phiếu đồng ý) bị đánh dấu "đã gửi" cho một mức tâm trạng máy chủ từ chối ghi.

Nay mỗi bản ghi có **đúng ba đường ra và không đường nào im**: gửi trọn vẹn → rời hàng đợi · lỗi tự khỏi khi có mạng (không có phản hồi / 5xx / 408 / 429) → **ở lại** chờ · hỏng y hệt lần sau (401/403/400) hoặc `moodSaved=false` → rời hàng đợi **kèm một dấu vết em đọc được** trên `/checkin`, chỉ nút "Đã hiểu" mới xoá. Luật phân loại lỗi có **một** bản duy nhất (`shouldQueueOffline` trong `apps/hub/lib/offline-queue.ts`), hàng đợi và màn hình cùng import. Khoá §9: hai lượt flush chồng nhau dùng chung một lượt chạy — trình duyệt bắn `online` nhiều lần khi wifi chập chờn, và tuy máy chủ idempotent theo `(student_id, occurred_on, kind)` (đo bằng HTTP thật: hai lượt `submitMood` trả cùng một `checkinId`, `select` ra đúng một dòng) thì gửi đôi vẫn tiêu hạn mức 429 của chính em. Hình dạng dữ liệu của hai kho khoá trên máy em: `02-database.md`, mục "Kho trên máy học sinh (IndexedDB)".

Nguyên tắc rút ra, đáng đứng cạnh "luật vàng" của mục 2: **một phần mềm chăm trẻ không được phép im lặng đúng lúc nó làm hỏng việc** — im lặng ở đây không trung tính, nó luôn được đọc thành tin tốt.

## 7. Cổng phát hành — "đủ tin tưởng" là danh sách đo được, không phải cảm giác

Chưa pass đủ bảng này thì chưa phát hành (thêm vào cổng nghiệm thu tuần 6 và trước mọi lần mở rộng):

- [ ] pgTAP toàn ma trận RLS: mọi ô, cả chiều cho phép lẫn từ chối
- [ ] Test leo quyền: lấy token học sinh thử gọi API của GVCN/admin → toàn bộ bị chặn
- [ ] Contract test idempotency (§9) pass toàn bộ mutation
- [ ] Secret scan sạch trên repo + client bundle
- [ ] Load test k6: 3.000 check-in/30 phút, p95 < 500ms
- [ ] Restore drill: khôi phục từ dump tuần (ổ cứng trường) về Postgres trống < 4h, smoke test pass
- [ ] Pentest bên thứ ba: không còn phát hiện mức cao/nghiêm trọng chưa xử
- [ ] Kiểm chống gian lận: check-in từ mạng ngoài không tính chuyên cần; QR động (nếu bật) không dùng lại được mã cũ

## 8. Bổ sung Rev B/C

- **`queued_late`:** bản check-in sync muộn (offline queue gửi lại ngoài khung giờ) KHÔNG tự tính chuyên cần, KHÔNG tự loại — vào danh sách lệch cho GVCN xác nhận. Không tin timestamp do client khai.
- **Giám sát backup:** thiếu dump tuần đúng hạn (quá 8 ngày chưa có bản pg_dump mới trên ổ cứng trường) = báo động cho on-call (không đợi tới drill quý mới phát hiện).
- **Hỏng im lặng:** freshness "Quét đêm qua: HH:mm" bắt buộc trên buồng lái (chi tiết ở 04-flag-engine).
- **IP WAN cơ sở đổi** là sự cố vận hành thường gặp: xem RB-03 trong 07-operations — data champion tự xử qua màn hình admin `school_networks`, không cần dev.
- SLO theo khung giờ nghiệp vụ + SEV matrix + on-call: xem `07-operations.md`.
