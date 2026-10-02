import { AppShell } from "@/components/crm/AppShell";
import { requireSession } from "../_lib/session";

export default async function CrmLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireSession();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}
