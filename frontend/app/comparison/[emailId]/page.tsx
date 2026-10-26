import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Spinner } from "@/components/ui";
import { ComparisonView } from "./ComparisonView";

export const metadata: Metadata = { title: "Comparison · OpenAI Decisions vs. Baseline Demo" };

export default function ComparisonPage({
  params,
}: PageProps<"/comparison/[emailId]">) {
  return (
    <Suspense
      fallback={
        <Card className="flex items-center gap-3 text-sm text-zinc-600">
          <Spinner /> Loading…
        </Card>
      }
    >
      {params.then(({ emailId }) => (
        <ComparisonView emailId={emailId} />
      ))}
    </Suspense>
  );
}
