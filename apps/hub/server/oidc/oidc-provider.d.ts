// oidc-provider (panva) không kèm type declarations — package thuần JS có chủ đích.
// Khai báo tối thiểu đủ để dùng làm cả type lẫn value (class Provider); còn lại
// dùng `any` — provider.ts tự khai kiểu tham số cụ thể ở nơi cần độ chính xác.
declare module "oidc-provider" {
  class Provider {
    constructor(issuer: string, config?: any);
    callback(): (req: any, res: any) => void;
    interactionDetails(req: any, res: any): Promise<any>;
    interactionFinished(req: any, res: any, result: any, options?: any): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    readonly Grant: any;
    [key: string]: any;
  }
  export default Provider;
}

// Adapter bộ nhớ trong CỦA CHÍNH thư viện, nhập theo đường sâu.
//
// Được phép: `package.json` của oidc-provider không khai trường `exports`, nên mọi file
// trong package đều nhập thẳng được — không phải một đường vòng qua rào.
//
// Vì sao không tự viết lại: từ ADR-032, model `Client` đọc từ CSDL còn mọi model khác
// (AccessToken · RefreshToken · Grant · Session · Interaction) vẫn ở RAM. Tự dựng bộ nhớ
// đó nghĩa là tự cài lại `revokeByGrantId` — chỗ thu hồi cả chùm token khi một grant chết.
// Viết sai chỗ đó là token đã thu hồi vẫn sống, và không phép thử nào của kho này nhìn thấy.
declare module "oidc-provider/lib/adapters/memory_adapter.js" {
  class MemoryAdapter {
    constructor(model: string);
    [key: string]: any;
  }
  export default MemoryAdapter;
}
