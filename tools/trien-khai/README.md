# Bộ triển khai VPS — thi hành ADR-018/019

Hình dạng đã chốt trong sổ quyết định: **một VPS duy nhất** (16 vCPU / 32 GB, Ubuntu 24.04),
app chạy **PM2**, **Nginx + Let's Encrypt** đứng trước, **database ở Supabase** (kết nối qua
Supavisor transaction pooling — 05-capacity-ops.md). Không Docker cho app, không K8s, không
load balancer. Cloudflared tunnel là đồ của thời máy-dev — VPS trỏ DNS thẳng.

## 0. Thứ tự một lần dựng mới

```bash
# 1. Hệ (chạy bằng user thường có sudo, KHÔNG chạy app bằng root)
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pnpm pm2

# 2. Mã nguồn + phụ thuộc
sudo mkdir -p /srv/hub && sudo chown "$USER" /srv/hub
git clone <repo> /srv/hub/app && cd /srv/hub/app && pnpm install --frozen-lockfile

# 3. Biến môi trường: chép mẫu rồi ĐIỀN THẬT — đọc kỹ từng chú thích trong file mẫu
cp tools/trien-khai/env.production.mau apps/hub/.env.local && nano apps/hub/.env.local

# 4. Migration lên database Supabase (chạy MỘT lần mỗi đợt lên schema)
DATABASE_URL="<chuỗi Supavisor>" node tools/migrate/migrate.mjs up

# 5. Build + chạy
cd apps/hub && npx next build && cd ../..
pm2 start tools/trien-khai/ecosystem.config.cjs && pm2 save && pm2 startup

# 6. Nginx + TLS
sudo cp tools/trien-khai/nginx-hub.conf /etc/nginx/sites-available/hub
sudo ln -s /etc/nginx/sites-available/hub /etc/nginx/sites-enabled/hub
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hub.truongvietanh.com
```

## Lên bản mới / lùi bản

```bash
bash tools/trien-khai/deploy.sh          # pull → install → build → (hỏi) migrate → pm2 reload
bash tools/trien-khai/deploy.sh --lui    # quay về commit đã chạy ngay trước đó
```

`deploy.sh` ghi commit đang chạy vào `/srv/hub/DA_CHAY` trước khi đổi — "một lệnh lùi bản"
của ADR-018 chính là đọc lại file đó.

## Ba luật không được quên

1. **KHÔNG đặt `DEV_LOGIN_CHO_PHEP_O_BAN_THAT` trên VPS.** Thiếu biến ⇒ cửa đăng nhập thử
   không tồn tại (404) — đây là cách nợ #19/#63 được đóng trên máy thật. Đăng nhập thật là
   Google SSO (`SUPABASE_URL`).
2. **Đổi hết chuỗi bí mật trước giờ mở cửa** (nợ #65): `EMBED_WEBHOOK_SECRET_CHUNG` thôi là
   `vietanh2026` — sinh mới bằng `openssl rand -base64 48`, và GỬI RIÊNG cho từng đội app
   (cửa sổ chồng lấn khi xoay: xem acceptPreviousSecrets trong provider.ts).
3. **`instances: 1` trong PM2 là CỐ Ý, không phải quên bật cluster.** oidc-provider và
   rate-limit đang giữ trạng thái trong bộ nhớ tiến trình — nhiều instance là interaction
   đăng nhập rơi giữa hai tiến trình. 5k user / 300k request/ngày ≈ 3,5 req/s trung bình:
   một tiến trình Node thừa sức (05-capacity-ops.md). Muốn cluster thì trước hết phải dời
   trạng thái đó ra ngoài — đó là một ADR, không phải một con số trong file config.

## Go-live: chạy đủ 8 nhóm trong `danh-cho-may/07-operations.md` (mục checklist) trước khi
trỏ DNS. Đặc biệt: k6 3.000 check-in/30 phút, drill khôi phục backup, secret-scan.
