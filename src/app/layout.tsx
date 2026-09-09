import type { Metadata } from "next";
import { Noto_Sans_SC, ZCOOL_XiaoWei } from "next/font/google";
import "./globals.css";
import { seedIfNeeded } from "@/lib/seed";

const sans = Noto_Sans_SC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const display = ZCOOL_XiaoWei({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "链关学堂 · 供应链闯关学习",
  description: "把教材和系统手册变成课程、脑图、案例和闯关测验",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await seedIfNeeded();
  return (
    <html lang="zh-CN" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
