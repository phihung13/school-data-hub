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
