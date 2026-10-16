"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/mail-sender", label: "Mail Sender", hint: "Create a demo email" },
  { href: "/dashboard", label: "Inbox", hint: "Pick an email to compare" },
  { href: "/benchmarks", label: "Benchmarks", hint: "Results across runs" },
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  return <NavList activePath={pathname} />;
}

// Rendered as the Suspense fallback too, so the nav never disappears.
export function NavList({ activePath }: { activePath: string | null }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          activePath === item.href ||
          (item.href === "/dashboard" && activePath?.startsWith("/comparison"));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 transition-colors ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-200/60"
            }`}
          >
            <span className="block text-sm font-medium">{item.label}</span>
            <span
              className={`block text-xs ${active ? "text-zinc-300" : "text-zinc-500"}`}
            >
              {item.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
