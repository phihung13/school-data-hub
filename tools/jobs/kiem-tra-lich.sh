#!/bin/sh
# ---------------------------------------------------------------------------
# tools/jobs/kiem-tra-lich.sh — soi lich job nen (no #33), ban Linux.
# ---------------------------------------------------------------------------
#
# Tra loi dung ba cau hoi nguoi truc can hoi moi sang, va tra loi CA KHI cau tra
# loi la "chua biet gi":
#   1. Cron co dong nao goi Hub khong?  (chua co ⇒ moi thu duoi day vo nghia)
#   2. Luot chay gan nhat de lai gi trong log?
#   3. Trong co so du lieu, cac job dang o trang thai nao? (ops.v_job_health)
#
# Cau 3 KHONG duoc doc thay cau 1 va 2. Do duoc 01/08/2026 tren hub_dev:
# ops.v_job_health bao flag_engine 'ok luc 13:05 hom nay' trong khi 313 dong
# job_runs cua hai ngay do do BO TEST sinh ra (vitest + pgTAP chay tren chinh
# hub_dev), khong do mot cai lich nao. So chay job chi la bang chung khi may do
# KHONG chay test.
#
#   sh tools/jobs/kiem-tra-lich.sh
#
# Ma thoat: 0 = lich da cam, da chay, khong job nao can chu y · 1 = co viec.

set -u

THU_MUC="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CRON_FILE="${HUB_CRON_FILE:-/etc/cron.d/hub-jobs}"
ENV_FILE="${HUB_ENV_FILE:-/etc/hub/hub.env}"
LOG="${HUB_LOG:-/var/log/hub/jobs.log}"
CO_VIEC=0

echo ""
echo "SOI LICH JOB NEN — Hub / Truong Viet Anh"
echo "----------------------------------------"

echo ""
echo "1) Cron"
if [ -f "$CRON_FILE" ]; then
  echo "   $CRON_FILE — da co:"
  grep -v '^#' "$CRON_FILE" | grep -v '^[[:space:]]*$' | sed 's/^/     /'
else
  echo "   $CRON_FILE : CHUA CAM"
  echo "     Khong co dong cron nao thi khong ai goi run-all.mjs, va loi hua"
  echo "     'xoa chi tiet cam xuc sau 12 thang' chua duoc thi hanh lan nao."
  echo "     Cam bang: sudo sh $THU_MUC/dang-ky-lich.sh --xac-nhan"
  CO_VIEC=1
fi

echo ""
echo "2) Luot chay gan nhat (theo $LOG)"
if [ -f "$LOG" ]; then
  # Moi luot bat dau bang mot dong '===== <ngay gio> ====='; lay hai dong moc cuoi.
  grep '^=====' "$LOG" | tail -n 4 | sed 's/^/   /'
else
  echo "   Chua co file log — nghia la run-all.sh CHUA CHAY LAN NAO tren may nay."
  echo "   Day khong phai 'khong co tin tuc la tin tot'."
  CO_VIEC=1
fi

echo ""
echo "3) Suc khoe job trong co so du lieu (ops.v_job_health)"
if [ -z "${DATABASE_URL:-}" ] && [ -r "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "   Khong co DATABASE_URL (va khong doc duoc $ENV_FILE) — bo qua phan nay."
  echo "   KHONG duoc doc dieu do thanh 'co so du lieu van on'."
  CO_VIEC=1
else
  HUB_NODE="${HUB_NODE:-/usr/bin/node}"
  ( cd "$THU_MUC/../.." && "$HUB_NODE" tools/jobs/run-all.mjs --check )
  if [ $? -ne 0 ]; then CO_VIEC=1; fi
fi

echo ""
if [ "$CO_VIEC" -ne 0 ]; then
  echo "CO VIEC CAN NGUOI XU — xem cac muc o tren."
  exit 1
fi
echo "Lich da cam, da chay, va khong job nao can chu y."
exit 0
