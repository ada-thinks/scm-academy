import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-full">
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
