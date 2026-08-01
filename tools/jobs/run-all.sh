#!/bin/sh
# ---------------------------------------------------------------------------
# tools/jobs/run-all.sh — thứ mà cron gọi. Bản Linux của run-all.cmd.
# ---------------------------------------------------------------------------
#
# Cùng một lý do với bản .cmd: dòng cron KHÔNG được mang theo DATABASE_URL.
# `/etc/cron.d/*` là file đọc được bởi mọi tiến trình trên máy (mode 644 là bắt
# buộc để cron chấp nhận nó), và `ps` hiện nguyên dòng lệnh của tiến trình con.
# Nhét mật khẩu cơ sở dữ liệu của trẻ em vào đó là để nó nằm ở hai chỗ công khai
# cùng lúc. Vi phạm §8 và mệnh lệnh 8.
#
# Biến môi trường tuỳ chọn:
#   HUB_ENV_FILE  file khai DATABASE_URL. Mặc định /etc/hub/hub.env
#   HUB_NODE      đường dẫn tuyệt đối tới node. Mặc định /usr/bin/node
#   HUB_LOG       file log. Mặc định /var/log/hub/jobs.log
#
# File env nên có quyền 600 và thuộc về đúng tài khoản chạy job:
#   install -m 600 -o hub -g hub /dev/null /etc/hub/hub.env
#
# Mã thoát đi thẳng từ run-all.mjs: 0 = xong · 1 = có job hỏng / thiếu bộ chạy.

set -eu

HUB_ENV_FILE="${HUB_ENV_FILE:-/etc/hub/hub.env}"

if [ ! -r "$HUB_ENV_FILE" ]; then
  echo "$(date '+%F %T') KHONG DOC DUOC FILE ENV: $HUB_ENV_FILE" >&2
  echo "  Tao file do NGOAI kho ma nguon, mot dong: DATABASE_URL=postgres://..." >&2
  exit 1
fi

# `set -a` để mọi biến gán trong file env trở thành biến môi trường của tiến
# trình con mà không phải liệt kê từng cái. Đóng lại ngay sau đó.
set -a
# shellcheck disable=SC1090
. "$HUB_ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "$(date '+%F %T') File env $HUB_ENV_FILE khong khai DATABASE_URL." >&2
  exit 1
fi

HUB_NODE="${HUB_NODE:-/usr/bin/node}"
if [ ! -x "$HUB_NODE" ]; then
  echo "$(date '+%F %T') KHONG THAY NODE: $HUB_NODE" >&2
  echo "  Dat HUB_NODE trong file env. Dung duong dan tuyet doi: cron chay voi" >&2
  echo "  PATH toi gian (/usr/bin:/bin), khong phai PATH cua shell dang nhap —" >&2
  echo "  do la ly do pho bien nhat khien mot job chay tay thi duoc, chay cron thi khong." >&2
  exit 1
fi

HUB_REPO="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
HUB_LOG="${HUB_LOG:-/var/log/hub/jobs.log}"
mkdir -p "$(dirname -- "$HUB_LOG")"

{
  echo ""
  echo "===== $(date '+%F %T %Z') ===== run-all.mjs $*"
} >> "$HUB_LOG"

cd "$HUB_REPO"
set +e
"$HUB_NODE" tools/jobs/run-all.mjs "$@" >> "$HUB_LOG" 2>&1
MA_THOAT=$?
set -e

echo "===== ket thuc, ma thoat $MA_THOAT =====" >> "$HUB_LOG"
exit "$MA_THOAT"
