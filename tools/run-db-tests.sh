#!/usr/bin/env bash
# Dựng database sạch từ migrations, nạp fixture, chạy toàn bộ pgTAP.
#
# Dùng psql thay vì pg_prove để không phải cài cả một chuỗi module Perl trong CI —
# pgTAP đã tự in ra định dạng TAP, việc còn lại là đọc đúng BA loại tín hiệu:
#   1. `not ok`  — assertion sai.
#   2. LỆCH PLAN — `select plan(N)` in header `1..N` ngay đầu file, nhưng khi một
#      lệnh SQL sai làm abort transaction thì pgTAP KHÔNG bao giờ chạy tới finish()
#      nên KHÔNG in dòng `# Looks like …` và cũng KHÔNG in `not ok` nào: nó chỉ
#      ngừng in. Một bài khai plan(40) mà chết ở assertion thứ 3 trông y hệt một bài
#      sạch nếu người đọc chỉ đếm `not ok`.
#   3. SỐ ASSERTION TỤT GIỮA HAI LẦN CHẠY — thứ mà pass/fail không bao giờ nói.
#      Một bài mất 3 assertion cuối vì một hàm vừa đổi chữ ký vẫn "xanh" (plan cũng
#      giảm theo nếu ai đó sửa cả plan) và chìm mất trong tổng số hơn bảy trăm.
#
# Tín hiệu 1 và 2 kiểm ngay tại chỗ, từng file, ở vòng lặp dưới. Tín hiệu 3 cần một
# MỐC nằm ngoài lượt chạy: `tools/pgtap-moc.tsv`, so bằng `tools/pgtap-plan-check.mjs`.
#
# Chạy trong CI:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_test ./tools/run-db-tests.sh
# Chạy trên máy dev Windows (không có psql trên PATH, Postgres nằm trong container):
#   HUB_PSQL="docker exec -i pg_hub psql" \
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/hub_test \
#   bash tools/run-db-tests.sh
#   (chú ý: khi psql chạy TRONG container thì host trong DATABASE_URL là góc nhìn của
#   container — localhost:5432, không phải cổng 5434 đã publish ra máy thật.)
set -euo pipefail

DB_URL="${DATABASE_URL:?Thiếu DATABASE_URL}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/packages/core/db/migrations"
FIX="$ROOT/packages/core/db/fixtures"
TST="$ROOT/packages/core/db/tests"
MOC="$ROOT/tools/pgtap-moc.tsv"

# ── Cổng #41: script này DROP/tạo lại đối tượng và chạy fixture. Chĩa nó vào
# `hub_dev` là vừa đập database mà buồng lái đang đọc, vừa để lại rác trong
# `ops.job_runs` — đúng cách bộ test bịa ra lịch sử chạy máy (nợ #41, đo 01/08/2026:
# 313 dòng flag_engine trong 2 ngày, nhịp khai là 1 lần/ngày).
DB_NAME="${DB_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
case "$DB_NAME" in
  *_test | test_* | test) ;;
  *)
    echo "TU CHOI: DATABASE_URL trỏ vào database \"$DB_NAME\"." >&2
    echo "  Bộ pgTAP chỉ được chạy trên database test (tên kết thúc bằng _test)." >&2
    echo "  Chạy trên hub_dev là đập chính database mà Hub đang phục vụ (nợ #41)." >&2
    exit 2
    ;;
esac

# psql có thể không nằm trên PATH (máy dev Windows chỉ có container). Cho phép thay
# bằng một lệnh khác — mảng để giữ nguyên khoảng trắng giữa các tham số.
read -r -a PSQL <<<"${HUB_PSQL:-psql}"

# Truyền file qua STDIN chứ không bằng -f: `docker exec -i` không nhìn thấy đường dẫn
# trên máy thật. Không file .sql nào trong kho dùng lệnh \i nên đọc từ stdin là tương
# đương (đã soát 02/08/2026: `grep -l '^\\' migrations fixtures tests` ra 0 file).
psql_file() { "${PSQL[@]}" "$DB_URL" -v ON_ERROR_STOP=1 -q <"$1"; }
psql_c() { "${PSQL[@]}" "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1"; }

