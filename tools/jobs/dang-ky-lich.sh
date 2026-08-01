#!/bin/sh
# ---------------------------------------------------------------------------
# tools/jobs/dang-ky-lich.sh — cắm lịch job nền vào cron (nợ #33), bản Linux.
# ---------------------------------------------------------------------------
#
# MẶC ĐỊNH SCRIPT NÀY KHÔNG GHI GÌ CẢ. Nó soát điều kiện, in ra nội dung file cron
# sẽ ghi, rồi dừng. Ghi vào /etc/cron.d là đổi cấu hình máy của người khác — việc
# đó phải do người vận hành tự bấm, sau khi đọc bằng mắt mình.
#
#   sh tools/jobs/dang-ky-lich.sh              # chỉ in, không đổi gì
#   sudo sh tools/jobs/dang-ky-lich.sh --xac-nhan
#
# Biến môi trường tuỳ chọn:
#   HUB_CRON_FILE  mặc định /etc/cron.d/hub-jobs
#   HUB_CRON_USER  tài khoản chạy job, mặc định hub
#   HUB_ENV_FILE   mặc định /etc/hub/hub.env

set -eu

XAC_NHAN=0
for a in "$@"; do
  case "$a" in
    --xac-nhan) XAC_NHAN=1 ;;
    *) echo "Tham so khong hieu: $a" >&2; exit 1 ;;
  esac
done

THU_MUC="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SH_FILE="$THU_MUC/run-all.sh"
CRON_FILE="${HUB_CRON_FILE:-/etc/cron.d/hub-jobs}"
CRON_USER="${HUB_CRON_USER:-hub}"
ENV_FILE="${HUB_ENV_FILE:-/etc/hub/hub.env}"

echo ""
echo "CAM LICH JOB NEN — Hub / Truong Viet Anh"
echo "----------------------------------------"
echo ""

LOI=0
if [ ! -f "$SH_FILE" ]; then
  echo "  ! Khong thay $SH_FILE" >&2; LOI=1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "  ! Khong thay file env: $ENV_FILE" >&2
  echo "    Tao NGOAI kho ma nguon, quyen 600:" >&2
  echo "      sudo install -d -m 700 /etc/hub" >&2
  echo "      sudo install -m 600 -o $CRON_USER -g $CRON_USER /dev/null $ENV_FILE" >&2
  echo "      # roi ghi mot dong: DATABASE_URL=postgres://..." >&2
  LOI=1
fi
if [ "$LOI" -ne 0 ]; then
  echo ""
  echo "CHUA DU DIEU KIEN — chua ghi gi. Sua xong roi chay lai."
  exit 1
fi

# Cam DAY, khong thua: run-all.mjs hoi ops.job_due() truoc moi job nen chay moi gio
# van khong lam job thang chay 720 lan. Doi lai, mot lan lo nhip duoc bu o luot ke
# tiep thay vi phai doi tron mot chu ky nua.
#
# Dong thu hai (--check, 07:30 moi sang) chi doi MA THOAT cua cron thanh 1 va sinh
# mot thu cron cho tai khoan do. Do la kenh bao dong YEU — kenh that (gui Zalo/thu
# cho nguoi truc) chua ton tai: ops.outbox_messages co bo GHI ma chua co bo GUI.
NOI_DUNG=$(cat <<EOF
# /etc/cron.d/hub-jobs — sinh boi tools/jobs/dang-ky-lich.sh
# KHONG dat DATABASE_URL o day: file nay mode 644, moi tien trinh doc duoc (§8).
# Bi mat nam trong $ENV_FILE, do run-all.sh doc.
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Moi gio: goi bo lich. Job nao chay, bao lau mot lan — doc tu ops.job_schedule.
0 * * * * $CRON_USER  $SH_FILE

# Moi sang 07:30: chi soi suc khoe, thoat 1 neu co job can chu y.
30 7 * * * $CRON_USER  $SH_FILE --check
EOF
)

echo "Se ghi vao : $CRON_FILE   (chu so huu root, quyen 644 — cron doi dung vay)"
echo "Tai khoan  : $CRON_USER"
echo "Bo chay    : $SH_FILE"
echo ""
echo "--- noi dung ---"
echo "$NOI_DUNG"
echo "--- het ---"
echo ""

if [ "$XAC_NHAN" -ne 1 ]; then
  echo "CHUA GHI GI CA."
  echo "Doc ky noi dung tren. Muon ghi that:"
  echo "  sudo sh $0 --xac-nhan"
  exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Can quyen root de ghi $CRON_FILE." >&2
  exit 1
fi

printf '%s\n' "$NOI_DUNG" > "$CRON_FILE"
chown root:root "$CRON_FILE"
chmod 644 "$CRON_FILE"

echo "XONG. Ba viec con lai, lam ngay bay gio chu khong de mai:"
echo "  1. Chay thu mot luot   : sudo -u $CRON_USER $SH_FILE"
echo "  2. Soi ket qua         : sh $THU_MUC/kiem-tra-lich.sh"
echo "  3. Doc lai sau 2 chu ky: cac job phai roi khoi trang thai chua_chay."
