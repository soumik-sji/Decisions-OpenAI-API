import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { NavList, SidebarNav } from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenAI Decisions vs. Baseline Demo",
  description:
    "Compare OpenAI Decisions and an OpenAI baseline side by side on the same simulated email.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-100 p-4">
          <div className="mb-6 px-3">
            <p className="text-lg font-semibold tracking-tight">Decisions vs. Baseline</p>
            <p className="text-xs text-zinc-500">AI mail intelligence demo</p>
          </div>
          <Suspense fallback={<NavList activePath={null} />}>
            <SidebarNav />
          </Suspense>
          <p className="mt-auto px-3 text-xs leading-relaxed text-zinc-500">
            Demonstration only. Emails are simulated and never sent.
          </p>
        </aside>
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </body>
    </html>
  );
}
