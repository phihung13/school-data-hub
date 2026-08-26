# CHUYỂN NHÀ — đưa Hub từ máy dev sang máy chủ khác (26/08/2026)

Chủ đầu tư: "tôi muốn đưa lên github để máy khác host, tôi không muốn máy tôi host nữa."

Git mang được **mã nguồn, migrations, fixtures, video/ảnh trong `public/`, và cả bộ triển
khai này**. Git KHÔNG mang được bốn thứ — thiếu một là máy mới không lên hoặc lên sai:

## 1. Bốn thứ phải mang tay (không có trong git)

| Thứ | Nằm ở đâu trên máy cũ | Mang thế nào |
|---|---|---|
| **Chuỗi bí mật** | `apps/hub/.env.local` | Chép qua kênh riêng (USB/密, KHÔNG gửi chat/email thường). Trên máy mới: điền vào khuôn `env.production.mau`. **`OIDC_JWKS` PHẢI giữ NGUYÊN** — đổi khoá ký là mọi app ngoài (Factory, Class) gãy đăng nhập cho tới khi họ nạp lại JWKS. Các chuỗi khác đổi mới càng tốt (mọi người chỉ phải đăng nhập lại) |
| **Database** | ~~Docker máy cũ~~ → **ĐÃ Ở SUPABASE từ 26/08/2026** (project `major-os`, 71 migration + seed + sổ đăng ký 2 app đã nạp xong) | Máy mới KHÔNG phải dựng database gì cả — chỉ cần `DATABASE_URL` (chuỗi transaction pooler, nằm trong `.env.local` mang theo). Docker `pg_hub` máy cũ là đường lùi 1 tuần rồi tắt |
| **Đường ra Internet** | Tunnel cloudflared của máy cũ (`~/.cloudflared/`) | Máy mới là **VPS có IP công khai** → KHÔNG dùng tunnel: trỏ DNS `os.truongvietanh.com` thẳng về IP, dựng Nginx + Let's Encrypt theo `README.md`. Máy mới **không có IP công khai** (một PC khác trong trường) → tạo tunnel MỚI trên máy đó (`cloudflared tunnel create hub`) rồi đổi DNS route sang tunnel mới — đừng chép credential tunnel cũ, một tunnel hai máy tranh nhau là 50% request rơi vào máy đã tắt |
| **Cấu hình SSO Google** (khi đã bật) | Supabase dashboard + Google Console | Không phụ thuộc máy — chỉ cần thêm biến `SUPABASE_URL` vào env máy mới |

## 2. Trình tự trên máy mới (VPS Ubuntu — đường chuẩn)

Theo đúng `README.md` cùng thư mục, tóm tắt:

```bash
git clone https://github.com/phihung13/school-data-hub.git /srv/hub/app
cd /srv/hub/app && git checkout sso-vao-so-dang-ky   # hoặc main sau khi merge
pnpm install --frozen-lockfile
cp tools/trien-khai/env.production.mau apps/hub/.env.local   # điền thật (mục 1)
# Database ĐÃ ở Supabase — không migrate, không nạp dump gì ở bước này.
# (Đợt lên schema sau này mới chạy: DATABASE_URL=... node tools/migrate/migrate.mjs up)
cd apps/hub && npx next build && cd ../..
pm2 start tools/trien-khai/ecosystem.config.cjs && pm2 save
# Nginx + certbot theo README, hoặc tunnel mới nếu không có IP công khai
```

## 3. Nghi thức TẮT máy cũ — đúng thứ tự, không có "để đấy cho chắc"

1. Máy mới lên, tự kiểm "trang có bấm được không" (bộ kiểm trong start-local.sh, mục 2b).
2. Đổi DNS/tunnel route trỏ về máy mới. Đợi một lượt người thật đăng nhập thành công.
3. Trên máy cũ: tắt tiến trình node cổng 3000 **và** cloudflared. KHÔNG để hai máy cùng
   phục vụ một tên miền — phiên đăng nhập ký bằng secret nào thì chỉ máy giữ secret đó
   đọc được, hai máy lệch env là người dùng bị đăng xuất ngẫu nhiên theo từng request.
4. Máy cũ giữ nguyên repo + Docker thêm một tuần làm đường lùi, rồi mới dọn.

## 4. Nợ đến hạn NGAY tại cửa này (đã ghi trong env.production.mau)

- `DEV_LOGIN_CHO_PHEP_O_BAN_THAT`: **không đặt** trên máy mới → cửa đăng nhập thử chết,
  nợ #19/#63 đóng. SSO Google ĐÃ SỐNG từ 26/08 (`SUPABASE_URL` trong env) — máy mới đăng
  nhập bằng Google thật ngay, không có khoảng chỉ-xem.
- `EMBED_WEBHOOK_SECRET_CHUNG`: sinh chuỗi mới, gửi riêng từng đội app (nợ #65) — dùng
  cửa sổ chồng lấn `_PREVIOUS`/`_PREVIOUS_UNTIL` để hai đội đổi dần trong một tuần.
- **Đợt vệ sinh khoá trước ngày có học sinh thật** (cả ba đã đi qua kênh chat 26/08):
  reset mật khẩu database Supabase (Settings → Database) · reset Client Secret Google
  (Console → Credentials) rồi dán lại vào Supabase · xoay service_role key (đã dặn xoay
  ngay hôm lộ — kiểm lại cho chắc).
