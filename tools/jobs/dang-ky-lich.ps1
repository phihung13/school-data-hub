<#
.SYNOPSIS
  Đăng ký lịch chạy job nền của Hub vào Task Scheduler của Windows (nợ #33).

.DESCRIPTION
  MẶC ĐỊNH SCRIPT NÀY KHÔNG ĐĂNG KÝ GÌ CẢ. Nó soát điều kiện, in ra đúng hai câu
  lệnh sẽ chạy, rồi dừng. Đăng ký một tác vụ hệ thống chạy bằng tài khoản SYSTEM là
  ĐỔI CẤU HÌNH MÁY của người khác — việc đó phải do người vận hành tự bấm, sau khi
  đọc câu lệnh bằng mắt mình.

  Muốn đăng ký thật thì thêm -XacNhan, trong PowerShell mở bằng quyền quản trị.

.PARAMETER Nhip
  Nhịp gọi bộ lịch. Mặc định HOURLY.
  Cắm DÀY, không thưa: run-all.mjs hỏi ops.job_due() trước mỗi job nên chạy mỗi giờ
  vẫn không làm job tháng chạy 720 lần. Đổi lại, một lần lỡ nhịp (máy tắt, mất mạng)
  được bù ở lượt kế tiếp thay vì phải đợi trọn một chu kỳ nữa.

.PARAMETER TenTacVu
  Tên tác vụ chính. Mặc định HubJobs.

.PARAMETER KhongSoiSucKhoe
  Bỏ tác vụ thứ hai (soi sức khoẻ mỗi sáng). Xem chú thích ở cuối file về việc vì sao
  tác vụ đó là một kênh báo động YẾU chứ không phải kênh báo động thật.

.PARAMETER XacNhan
  Thật sự gọi schtasks. Không có nó thì script chỉ in.

.EXAMPLE
  # Bước 1 — xem sẽ làm gì (không đổi gì trên máy)
  powershell -ExecutionPolicy Bypass -File tools\jobs\dang-ky-lich.ps1

  # Bước 2 — PowerShell QUYỀN QUẢN TRỊ, đăng ký thật
  powershell -ExecutionPolicy Bypass -File tools\jobs\dang-ky-lich.ps1 -XacNhan

  # Bước 3 — soi lại
  powershell -ExecutionPolicy Bypass -File tools\jobs\kiem-tra-lich.ps1
#>
[CmdletBinding()]
param(
  [ValidateSet('HOURLY', 'DAILY')]
  [string] $Nhip = 'HOURLY',
  [string] $TenTacVu = 'HubJobs',
  [switch] $KhongSoiSucKhoe,
  [switch] $XacNhan
)

$ErrorActionPreference = 'Stop'

$thuMuc  = Split-Path -Parent $MyInvocation.MyCommand.Path
$cmdFile = Join-Path $thuMuc 'run-all.cmd'
$tenSoi  = "$TenTacVu-SoiSucKhoe"

Write-Host ''
Write-Host 'ĐĂNG KÝ LỊCH CHẠY JOB NỀN — Hub / Trường Việt Anh'
Write-Host '─────────────────────────────────────────────────'
Write-Host ''

# ── Soát điều kiện TRƯỚC, kể cả khi chỉ in ─────────────────────────────────────
# Đăng ký một tác vụ trỏ vào một file không tồn tại là tự bật một dòng đỏ mỗi giờ.
$loi = @()

if (-not (Test-Path -LiteralPath $cmdFile)) {
  $loi += "Không thấy $cmdFile — script này phải nằm cùng thư mục với run-all.cmd."
}

$envFile = if ($env:HUB_ENV_FILE) { $env:HUB_ENV_FILE } else { 'C:\hub-secrets\hub.env' }
if (-not (Test-Path -LiteralPath $envFile)) {
  $loi += @"
Không thấy file env: $envFile
    Tạo nó NGOÀI kho mã nguồn, nội dung một dòng:
      DATABASE_URL=postgres://nguoi:matkhau@may:5432/hub
    Rồi siết quyền đọc về đúng SYSTEM và quản trị viên:
      icacls "$envFile" /inheritance:r /grant "SYSTEM:(R)" /grant "Administrators:(R)"
    Đặt trong kho là để secret-scan trở thành lớp phòng thủ duy nhất (§8, mệnh lệnh 8).
"@
}

$nodePath = if ($env:HUB_NODE) { $env:HUB_NODE } else { 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) {
  $loi += @"
Không thấy node: $nodePath
    Khai HUB_NODE trong file env trỏ tới node.exe đúng của máy này.
    Dùng đường dẫn TUYỆT ĐỐI: tác vụ chạy bằng tài khoản SYSTEM có PATH khác hẳn
    tài khoản người dùng đã cài node (bẫy nvm-per-user).
"@
}

if ($loi.Count -gt 0) {
  Write-Host 'CHƯA ĐỦ ĐIỀU KIỆN — chưa đăng ký gì:' -ForegroundColor Yellow
  foreach ($l in $loi) { Write-Host "  · $l" -ForegroundColor Yellow }
  Write-Host ''
  Write-Host 'Sửa xong rồi chạy lại script này.'
  exit 1
}

# ── Hai câu lệnh sẽ chạy ──────────────────────────────────────────────────────
# /RU SYSTEM  : chạy được cả khi không ai đăng nhập. Máy chủ của trường không có
#               người ngồi trước màn hình lúc 01:00 sáng.
# /RL HIGHEST : chạy ở mức toàn quyền, để việc ghi log vào thư mục kho không bị chặn.
# /F          : ghi đè nếu tác vụ trùng tên đã có — chạy lại script này là cập nhật,
#               không phải là lỗi (§9 ở tầng vận hành).
# Dấu nháy lồng \"...\" là bắt buộc: đường dẫn có khoảng trắng mà không bọc nháy thì
# schtasks cắt tại khoảng trắng và tác vụ trỏ vào một đường dẫn cụt.
$lenhChinh = "schtasks /Create /TN `"$TenTacVu`" /SC $Nhip /RU SYSTEM /RL HIGHEST /F /TR `"\`"$cmdFile\`"`""
$lenhSoi   = "schtasks /Create /TN `"$tenSoi`" /SC DAILY /ST 07:30 /RU SYSTEM /RL HIGHEST /F /TR `"\`"$cmdFile\`" --check`""

Write-Host "Tác vụ chính  : $TenTacVu  (nhịp $Nhip)"
Write-Host "  $lenhChinh"
Write-Host ''
if (-not $KhongSoiSucKhoe) {
  Write-Host "Tác vụ soi    : $tenSoi  (mỗi ngày 07:30, chỉ đọc)"
  Write-Host "  $lenhSoi"
  Write-Host ''
}

if (-not $XacNhan) {
  Write-Host 'CHƯA ĐĂNG KÝ GÌ CẢ.' -ForegroundColor Cyan
  Write-Host 'Đọc kỹ hai câu lệnh trên. Muốn đăng ký thật thì mở PowerShell QUYỀN QUẢN TRỊ và chạy lại:'
  Write-Host "  powershell -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`" -XacNhan"
  exit 0
}

# ── Đăng ký thật ──────────────────────────────────────────────────────────────
$laQuanTri = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
             ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $laQuanTri) {
  Write-Host 'Cần PowerShell mở bằng quyền quản trị để tạo tác vụ chạy bằng SYSTEM.' -ForegroundColor Red
  exit 1
}

