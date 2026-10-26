import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorBox({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-red-300 bg-white px-3 py-1 font-medium hover:bg-red-100"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function Unavailable({ children = "Unavailable" }: { children?: ReactNode }) {
  return <span className="text-sm italic text-zinc-400">{children}</span>;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonPrimary = `${buttonBase} bg-zinc-900 text-white hover:bg-zinc-700`;
export const buttonSecondary = `${buttonBase} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`;

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Per-call costs are fractions of a cent, so show enough digits to be meaningful. */
export function formatCost(usd: number | null): string | null {
  if (usd === null) return null;
  return `$${usd.toFixed(usd < 0.01 ? 6 : 4)}`;
}

export function formatLatency(ms: number | null): string | null {
  return ms === null ? null : `${Math.round(ms).toLocaleString()} ms`;
}
