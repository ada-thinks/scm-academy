import Link from "next/link";
import { AuthPanel } from "@/components/AuthPanel";

export default function LoginPage() {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div>
        <AuthPanel mode="login" />
        <p className="mt-4 text-center text-sm text-ink">
          没有账号？<Link href="/register" className="text-gold">加入小队</Link>
        </p>
      </div>
    </div>
  );
}
