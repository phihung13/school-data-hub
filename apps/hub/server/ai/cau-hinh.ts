// apps/hub/server/ai/cau-hinh.ts — kho cấu hình AI cho DEMO.
//
// Khoá OpenRouter nhập từ màn Cài đặt (UI) → lưu file gitignore trên máy chủ + cache RAM.
// KHÔNG BAO GIỜ trả khoá về client (§4): route status chỉ nói "đã có khoá / model gì".
// Ưu tiên ENV (cách chuẩn của trường — AI_API_KEY/AI_MODEL/AI_API_URL); thiếu env thì
// đọc file do UI lưu. Đây là đường tiện cho demo, không thay env ở production.
import { promises as fs } from "node:fs";
import path from "node:path";

export interface CauHinhAi {
  khoa: string;
  model: string;
  url: string;
}

const FILE = path.join(process.cwd(), ".leo-ai.local.json");
const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_MAC_DINH = "openai/gpt-4o-mini";

let cache: CauHinhAi | null = null;

/** Đọc cấu hình hiện dùng: env thắng, rồi tới file do UI lưu, rồi tới mặc định (không khoá). */
export async function docCauHinhAi(): Promise<CauHinhAi> {
  const envKhoa = (process.env.AI_API_KEY ?? "").trim();
  if (envKhoa) {
    return {
      khoa: envKhoa,
      model: (process.env.AI_MODEL ?? MODEL_MAC_DINH).trim(),
      url: (process.env.AI_API_URL ?? URL_OPENROUTER).trim(),
    };
  }
  if (cache) return cache;
  try {
    const j = JSON.parse(await fs.readFile(FILE, "utf8")) as Partial<CauHinhAi>;
    cache = {
      khoa: (j.khoa ?? "").trim(),
      model: (j.model ?? MODEL_MAC_DINH).trim(),
      url: (j.url ?? URL_OPENROUTER).trim(),
    };
  } catch {
    cache = { khoa: "", model: MODEL_MAC_DINH, url: URL_OPENROUTER };
  }
  return cache;
}

/** Lưu khoá/model từ UI. `mode 0o600`: chỉ chủ tiến trình đọc được file trên đĩa. */
export async function luuCauHinhAi(cfg: { khoa: string; model?: string }): Promise<void> {
  const data: CauHinhAi = {
    khoa: cfg.khoa.trim(),
    model: (cfg.model ?? "").trim() || MODEL_MAC_DINH,
    url: URL_OPENROUTER,
  };
  await fs.writeFile(FILE, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
  cache = data;
}
