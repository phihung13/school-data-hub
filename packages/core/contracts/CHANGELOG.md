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

- (do gói việc `care` sở hữu `contracts/care.ts` thêm, ghi lại ở đây để **bản chụp bề mặt và
  sổ này không lệch nhau**): `LogInterventionOutput`, `AcknowledgeHelpRequestInput`,
  `AcknowledgeHelpRequestOutput`, `CloseCaseInput`, `CloseCaseOutput`,
  `LogInterventionInput.clientMutationId` — mutation của buồng lái GVCN. Chủ sở hữu file đó
  bổ sung mô tả chi tiết khi chốt.

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
