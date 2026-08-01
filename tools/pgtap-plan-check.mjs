#!/usr/bin/env node
// tools/pgtap-plan-check.mjs — cổng thứ ba của bộ pgTAP: so lượt chạy với MỐC đã chốt.
//
// VÌ SAO CẦN MỘT FILE MỐC (nợ #46)
// ────────────────────────────────────────────────────────────────────────────────
// `run-db-tests.sh` tự bắt được hai loại hỏng trong chính lượt chạy: `not ok`, và
// "chạy ít assertion hơn plan". Có một loại thứ ba nó KHÔNG thể tự thấy, vì nó không
// có gì để so:
//
//   · Một bài mất 3 assertion cuối, VÀ ai đó sửa `plan(40)` thành `plan(37)` cho khớp.
//     Lượt chạy hoàn toàn hợp lệ: 37/37, không `not ok` nào. Ba kiểm chứng biến mất
//     không để lại một dòng đỏ nào.
//   · Một file test bị đổi tên thành không khớp `*_test.sql`, hoặc bị xoá. Vòng lặp
//     chỉ duyệt file CÒN TỒN TẠI nên nó không biết mình vừa mất một bài — tổng chỉ
//     tụt vài chục assertion giữa hơn bảy trăm.
//
// Mốc là bản khai "bộ kiểm thử này lớn chừng nào" nằm NGOÀI lượt chạy. Thu hẹp phải
// đi qua một lần sửa mốc, tức đi qua một lần review — không lặng lẽ được nữa. Đó là
// điều kiện để con số assertion in trong `02-database.md` và trong hồ sơ HTML còn là
// một khẳng định kiểm được, thay vì một lần đo trong quá khứ.
//
// Vì sao KHÔNG chỉ so tổng: tổng che được chuyện đắp chỗ này bù chỗ kia. Thêm 3
// assertion vào một bài dễ, xoá 3 assertion khỏi bài RLS khó — tổng không đổi. Mốc
// ghi theo TỪNG FILE.
//
// Dùng:
//   node tools/pgtap-plan-check.mjs --ket-qua <tsv> [--moc tools/pgtap-moc.tsv]
//   node tools/pgtap-plan-check.mjs --ket-qua <tsv> --cap-nhat   # chốt mốc mới
//
// Định dạng <tsv> (do run-db-tests.sh sinh): ten<TAB>plan<TAB>ran<TAB>ok<TAB>notok
// (plan = -1 khi không tìm thấy header `1..N`).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MOC_MAC_DINH = fileURLToPath(new URL("./pgtap-moc.tsv", import.meta.url));

function docThamSo(argv) {
  const t = { ketQua: undefined, moc: MOC_MAC_DINH, capNhat: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ket-qua") t.ketQua = argv[++i];
    else if (argv[i] === "--moc") t.moc = argv[++i];
    else if (argv[i] === "--cap-nhat") t.capNhat = true;
  }
  return t;
}

function docKetQua(duong) {
  const map = new Map();
  for (const dong of readFileSync(duong, "utf8").split(/\r?\n/)) {
    if (!dong.trim()) continue;
    const [ten, plan, ran, ok, notok] = dong.split("\t");
    map.set(ten, {
      plan: Number(plan),
      ran: Number(ran),
      ok: Number(ok),
      notok: Number(notok),
    });
  }
  return map;
}

function docMoc(duong) {
  const map = new Map();
  if (!existsSync(duong)) return map;
  for (const dong of readFileSync(duong, "utf8").split(/\r?\n/)) {
    const sach = dong.trim();
    if (!sach || sach.startsWith("#")) continue;
    const [ten, plan] = sach.split("\t");
    map.set(ten, Number(plan));
  }
  return map;
}

function ghiMoc(duong, ketQua) {
  const dong = [...ketQua.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ten, r]) => `${ten}\t${r.plan}`);
  const tong = [...ketQua.values()].reduce((s, r) => s + r.plan, 0);
  const dau = [
    "# tools/pgtap-moc.tsv — MỐC của bộ pgTAP: mỗi dòng là <tên file>\\t<số assertion khai trong plan(N)>.",
    "#",
    "# Ghi PLAN chứ không ghi số dòng `ok`: plan là con số bài test TỰ KHAI về kích cỡ",
    "# của mình, nên nó đọc được cả trong một lượt chạy đang đỏ. Còn số `ok` thì tụt theo",
    "# mọi lỗi tạm thời, và một mốc dao động theo lỗi tạm thời là mốc không ai tin.",
    "# Chuyện `ok` phải bằng `plan` đã có cổng riêng ngay trong lượt chạy.",
    "#",
    "# Đây là bản khai \"bộ kiểm thử này lớn chừng nào\". `tools/pgtap-plan-check.mjs` so",
    "# lượt chạy với file này và ĐỎ khi có bài tụt assertion hoặc biến mất — loại hỏng mà",
    "# pass/fail của chính lượt chạy không bao giờ nói ra (nợ #46).",
    "#",
    "# Mốc là BÁNH CÓC: viết thêm assertion thì nó TỰ NÂNG (và file này thành một diff",
    "# trong PR để có người đọc). Viết BỚT thì cổng đỏ, và muốn hạ mốc phải gõ ra tay:",
    "#     node tools/pgtap-plan-check.mjs --ket-qua <tsv> --cap-nhat",
    "# Hạ hàng rào phải là một hành động có tên, không phải một hệ quả phụ.",
    `#`,
    `# Tổng: ${tong} assertion trên ${ketQua.size} file.`,
    "",
  ].join("\n");
  writeFileSync(duong, `${dau}${dong.join("\n")}\n`, "utf8");
}

