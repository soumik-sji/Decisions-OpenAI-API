import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { MailSenderForm } from "./MailSenderForm";

export const metadata: Metadata = { title: "Mail Sender · OpenAI Decisions vs. Baseline Demo" };

export default function MailSenderPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Mail Sender"
        description="Create a simulated email to use in the comparison. Nothing is sent. The email is only saved to the demo database."
      />
      <MailSenderForm />
    </div>
  );
}