Write-Host 'Đang đăng ký...'
cmd /c $lenhChinh
if ($LASTEXITCODE -ne 0) { Write-Host "schtasks thất bại (mã $LASTEXITCODE)." -ForegroundColor Red; exit 1 }

if (-not $KhongSoiSucKhoe) {
  cmd /c $lenhSoi
  if ($LASTEXITCODE -ne 0) { Write-Host "schtasks (soi sức khoẻ) thất bại (mã $LASTEXITCODE)." -ForegroundColor Red; exit 1 }
}

Write-Host ''
Write-Host 'XONG. Ba việc còn lại, làm ngay bây giờ chứ không để mai:' -ForegroundColor Green
Write-Host "  1. Chạy thử một lượt   : schtasks /Run /TN `"$TenTacVu`""
Write-Host "  2. Soi kết quả         : powershell -File `"$(Join-Path $thuMuc 'kiem-tra-lich.ps1')`""
Write-Host '  3. Đọc lại sau 2 chu kỳ: các job phải rời khỏi trạng thái chua_chay.'
Write-Host ''
Write-Host 'LƯU Ý VỀ TÁC VỤ SOI SỨC KHOẺ — đây là kênh báo động YẾU, không phải kênh thật:'
Write-Host '  nó chỉ đổi cột "Last Run Result" của Task Scheduler thành 1. Không ai ngồi'
Write-Host '  nhìn Task Scheduler. Kênh thật (gửi thư/Zalo cho người trực) chưa tồn tại —'
Write-Host '  ops.outbox_messages có bộ GHI mà chưa có bộ GỬI. Xem sổ nợ danh-cho-may/DEBT.md.'
