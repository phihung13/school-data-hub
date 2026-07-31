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
  `happyDays`), nên màn "Duyệt báo cáo" mời GVCN bấm **«Duyệt gửi phụ huynh»** trên một
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
