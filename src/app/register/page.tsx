import Link from "next/link";
import { AuthPanel } from "@/components/AuthPanel";

export default function RegisterPage() {
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div>
        <AuthPanel mode="register" />
        <p className="mt-4 text-center text-sm text-ink">
          已有账号？<Link href="/login" className="text-gold">回到关卡</Link>
        </p>
      </div>
    </div>
  );
}
