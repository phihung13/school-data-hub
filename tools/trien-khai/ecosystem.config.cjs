// PM2 — thi hành ADR-018. `instances: 1` là CỐ Ý (oidc-provider + rate-limit giữ trạng
// thái trong bộ nhớ tiến trình — xem README.md luật 3). Tải thiết kế 300k req/ngày ≈
// 3,5 req/s trung bình: một tiến trình Node thừa sức, đo trước khi nghĩ tới cluster.
module.exports = {
  apps: [
    {
      name: "hub",
      cwd: "/srv/hub/app/apps/hub",
      script: "server.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: "3000" },
      // Chết là dựng lại, nhưng không dựng điên: 10 lần trong 60s thì dừng hẳn cho
      // người trực đọc log — một tiến trình chết-lặp là một lỗi cấu hình, không phải
      // một thứ để restart che đi.
      max_restarts: 10,
      min_uptime: "6s",
      restart_delay: 2000,
      // server.mjs tự log ra stdout/stderr — PM2 gom về đây, logrotate của pm2-logrotate
      // (cài kèm: `pm2 install pm2-logrotate`) giữ 14 ngày.
      out_file: "/srv/hub/log/hub.out.log",
      error_file: "/srv/hub/log/hub.err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
