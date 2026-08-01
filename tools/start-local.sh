#!/usr/bin/env bash
# Bật lại toàn bộ môi trường chạy Hub trên máy dev, đúng thứ tự phụ thuộc.
#
# Vì sao cần script này: ba thứ giữ hệ thống sống — Postgres, Hub, đường hầm
# Cloudflare — đều là tiến trình rời, không cái nào tự khởi động lại. Ngày
# 31/07/2026 mất thời gian hai lần vì đúng chuyện đó: Docker tắt làm 22 test tự
# bỏ qua (bộ test vẫn báo xanh, không ai biết), rồi cloudflared tắt làm
# hub.truongvietanh.com trả lỗi 1033 trong khi Hub vẫn chạy bình thường.
#
# Đây là bản vá tạm cho máy dev. Bản thật là chuyển lên máy chủ có tự khởi động
# lại (ADR-018/019) — script này KHÔNG thay thế việc đó.
#
# Chạy: bash tools/start-local.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_CONTAINER="pg_hub"
DB_URL="postgres://postgres:postgres@localhost:5434/hub_dev"
HUB_URL="http://localhost:3000"
PUBLIC_URL="https://hub.truongvietanh.com"
CF_CONFIG="$HOME/.cloudflared/config.yml"

ok()   { echo "  ✓ $1"; }
warn() { echo "  ! $1"; }
fail() { echo "  ✗ $1"; }

# ── Kiểm môi trường TRƯỚC khi kiểm dịch vụ ──────────────────────────────────
# Vì sao bước này tồn tại: bản trước nuốt toàn bộ thông báo lỗi (`2>/dev/null`),
# nên "Postgres chết" và "không tìm thấy lệnh node" hiện ra y hệt nhau. Ngày
# 31/07/2026 script báo "Docker không phản hồi" ở máy người dùng trong khi Docker
# vẫn chạy — thật ra `bash` gọi từ cmd.exe là WSL bash, nơi không thấy node/docker
# của Windows. Chẩn đoán sai kiểu này tốn thời gian hơn hẳn lỗi gốc.
missing=""
for cmd in node docker curl; do
  command -v "$cmd" >/dev/null 2>&1 || missing="$missing $cmd"
done

if [ -n "$missing" ] && grep -qi microsoft /proc/version 2>/dev/null; then
  # Gõ `bash` trong cmd.exe trên máy này rơi vào WSL bash (C:\Windows\System32\bash.exe
  # đứng trước Git Bash trong PATH), nơi node/docker của Windows không tồn tại. Thay vì
  # bắt người dùng nhớ một đường dẫn dài, tự chuyển sang Git Bash rồi chạy lại chính mình.
  for gb in "/mnt/c/Program Files/Git/bin/bash.exe" "/mnt/c/Program Files (x86)/Git/bin/bash.exe"; do
    if [ -x "$gb" ]; then
      warn "đang ở WSL (không thấy:$missing) — tự chuyển sang Git Bash"
      # Đổi /mnt/c/... thành C:/... để Git Bash hiểu đường dẫn script.
      win_script="$(printf '%s' "${BASH_SOURCE[0]}" | sed 's|^/mnt/\([a-z]\)/|\1:/|')"
      exec "$gb" "$win_script" "$@"
    fi
  done
fi

if [ -n "$missing" ]; then
  fail "Shell này không thấy lệnh:$missing"
  echo
  echo "  Bạn đang chạy trong: $(uname -s 2>/dev/null || echo 'không rõ')"
  if grep -qi microsoft /proc/version 2>/dev/null; then
    echo "  → Đây là WSL và không tìm thấy Git Bash để chuyển sang."
    echo "     Cài Git for Windows, hoặc chạy script từ cửa sổ Git Bash."
  else
    echo "  → Cài thiếu, hoặc PATH của shell này không có chúng."
  fi
  exit 1
fi

# Chờ tới khi lệnh kiểm trả về thật, thay vì `sleep` một con số đoán bừa.
wait_for() {
  local label="$1" tries="$2"; shift 2
  for _ in $(seq 1 "$tries"); do
    if "$@" >/dev/null 2>&1; then ok "$label"; return 0; fi
    sleep 1
  done
  fail "$label — quá hạn chờ"
  return 1
}

