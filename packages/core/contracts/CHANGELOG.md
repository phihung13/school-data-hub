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
