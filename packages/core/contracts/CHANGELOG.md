# Changelog — `@hub/core/contracts`

Sổ thay đổi của **hợp đồng giữa hai đội** (2 dev lõi ↔ vibe team), không phải của cả kho mã.
Khuôn [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/); số phiên bản theo
[SemVer](https://semver.org/lang/vi/) và **phải bằng** field `version` trong
`packages/core/package.json` — `tools/contracts-lint.mjs` chặn merge khi hai nơi lệch.

Luật đọc sổ này (`03-api.md` luật endpoint 6):

- **Added** — thêm field/schema mới. Không phá client cũ, nhưng vẫn phải ghi để vibe team biết có gì mới dùng được.
- **Changed** — siết kiểu hoặc đổi ngữ nghĩa của field đang có. Đọc kỹ: đây là chỗ client cũ gãy âm thầm.
- **Deprecated** — field còn chạy nhưng sẽ gỡ. Client phải chuyển trong khoảng này, **không được gỡ ngay**.
- **Removed** — chỉ được xuất hiện sau khi field đã nằm ở Deprecated ít nhất một phiên bản (expand–contract, y như migration).

Sửa bất kỳ file nào trong `packages/core/contracts/` mà không ghi vào đây → `node tools/contracts-lint.mjs` fail.
Sau khi sửa contract, chạy `node tools/contracts-lint.mjs --update` để cập nhật bản chụp bề mặt trong `version.ts`.

## [Unreleased]

### Added

- `StudentCheckinDay.mood` (`number 1..4 | null`) — GVCN đọc lại được nhật ký cảm xúc
  (ADR-035, 21/08/2026, đảo ADR-026; migration `0059`). Nguồn là LEFT JOIN
  `attendance.checkins_care` theo `id` trong `care.getStudentDetail` — cột `mood` của
  bảng gốc vẫn ngoài grant, nên với người xem ngoài `core.can_read_mood()` field này là
  `null`, không phải lỗi. Cùng đợt: `ReportApprovalRow.happyDays` (đã `nullable` từ
  trước, không đổi kiểu) bắt đầu mang SỐ THẬT cho GVCN thay vì `null` cố định — client
  nào lỡ coi `null` là hằng số thì đọc lại ghi chú tại field.

## [0.3.0] — 08/08/2026

**Phiên bản tăng vì có mục `Removed`.** Luật của kho (03-api.md luật 6) đòi expand–contract:
thêm cái mới → client chuyển dần → mới gỡ cái cũ. Ngoại lệ ở đây được nêu tường minh trong
chính mục `Removed` bên dưới, và `tools/contracts-lint.mjs` đã chặn đúng một lần trước khi
tôi tăng số — cổng gánh việc thật.

### Removed

- **Bỏ hẳn khái niệm "khoá riêng cho từng app"** (08/08/2026, migration `0058`, chủ đầu tư:
  *"thì bạn cứ yêu cầu app theo khoá của bạn"*). Gỡ khỏi bề mặt: `MiniAppRow.webhookSecretEnv`
  · `MiniAppRow.daCapSecret` · `MiniAppRow.ssoClientSecretEnv` · `MiniAppRow.daCapSsoSecret` ·
  `CreateMiniAppInput.webhookSecretEnv` · `CreateMiniAppInput.ssoClientSecretEnv` · hàm
  `tenBienSecret`.

  **Vì sao gỡ THẲNG chứ không đi expand–contract:** luật của kho đòi một field phải nằm ở
  Deprecated ít nhất một phiên bản trước khi gỡ, và luật đó đúng vì nó bảo vệ **client cũ đã
  cache**. Sáu field này không có client cũ nào: cả sáu **sinh ra trong hai ngày 07–08/08/2026**,
  chưa từng qua một bản phát hành nào, và bề mặt duy nhất đọc chúng là `/quan-tri/mini-app` —
  một màn chỉ quản trị mở, đi cùng máy chủ, không có bản PWA nào cache riêng. Giữ chúng một
  vòng để "đúng quy trình" là giữ đúng cái bẫy vừa cắn hai lần trong ngày.

  **Cái bẫy đó, ghi lại vì nó là lý do gỡ:** khai một *tên biến* riêng nghĩa là "app này dùng
  khoá riêng", và tầng nạp **cố ý không** rơi về chuỗi chung khi khoá riêng chưa đặt — nếu rơi
  thì một app được cấp khoá mạnh riêng vẫn chạy bằng chuỗi ai cũng đoán được, không tín hiệu
  nào. Đúng vì thế mà phiếu dán tự sinh sẵn tên biến đã làm mọi app mới nhận **401** hai lần
  trong một buổi. Một trường còn tồn tại là một trường còn khai được.

  Hai cột tương ứng cũng đã bị **xoá khỏi `core.embedded_apps`** cùng migration — cùng lý lẽ
  với việc rổ Đỏ không có mặt trong CHECK của `0052`: *"để lộ ra một trạng thái hợp lệ trên
  giấy — và mọi thứ hợp lệ trên giấy rồi sẽ có người thử."*

  **Client thay bằng gì:** không gì cả. Mọi app dùng MỘT chuỗi chung của trường cho cả webhook
  lẫn đăng nhập, nên "app này đã cấp secret chưa" thôi là một câu hỏi. `conThieu` không còn
  dòng nào về secret.

### Added

- **`MiniAppRow.conThieu` — còn thiếu gì để app này chạy** (08/08/2026), mảng câu tiếng Việt
  theo đúng thứ tự nên làm; **rỗng = sẵn sàng**.

  **Vì sao:** chủ đầu tư đặt bài toán *"tôi tải file md đưa app khác, nó trả về json mà tôi
  paste vào không chạy thì bạn chịu hoàn toàn trách nhiệm"*. Chạy thử trọn vòng với một app
  mới (`can-tin`) và đo: dán phiếu xong app vào sổ **đúng**, nhưng **cả ba đường đều chưa
  chạy** — `/embed` 404 · `/oidc/auth` `invalid_client` · webhook 401. Còn ba việc nữa.

  Ba việc đó đều **đã** hiện trên thẻ app từ trước (badge "ĐANG TẮT", chip "chưa cấp cho vai
  nào", khối đỏ tên biến môi trường) — nhưng **rải ba chỗ**, nên người vừa dán phiếu không có
  cách nào biết còn mấy việc hay đã xong. Trường này gom lại thành một câu trả lời.

  **Máy chủ tính, client không tự suy**: hai trong bốn điều kiện đọc `process.env`, mà màn
  hình thì không đọc được. Client dựng lại logic này bằng `daCapSecret`/`enabled`/… sẽ đúng
  hôm nay và sai vào ngày thêm điều kiện thứ năm.

- **`MiniAppRow.daNhan` — app này đã gửi về những gì** (08/08/2026, ADR-033, migration 0056).
  Mảng một dòng mỗi loại sự kiện: `eventType` · `soSuKien` · `soEm` · `lanCuoi`.

  **Vì sao:** chủ đầu tư hỏi *"các app mini nhúng vào bây giờ đổ dữ liệu của app về hết được
  chưa"*, và câu đó trước hôm nay **chỉ trả lời được bằng một lời hứa** — bảng nhận
  `ops.embedded_app_events` không vai nào đọc được và không màn hình nào hiện.

  **Mảng rỗng là một trạng thái CÓ NGHĨA, client phải nói ra:** app chưa gửi về gì. Đó là
  bình thường với một app vừa khai và **đáng ngờ** với một app đã bật ba tuần — hai ca đó
  chỉ phân biệt được khi có con số đứng cạnh, nên đừng ẩn khối đó đi khi mảng rỗng.

  `soEm = 0` nghĩa là loại sự kiện đó không gắn em nào (thực đơn tuần, lịch CLB) — hợp lệ,
  không phải thiếu dữ liệu.

- **Phiếu đấu nối — khuôn JSON đội làm app gửi về** (07/08/2026, chủ đầu tư yêu cầu trực tiếp:
  *"lần nào cần cắm app khác thì tôi download đưa file đó cho họ sửa, sau đó họ trả về … json
  theo đúng template thì copy paste vào đó phát là ra app, khỏi cần điền từng tí 1"*):
  `PhieuDauNoi` + ba khối con `PhieuNhung` · `PhieuWebhook` · `PhieuSso`, bảng
  `KHOA_NHA_TRUONG_QUYET`, và hai hàm thuần `phieuThanhKhaiBao()` · `tenBienSecret()`.

  **Đây KHÔNG phải bản sao của `CreateMiniAppInput`, và khác biệt là toàn bộ lý do nó tồn
  tại.** Bốn trường của `CreateMiniAppInput` là quyết định của NHÀ TRƯỜNG, không của đội làm
  app: `allowedRoles` (ai được mở app) · `enabled` (app có chạy không) · `reviewDueOn` (nhịp
  rà lại) · `webhookSecretEnv`/`ssoClientSecretEnv` (quy ước đặt tên trên máy chủ Hub). Phiếu
  **không có** bốn thứ đó, và **mọi cấp đều `.strict()`** — khai thừa là một lỗi CÓ TÊN, không
  phải một trường bị bỏ qua trong im lặng. `KHOA_NHA_TRUONG_QUYET` biến lỗi "khoá lạ" thành
  một câu nói rõ vì sao khoá đó bị từ chối, vì người dán phiếu không phải kỹ sư và phải gửi
  lại được cho đội bên kia một câu đủ để họ biết sửa dòng nào.

  `phieuThanhKhaiBao()` luôn trả `allowedRoles: []` — **dán một phiếu không bao giờ cấp quyền
  cho ai**. Tên biến secret do `tenBienSecret()` sinh từ mã app, không nhận từ phiếu: một ký
  tự gõ sai cho ra `undefined`, đúng cùng giá trị với "chưa đặt", và không có cách nào phân
  biệt hai ca đó từ trong hệ.

  Hàm nhận `ngayRaLai` làm tham số thay vì tự gọi đồng hồ — hàm thuần thì bài test truyền một
  hằng số, không phải chạy đúng vào một ngày cụ thể mới đo được.

  Khoá tiếng Việt là có chủ ý: người đọc bản yêu cầu (`apps/hub/server/dau-noi/ban-yeu-cau.md`)
  là đội làm app Việt Nam hoặc một AI đọc bản tiếng Việt đó. Một khuôn tiếng Anh cạnh một tài
  liệu tiếng Việt là thêm một lớp dịch, và mỗi lớp dịch là một chỗ dịch sai.
  `tests/unit/phieu-dau-noi.test.ts` bắt **mọi khối JSON trong chính bản yêu cầu** đi qua khuôn
  thật — tài liệu phát ra ngoài tổ chức và mã ở đây không có đường nào trôi khỏi nhau mà vẫn xanh.

- **Khai SSO ngay trong sổ Mini App** (07/08/2026, ADR-032, migration 0055 — chủ đầu tư duyệt
  trực tiếp): `MiniAppRow` và `CreateMiniAppInput` nhận thêm `ssoEnabled`, `ssoRedirectUris`,
  `ssoBackchannelLogoutUri`, `ssoScopes`, `ssoClientSecretEnv`; `MiniAppRow` có thêm
  `daCapSsoSecret` (máy chủ tính); `ListMiniAppsOutput` có thêm `hubUrl`. Hai schema mới:
  `MiniAppRedirectUri`, `MiniAppScope`.

  **Vì sao:** đo trên bản đang chạy ngày 06/08 — khai một app trong sổ thì nhúng chạy được,
  tile hiện được, webhook đóng cổng đúng, còn SSO thì *không có gì*: danh sách Relying Party
  nằm trong `apps/hub/server/oidc/clients.ts`, một mảng TypeScript. Hệ quả nặng nhất không
  phải "thêm app phải deploy" mà là **thu hồi cũng phải deploy**: tắt một app trong sổ cắt
  được nhúng và webhook, nhưng client OIDC vẫn sống và vẫn đổi được `authorization_code` lấy
  token. Công tắc thu hồi thu hồi được hai phần ba, và không chỗ nào nói ra điều đó.

  Ba điều ràng buộc client:

  1. **`client_id` CHÍNH LÀ `appId`.** Không có trường thứ hai. Mini App và RP là cùng một
     app, nên hai cột là hai chỗ để lệch nhau.
  2. **`ssoClientSecretEnv` là TÊN biến môi trường, không phải giá trị** — y hệt
     `webhookSecretEnv`. Giá trị secret không bao giờ vào cơ sở dữ liệu (lý lẽ ở đầu migration
     0052: bản sao lưu đi ra khỏi máy chủ). `daCapSsoSecret` là câu trả lời cho "biến đó đã có
     giá trị trên máy chủ này chưa" — một boolean do máy chủ tính, không phải chuỗi.
  3. **`ssoRedirectUris` KHÔNG chứa `/embed/relay`.** Hub tự thêm URI cầu nối đó từ `HUB_URL`
     cho app có nhúng. Client đừng hiển thị nó như thứ người dùng phải khai, và đừng gửi nó
     lên — nó không thuộc về app ngoài.

  `hubUrl` do máy chủ khai chứ không lấy từ `window.location.origin`: màn quản trị sinh bản
  đấu nối để chép cho đối tác, và mở màn bằng `localhost:3000` thì bản chép sẽ mang một
  `issuer` trỏ về máy của chính người quản trị.

### Changed

- **`scope` khai trong sổ nay ĐƯỢC CƯỠNG CHẾ thật** (07/08/2026, cùng ADR-032). Trường
  `scopes` của `OidcClientConfig` trước nay được khai rồi **không bao giờ truyền xuống thư
  viện** — dòng chú thích "chỉ cho phép khai `hub_profile` nếu app thật sự cần vai trò" mô tả
  một hàng rào chưa từng tồn tại: mọi RP xin được cả bốn scope, kể cả `hub_profile` (vai + cơ
  sở + lớp) và `offline_access`.

  Từ nay `scope` đi xuống provider. **RP xin scope ngoài danh sách đã khai sẽ nhận
  `invalid_scope` tại `/oidc/auth`.** Đây là một siết chặt có thể làm gãy một RP đang chạy nếu
  nó đang xin nhiều hơn phần đã khai — và đó là lý do nó nằm ở mục Changed chứ không phải một
  dòng dọn dẹp. Cái giá của việc siết nhầm nay là **một ô tích trên `/quan-tri/mini-app`**,
  không còn là một lần sửa mã và deploy.

- **`PendingWorkItem.href` nay nhận `null`** (06/08/2026, cùng ngày ra mắt). `null` nghĩa là việc
  đó CÓ THẬT nhưng chưa có màn nào xử nó: chuông vẫn hiện để người dùng biết, nhưng dòng đó
  không bấm được và không vẽ mũi tên.

  Sinh ra từ một phép đo trên bản đang chạy: mục "Job nền cần xem" của quản trị trỏ
  `/quan-tri/mini-app` chỉ vì cần một đường dẫn hợp lệ — mà đó là sổ đăng ký Mini App, không
  liên quan gì tới job nền. Một mục bấm vào ra nhầm màn còn tệ hơn một mục không bấm được: nó
  dạy người dùng rằng chuông này không đáng tin.

  **Client phải xử lý `null`** — dựng `<Link>` với href rỗng là quay lại đúng cái chuông giả đã
  bị gỡ khỏi trang chủ ngày 31/07/2026.

### Added

- **Chuông thông báo + cột phải trang chủ — nguồn dữ liệu của chúng** (06/08/2026, chủ đầu tư
  mở `/home` bằng tài khoản quản trị rồi tài khoản giáo viên: *"thiếu thiếu gì á"*): file mới
  `contracts/session.ts` với `PendingWorkTone`, `PendingWorkItem`, `GetPendingWorkOutput` —
  bề mặt của thủ tục mới `session.getPendingWork` (`protectedProcedure`, CHỈ ĐỌC).

  **Vì sao vibe team cần biết trước khi vẽ:** brief thiết kế 06/08 mục 5.1 cho phép vẽ chuông
  với đúng MỘT điều kiện — nêu được nguồn dữ liệu. Một cái chuông rỗng đã bị gỡ khỏi trang chủ
  ngày 31/07/2026 vì là affordance giả. Hợp đồng này là lời khai nguồn đó, và nó ràng buộc
  bốn điều mà client không được tự nới:

  1. **`PendingWorkItem` có ĐÚNG bốn trường hiển thị** — `key`, `label`, `count`, `href`,
     `tone`. **Không có `studentId`, không có tên, không có mã học sinh.** Chuông chỉ đưa
     người dùng TỚI đúng màn; danh tính hiện ở màn đó, nơi RLS đã gác từ trước. Điều 24 hiến
     pháp UI (không rò nội tình) trùng đúng chỗ này với luật riêng tư của trường — một danh
     sách tên trong lớp nổi của chuông là một bề mặt lộ dữ liệu MỚI, không policy nào canh
     riêng cho nó. `tests/unit/chuong-khong-lo-ten.test.ts` quét mã nguồn router + hợp đồng
     để giữ điều này.
  2. **`count` luôn `>= 1`.** Mục đếm được 0 KHÔNG được máy chủ trả ra. "Hết việc" là
     `items: []`, và màn hình nói điều đó bằng thể rỗng của chuông — đừng vẽ một danh sách
     bốn dòng số 0, đó chính là hình dạng cái chuông vừa bị gỡ.
  3. **`label` do MÁY CHỦ sinh, đúng giọng của vai (§8 brief — hai giọng, không trộn).**
     Học sinh/phụ huynh nhận giọng Glow & Grow; người lớn nhận giọng nghiệp vụ. Client
     **không được viết lại chữ** theo `key`: client không biết người đang đọc mang vai nào
     cho tới khi query xong, và một màn hình tự chọn giọng là một màn hình sẽ có ngày in chữ
     "cờ", "leo thang", "định mức" cho một đứa lớp 6 đọc. `key` là mã nội bộ, dùng cho
     `key` của React và cho việc nhớ thứ tự — **không phải để hiển thị** (điều 24).
  4. **`principal` và `board` luôn nhận `items: []`.** Hai vai đó xem số tổng hợp ở
     `/dieu-hanh` và không có thao tác nào phải làm trong hệ hôm nay. Đừng vẽ một ô trống chờ
     số cho họ.

  **Nguồn từng mục, để không ai vẽ số bịa** (mọi phép đếm đi qua RLS của chính người gọi,
  không hàm `security definer` nào đếm hộ): `homeroom` ← `attendance.checkins` trạng thái
  `queued_late` · `attendance.help_requests` chưa `handled_at` (mục **duy nhất** mang
  `tone: "urgent"`) · `report.growth_report_approvals` thiếu dòng hoặc `status='pending'` ·
  `care.flags` `origin='live'` trong cửa sổ đọc từ `care.thresholds`. `teacher` ←
  `core.teaches` + `attendance.checkins` (số LỚP hôm nay chưa có dòng điểm danh nào).
  `counselor` ← `care.care_cases` `status='open'`. `admin` ← `core.embedded_apps` đang tắt ·
  `ops.v_job_health.needs_attention`. `student` ← hôm nay chưa có dòng check-in.
  `guardian` ← `core.my_consent_status()` còn `needs_action`.

  **`href` luôn trỏ tới màn ĐANG CÓ THẬT** — không mục nào dẫn tới màn chưa xây. Ngoại lệ đã
  biết và đã ghi: `admin.jobs_need_attention` trỏ tạm về `/quan-tri/mini-app` vì hệ chưa có
  màn "sức khoẻ job nền". Con số vẫn được trả về chứ không giấu — RULES Rev F điều 8 cấm suy
  tin tốt từ im lặng, mà thứ đang im ở đây có thể là job xoá chi tiết cảm xúc sau 12 tháng
  (§3) đã chết từ tuần trước.

- **Màn đầu tiên của vai `teacher` — giáo viên BỘ MÔN** (06/08/2026, chủ đầu tư: *"họ không
  có gì ngoài trang chủ?"*): file mới `contracts/teaching.ts` với `TeachingClass`,
  `GetMyTeachingClassesOutput`, `GetTeachingRosterInput`, `TeachingRosterEntry`,
  `GetTeachingRosterOutput` — bề mặt của router mới `teaching`
  (`teaching.getMyClasses` · `teaching.getRoster`).

  **Vì sao vibe team cần biết:** đây là hợp đồng THỨ HAI mô tả "một dòng danh sách lớp", bên
  cạnh `ClassRosterEntry` của `care.ts`. Hai bản KHÔNG được dùng lẫn nhau, và khác biệt không
  phải chuyện đặt tên:

  1. **`TeachingRosterEntry` có ĐÚNG bốn field** — `studentId`, `studentCode`, `fullName`,
     `status`. Không `mood` (đã không có ở `care.ts` từ ADR-026), và cũng KHÔNG có
     `helpPending`, `hasOpenCase`, `checkedInAt`, `source`. Đo dưới phiên Thầy Nam (bộ môn
     Toán) ngày 06/08/2026: `care.flags` = 0 dòng, `attendance.help_requests` = 0 dòng, cột
     `mood` = `42501 permission denied`. Thêm những field đó vào đây là hứa một thứ tầng dữ
     liệu không cấp — client sẽ vẽ ô trống và người đọc hiểu thành "em này không có gì".
  2. **Không dùng khuôn `SuppressibleCount`** (`number | null`) của màn Điều hành: ở đó `null`
     nghĩa là "nhóm nhỏ hơn `report.min_cohort()` nên che". Ở đây thầy cô nhìn đúng lớp mình
     dạy, RLS đã cho đọc từng dòng, nên số luôn là số thật — thêm một trạng thái `null` không
     bao giờ xảy ra chỉ tạo một nhánh chết trên màn hình.
  3. **Ba con số của `TeachingClass` giữ QĐ-3 nguyên vẹn:** `recordedCount` (đã có dòng điểm
     danh, bất kể trạng thái) · `absentCount` (CHỈ `status = 'absent'`) · `noRecordCount`
     (chưa ai ghi). `noRecordCount` là field riêng chứ không để màn hình tự trừ, đúng để không
     ai cộng nó vào `absentCount`: **chưa điểm danh ≠ vắng**.

  **Một field CỐ Ý THIẾU, đọc trước khi dựng màn:** `TeachingClass` KHÔNG có `subject` (tên
  môn). `core.class_assignments.subject` là nguồn duy nhất và bảng đó không GRANT cho
  `authenticated` (`0024` có assertion khoá điều này) — đo dưới phiên Thầy Nam:
  `42501 permission denied for table class_assignments`. Mở ra cần một view `security definer`
  mới + migration, tức là một quyết định mở quyền, không phải một dòng SQL. Đừng vá bằng cách
  đoán tên môn ở client.

- **Duyệt / trả lại / SỬA báo cáo HÀNG LOẠT** (06/08/2026, chủ đầu tư yêu cầu trực tiếp;
  migration `0054`, ADR-031): `REPORT_DECISIONS`, `ReportDecision`, `REPORT_DECISION_LABEL`,
  `DecideReportsInput`, `DecideReportsOutput` — bề mặt của thủ tục mới `care.decideReports`.

  **Vì sao vibe team cần biết:** màn Duyệt báo cáo bắt GVCN ký từng em một — một lớp 40 em
  là 40 cú bấm cho một quyết định cô đã ra từ lúc đọc xong danh sách. Thủ tục mới nhận MẢNG
  `studentIds` + một `decision` + một `note`, trả `{updated, skipped}`.

  **Ba chỗ dễ hiểu nhầm, đọc trước khi dùng:**

  1. `skipped` KHÔNG phải lỗi, và **nghĩa của nó đổi theo `ghiDeQuyetDinhDaCo`**. Cờ tắt:
     em đã có người ký trước (đồng nghiệp, chính cô ở tab khác, hoặc đây là lượt gửi lại),
     cộng em không thuộc lớp chủ nhiệm. Cờ bật: chỉ còn "không thuộc lớp" và "lượt gửi lại
     cùng `clientMutationId`". Màn hình phải nói ra con số đó bằng đúng nghĩa đang dùng —
     nuốt nó đi thì cô đếm "đã xử 30 em" trong khi hệ chỉ ghi 27.
  2. **Mặc định thủ tục KHÔNG ghi đè một quyết định đã ký** — nó chỉ chạm dòng chưa ai
     quyết, và đó là hàng rào cố ý. Muốn đổi một chữ ký đã có thì bật `ghiDeQuyetDinhDaCo:
     true`: một trường riêng, tường minh, **bắt buộc kèm `note` kể cả khi `decision` là
     `approved`**. Mỗi lượt ghi đè để lại một dòng `report.report_decisions` (`0054`):
     `from_status · to_status · decided_by · decided_at · reason · client_mutation_id`.
     Giới hạn ADR-031 ghi thẳng và màn hình không được nói khác: sổ vết trả lời "ai đổi,
     lúc nào, vì sao", **không** trả lời "phụ huynh đã đọc bản nào".
  3. `clientMutationId` **nay được lưu** (`0054` có cột + unique một phần
     `(student_id, week_start, client_mutation_id)`), nên gửi lại cùng mã là cùng một
     quyết định trên CẢ HAI đường. Trước `0054` trường này nhận vào mà không có chỗ ghi:
     chống trùng chỉ dựa vào khoá `(student_id, week_start)` + điều kiện "chỉ ghi lên dòng
     chưa ai quyết" — đủ cho đường mặc định, nhưng đường ghi đè thì không còn điều kiện
     trạng thái nào để chặn lượt thứ hai. Đó là lý do `0054` phải có mặt trước đường sửa.

- **Kết luận cho check-in gửi muộn** (migration `0053`, ADR-029): `LATE_DECISIONS`,
  `LateDecision`, `LATE_DECISION_LABEL`, `DecideLateCheckinsInput`, `DecideLateCheckinsOutput`;
  `PendingLateCheckin` thêm field `occurredAtTime`.

  **Vì sao vibe team cần biết:** buồng lái GVCN trước đây chỉ có đúng một nút "Xác nhận cả N"
  — tức chỉ có một kết luận duy nhất (`present`) cho mọi dòng gửi muộn, không giờ gửi, không
  chọn từng em, không chỗ ghi vì sao. Nay cô chọn được từng dòng và ghi một trong ba kết luận
  `present` · `late` · `absent`, **bắt buộc kèm lý do** khi kết luận khác `present`, và mỗi
  lượt ghi để lại một dòng trong `attendance.late_decisions`.

  `absent` là quyền MỚI của GVCN và nó sửa ADR-007 — đọc ADR-029 trước khi dựng màn nào chạm
  tới trạng thái điểm danh.

### Deprecated

- `ApproveReportInput` / `ApproveReportOutput` và thủ tục `care.approveReport` (06/08/2026):
  vẫn chạy nguyên hành vi cũ cho client cũ (PWA đã cài trên máy thầy cô còn gọi tên này).
  Client mới chuyển sang `care.decideReports` — kể cả khi chỉ chọn một em, để có một đường
  ghi duy nhất. Sẽ gỡ ở phiên bản kế tiếp theo luật expand–contract.

  **Một khác biệt hành vi phải biết trước khi chuyển:** `approveReport` ghi đè lên quyết
  định đã có mà **không hỏi và không để lại vết** (nó là upsert trần theo `(student_id,
  week_start)`, viết trước ADR-031). `decideReports` làm được cùng việc đó nhưng bắt khai
  `ghiDeQuyetDinhDaCo: true` + lý do, và ghi một dòng `report.report_decisions`. Đây chính
  là lý do `approveReport` phải gỡ chứ không phải "cũng được": nó là đường ghi đè duy nhất
  còn lại không ai soát được.

- `AcknowledgeLateInput` và thủ tục `care.acknowledgeLate`: vẫn chạy, là lối tắt của
  `decideLateCheckins({ decision: "present" })`. Client chuyển sang thủ tục mới; sẽ gỡ ở
  phiên bản kế tiếp theo luật expand–contract.

- **Sổ đăng ký Mini App** (migration `0052`, ADR-015 mục 5): `MiniAppRow`, `ListMiniAppsOutput`,
  `CreateMiniAppInput`, `UpdateMiniAppInput`, `SetMiniAppEnabledInput`, `MiniAppMutationOutput`,
  cùng ba kiểu nền `MiniAppId`, `MiniAppOrigin`, `MiniAppBasket`, `MiniAppRole`.

  **Vì sao vibe team cần biết:** từ đây thêm một Mini App ngoài KHÔNG còn phải sửa mã lõi.
  Trước 02/08/2026 danh sách app nằm trong `apps/hub/server/embed/registry.ts` — một mảng
  TypeScript, nên mỗi lần cắm app là một lần chờ dev lõi sửa file, build, deploy. Nay khai
  qua màn `/quan-tri/mini-app`, và nguồn sự thật là bảng `core.embedded_apps`.

  **Ba chỗ dễ hiểu nhầm, đọc trước khi dùng:**

  1. `MiniAppBasket` chỉ có **hai** giá trị (`xanh`, `vang`). Rổ Đỏ không phải là "giá trị
     chưa hỗ trợ" — nó là trạng thái không biểu diễn được, ở cả contract lẫn CHECK của bảng.
  2. Contract **không** có trường chứa secret webhook. `webhookSecretEnv` là TÊN biến môi
     trường; giá trị không bao giờ vào database (bản sao lưu database đi ra khỏi máy chủ).
     Muốn biết "app này đã cấp secret chưa" thì đọc `daCapSecret` — boolean do máy chủ tính.
  3. `CreateMiniAppInput` **không** có `enabled`. App mới luôn tắt. Bật là một quyết định
     riêng (`setEnabled`), không gộp vào lần khai.


- **`SubmitMoodOutput.moodSaved` + `SubmitMoodOutput.moodBlockedReason`** (migration `0047`,
  ADR-027 bản 2) — máy chủ nay có thể nhận một lượt check-in mà **không** nhận mức tâm trạng:
  nhà em chưa có phiếu đồng ý của người đại diện thì RLS của `attendance.checkins` từ chối giá
  trị `mood`, còn lượt điểm danh vẫn ghi bình thường.

  **Đọc kỹ, đây là chỗ client cũ nói dối mà không lỗi:** procedure vẫn trả `2xx` và vẫn có
  `checkinId`. Màn hình nào không đọc `moodSaved` sẽ in "Con đã ghi: Vui" cho một giá trị không
  nằm trong kho — đúng con lỗi "câu ĐÃ GỬI in ra khi không ghi được gì" mà `checkin.requestHelp`
  đã phải sửa một lần. `moodBlockedReason` là chuỗi có tên (`"chua_co_phieu_dong_y"`) chứ không
  phải một `false` trơn, để lần sau thêm nhánh thì màn hình không phải đoán.

- **`ConsentChildStatus.moodEnabled` + `RecordConsentResult.moodEnabled`** (`0047`) — thứ cú bấm
  của phụ huynh THẬT SỰ điều khiển. Trước `0047` màn hình đọc `accountStatus` để suy ra hậu quả;
  cách đó nay SAI: `accountStatus` là trạng thái **danh tính**, và phiếu đồng ý không còn chạm
  vào nó (khoá tài khoản của một đứa trẻ là khoá luôn nút "Mình cần gặp thầy cô" của chính em —
  đo đầu-cuối 01/08/2026). `moodEnabled` hỏi theo ĐỨA TRẺ (`core.has_student_consent`), nên nhà
  có hai người đại diện mà người kia đã bấm thì nó `true` dù `needsAction` vẫn `true`.

- **`contracts/consent.ts`** — bề mặt của router `consent` (màn điều khoản kèm nút đồng ý,
  migration `0046`, ADR-027): `ConsentDecision`, `StudentAccountStatus`, `TermsVersionOutput`,
  `ConsentChildStatus`, `ConsentGateOutput`, `RecordConsentInput`, `RecordConsentResult`,
  `RecordConsentOutput`.

  Thuần THÊM, không field nào của bản 0.2.0 đổi hình dạng — nên không tăng `CONTRACTS_VERSION`
  ở đây mà ghi vào `Unreleased`: bản 0.2.0 vừa phát hành hôm nay và ba gói việc đang chạy song
  song cùng chạm thư mục này; ai tăng số trước cũng ép hai gói kia phải sửa theo, mà không gói
  nào thật sự phá tương thích.

  Hai chỗ vibe team dễ đọc nhầm, nói trước:

  - **`ConsentChildStatus.decision = null` KHÁC `"withdrawn"`.** `null` là "chưa từng bấm gì
    cho em này"; `"withdrawn"` là "đã bấm rồi rút lại". Gộp hai thứ đó trên màn hình là nói với
    một phụ huynh vừa rút lại rằng họ chưa làm gì.
  - **`StudentAccountStatus` có `no_account`**, và đó là trạng thái PHỔ BIẾN chứ không phải ca
    hiếm: đo trên hub_dev ngày 01/08/2026, 63/64 học sinh chưa có tài khoản đăng nhập. Hiện nó
    thành "tài khoản đang chờ" là nói sai — em không có tài khoản nào để chờ cả.

## [0.2.0] - 2026-08-01

Ba quyết định của chủ đầu tư ngày 01/08/2026 chạm tới bề mặt hợp đồng. Đây là bản **PHÁ
VỠ** đầu tiên của `@hub/core/contracts` — đọc kỹ mục `Removed` trước khi cập nhật client.

### Removed

- **`GetDashboardOutput.moodDistribution`**, **`ClassRosterEntry.mood`**,
  **`StudentCheckinDay.mood`**, và schema **`MoodBucket`** — [QĐ-1] / ADR-026: giáo viên
  chủ nhiệm không còn đọc được nhật ký cảm xúc từng ngày của học sinh. Tầng dữ liệu đã
  cắt ở migration `0044` (`core.can_read_mood()` = `is_me ∨ in_my_cluster`); ba field này
  là đường còn lại ở tầng hợp đồng.

  **Vì sao GỠ HẲN chứ không giữ field rồi luôn trả `null`/`[]`** — và đây là chỗ bản này
  cố ý đi lệch nhịp expand–contract, nên phải giải thích chứ không lặng lẽ làm: cả ba
  field đều đã có `null`/rỗng mang một nghĩa CÓ SẴN. `ClassRosterEntry.mood = null` nghĩa
  là "em chưa chọn tâm trạng hôm nay"; `moodDistribution = []` nghĩa là "chưa em nào
  chọn". Giữ field rồi luôn trả giá trị đó là dạy client đọc "không được phép biết" thành
  "không có gì" — đúng loại nói dối mà cả hệ này chống, và tệ hơn hẳn một lỗi biên dịch.
  Một field biến mất thì `tsc` kêu ngay lúc build; một field luôn trả `null` thì không ai
  biết cho tới lúc một giáo viên đọc sai về một đứa trẻ.

  Không có client nào đã phát hành (chưa lên CH Play/App Store), nên cái giá thật của
  việc bỏ nhịp Deprecated ở đây bằng không.

- **`AcknowledgeHelpRequestInput.requestedOn`** — thay bằng `helpRequestIds`. Xem
  `Changed` bên dưới.

- **`AcknowledgeHelpRequestOutput.updated`** — thay bằng bốn con số. Xem `Changed`.

- **`contracts/checkin.ts` không còn khai `CONTRACTS_VERSION`.** Bản sao cũ đó đã bị
  `index.ts` che từ lâu (export tường minh thắng export sao), nên giá trị lọt ra ngoài
  KHÔNG đổi và không client nào gãy. Gỡ ở đây vì `contracts-lint` chuyển từ cảnh báo
  sang chặn ngay khi hai số lệch nhau — và lần tăng lên 0.2.0 này là lần đầu chúng lệch.

### Changed

- **`AcknowledgeHelpRequestInput`: `{ studentId, requestedOn }` → `{ studentId,
  helpRequestIds: uuid[] }`.** Sửa một lỗi ĐANG SỐNG, tái hiện được trên hub_dev:
  buồng lái gửi `requestedOn = flag.asOfDate`, mà `asOfDate` cũ là `greatest(ngày
  check-in gần nhất, ngày yêu cầu treo gần nhất)`. Em có hai yêu cầu treo (31/07 và
  01/08) và một buổi sáng 01/08 vui vẻ: cú bấm đầu tắt dòng 01/08, rồi ngày check-in che
  mất ngày của yêu cầu còn lại, nên mọi cú bấm sau khớp 0 dòng — cờ khẩn KHÔNG TẮT ĐƯỢC
  từ buồng lái, sống tới hết cửa sổ 14 ngày. `attendance.help_requests` đã có khoá chính
  `id uuid` từ đầu; bản cũ không dùng.

  **Luôn gửi tập id ĐANG HIỆN TRÊN MÀN**, đừng gửi "đóng hết yêu cầu treo của em": màn
  hình có thể đang vẽ trạng thái của mười phút trước, và đóng hết sẽ nuốt luôn lời em vừa
  gửi mà chưa ai đọc — rồi em nhận dấu "cô đã gặp em rồi" cho lời đó.

- **`AcknowledgeHelpRequestOutput`: `{ updated, alreadyHandled: boolean }` → `{
  justHandled, alreadyHandled, notFound, remainingOpen, handledByMe, handledByName,
  handledAt }`.** `alreadyHandled` cũ là một boolean gộp ít nhất bốn nguyên nhân khác hẳn
  nhau, và hai màn đang in cùng một câu ("Người khác đã xử lý trước rồi.") cho cả bốn.
  `alreadyHandled` nay là một SỐ, không phải boolean — client cũ đọc nó như boolean sẽ
  thấy `0` là falsy và `N` là truthy, tình cờ đúng, nhưng đừng dựa vào.

- **`FlagSummary.detail`: `z.record(z.unknown())` → `FlagDetail` (schema đóng).** Bản cũ
  chở `negativeDays`, `negativeDaysInWindow`, `negativeStreak`, `mode`, `threshold` —
  tức số ngày em có tâm trạng xấu, đi thẳng ra trình duyệt của giáo viên chủ nhiệm.
  DESIGN-GUIDELINES §9 cấm ba thứ ở phía GVCN vì cả ba nói nhiều hơn "cần để ý": chiều
  của cảm xúc, SỐ NGÀY, và mọi trích dẫn từ ô nhập của em — **cắt tại contract, không
  chỉ ẩn bằng CSS**. `FlagDetail` nay có đúng ba khoá: `cadence`, `openHelpRequests`,
  `recentlyHandled`.

- **`ReportApprovalRow.happyDays`: `number` → `number | null`.** Số ngày "Vui" đọc từ cột
  cảm xúc, nên với GVCN nó là `null`. Không để rơi xuống `0`: `0` ở đây là lời nói dối
  thay cho "không được phép biết", và là loại tệ nhất vì trông giống hệt một phép đo —
  cô sẽ đọc "tuần này em không có ngày nào vui" về một em có thể vui cả tuần.

### Added

- **`FlagCadence` + `FlagDetail.cadence`** ([QĐ-2], VIỆC 4). Buồng lái GVCN trộn HAI nhịp
  trong cùng một danh sách: `tuc_thi` (E_URGENT tính thẳng từ `attendance.help_requests`
  ngay trong lượt gọi — đo đường đầy đủ qua HTTP: 195 ms ghi + 226 ms đọc) và `quet_dem`
  (E_MOOD do `care.run_flag_engine` sinh theo lượt quét). **Màn hình BẮT BUỘC nói ra nhịp
  của từng thẻ.** Chỗ nguy hiểm nhất là chiều VẮNG MẶT: không có cờ khẩn nghĩa là "chưa em
  nào bấm", còn không có cờ cảm xúc có thể chỉ nghĩa là "bộ quét chưa chạy".

- **`OpenHelpRequest`** + `FlagDetail.openHelpRequests`, **`StudentHelpRequest.helpRequestId`**,
  **`ClusterHelpSignal.helpRequestId`** — khoá chính thật đi ra tới màn hình. Dùng nó làm
  khoá React thay cho `requestedOn`: khoá tự nhiên chỉ hợp lệ nhờ
  `unique(student_id, requested_on)` và sẽ gãy im lặng khi bảng cho phép hai yêu cầu một ngày.

- **`MoodVisibility`** + `GetDashboardOutput.moodVisibility`. Bỏ một ô khỏi màn hình rồi
  im lặng cũng là một cách nói dối — nó để người dùng tự dựng lấy một lời giải thích sai
  ("màn hình hỏng"). Máy chủ phát ra mã lý do, màn hình chọn câu chữ, không tự suy.

- **`GetDashboardOutput.totals.notCheckedInCount`** ([QĐ-3]). Thẻ "Vắng" đếm
  `status = 'absent'`, nên buổi sáng chưa ai điểm danh thì nó bằng 0 và phụ đề in "không
  có ai vắng". "Chưa ai ghi gì" và "đã ghi và không ai vắng" là hai sự thật khác nhau.

- **`ClassRosterEntry.source`** và ý nghĩa mới của `checkedInAt`. `checkedInAt` nay là
  `"HH:MM"` **chỉ khi `source = 'app'`**. Trước đó câu SQL trả `occurred_at::text` thô
  (gọi thật qua HTTP: `"2026-08-01 00:41:49.075267+07"`), trong khi contract đã hứa "null
  khi dòng do cô ghi hộ" — mà cột là `not null default now()` nên không bao giờ null: dòng
  cô đánh vắng cho một ngày cách đây 30 hôm vẫn mang "giờ check-in" là 3 giờ sáng nay.

- **`ATTENDANCE_STATUS_ICON`, `ATTENDANCE_UNKNOWN_LABEL`, `ATTENDANCE_UNKNOWN_ICON`**
  ([QĐ-3]). Một bảng icon cho MỌI màn. Trước đó lịch trong hồ sơ học sinh gộp `late` và
  `queued_late` vào cùng icon `schedule`, và để `present`/`excused` không có icon nào —
  nên ngày cô ghi "có mặt" vẽ y hệt ngày chưa ai ghi gì.

- **`ARRIVAL_BAND_UNAVAILABLE_NOTE`** ([QĐ-3]). [QĐ-3] đòi năm trạng thái, trong đó có
  "đi sớm". Bốn trạng thái có chỗ chứa thật; "đi sớm" thì **không**:
  `attendance.resolve_checkin` không đọc `opens_at` ở bất kỳ nhánh nào (đo trên hub_dev
  trong giao dịch đã rollback, luật tạm 06:45–07:30: 05:30 → present · 07:29 → present ·
  07:31 → late), cột duy nhất tách được là `occurred_at` — mà nó là giờ máy chủ nhận lượt
  bấm — và `attendance.checkin_rules` hôm nay có 0 dòng. Nên màn hình hiện GIỜ THẬT và
  nói thẳng chỗ hụt, thay vì bịa một giá trị thứ sáu trong `status`.

- **`ReportPreview.glowIncomplete`.** Bản xem trước của GVCN có thể thiếu một mục Glow so
  với bản phụ huynh đọc (mục "tâm trạng vui vẻ" dựng từ số ngày Vui). Để nó lặng lẽ biến
  mất là quay lại đúng thứ màn duyệt sinh ra để chữa: ký một bản khác bản người khác đọc.

### Changed

- **Dạng dấu mốc của BẢN CHỤP đổi, bề mặt hợp đồng KHÔNG đổi** (01/08/2026). Bản chụp
  trong `version.ts` đánh dấu bốn loại mục bằng nháy nhọn — `"function"`, `"type"`,
  `"enum"`, `"extends"`, `"expr"`. Chủ đầu tư bỏ hẳn kiểu nháy đó khỏi sản phẩm, nên dấu
  mốc chuyển sang ASCII: `#function#`, `#type#`, `#enum#`, `#extends#`, `#expr#`.

  Đọc kỹ chỗ này nếu bạn xem `git diff` của `version.ts` và thấy bản chụp bị viết lại
  TOÀN BỘ: đó là do đổi dấu mốc, không phải do 83 tên xuất khẩu bị xoá rồi thêm lại. Con
  số 83 trước và sau bằng nhau, đã đối chiếu. Dấu mốc mới giữ đúng tính chất khiến người
  viết chọn nháy nhọn lúc đầu — `#` không bao giờ xuất hiện trong tên kiểu TypeScript nên
  không thể lẫn với nội dung thật.

  Bài học kèm theo, ghi để đừng lặp lại: một lượt thay thế ký tự hàng loạt chạy qua cả
  kho mã đã sửa luôn hai thứ KHÔNG phải là văn bản — dấu mốc dữ liệu ở đây, và một biểu
  thức chính quy trong `tools/check-html.mjs`. Cả hai đều gãy thành tiếng ngay (một lỗi
  cú pháp, một cổng báo 8730 lỗi), nên không có gì lọt âm thầm; nhưng lần sau, chỗ nào
  dùng ký tự lạ làm DẤU MỐC thì viết bằng mã thoát Unicode trong biểu thức, đừng viết ký tự thẳng.

### Added

- Gói `debt-32-buong-lai-doc-care-flags` (01/08/2026) — `SkippedRule`, `ScanState`,
  `ScanHealth`, và field `GetDashboardOutput.scanHealth`. Chỉ THÊM: `lastScanAt` giữ
  nguyên kiểu, nguyên nghĩa và nguyên giá trị, nên client cũ không gãy một dòng nào.

  Vì sao thêm chứ không sửa `lastScanAt` cho gọn: `string | null` gộp làm một BA câu trả
  lời khác hẳn nhau — "chưa ai quét lần nào", "bộ quét vừa hỏng", "màn hình không đọc nổi
  sổ nhật ký". Cả ba đều hiện ra dưới dạng một bảng cờ trống, mà bảng cờ trống thì đọc y
  hệt "lớp mình đang ổn" (RULES Rev F điều 8). `ScanHealth.state` có chín giá trị: bảy giá
  trị của `ops.v_job_health` (migration 0041) cộng hai giá trị chỉ tầng API biết —
  `chua_khai` (sổ lịch chưa có dòng nào cho bộ quét) và `khong_doc_duoc` (câu đọc ném lỗi).

  Ghi chú cho vibe team — ba chỗ dễ dùng sai:
  1. **`state = 'ok'` KHÔNG có nghĩa "quét hôm nay".** Nhịp đã khai là 24 giờ + dung sai
     6 giờ, nên một lần quét lúc 23:40 hôm qua vẫn là `ok`. Muốn biết số trên màn có phải
     của hôm nay không thì so `lastSuccessAt` với `asOfDate` — `scanBannerPresentation`
     trong `apps/hub/components/gvcn/scan-status.ts` đã làm sẵn, dùng lại đừng viết lại.
  2. **Đừng viết ngưỡng "trễ quá 26 giờ" vào UI.** Ngưỡng nằm ở `ops.job_schedule`
     (`expected_every` + `grace`) và đã thành `state`; `expectedEveryHours`/`graceHours`
     đi ra chỉ để VIẾT CÂU ("phải chạy mỗi 24 giờ"), không phải để tính lại kết luận.
  3. **`degradedSources` ≠ `staleSources`.** Cái trước là nguồn mà LẦN QUÉT ĐÓ đã bỏ qua
     (thuộc về những cái cờ đang hiện); cái sau là nguồn đang quá hạn tươi NGAY LÚC NÀY.
     Trộn hai cái là mất khả năng trả lời "mấy cái cờ tôi đang nhìn có thiếu nguồn không".

- Gói `man-hinh-tam-ly-cum` (31/07/2026) — hợp đồng cho **hai màn hình của tâm lý cụm**
  trong `contracts/care.ts`. Chỉ THÊM, không đổi và không xoá field nào đang có:
  - Hộp việc của cụm: `ClusterSchool`, `ClusterCaseRow`, `ListClusterCasesInput`,
    `ListClusterCasesOutput`.
  - Hồ sơ một em: `ClusterHelpSignal`, `CounselorNote`, `GetClusterCaseDetailInput`,
    `GetClusterCaseDetailOutput`.

  Ghi chú cho vibe team — hai chỗ dễ dùng sai:
  1. `ClusterHelpSignal` **KHÔNG có `note`**, khác `StudentHelpRequest` (màn GVCN) đúng ở
     field đó. Cố ý: màn `/can-gap-thay-co` in cho học sinh đọc rằng chỉ GVCN của em thấy
     lời em viết, và phòng tâm lý chỉ đọc sau một lần chuyển tuyến em đã đồng ý — đường
     chuyển tuyến đó chưa tồn tại. Đừng "hợp nhất hai schema cho gọn".
  2. `ClusterCaseRow.daysSinceLastAction = null` nghĩa là **chưa ai ghi hành động nào**,
     KHÔNG phải 0 ngày. Vẽ nó thành "0" là suy tin tốt từ im lặng (RULES Rev F điều 8).

- (do gói việc `care` sở hữu `contracts/care.ts` thêm, ghi lại ở đây để **bản chụp bề mặt và
  sổ này không lệch nhau**): `LogInterventionOutput`, `AcknowledgeHelpRequestInput`,
  `AcknowledgeHelpRequestOutput`, `CloseCaseInput`, `CloseCaseOutput`,
  `LogInterventionInput.clientMutationId` — mutation của buồng lái GVCN. Chủ sở hữu file đó
  bổ sung mô tả chi tiết khi chốt.
- Gói `gvcn-man-hinh` (31/07/2026) — hợp đồng cho **bốn màn hình GVCN** trong `contracts/care.ts`.
  Chỉ THÊM, không đổi và không xoá field nào đang có, nên client cũ không gãy:
  - Danh sách lớp: `HomeroomClass`, `GetMyClassesOutput`, `GetClassRosterInput`,
    `ClassRosterEntry`, `GetClassRosterOutput`.
  - Điểm danh lớp: `AttendanceStatus`, `TeacherAttendanceStatus` (hẹp hơn một giá trị —
    `queued_late` là trạng thái của máy, người không ghi tay), `ATTENDANCE_STATUS_LABEL`,
    `MarkAttendanceInput`, `MarkAttendanceOutput`.
  - Duyệt Báo cáo Trưởng thành: `ReportApprovalStatus`, `ListReportApprovalsInput`,
    `ReportApprovalRow`, `ListReportApprovalsOutput`, `ApproveReportInput`, `ApproveReportOutput`.
  - Ghi chú can thiệp: `ListClassInterventionsInput`, `ClassInterventionRow`,
    `ListClassInterventionsOutput`.

  Ghi chú cho vibe team: `ClassRosterEntry.status = null` nghĩa là **chưa ai điểm danh em đó**,
  KHÔNG phải "vắng" — đừng vẽ nó thành nhãn vắng (RULES Rev F điều 8).

- Gói `cong-duyet-bao-cao` (31/07/2026) — `ReportPreview` và `ReportApprovalRow.preview`
  trong `contracts/care.ts`. Chỉ THÊM, client cũ không gãy.

  `care.listReportApprovals` trước đây chỉ trả hai con số vận hành (`checkinDays`,
  `happyDays`), nên màn "Duyệt báo cáo" mời GVCN bấm **"Duyệt gửi phụ huynh"** trên một
  văn bản cô chưa từng nhìn thấy. `preview` là **nguyên văn thứ phụ huynh sẽ đọc**:
  `headline`, `glow` (dùng lại `GlowItem` của `contracts/report.ts`), `grow` (tối đa 1,
  giống `GetGrowthReportOutput.grow`), `streakDays`.

  Ghi chú cho vibe team: `preview` viết bằng **giọng "Glow & Grow"** của phụ huynh
  (DESIGN-GUIDELINES §8) dù nó hiện trên màn hình giáo viên — đừng trộn từ vựng vận hành
  (cờ / ngưỡng / leo thang) vào khối này, và **đừng gấp nó lại sau một nút "Xem trước"**:
  gấp được nghĩa là duyệt được mà không đọc, tức là quay lại đúng lỗi vừa sửa.
  `preview` KHÔNG chứa tín hiệu "cần gặp thầy cô" — đó là tín hiệu chăm sóc, không phải
  thành tích kể với phụ huynh (mệnh lệnh 4, CLAUDE.md).

- Gói `man-hinh-con-thieu-gvcn-hs` (31/07/2026) — hợp đồng cho **màn hồ sơ MỘT học sinh**
  của GVCN, trong `contracts/care.ts`. Chỉ THÊM, không đổi và không xoá field nào đang có:
  `GetStudentDetailInput`, `StudentCheckinDay`, `StudentHelpRequest`, `StudentCareCase`,
  `StudentReportApproval`, `GetStudentDetailOutput`.

  Ba ghi chú cho vibe team, cả ba đều là ràng buộc chứ không phải gợi ý:

  1. `checkins` CHỈ chứa ngày **có** dòng check-in. Ngày không có thì **không có phần tử
     nào** trong mảng — đừng "sửa cho tiện" thành 14 hàng với `status: null`. Một hàng có
     mặt trong mảng trông như một sự thật đã ghi nhận, mà "chưa ai ghi gì" thì không phải
     (RULES Rev F điều 8). Màn hình tự dựng lưới ngày từ `window` rồi vẽ ô trống là *chưa
     có dữ liệu* — không phải "vắng", cũng không phải "ổn".
  2. `StudentHelpRequest.note` là **lời riêng em viết cho thầy cô chủ nhiệm**. Nó chỉ ra
     khỏi CSDL qua đúng một procedure (`care.getStudentDetail`, `homeroomProcedure` + đối
     chiếu em thuộc lớp mình chủ nhiệm). Không sao chép sang `care.flags.detail` (luật "cờ
     E gọn" — cờ chỉ ghi LOẠI tín hiệu), không đưa vào báo cáo phụ huynh (§5), không hiện
     ở màn tâm lý cụm.
  3. `StudentHelpRequest.handledAt = null` nghĩa là **chưa ai bấm nút "đã gặp em rồi"** —
     KHÔNG có nghĩa "chưa ai đọc". Đừng vẽ nó thành câu kết luận về người lớn.

  Kèm theo (không có contract vì trả plain object, giống `checkin.getTodayStatus`):
  `checkin.getMyHelpRequests` — em tự xem trạng thái lời mình đã gửi. Cố ý trả **chỉ
  trạng thái**: `requestedOn`, `requestedAtTime`, `acknowledged`, `acknowledgedOn`,
  `acknowledgedAtTime`. Không `topic`, không `urgency`, không `note`.

- Gói `gvcn-nhieu-lop` (31/07/2026) — `care.getDashboard` **thôi cố định ở một lớp**, trong
  `contracts/care.ts`: thêm `GetDashboardInput` (`{ classId? }`, cả object là `.optional()`)
  và thêm `GetDashboardOutput.classId`. Chỉ THÊM, không xoá và không siết field nào đang có
  — `care.getDashboard()` gọi không tham số vẫn hợp lệ, nên client cũ và `home-view` prefetch
  không gãy.

  Vì sao: buồng lái trước đây lấy `ctx.homeroomClassId`, tức phần tử đầu của
  `core.v_my_scopes` — một SELECT **không** ORDER BY. Một cô chủ nhiệm hai lớp (chuyện bình
  thường ở trường liên cấp) chỉ thấy lớp một, màn hình không nói đang xem lớp nào, và "lớp
  một" đó không cố định giữa hai lần tải. Bốn màn con `/gvcn/*` đã có bộ chọn lớp và mặc
  định lấy lớp đầu **theo mã lớp** (`getMyClasses` sắp `order by c.code`), nên buồng lái và
  bốn màn con có thể mở hai lớp khác nhau trong cùng một phiên.

  Hai ghi chú cho vibe team, cả hai là ràng buộc:

  1. `classId` để trống KHÔNG có nghĩa "lớp bất kỳ": máy chủ chọn lớp đầu **theo mã lớp**,
     đúng thứ tự `GetMyClassesOutput` trả về. Dùng chung `useSelectedClass`
     (`components/gvcn/class-picker.tsx`) là cách duy nhất bảo đảm mọi màn GVCN mở cùng một
     lớp mặc định — đừng tự viết lại phép chọn lớp đầu ở màn mới.
  2. `GetDashboardOutput.classId` là **lớp mà mọi con số trong output thuộc về**. Màn hình
     nào hiện `totals` / `moodDistribution` / `priorityFlags` thì phải hiện kèm lớp đang
     xem — một con số không nói rõ của lớp nào là một con số dùng được mà sai. Đừng suy lớp
     từ `className`: mã lớp trùng nhau giữa hai cơ sở là chuyện có thật.

## [0.1.0] — 31/07/2026

Phiên bản đầu tiên được **đánh số thật**. Trước mốc này chuỗi `0.1.0` có tồn tại trong
`contracts/checkin.ts` nhưng không nơi nào đọc, không changelog, không cổng kiểm — tức là
DEBT #13 vẫn nguyên vẹn. Bản này trả nợ đó và vá các procedure trả dữ liệu không có hợp đồng
output (`03-api.md` luật 3: *mọi input/output khai báo trong `packages/core/contracts/`*).

### Added

- `contracts/version.ts`: `CONTRACTS_VERSION`, `MIN_SUPPORTED_CONTRACTS_VERSION`,
  `CONTRACTS_VERSION_HEADER` (`x-contracts-version`), `ContractsMetaOutput`,
  `parseSemver`, `compareContractsVersions`, `isContractsVersionSupported`.
  Ba lớp cưỡng chế: lint lúc CI · changelog lúc đọc · header lúc chạy.
- `contracts/report.ts`: `IsoDateString`, `ReportWeekStart`, `GetReportForWeekInput` —
  thay cho `z.object({ weekStart: z.string() })` khai trực tiếp trong router.
- `contracts/report.ts`: `GetWeeklyReportOutput` — vỏ ngoài `{ studentId, weekStart, report }`
  mà `report.getMyLatestReport` và `report.getReportForWeek` cùng trả.
- `contracts/report.ts`: `GuardianContact`, `GuardianListOutput` cho `report.getMyGuardians`.
- `contracts/auth.ts`: `MiniAppsOutput` cho `session.miniApps`, `SessionMeOutput` cho `session.me`.
- `tools/contracts-lint.mjs` + bản chụp bề mặt hợp đồng trong `version.ts`.

### Changed

- `GetGrowthReportInput.weekStart`: `z.string()` → `ReportWeekStart` (ISO `YYYY-MM-DD`, ngày
  có thật, không phải tuần tương lai xa). Siết kiểu nên client gửi chuỗi rác nay nhận
  `BAD_REQUEST` ở biên thay vì để Postgres ném `22007` rồi trả 500 — xem lý do đầy đủ trong
  chú thích cạnh `IsoDateString`.
- `contracts/index.ts`: `CONTRACTS_VERSION` nay xuất tường minh từ `version.ts`, thắng bản
  cũ xuất qua `export *` từ `checkin.ts`. Giá trị không đổi (`0.1.0`), nên client không gãy.

### Deprecated

- `CONTRACTS_VERSION` khai trong `contracts/checkin.ts`: bản chính thức nằm ở
  `contracts/version.ts`. Bản cũ sẽ gỡ ở `0.2.0`; import từ `@hub/core/contracts` thì
  không phải làm gì.
- `GuardianContact.full_name` / `.relation` (snake_case): giữ nguyên vì đó là hình dạng
  đang chạy thật trên dây (`growth-report-view.tsx` đọc `g.full_name`). Kế hoạch
  expand–contract: `0.2.0` thêm `fullName`/`relationLabel` song song → client chuyển →
  `0.3.0` gỡ bản snake_case.
