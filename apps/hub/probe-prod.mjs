// Dò xem chế độ chạy thật treo ở BƯỚC NÀO. Xoá sau khi dùng.
import next from "next";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const moc = Date.now();
const t = (nhan) => console.log(`[${String(Date.now() - moc).padStart(6)}ms] ${nhan}`);

t("bắt đầu");
loadEnvConfig(process.cwd());
t("đã nạp env");

const app = next({ dev: false });
t("đã dựng đối tượng next");

const hen = setTimeout(() => {
  console.log("!!! QUÁ 20 GIÂY — treo ở bước ngay sau nhãn cuối cùng ở trên");
  process.exit(3);
}, 20000);

await app.prepare();
t("app.prepare() xong");

const { getProvider } = await import("./server/oidc/provider.ts");
t("đã import provider.ts");

await getProvider();
t("getProvider() xong");

clearTimeout(hen);
t("TẤT CẢ ĐỀU QUA — không có bước nào treo");
process.exit(0);
