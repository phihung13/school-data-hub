// packages/core/auth-adapter/index.ts — điểm vào duy nhất của adapter auth.
// apps/hub CHỈ import từ đây, không import trực tiếp session.ts/dev-provider.ts
// từ nơi khác ngoài các route handler đăng nhập (01-architecture.md §4).
export * from "./session.ts";
export * from "./dev-provider.ts";
export * from "./dev-gate.ts";
