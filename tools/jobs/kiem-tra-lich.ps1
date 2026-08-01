<#
.SYNOPSIS
  Soi lịch job nền: đã đăng ký chưa, chạy lần cuối lúc nào, kết quả gì (nợ #33).

.DESCRIPTION
  Trả lời đúng ba câu hỏi mà người trực cần hỏi mỗi sáng, và trả lời cả khi câu trả
  lời là "chưa biết gì":

    1. Task Scheduler có tác vụ nào gọi Hub không?  (chưa có ⇒ mọi thứ dưới đây vô nghĩa)
    2. Tác vụ đó chạy lần cuối lúc nào, kết quả gì? (cột Last Run Result)
    3. Trong cơ sở dữ liệu, các job đang ở trạng thái nào? (ops.v_job_health)

  Câu 3 KHÔNG được đọc thay câu 1 và 2. Đo được ngày 01/08/2026 trên hub_dev:
  ops.v_job_health báo flag_engine state='ok', last_success_at 13:05 "hôm nay" — trong
  khi 313 dòng job_runs của hai ngày đó do BỘ TEST sinh ra (vitest và pgTAP chạy trên
  chính hub_dev), không do một cái lịch nào. Buồng lái nói đúng theo sổ và sai theo vận
  hành. Nên: sổ chạy job chỉ là bằng chứng khi máy đó KHÔNG chạy test.

.PARAMETER TenTacVu
  Tên tác vụ chính. Mặc định HubJobs.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\jobs\kiem-tra-lich.ps1
#>
[CmdletBinding()]
param(
  [string] $TenTacVu = 'HubJobs'
)

$ErrorActionPreference = 'Continue'
$coViec = $false

$thuMuc = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ''
Write-Host 'SOI LỊCH JOB NỀN — Hub / Trường Việt Anh'
Write-Host '────────────────────────────────────────'

# ── 1 + 2. Tác vụ trên máy ────────────────────────────────────────────────────
Write-Host ''
Write-Host '1) Task Scheduler'
foreach ($ten in @($TenTacVu, "$TenTacVu-SoiSucKhoe")) {
  $raw = schtasks /Query /TN $ten /FO LIST /V 2>&1
  if ($LASTEXITCODE -ne 0) {
    if ($ten -eq $TenTacVu) {
      Write-Host "   $ten : CHƯA ĐĂNG KÝ" -ForegroundColor Red
      Write-Host '     Không có tác vụ này thì không ai gọi run-all.mjs, và lời hứa "xoá chi tiết'
      Write-Host '     cảm xúc sau 12 tháng" chưa được thi hành lần nào. Đăng ký bằng:'
      Write-Host "       powershell -ExecutionPolicy Bypass -File `"$(Join-Path $thuMuc 'dang-ky-lich.ps1')`""
      $coViec = $true
    } else {
      Write-Host "   $ten : chưa đăng ký (tuỳ chọn)" -ForegroundColor Yellow
    }
    continue
  }

  $lay = {
    param($mau)
    $d = $raw | Where-Object { $_ -match $mau } | Select-Object -First 1
    if ($d) { ($d -split ':', 2)[1].Trim() } else { '(không đọc được)' }
  }
  $lanCuoi = & $lay 'Last Run Time|Thời gian chạy lần cuối'
  $ketQua  = & $lay 'Last Result|Kết quả lần cuối'
  $lanToi  = & $lay 'Next Run Time|Thời gian chạy tiếp theo'

  Write-Host "   $ten"
  Write-Host "     chạy lần cuối : $lanCuoi"
  Write-Host "     mã kết quả    : $ketQua   (0 = xong · 1 = có job hỏng hoặc thiếu bộ chạy)"
  Write-Host "     lượt kế tiếp  : $lanToi"

  if ($ketQua -ne '0' -and $ketQua -notmatch '^\(') {
    Write-Host '     ! Mã khác 0 — đọc log để biết job nào hỏng.' -ForegroundColor Yellow
    $coViec = $true
  }
  # "Chưa chạy lần nào" của Task Scheduler in ra một mốc thời gian giả ở thế kỷ trước.
  # Đọc nó thành "đã chạy" là đúng cái lỗi im-lặng-thành-tin-tốt mà 0041 dựng đèn để chống.
  if ($lanCuoi -match '1999|N/A|Không') {
    Write-Host '     ! Tác vụ đã đăng ký nhưng CHƯA CHẠY LẦN NÀO.' -ForegroundColor Yellow
    Write-Host "       Chạy thử ngay: schtasks /Run /TN `"$ten`""
    $coViec = $true
  }
}

# ── 3. Sổ chạy job trong cơ sở dữ liệu ────────────────────────────────────────
Write-Host ''
Write-Host '2) Sức khoẻ job trong cơ sở dữ liệu (ops.v_job_health)'

$envFile = if ($env:HUB_ENV_FILE) { $env:HUB_ENV_FILE } else { 'C:\hub-secrets\hub.env' }
if (-not $env:DATABASE_URL) {
  if (Test-Path -LiteralPath $envFile) {
    foreach ($dong in Get-Content -LiteralPath $envFile) {
      if ($dong -match '^\s*#') { continue }
      $p = $dong -split '=', 2
      if ($p.Count -eq 2 -and $p[0].Trim()) {
        Set-Item -Path "env:$($p[0].Trim())" -Value $p[1].Trim()
      }
    }
  }
}
if (-not $env:DATABASE_URL) {
  Write-Host "   Không có DATABASE_URL (và không đọc được $envFile) — bỏ qua phần này." -ForegroundColor Yellow
  Write-Host '   KHÔNG được đọc điều đó thành "cơ sở dữ liệu vẫn ổn".' -ForegroundColor Yellow
  $coViec = $true
} else {
  $nodePath = if ($env:HUB_NODE) { $env:HUB_NODE } else { 'C:\Program Files\nodejs\node.exe' }
  $repo = Resolve-Path (Join-Path $thuMuc '..\..')
  Push-Location $repo
  & $nodePath 'tools/jobs/run-all.mjs' '--check'
  $maCheck = $LASTEXITCODE
  Pop-Location
  if ($maCheck -ne 0) { $coViec = $true }
}

Write-Host ''
if ($coViec) {
  Write-Host 'CÓ VIỆC CẦN NGƯỜI XỬ — xem các dòng đánh dấu ! ở trên.' -ForegroundColor Yellow
  exit 1
}
Write-Host 'Lịch đã cắm, đã chạy, và không job nào cần chú ý.' -ForegroundColor Green
exit 0
