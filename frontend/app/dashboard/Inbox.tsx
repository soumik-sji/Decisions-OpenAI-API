"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Email } from "@/lib/types";
import { EMAIL_CATEGORIES } from "@/lib/usecases";
import {
  Card,
  ErrorBox,
  Spinner,
  buttonPrimary,
  buttonSecondary,
  formatDate,
} from "@/components/ui";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; emails: Email[] };

const UNLABELLED = "__unlabelled__";

export function Inbox() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", emails: await api.listEmails() });
    } catch (err) {
      setState({ kind: "error", message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state?.emails?.filter((e) => {
      if (label === UNLABELLED && e.expectedLabel) return false;
      if (label && label !== UNLABELLED && e.expectedLabel !== label) return false;
      if (!q) return true;
      return [e.subject, e.fromAddress, e.body].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
  }, [state, query, label]);

  if (state.kind === "loading") {
    return (
      <Card className="flex items-center gap-3 text-sm text-zinc-600">
        <Spinner /> Loading emails…
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <ErrorBox title="Couldn't load emails" message={state.message} onRetry={load} />
    );
  }

  if (state.emails.length === 0) {
    return (
      <Card className="py-12 text-center">
        <p className="font-medium">No emails yet</p>
        <p className="mt-1 text-sm text-zinc-600">
          Create a simulated email to start a comparison.
        </p>
        <Link href="/mail-sender" className={`${buttonPrimary} mt-4`}>
          Write an email
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          aria-label="Search emails"
          placeholder="Search subject, sender, or body"
          className="w-72 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter by expected label"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        >
          <option value="">All labels</option>
          <option value={UNLABELLED}>No expected label</option>
          {EMAIL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" onClick={load} className={buttonSecondary}>
          Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <Card className="text-sm text-zinc-600">No emails match these filters.</Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((email) => (
            <li key={email.id}>
              <Card className="flex items-center gap-6 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <p className="truncate font-medium">{email.subject}</p>
                    {email.expectedLabel && (
                      <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        Expected: {email.expectedLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {email.fromAddress} · {formatDate(email.createdAt)}
                  </p>
                  <p className="mt-1 truncate text-sm text-zinc-600">{email.body}</p>
                </div>
                <Link
                  href={`/comparison/${email.id}`}
                  className={`${buttonSecondary} shrink-0`}
                >
                  Open in comparison
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
