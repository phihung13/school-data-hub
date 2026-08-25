#!/usr/bin/env bash
# Lên bản mới / lùi bản — "một lệnh" của ADR-018.
#
#   bash tools/trien-khai/deploy.sh          # pull → install → build → (hỏi) migrate → reload
#   bash tools/trien-khai/deploy.sh --lui    # quay về commit ghi trong /srv/hub/DA_CHAY
#
# Nguyên tắc: KHÔNG deploy một cây bẩn (git status phải sạch trên VPS — VPS không phải
# chỗ sửa tay); build xong mới reload (PM2 reload là graceful: tiến trình cũ tiễn nốt
# request đang dở); migration hỏi trước vì nó là thứ duy nhất không lùi được bằng git.
set -euo pipefail

GOC="/srv/hub/app"
SO_DA_CHAY="/srv/hub/DA_CHAY"
cd "$GOC"

if [ "${1:-}" = "--lui" ]; then
  [ -f "$SO_DA_CHAY" ] || { echo "Chưa có sổ DA_CHAY — chưa từng deploy bằng script này."; exit 1; }
  DICH="$(cat "$SO_DA_CHAY")"
  echo "LÙI về $DICH (bản đã chạy ngay trước bản hiện tại)"
  git -C "$GOC" checkout --detach "$DICH"
  pnpm install --frozen-lockfile
  ( cd apps/hub && npx next build )
  pm2 reload hub --update-env
  echo "Đã lùi. LƯU Ý: migration KHÔNG tự lùi — schema mới thường tương thích lùi, nhưng đọc lại migration của bản vừa rời nếu app kêu."
  exit 0
fi

[ -z "$(git status --porcelain)" ] || { echo "TỪ CHỐI: cây làm việc trên VPS đang bẩn — VPS không phải chỗ sửa tay."; exit 1; }

# Ghi bản ĐANG chạy trước khi đổi — chính là cái để --lui đọc.
git rev-parse HEAD > "$SO_DA_CHAY"

git fetch origin
git checkout --detach origin/main
pnpm install --frozen-lockfile
( cd apps/hub && npx next build )

CHUA_AP="$(DATABASE_URL="${DATABASE_URL:?Thiếu DATABASE_URL}" node tools/migrate/migrate.mjs 2>/dev/null | grep -c "CHƯA áp" || true)"
if [ "$CHUA_AP" != "0" ]; then
  echo "$CHUA_AP migration CHƯA áp. Áp bây giờ? (yes/no)"
  read -r TRA_LOI
  [ "$TRA_LOI" = "yes" ] && node tools/migrate/migrate.mjs up
fi

pm2 reload hub --update-env
echo "XONG — đang chạy $(git rev-parse --short HEAD). Lùi bản: bash tools/trien-khai/deploy.sh --lui"
