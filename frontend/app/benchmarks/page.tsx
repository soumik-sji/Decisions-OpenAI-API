import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Benchmarks · Jev vs. OpenAI Demo" };

// Optional page (ROADMAP §5, Page D). Built only after all three use cases work end to end.
export default function BenchmarksPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Benchmarks"
        description="Summary results across the curated, labelled test emails."
      />
      <Card className="text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">Not available yet</p>
        <p className="mt-1">
          This page will show completed and failed runs, accuracy (labelled emails
          only), agreement rate, and latency with its measurement method. It
          depends on the backend benchmark endpoints, which come after the three
          core comparisons work.
        </p>
      </Card>
    </div>
  );
}
