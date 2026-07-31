#!/usr/bin/env bash
# Dựng database sạch từ migrations, nạp fixture, chạy toàn bộ pgTAP.
#
# Dùng psql thay vì pg_prove để không phải cài cả một chuỗi module Perl trong CI —
# pgTAP đã tự in ra định dạng TAP, việc còn lại là đọc đúng ba loại tín hiệu:
#   1. `not ok`  — assertion sai.
#   2. `# Looks like you planned N tests but ran M` / `# Looks like you failed …`
#      — pgTAP báo LỆCH PLAN bằng dòng bắt đầu bằng '#', KHÔNG bằng 'not ok'.
#      Bỏ sót loại này thì một file khai plan(12) mà chỉ chạy 3 assertion vẫn
#      "xanh": xoá bớt kiểm chứng không ai biết.
#   3. Số assertion `ok` — in ra để nhìn thấy coverage TỤT giữa hai lần chạy,
#      thứ mà kết quả pass/fail không bao giờ nói cho biết.
#
# Chạy: DATABASE_URL=postgres://... ./tools/run-db-tests.sh
set -euo pipefail

DB_URL="${DATABASE_URL:?Thiếu DATABASE_URL}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/packages/core/db/migrations"
FIX="$ROOT/packages/core/db/fixtures"
TST="$ROOT/packages/core/db/tests"

psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "── 1. Cài pgTAP"
psql_q -c "create extension if not exists pgtap;"

echo "── 2. Chạy migrations theo thứ tự"
for f in "$MIG"/*.sql; do
  echo "   → $(basename "$f")"
  psql_q -f "$f"
done

echo "── 3. Nạp fixture"
for f in "$FIX"/*.sql; do
  echo "   → $(basename "$f")"
  psql_q -f "$f"
done

echo "── 4. Chạy test"
failed=0
total_files=0
total_assert=0
for f in "$TST"/*_test.sql; do
  total_files=$((total_files + 1))
  name="$(basename "$f")"
  echo
  echo "▸ $name"
  # Không dùng ON_ERROR_STOP: một bài hỏng vẫn phải chạy tiếp các bài còn lại,
  # để một lần chạy cho ra toàn bộ danh sách lỗi thay vì dừng ở lỗi đầu tiên.
  # -t -A: bỏ khung bảng và tiêu đề cột, để output là TAP thuần (ok / not ok).
  if ! out="$(psql "$DB_URL" -q -t -A -f "$f" 2>&1)"; then
    echo "$out"
    echo "   ✗ $name — psql lỗi"
    failed=$((failed + 1))
    continue
  fi
  echo "$out"
  # `|| true`: grep -c trả exit 1 khi đếm được 0, mà `set -e` đang bật.
  n_ok="$(grep -cE '^ok ' <<<"$out" || true)"
  n_ran="$(grep -cE '^(ok|not ok) ' <<<"$out" || true)"
  # plan(N) in ra header "1..N" NGAY ĐẦU file, trước khi chạy assertion nào.
  # Đây là mấu chốt để bắt ca "file chết giữa chừng": header đã in rồi thì dù
  # file abort ở assertion thứ 5, ta vẫn biết đáng lẽ phải có N.
  n_plan="$(grep -oE '^1\.\.[0-9]+' <<<"$out" | head -1 | cut -d. -f3)"

  if grep -qE '^not ok' <<<"$out"; then
    echo "   ✗ $name — có assertion thất bại"
    failed=$((failed + 1))
  elif [ -z "$n_plan" ]; then
    # Không có cả header 1..N: file hỏng ngay từ đầu (lỗi cú pháp, thiếu plan()).
    echo "   ✗ $name — không tìm thấy plan (1..N); file hỏng ngay từ đầu?"
    failed=$((failed + 1))
  elif [ "$n_ran" -ne "$n_plan" ]; then
    # Bắt ĐƯỢC ca mà nhánh '# Looks like' bỏ sót: khi một lệnh SQL sai làm abort
    # transaction, pgTAP không bao giờ chạy tới finish() nên KHÔNG in dòng
    # '# Looks like …' — script cũ đọc thấy 5 dòng 'ok', không thấy 'not ok',
    # rồi kết luận PASS trong khi output có 20 dòng ERROR (tái hiện được, 31/07/2026).
    # So thẳng plan với số assertion chạy thật thì không có đường nào lọt.
    echo "   ✗ $name — chạy $n_ran/$n_plan assertion (lệch plan hoặc file dừng giữa chừng)"
    failed=$((failed + 1))
  elif grep -qE '^# Looks like you (planned|failed)' <<<"$out"; then
    echo "   ✗ $name — pgTAP báo lệch plan (xem dòng '# Looks like …')"
    failed=$((failed + 1))
  elif grep -qE '^(psql:|ERROR:)' <<<"$out"; then
    # Đủ assertion nhưng vẫn có lỗi SQL in ra: thường là lệnh dọn dẹp/thiết lập
    # hỏng mà không làm sai assertion nào. Không được coi là xanh.
    echo "   ✗ $name — đủ assertion nhưng output có lỗi SQL"
    failed=$((failed + 1))
  else
    echo "   ✓ $name — $n_ok assertion"
  fi
  total_assert=$((total_assert + n_ok))
done

echo
echo "TONG: $total_assert assertion trên $total_files file"
if [ "$failed" -gt 0 ]; then
  echo "KET QUA: FAIL — $failed/$total_files file test có lỗi"
  exit 1
fi
echo "KET QUA: PASS — $total_files/$total_files file test xanh"
