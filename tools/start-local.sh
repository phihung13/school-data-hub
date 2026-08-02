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

# ── Hai chế độ chạy, và mặc định là chế độ NHANH ────────────────────────────
#
#   bash tools/start-local.sh          → bản CHẠY THẬT (mặc định, cho demo và cho điện thoại)
#   bash tools/start-local.sh --sua     → chế độ lập trình viên (sửa mã là trang tự nạp lại)
#
# Vì sao mặc định là bản chạy thật: đo 02/08/2026 trên chính trang buồng lái GVCN,
# thứ điện thoại phải tải về —
#     chế độ lập trình viên : 7 tệp · 10.058 KB thô · 2.298 KB khi nén
#     bản chạy thật         : 5 tệp ·    404 KB thô ·   124 KB khi nén
# Nhẹ hơn 18,5 lần khi truyền. Chủ đầu tư báo "mở mini app chờ 30 giây" — 2,3 MB
# qua đường hầm trên điện thoại đúng bằng chừng đó. Chạy máy chủ chế độ lập trình
# viên cho người dùng thật là trả giá đó mỗi lần mở trang, để đổi lấy một tiện nghi
# mà chỉ người viết mã mới dùng tới.
#
# Hai chế độ ghi vào HAI thư mục khác nhau (`.next-prod` và `.next`, xem
# next.config.mjs) nên không còn giẫm chân nhau như hai lần sự cố hôm 01–02/08.
CHE_DO="that"
for a in "$@"; do
  case "$a" in
    --sua|--dev) CHE_DO="sua" ;;
    --that|--prod) CHE_DO="that" ;;
  esac
done

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

echo "── 2. Hub ($HUB_URL · chế độ $( [ "$CHE_DO" = that ] && echo "CHẠY THẬT" || echo "lập trình viên" ))"
if curl -sf -m 3 "$HUB_URL/login" >/dev/null 2>&1; then
  ok "đang chạy sẵn"
  warn "đang chạy sẵn thì script KHÔNG đổi chế độ — muốn đổi thì tắt tiến trình node server.mjs trước"
else
  if [ "$CHE_DO" = "that" ]; then
    # Bản chạy thật cần bản dựng nằm ở .next-prod. Dựng lại mỗi lần bật thì chậm;
    # chỉ dựng khi CHƯA có, còn lại để người sửa mã tự gọi build khi cần.
    if [ ! -f "$ROOT/apps/hub/.next-prod/BUILD_ID" ]; then
      warn "chưa có bản dựng thật — đang dựng (một lần, khoảng một phút)"
      ( cd "$ROOT" && npx pnpm --filter @hub/app build ) >"$ROOT/.hub-build.log" 2>&1 || {
        fail "dựng hỏng — xem $ROOT/.hub-build.log"; exit 1;
      }
      ok "đã dựng xong"
    fi
    ( cd "$ROOT/apps/hub" && NODE_ENV=production nohup node server.mjs > "$ROOT/.hub.log" 2>&1 & )
  else
    ( cd "$ROOT/apps/hub" && nohup node server.mjs > "$ROOT/.hub.log" 2>&1 & )
  fi
  wait_for "trả 200 ở /login" 90 curl -sf -m 3 "$HUB_URL/login" || {
    fail "Hub không lên. Máy chủ nay in đúng bệnh và cách chữa vào log:"
    tail -14 "$ROOT/.hub.log" 2>/dev/null | sed 's/^/     /'
    exit 1;
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

# ── 2c. Cửa đăng nhập tạm có THẬT SỰ khoá không ─────────────────────────────
#
# Vì sao bước này tồn tại: tới 02/08/2026, /api/auth/dev-login nhận một mã tài
# khoản mẫu rồi trả thẳng cookie phiên đúng vai đó — không mật khẩu, không kiểm
# gì cả. Route đó nằm sau tên miền công khai, và dãy mã mẫu đoán được bằng mắt.
# Đo thật hôm 30/07/2026: một lượt POST từ ngoài Internet lấy được phiên hiệu
# trưởng, nhìn được toàn bộ học sinh cơ sở.
#
# Nay cửa đã khoá bằng một mã đặt trong apps/hub/.env.local. Bước này KHÔNG tin
# vào việc đó — nó tự đi thử: gõ cửa mà không cầm mã, và đòi bị từ chối. Một cái
# khoá chưa từng bị thử là một cái khoá chưa biết có khoá hay không.
echo "── 2c. Cửa đăng nhập tạm có khoá không"
DEV_ENV_FILE="$ROOT/apps/hub/.env.local"
DEV_SECRET="$(sed -n 's/^DEV_LOGIN_SECRET=//p' "$DEV_ENV_FILE" 2>/dev/null | head -1 | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
TK_THU="90000000-0000-0000-0000-000000000007"   # Hùng (quản trị) — vai nặng nhất

go_cua() { # $1 = địa chỉ gốc, $2 = mã (rỗng = không cầm mã)
  if [ -n "$2" ]; then
    curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "$1/api/auth/dev-login" \
      -H 'content-type: application/json' -H "x-hub-dev-secret: $2" \
      -d "{\"authUid\":\"$TK_THU\"}"
  else
    curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "$1/api/auth/dev-login" \
      -H 'content-type: application/json' -d "{\"authUid\":\"$TK_THU\"}"
  fi
}

MA_KHONG="$(go_cua "$HUB_URL" "")"
if [ "$MA_KHONG" = "200" ]; then
  fail "CỬA ĐANG MỞ TOANG: gõ cửa không cầm mã vẫn nhận được phiên (HTTP 200)."
  fail "Ai biết địa chỉ đều tự cấp cho mình vai hiệu trưởng. KHÔNG được nạp dữ liệu thật."
  fail "chữa: xem apps/hub/app/api/auth/dev-login/route.ts và nợ #19 trong danh-cho-may/DEBT.md"
  exit 1
fi
if [ "$MA_KHONG" = "503" ]; then
  warn "cửa đóng với TẤT CẢ: chưa đặt DEV_LOGIN_SECRET trong $DEV_ENV_FILE"
  warn "thêm một dòng DEV_LOGIN_SECRET=<ít nhất 12 ký tự> rồi khởi động lại Hub"
elif [ "$MA_KHONG" = "401" ]; then
  ok "không cầm mã thì bị từ chối (401) — đúng"
  if [ -z "$DEV_SECRET" ]; then
    warn "không đọc được mã trong $DEV_ENV_FILE nên chưa thử được chiều ngược lại"
  else
    MA_DUNG="$(go_cua "$HUB_URL" "$DEV_SECRET")"
    case "$MA_DUNG" in
      200) ok "cầm đúng mã thì vào được (200) — cửa khoá đúng chiều, không phải khoá chết" ;;
      500) warn "mã đúng nhưng chưa dựng được phiên (500) — nhiều khả năng chưa seed dữ liệu dev" ;;
      *)   fail "cầm đúng mã mà vẫn không vào được (HTTP $MA_DUNG) — cửa đang khoá cả người nhà"; exit 1 ;;
    esac
  fi
