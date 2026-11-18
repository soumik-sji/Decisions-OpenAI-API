import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, buttonPrimary } from "@/components/ui";
import { Inbox } from "./Inbox";

export const metadata: Metadata = { title: "Inbox · OpenAI Decisions vs. Baseline Demo" };

export default function DashboardPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Inbox"
        description="Saved demo emails. Open one to compare the typed-decision engine (OpenAI Decisions or Jev) with the OpenAI baseline."
        action={
          <Link href="/mail-sender" className={buttonPrimary}>
            New email
          </Link>
        }
      />
      <Inbox />
    </div>
  );
}
