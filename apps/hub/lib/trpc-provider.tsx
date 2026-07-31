"use client";

import { useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import {
  REACT_QUERY_DEFAULTS,
  isUnauthorizedError,
  loginRedirectHref,
  trpc,
} from "./trpc-client";

/**
 * Đưa người dùng về màn đăng nhập, GIỮ LẠI trang họ đang đứng trong `?then=`.
 *
 * Vì sao dùng `window.location.assign` chứ không `router.push`: phiên đã chết nên mọi Server
 * Component trên trang hiện tại cũng không còn dữ liệu; nạp lại cả trang là cách duy nhất
 * chắc chắn xoá sạch cache RSC cũ. Ngoài ra `?then=` có thể trỏ tới `/oidc/interaction/<uid>`
 * — đường do server.mjs phục vụ, nằm ngoài router của Next.
 *
 * `redirecting` chặn hiệu ứng "bắn liên thanh": một màn hình có 13 query, phiên hết hạn thì cả
 * 13 cùng trả UNAUTHORIZED trong một nhịp; không có cờ này thì trang bị gọi assign 13 lần.
 */
let redirecting = false;

function goToLoginKeepingPlace() {
  if (redirecting) return;
  if (typeof window === "undefined") return;
  const href = loginRedirectHref(window.location.pathname, window.location.search);
  // `null` = đang ở /login rồi. Đứng yên, để chính màn đăng nhập báo lỗi — nạp lại trang ở đây
  // sẽ thành vòng lặp vô tận ngay trước mặt người dùng.
  if (!href) return;
  redirecting = true;
  window.location.assign(href);
}

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: REACT_QUERY_DEFAULTS,
        // MỘT chỗ duy nhất xử lý "hết phiên" cho toàn ứng dụng. Trước 31/07/2026 mỗi màn hình
        // tự vẽ một dòng chữ đỏ (buồng lái GVCN, báo cáo tăng trưởng, màn "cần gặp thầy cô")
        // và không nơi nào đưa người dùng về /login — thầy cô ngồi trước thẻ báo lỗi, bấm lại
        // vẫn lỗi, không có đường thoát. Đặt ở tầng cache nên phủ cả query lẫn mutation, kể cả
        // những màn hình viết sau này quên xử lý lỗi.
        queryCache: new QueryCache({
          onError: (error) => {
            if (isUnauthorizedError(error)) goToLoginKeepingPlace();
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            if (isUnauthorizedError(error)) goToLoginKeepingPlace();
          },
        }),
      }),
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          fetch(url, options) {
            return fetch(url, { ...options, credentials: "include" });
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