# ── 0. DỰNG LẠI DATABASE TỪ SỐ KHÔNG ─────────────────────────────────────────
#
# Thêm 07/08/2026 sau khi TÁI HIỆN ĐƯỢC một lỗi đã nhiều lần bị gọi là "test bập bênh".
# Sự thật: HAI bộ chạy test dùng CHUNG `hub_test`, và mỗi bộ tin rằng nó sở hữu dữ liệu.
#
#   · `tests/helpers/chuan-bi-db-test.ts` (vitest) dựng đầy đủ migration + seed, rồi ghim
#     một "dấu vân" vào `test_meta.dau_van` để lượt sau khỏi dựng lại.
#   · Script này thì giả định database RỖNG và replay từng migration.
#
# Hai chiều va nhau, cả hai đều cho ra một màu đỏ không nói gì về mã nguồn:
#   vitest ➜ pgTAP : script chết ở `0002` với `relation "school_networks" already exists`,
#                    thoát mã 3, trước khi chạy một assertion nào.
#   pgTAP ➜ vitest : script nạp fixture và các bài pgTAP ghi vào database; lượt vitest kế
#                    tiếp thấy dấu vân KHỚP nên dùng lại, rồi đếm ra những con số không
#                    phải của nó. Đo được 07/08/2026: `tests/db/perf.test.ts` đòi 0 lượt
#                    tra `core.users` và nhận **3.547** — một phép đo cache trở thành vô
#                    nghĩa vì bảng đã bị người khác cày qua.
#
# Dựng lại từ số không chữa CẢ HAI chiều bằng một việc: `hub_test` biến mất kéo theo
# `test_meta.dau_van`, nên lượt vitest kế tiếp thấy "dấu vân lệch" và tự dựng lại phần của
# nó. Không cần hai bộ biết về nhau.
#
# Cái giá: mỗi lượt chạy thêm ~30 giây replay migration. Rẻ hơn nhiều so với một lượt đỏ
# giả — thứ đắt không phải 30 giây máy, mà là nửa giờ người đi tìm một lỗi không tồn tại.
#
# An toàn: cổng #41 ở trên đã chặn mọi tên database không kết thúc bằng `_test`, và câu
# `drop` dưới đây nằm SAU cổng đó. `with (force)` để không kẹt vì một kết nối bỏ quên.
DB_ADMIN_URL="${DB_URL%/*}/postgres"
echo "── 0. Dựng lại $DB_NAME từ số không (xem chú thích: hai bộ test dùng chung database)"
"${PSQL[@]}" "$DB_ADMIN_URL" -v ON_ERROR_STOP=1 -q \
  -c "drop database if exists $DB_NAME with (force);" \
  -c "create database $DB_NAME;"

echo "── 1. Cài pgTAP"
psql_c "create extension if not exists pgtap;"

echo "── 2. Chạy migrations theo thứ tự"
for f in "$MIG"/*.sql; do
  echo "   → $(basename "$f")"
  psql_file "$f"
done

echo "── 3. Nạp fixture"
for f in "$FIX"/*.sql; do
  echo "   → $(basename "$f")"
  psql_file "$f"
done

echo "── 4. Chạy test"
# Bảng kê từng file của lượt này. Đặt HUB_TAP_KET_QUA=<đường dẫn> để giữ lại — cần khi
# muốn chốt mốc mới: `node tools/pgtap-plan-check.mjs --ket-qua <đường dẫn> --cap-nhat`.
if [ -n "${HUB_TAP_KET_QUA:-}" ]; then
  KET_QUA="$HUB_TAP_KET_QUA"
  : >"$KET_QUA"
else
  KET_QUA="$(mktemp)"
  trap 'rm -f "$KET_QUA"' EXIT
fi
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
  if ! out="$("${PSQL[@]}" "$DB_URL" -q -t -A <"$f" 2>&1)"; then
    echo "$out"
    echo "   ✗ $name — psql lỗi"
    printf '%s\t%s\t%s\t%s\t%s\n' "$name" "-1" "0" "0" "0" >>"$KET_QUA"
    failed=$((failed + 1))
    continue
  fi
  echo "$out"
  # `|| true`: grep -c trả exit 1 khi đếm được 0, mà `set -e` đang bật.
  n_ok="$(grep -cE '^ok ' <<<"$out" || true)"
  n_notok="$(grep -cE '^not ok' <<<"$out" || true)"
  n_ran="$(grep -cE '^(ok|not ok) ' <<<"$out" || true)"
  # plan(N) in ra header "1..N" NGAY ĐẦU file, trước khi chạy assertion nào.
  # Đây là mấu chốt để bắt ca "file chết giữa chừng": header đã in rồi thì dù
  # file abort ở assertion thứ 5, ta vẫn biết đáng lẽ phải có N.
  n_plan="$(grep -oE '^1\.\.[0-9]+' <<<"$out" | head -1 | cut -d. -f3)"
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "${n_plan:--1}" "$n_ran" "$n_ok" "$n_notok" >>"$KET_QUA"

  if [ "$n_notok" -gt 0 ]; then
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

# ── 5. Tín hiệu thứ ba: so với MỐC đã chốt. Đặt SAU vòng lặp và chạy kể cả khi
# vòng lặp đã đỏ — để một lượt chạy in ra trọn danh sách vấn đề, gồm cả bài biến
# mất khỏi thư mục (thứ vòng lặp trên không thể thấy: nó chỉ duyệt file còn tồn tại).
echo
echo "── 5. So với mốc đã chốt ($(basename "$MOC"))"
if node "$ROOT/tools/pgtap-plan-check.mjs" --ket-qua "$KET_QUA" --moc "$MOC"; then
  moc_ok=1
else
  moc_ok=0
fi

if [ "$failed" -gt 0 ] || [ "$moc_ok" -eq 0 ]; then
  echo "KET QUA: FAIL — $failed/$total_files file test có lỗi, cổng mốc $([ "$moc_ok" -eq 1 ] && echo "xanh" || echo "ĐỎ")"
  exit 1
fi
echo "KET QUA: PASS — $total_files/$total_files file test xanh, khớp mốc"