# Cơ sở dữ liệu có nhận kết nối thật không — hỏi ĐÚNG thứ mình cần, bằng đúng
# đường mà ứng dụng đi. Không hỏi qua `docker`.
db_reachable() {
  # Chạy từ packages/core để `require("pg")` tự phân giải qua node_modules của
  # workspace đó — không ghim số phiên bản pg vào đường dẫn, và không truyền
  # đường dẫn tuyệt đối kiểu Git Bash (/c/Users/...) cho Node, thứ mà Node trên
  # Windows đọc thành C:\c\Users\... rồi báo không tìm thấy file (gặp thật 31/07/2026).
  ( cd "$ROOT/packages/core" && node -e '
      const pg = require("pg");
      const c = new pg.Client({ connectionString: process.argv[1], connectionTimeoutMillis: 3000 });
      c.connect().then(() => c.query("select 1")).then(() => c.end())
        .then(() => process.exit(0)).catch(() => process.exit(1));
    ' "$DB_URL" ) >/dev/null 2>&1
}

echo "── 1. Postgres (container $DB_CONTAINER)"
# Hỏi cơ sở dữ liệu TRƯỚC, hỏi Docker SAU. Bản đầu của script làm ngược lại và
# báo sai ngay lần chạy thật đầu tiên (31/07/2026): người dùng tắt tiến trình
# giao diện Docker Desktop, `docker info` không nối được daemon trong lúc nó khởi
# động lại, script kết luận "Docker chưa chạy" và dừng — trong khi container vẫn
# sống và Postgres vẫn trả lời bình thường. Đúng lỗi mà chính script này sinh ra
# để tránh: tin một tín hiệu gián tiếp thay vì hỏi thẳng thứ mình cần.
if db_reachable; then
  ok "đang chạy sẵn (nối thẳng được, không cần hỏi Docker)"
else
  # KHÔNG kết luận sau một lần hỏi. Docker Desktop mất 10–40 giây để dựng lại máy
  # ảo sau khi khởi động lại, và trong khoảng đó cả `docker info` lẫn cổng 5434
  # đều im. Bản trước hỏi đúng một lần rồi bảo người dùng "mở Docker Desktop" —
  # trong khi Docker đang mở dở và vài giây sau là xong (gặp thật 31/07/2026).
  warn "chưa nối được — chờ Docker dựng xong máy ảo (tối đa 60 giây)"
  if ! wait_for "Docker phản hồi" 60 docker info; then
    fail "Docker không phản hồi sau 60 giây."
    fail "Mở Docker Desktop, đợi biểu tượng hết quay, rồi chạy lại script này."
    exit 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    docker start "$DB_CONTAINER" >/dev/null 2>&1 || { fail "không start được $DB_CONTAINER"; exit 1; }
  fi
  wait_for "sẵn sàng nhận kết nối" 60 db_reachable || exit 1
fi

echo "── 2. Hub ($HUB_URL)"
if curl -sf -m 3 "$HUB_URL/login" >/dev/null 2>&1; then
  ok "đang chạy sẵn"
else
  # nohup + & : giữ tiến trình sống sau khi script thoát.
  ( cd "$ROOT/apps/hub" && nohup node server.mjs > "$ROOT/.hub.log" 2>&1 & )
  wait_for "trả 200 ở /login" 60 curl -sf -m 3 "$HUB_URL/login" || {
    fail "xem log: $ROOT/.hub.log"; exit 1;
  }
fi

# ── 2b. Trang có BẤM ĐƯỢC không, không chỉ có mở được ────────────────────────
#
# Vì sao có bước này: "trả 200 ở /login" là một phép kiểm XANH GIẢ, và nó đã lừa
# đúng hai lần trong ngày 01/08/2026. Next.js dựng trang ở máy chủ rồi gửi HTML
# đi — nên trang vẫn 200 và vẫn hiện đủ chữ KỂ CẢ KHI toàn bộ phần chạy trên máy
# người dùng không tải được. Lúc đó mọi nút trên màn là HTML chết: bấm không có
# gì xảy ra, console không một dòng lỗi, curl vẫn báo 200.
#
# Lần thứ hai nó xảy ra, người phát hiện là chủ đầu tư, bằng điện thoại, với đúng
# một câu "tôi không vào được". Đo lại thì `main-app.js` (điểm vào của React),
# `app-pages-internals.js` và `not-found.js` đều 404 vì thư mục .next bị dọn
# trong lúc máy chủ đang chạy. Chữa bằng cách tắt máy chủ, xoá .next, bật lại.
#
# Nên bước này KHÔNG hỏi "trang có mở không" mà hỏi "trang có sống không": lấy
# đúng danh sách <script src> mà trình duyệt sẽ tải, rồi thử từng tệp một. Thiếu
# một tệp là hỏng, dù trang trông vẫn bình thường.
echo "── 2b. Hub có bấm được không (không chỉ mở được)"
HTML_LOGIN="$(curl -sf -m 10 "$HUB_URL/login" 2>/dev/null || true)"
CHUNKS="$(printf '%s' "$HTML_LOGIN" | grep -oE '/_next/[^"]+\.js[^"]*' | sort -u)"
if [ -z "$CHUNKS" ]; then
  fail "không tìm thấy tệp JS nào trong trang đăng nhập — trang này không thể bấm được"
  fail "chữa: dừng Hub, xoá apps/hub/.next, chạy lại script này"
  exit 1
fi
CHET=""
for c in $CHUNKS; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$HUB_URL$c")"
  [ "$code" = "200" ] || CHET="$CHET\n     $code  $c"
done
if [ -n "$CHET" ]; then
  fail "trang mở được nhưng KHÔNG BẤM ĐƯỢC — thiếu tệp JS:"
  printf "$CHET\n"
  fail "chữa: dừng tiến trình nghe cổng 3000, xoá apps/hub/.next, chạy lại script này"
  exit 1
fi
ok "$(printf '%s' "$CHUNKS" | grep -c .) tệp JS đều tải được — trang bấm được thật"

echo "── 3. Đường hầm Cloudflare ($PUBLIC_URL)"
if [ ! -f "$CF_CONFIG" ]; then
  warn "không có $CF_CONFIG — bỏ qua bước này (chỉ chạy được ở local)"
else
  if curl -sf -m 8 "$PUBLIC_URL/login" >/dev/null 2>&1; then
    ok "đang sống sẵn"
  else
    ( nohup cloudflared tunnel --config "$CF_CONFIG" run > "$ROOT/.cloudflared.log" 2>&1 & )
    # Đường hầm cần vài giây bắt tay 4 kết nối với biên Cloudflare.
    wait_for "trả 200 qua tên miền công khai" 60 curl -sf -m 6 "$PUBLIC_URL/login" || {
      warn "xem log: $ROOT/.cloudflared.log — Hub vẫn dùng được ở $HUB_URL";
    }
  fi
fi

echo
echo "Xong. Kiểm nhanh:"
echo "  Hub local   : $HUB_URL"
echo "  Hub công khai: $PUBLIC_URL"
echo "  Test         : DATABASE_URL=$DB_URL npx vitest run"