else
  warn "gõ cửa trả HTTP $MA_KHONG — không phải 401 lẫn 200, xem $ROOT/.hub.log"
fi

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

  # Thử lại đúng phép thử của bước 2c, nhưng TỪ NGOÀI. Đây là con đường mà lỗ hổng
  # nợ #19 được đo thật hôm 30/07/2026 — và cũng là con đường mà chỉ nó mới nói được
  # sự thật: đường hầm trỏ về http://localhost:3000, nên mọi request từ Internet tới
  # Node đều mang địa chỉ nguồn 127.0.0.1. Phép kiểm chạy ở bước 2c không thay thế
  # được bước này, vì ở bước 2c hai thứ đó trông y hệt nhau.
  if curl -sf -m 8 "$PUBLIC_URL/login" >/dev/null 2>&1; then
    NGOAI="$(go_cua "$PUBLIC_URL" "")"
    if [ "$NGOAI" = "200" ]; then
      fail "CỬA MỞ TOANG TỪ INTERNET: POST $PUBLIC_URL/api/auth/dev-login không cần mã trả 200"
      exit 1
    fi
    ok "từ Internet gõ cửa không cầm mã cũng bị từ chối (HTTP $NGOAI)"
  fi
fi

echo
echo "Xong. Kiểm nhanh:"
echo "  Hub local   : $HUB_URL"
echo "  Hub công khai: $PUBLIC_URL"
echo "  Test         : DATABASE_URL=$DB_URL npx vitest run"
echo
# Đăng nhập đổi cách từ 02/08/2026 (nợ #19) — in ra đây vì người chạy script này là
# người demo, không phải người đọc mã nguồn.
echo "Đăng nhập (đổi từ 02/08/2026):"
echo "  Mở $PUBLIC_URL/login trên máy tính hoặc điện thoại. Màn hình sẽ hỏi MỘT mã mở khoá,"
echo "  nhập một lần rồi thôi — máy đó nhớ 30 ngày, lần sau vào thẳng danh sách tài khoản thử."
if [ -n "$DEV_SECRET" ]; then
  # KHÔNG IN MÃ RA MÀN HÌNH (sửa 02/08/2026, sau khi chính nó rò).
  #
  # Bản trước in thẳng `Mã hiện tại: <mã>` cho tiện người demo. Cái giá đo được ngay
  # trong ngày: mã rơi vào scrollback của mọi cửa sổ terminal, vào log của mọi lượt CI
  # chạy script này, và vào bản ghi của mọi phiên trợ lý đọc output — một lượt chạy
  # bình thường là một lượt phát tán. Đây là MẬT KHẨU DÙNG CHUNG, mất là mất cho tất cả,
  # và thu hồi thì thu hồi hết mọi máy cùng lúc.
  #
  # Nay chỉ in CHỖ ĐỂ MÃ và cách tự đọc. Người demo mất thêm một thao tác; đổi lại mã
  # không còn tự đi ra ngoài mỗi lần ai đó bật máy.
  echo "  Mã nằm trong: $DEV_ENV_FILE  (dòng DEV_LOGIN_SECRET, file này KHÔNG lên GitHub)"
  echo "  Xem mã       : grep DEV_LOGIN_SECRET \"$DEV_ENV_FILE\""
  echo "  Đổi mã       : sửa dòng đó rồi khởi động lại Hub — mọi máy đã mở khoá bị thu hồi ngay."
else
  echo "  CHƯA CÓ MÃ. Thêm vào $DEV_ENV_FILE một dòng:"
  echo "      DEV_LOGIN_SECRET=<chuỗi ít nhất 12 ký tự>"
  echo "  rồi tắt Hub và chạy lại script này. Chưa có mã thì KHÔNG AI đăng nhập được — đó là"
  echo "  trạng thái mặc định có chủ ý, không phải lỗi."
fi