const t = docThamSo(process.argv.slice(2));
if (!t.ketQua) {
  console.error("Thiếu --ket-qua <tsv>.");
  process.exit(2);
}

const ketQua = docKetQua(t.ketQua);

if (t.capNhat) {
  ghiMoc(t.moc, ketQua);
  const tong = [...ketQua.values()].reduce((s, r) => s + r.plan, 0);
  console.log(`Đã chốt mốc mới: ${ketQua.size} file, ${tong} assertion → ${t.moc}`);
  process.exit(0);
}

const moc = docMoc(t.moc);
const loi = [];
const canhBao = [];

if (moc.size === 0) {
  console.error(
    `KHÔNG CÓ MỐC: ${t.moc} chưa tồn tại hoặc rỗng.\n` +
      `  Chốt lần đầu bằng: node tools/pgtap-plan-check.mjs --ket-qua <tsv> --cap-nhat`,
  );
  process.exit(1);
}

// ── Tín hiệu 1 & 2, kiểm lại độc lập với vòng lặp shell ─────────────────────────
// Lặp lại có chủ đích: cổng phải tự đứng được. Nếu mai này ai đó viết một runner
// khác (pg_prove, một job CI khác) thì chỉ cần sinh ra đúng file TSV là có cổng.
for (const [ten, r] of ketQua) {
  if (r.notok > 0) loi.push(`${ten}: ${r.notok} assertion THẤT BẠI (not ok)`);
  else if (r.plan < 0) loi.push(`${ten}: không tìm thấy plan (1..N) — file hỏng ngay từ đầu`);
  else if (r.ran !== r.plan)
    loi.push(`${ten}: chạy ${r.ran}/${r.plan} assertion — LỆCH PLAN (file dừng giữa chừng?)`);
}

// ── Tín hiệu 3: so với mốc ──────────────────────────────────────────────────────
for (const [ten, plan] of moc) {
  const r = ketQua.get(ten);
  if (!r) {
    loi.push(`${ten}: CÓ TRONG MỐC nhưng lượt này KHÔNG CHẠY — bài test biến mất (${plan} assertion)`);
    continue;
  }
  if (r.plan < 0) continue; // đã báo ở trên: file không in nổi header 1..N
  if (r.plan < plan) loi.push(`${ten}: plan TỤT ${plan} → ${r.plan} (mất ${plan - r.plan} assertion)`);
  else if (r.plan > plan) canhBao.push(`${ten}: plan TĂNG ${plan} → ${r.plan}`);
}
for (const ten of ketQua.keys()) {
  if (!moc.has(ten)) canhBao.push(`${ten}: file MỚI, chưa có trong mốc (${ketQua.get(ten).plan} assertion)`);
}


const tongChay = [...ketQua.values()].reduce((s, r) => s + Math.max(r.plan, 0), 0);
const tongMoc = [...moc.values()].reduce((s, n) => s + n, 0);
console.log(`   mốc: ${tongMoc} assertion / ${moc.size} file · lượt này: ${tongChay} / ${ketQua.size} file`);

for (const c of canhBao) console.log(`   + ${c}`);

// Mốc là BÁNH CÓC, không phải ảnh chụp: nó chỉ đi lên. Tăng thêm assertion / thêm
// file mới thì mốc TỰ NÂNG, không ai bị chặn vì đã viết thêm test. Chỉ chiều TỤT
// mới đỏ — đó mới là loại hỏng nợ #46 nói tới.
//
// Vì sao tự nâng chứ không bắt người ta chạy --cap-nhat: nếu tăng cũng đỏ thì gói
// nào thêm một bài pgTAP cũng phải sửa mốc, và một cổng làm phiền mỗi lần làm đúng
// là một cổng sẽ bị tắt. Mốc mới vẫn hiện thành diff trong git để đi qua review.
// Chiều tụt thì bắt buộc con người xác nhận bằng `--cap-nhat` — hạ hàng rào phải
// là một hành động có tên.
if (loi.length === 0 && canhBao.length > 0) {
  ghiMoc(t.moc, ketQua);
  console.log(`   ↑ mốc tự nâng theo ${canhBao.length} thay đổi ở trên (${t.moc})`);
}

if (loi.length > 0) {
  console.error("\nCONG MOC: FAIL");
  for (const l of loi) console.error(`   ✗ ${l}`);
  process.exit(1);
}
console.log("   ✓ khớp mốc — không bài nào tụt assertion, không bài nào biến mất");
