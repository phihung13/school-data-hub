#!/usr/bin/env node
// tools/mp4-faststart.mjs — dời `moov` lên đầu file mp4, KHÔNG mã hoá lại.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO CÓ FILE NÀY
// ═══════════════════════════════════════════════════════════════════════════════
// Hai video của trang trình diễn (23/08/2026) có `moov` nằm ở CUỐI — đo được: 100,0%
// và 99,9% vị trí file. `moov` là bảng mục lục; trình duyệt không phát được khung hình
// nào cho tới khi đọc được nó. Nghĩa là phải tải trọn 17 MB + 10 MB trước khi có hình.
//
// Trên localhost không ai thấy. Trên wifi trường qua tunnel thì đó là màn đen giữa buổi
// trình bày — đúng loại lỗi chỉ lộ ra ở đúng chỗ không được phép lộ.
//
// `ffmpeg -movflags +faststart` làm việc này, nhưng máy không có ffmpeg. Phép biến đổi
// thì xác định và nhỏ, nên làm thẳng:
//
//   ftyp · uuid · mdat · moov   →   ftyp · uuid · moov · mdat
//
// KÈM MỘT VIỆC BẮT BUỘC, quên là hỏng file: `stco`/`co64` bên trong `moov` giữ **offset
// tuyệt đối trong file** của từng chunk dữ liệu. Dời `moov` lên trước `mdat` là đẩy toàn
// bộ `mdat` xuống đúng `len(moov)` byte, nên mọi ô trong hai bảng đó phải cộng bù đúng
// bấy nhiêu. Không cộng thì file vẫn "hợp lệ" với trình phân tích cấu trúc, vẫn mở được,
// nhưng phát ra rác — hỏng theo kiểu im lặng.
//
// Dùng: node tools/mp4-faststart.mjs <file.mp4> [file2.mp4 ...]
// Ghi ra `<tên>.faststart.mp4` cạnh bản gốc. KHÔNG tự ghi đè — người gọi tự đổi sau khi
// đã kiểm, vì đây là thao tác trên nhị phân và bản gốc là thứ duy nhất không dựng lại được.
import { readFileSync, writeFileSync } from "node:fs";

/** Duyệt các atom ở MỘT tầng, trả về [{ten, dau, cuoi, kichThuoc}]. */
function duyetAtom(buf, dau = 0, cuoi = buf.length) {
  const ra = [];
  let i = dau;
  while (i + 8 <= cuoi) {
    let sz = buf.readUInt32BE(i);
    const ten = buf.toString("latin1", i + 4, i + 8);
    let phanDau = 8;
    if (sz === 1) {
      // Atom 64-bit: kích thước thật nằm ở 8 byte tiếp theo.
      sz = Number(buf.readBigUInt64BE(i + 8));
      phanDau = 16;
    } else if (sz === 0) {
      sz = cuoi - i; // "tới hết file"
    }
    if (sz < phanDau || i + sz > cuoi) break;
    ra.push({ ten, dau: i, cuoi: i + sz, kichThuoc: sz, phanDau });
    i += sz;
  }
  return ra;
}

/** Cộng `buChenh` vào mọi ô của mọi bảng `stco`/`co64` nằm bên trong `buf`. */
function buOffset(buf, dau, cuoi, buChenh) {
  let soO = 0;
  for (const a of duyetAtom(buf, dau, cuoi)) {
    if (a.ten === "stco" || a.ten === "co64") {
      const n = buf.readUInt32BE(a.dau + a.phanDau + 4); // sau 4 byte version+flags
      let p = a.dau + a.phanDau + 8;
      for (let k = 0; k < n; k++) {
        if (a.ten === "stco") {
          buf.writeUInt32BE(buf.readUInt32BE(p) + buChenh, p);
          p += 4;
        } else {
          buf.writeBigUInt64BE(buf.readBigUInt64BE(p) + BigInt(buChenh), p);
          p += 8;
        }
        soO++;
      }
    } else if (["moov", "trak", "mdia", "minf", "stbl"].includes(a.ten)) {
      // Chỉ đi sâu vào đúng nhánh chứa bảng offset — không quét mù cả file.
      soO += buOffset(buf, a.dau + a.phanDau, a.cuoi, buChenh);
    }
  }
  return soO;
}

let hong = 0;
for (const duong of process.argv.slice(2)) {
  const buf = readFileSync(duong);
  const atoms = duyetAtom(buf);
  const ten = atoms.map((a) => a.ten);
  const moov = atoms.find((a) => a.ten === "moov");
  const mdat = atoms.find((a) => a.ten === "mdat");

  if (!moov || !mdat) {
    console.error(`FAIL ${duong}: thiếu moov hoặc mdat (thấy: ${ten.join(" ")})`);
    hong = 1;
    continue;
  }
  if (moov.dau < mdat.dau) {
    console.log(`OK   ${duong}: moov đã ở trước mdat — không cần sửa`);
    continue;
  }

  // Cắt moov ra bản riêng rồi cộng bù NGAY TRÊN BẢN ĐÓ, không đụng buf gốc.
  const banMoov = Buffer.from(buf.subarray(moov.dau, moov.cuoi));
  const soO = buOffset(banMoov, 0, banMoov.length, moov.kichThuoc);

  // Ghép lại: mọi atom TRỪ moov, giữ nguyên thứ tự, nhưng moov chèn ngay trước mdat.
  const phan = [];
  for (const a of atoms) {
    if (a.ten === "moov") continue;
    if (a.ten === "mdat") phan.push(banMoov);
    phan.push(buf.subarray(a.dau, a.cuoi));
  }
  const ra = Buffer.concat(phan);

  // TỰ KIỂM trước khi ghi — không tin phép biến đổi, đo lại nó.
  const lai = duyetAtom(ra);
  const iMoov = lai.findIndex((a) => a.ten === "moov");
  const iMdat = lai.findIndex((a) => a.ten === "mdat");
  if (ra.length !== buf.length || iMoov < 0 || iMdat < 0 || iMoov > iMdat) {
    console.error(`FAIL ${duong}: kết quả không hợp lệ (dài ${ra.length}/${buf.length}, moov#${iMoov}, mdat#${iMdat})`);
    hong = 1;
    continue;
  }

  const dich = `${duong.replace(/\.mp4$/i, "")}.faststart.mp4`;
  writeFileSync(dich, ra);
  const pc = ((lai[iMoov].dau / ra.length) * 100).toFixed(1);
  console.log(`OK   ${duong} → ${dich}  · moov nay ở ${pc}% · đã bù ${soO} ô offset`);
}
process.exit(hong);
