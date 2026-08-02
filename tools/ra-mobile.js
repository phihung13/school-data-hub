/* eslint-disable */
// tools/ra-mobile.js — RÀ BẢN ĐIỆN THOẠI BẰNG TRÌNH DUYỆT THẬT.
//
// ═══════════════════════════════════════════════════════════════════════════════
// VÌ SAO KHÔNG PHẢI MỘT BÀI TEST TRONG CI
// ═══════════════════════════════════════════════════════════════════════════════
// Ba trong bốn câu hỏi dưới đây chỉ trả lời được khi có một bộ dựng trang THẬT:
// "trang có rộng hơn khung nhìn không", "nút này cao bao nhiêu pixel", "phần tử nào
// đang đẩy trang ra". Không lời nào trong mã nguồn nói ra được mấy con số đó — cùng
// một class Tailwind cho hai chiều cao khác nhau tuỳ nội dung bên trong.
//
// Repo chưa cài Playwright (thêm ~300 MB trình duyệt cho hai dev). Nên bộ đo này chạy
// bằng chính trình duyệt đang mở, và nó KHÔNG phải một cổng CI. Nó là việc của người rà.
// Hai chỗ đã sửa nhờ nó có ảnh chụp cố định trong tests/unit/a11y.test.ts mục 2b — đó là
// phần duy nhất CI canh được, và giới hạn đó ghi thẳng trong bài test.
//
// ═══════════════════════════════════════════════════════════════════════════════
// CÁCH CHẠY
// ═══════════════════════════════════════════════════════════════════════════════
//   1. Bật Hub: bash tools/start-local.sh
//   2. Mở http://localhost:3000/login trong trình duyệt (bản thường, KHÔNG ẩn danh —
//      cần cookie đăng nhập dev).
//   3. Mở DevTools → Console, dán TOÀN BỘ file này, Enter.
//   4. Gõ:  await raMobile()
//
// Bộ đo nạp từng trang vào một <iframe> rộng 360/375px NGAY TRONG trang hiện tại. Cùng
// một engine dựng trang, cùng CSS, cùng JavaScript — chỉ khác là khung nhìn của iframe
// mới là thứ media query đọc, nên nó đo đúng cái bản điện thoại thật sẽ ra.
//
// ═══════════════════════════════════════════════════════════════════════════════
// BÁO ĐỘNG GIẢ ĐÃ GỠ (đọc trước khi thêm luật mới)
// ═══════════════════════════════════════════════════════════════════════════════
// Bản đầu của bộ đo này báo ba ô nhập "cao 21px, vi phạm §11" trên /gvcn/diem-danh,
// /dieu-hanh và /dieu-khoan. Cả ba đều SAI: ba ô đó nằm trong <label> cao 44px, và bấm
// vào label cũng kích hoạt ô — kho đã xử lý có chủ ý, có cả chú thích giải thích tại
// chỗ. Một phép đo báo động giả không phải là "cẩn thận thừa": nó đẩy ba dòng nhiễu vào
// báo cáo, và người đọc quen bỏ qua nhiễu sẽ bỏ qua luôn dòng thật nằm cạnh.
// → Luật `closest('label')` ở dưới sinh ra từ đó. Thêm luật mới thì kiểm cả chiều ngược
//   lại: nó có báo cái đang đúng không.
(function () {
  const VAI = [
    ["Minh · học sinh", "90000000-0000-0000-0000-000000000005", ["/home", "/checkin", "/tuan-nay", "/diem-danh", "/bao-cao", "/can-gap-thay-co", "/ho-so"]],
    ["Khôi · học sinh có cờ", "90000000-0000-0000-0000-000000000010", ["/home", "/checkin", "/bao-cao"]],
    ["Phụ huynh của Minh", "90000000-0000-0000-0000-000000000004", ["/bao-cao", "/ho-so", "/dieu-khoan"]],
    ["Cô Vân · chủ nhiệm 2 lớp", "90000000-0000-0000-0000-000000000008", ["/home", "/gvcn", "/gvcn/lop", "/gvcn/diem-danh", "/gvcn/duyet-bao-cao", "/gvcn/ghi-chu", "/ho-so"]],
    ["Cô Mai · tâm lý cụm", "90000000-0000-0000-0000-000000000003", ["/home", "/tam-ly", "/ho-so"]],
    ["Hùng · quản trị", "90000000-0000-0000-0000-000000000007", ["/home", "/dieu-hanh", "/ho-so"]],
  ];
  const KHO = [360, 375];

  function doMotTrang(doc, win) {
    const r = doc.documentElement;
    const tran = r.scrollWidth - r.clientWidth;

    // Thủ phạm gây tràn — không có phần này thì báo cáo chỉ nói "có tràn" mà không nói ở
    // đâu, và người sửa phải tự dò từng phần tử.
    const thuPham = [];
    if (tran > 1) {
      for (const el of doc.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > r.clientWidth + 1) {
          const c = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).slice(0, 3).join(".");
          thuPham.push(el.tagName.toLowerCase() + (c ? "." + c : "") + "→" + Math.round(b.right) + "px");
        }
      }
    }

    const nho = [];
    for (const el of doc.querySelectorAll("a[href],button,[role=button],input,select")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const cs = win.getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      if (b.height >= 44) continue;
      const lb = el.closest("label"); // xem mục "báo động giả" ở đầu file
      if (lb && lb.getBoundingClientRect().height >= 44) continue;
      nho.push(((el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 26).replace(/\n/g, " ")) + "[" + Math.round(b.width) + "×" + Math.round(b.height) + "]");
    }

    return {
      tran,
      thuPham: thuPham.slice(0, 3),
      nho: [...new Set(nho)].slice(0, 4),
      tab: !!doc.querySelector('nav[aria-label="Thanh điều hướng chính"]'),
      avatar: !!doc.querySelector('button[aria-haspopup="true"]'),
      lienKet: [...doc.querySelectorAll('a[href^="/"]')].filter((a) => {
        const b = a.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      }).length,
    };
  }

  window.raMobile = async function raMobile() {
    let f = document.getElementById("__khung-ra-mobile");
    if (!f) {
      f = document.createElement("iframe");
      f.id = "__khung-ra-mobile";
      document.body.appendChild(f);
    }
    const loi = [];
    let tong = 0;

    for (const [ten, uid, man] of VAI) {
      const dn = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authUid: uid }),
      });
      if (dn.status !== 200) {
        console.log(`✗ ${ten}: đăng nhập hỏng (HTTP ${dn.status}) — đã seed dữ liệu dev chưa?`);
        loi.push(`${ten}: không đăng nhập được`);
        continue;
      }
      console.log(`\n━━ ${ten}`);
      for (const rong of KHO) {
        f.style.cssText = `position:fixed;left:-9999px;top:0;height:740px;border:0;width:${rong}px`;
        for (const duong of man) {
          tong++;
          await new Promise((res) => {
            f.onload = res;
            f.src = duong + "?raMobile=" + Date.now(); // tham số phá cache bfcache của iframe
          });
          await new Promise((res) => setTimeout(res, 700)); // chờ dữ liệu tRPC về, nếu không thì đo khung rỗng
          const d = doMotTrang(f.contentDocument, f.contentWindow);
          const ds = [];
          if (d.tran > 1) ds.push(`TRÀN NGANG ${d.tran}px (${d.thuPham.join(" · ")})`);
          if (d.nho.length) ds.push(`VÙNG BẤM <44px: ${d.nho.join(" · ")}`);
          if (!d.tab && !d.avatar && d.lienKet === 0) ds.push("KHÔNG LỐI RA");
          if (ds.length) {
            console.log(`   ✗ ${rong}px ${duong.padEnd(22)} ${ds.join(" | ")}`);
            loi.push(`${rong}px ${ten} ${duong}: ${ds.join(" | ")}`);
          } else {
            console.log(`   ✓ ${rong}px ${duong.padEnd(22)} tab:${d.tab ? "có" : "—"} avatar:${d.avatar ? "có" : "—"} liên kết:${d.lienKet}`);
          }
        }
      }
    }
    f.remove();
    console.log(`\n═══ ${tong} lượt đo · ${loi.length === 0 ? "KHÔNG CHỖ NÀO HỎNG" : loi.length + " chỗ hỏng"}`);
    return loi;
  };

  console.log("Đã nạp. Chạy:  await raMobile()");
})();
