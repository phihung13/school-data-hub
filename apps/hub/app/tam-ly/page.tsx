// apps/hub/app/tam-ly/page.tsx — "Tâm lý cụm": hộp việc đang chờ trong cụm.
//
// Chặn quyền ở ĐÂY (server component) chứ không chỉ ở tRPC, đúng khuôn các màn GVCN:
// vào thẳng URL mà không mang vai tâm lý cụm thì bị đá về /home trước khi tải bất kỳ dữ
// liệu nào — người dùng không phải nhìn một khung màn hình rồi mới nhận thông báo cấm.
//
// Trang KHÔNG tự kiểm "cụm gồm cơ sở nào": việc đó thuộc về `care.listClusterCases`
// (roleProcedure("counselor") + đối chiếu `core.v_my_scopes`) và về RLS. Kiểm hai nơi
// bằng hai câu truy vấn khác nhau là cách hai câu trả lời bắt đầu lệch nhau.
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { ClusterCaseListView } from "@/components/tam-ly/cluster-case-list-view";

export default async function TamLyPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!session.roles.includes("counselor")) redirect("/home");

  return <ClusterCaseListView />;
}
