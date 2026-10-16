"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Email } from "@/lib/types";
import { EMAIL_CATEGORIES } from "@/lib/usecases";
import {
  Card,
  ErrorBox,
  Spinner,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

type Fields = {
  fromAddress: string;
  subject: string;
  body: string;
  expectedLabel: string;
};

type FieldErrors = Partial<Record<keyof Fields, string>>;

const EMPTY: Fields = { fromAddress: "", subject: "", body: "", expectedLabel: "" };

function validate(f: Fields): FieldErrors {
  const errors: FieldErrors = {};
  if (!f.fromAddress.trim()) errors.fromAddress = "Enter a sender name or address.";
  if (!f.subject.trim()) errors.subject = "Enter a subject.";
  if (!f.body.trim()) errors.body = "Enter the message body.";
  return errors;
}

const inputClass =
  "mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 aria-invalid:border-red-500";

export function MailSenderForm() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Email | null>(null);

  function update<K extends keyof Fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validate(fields);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const email = await api.createEmail({
        fromAddress: fields.fromAddress.trim(),
        subject: fields.subject.trim(),
        body: fields.body.trim(),
        expectedLabel: fields.expectedLabel || null,
      });
      setSaved(email);
      setFields(EMPTY);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (saved) {
    return (
      <Card>
        <p className="text-sm font-medium text-emerald-700">Email saved (not sent)</p>
        <p className="mt-1 text-lg font-semibold">{saved.subject}</p>
        <p className="text-sm text-zinc-600">From {saved.fromAddress}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/comparison/${saved.id}`} className={buttonPrimary}>
            Open in comparison
          </Link>
          <Link href="/dashboard" className={buttonSecondary}>
            Go to inbox
          </Link>
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => setSaved(null)}
          >
            Write another
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <input
            id="from"
            className={inputClass}
            placeholder="jordan@example.com"
            value={fields.fromAddress}
            onChange={(e) => update("fromAddress", e.target.value)}
            aria-invalid={!!errors.fromAddress}
            aria-describedby={errors.fromAddress ? "from-error" : undefined}
          />
          {errors.fromAddress && (
            <p id="from-error" className="mt-1 text-xs text-red-600">
              {errors.fromAddress}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="subject" className="text-sm font-medium">
            Subject
          </label>
          <input
            id="subject"
            className={inputClass}
            placeholder="Charged twice this month"
            value={fields.subject}
            onChange={(e) => update("subject", e.target.value)}
            aria-invalid={!!errors.subject}
            aria-describedby={errors.subject ? "subject-error" : undefined}
          />
          {errors.subject && (
            <p id="subject-error" className="mt-1 text-xs text-red-600">
              {errors.subject}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="body" className="text-sm font-medium">
            Message
          </label>
          <textarea
            id="body"
            rows={8}
            className={inputClass}
            placeholder="Write the email body…"
            value={fields.body}
            onChange={(e) => update("body", e.target.value)}
            aria-invalid={!!errors.body}
            aria-describedby={errors.body ? "body-error" : undefined}
          />
          {errors.body && (
            <p id="body-error" className="mt-1 text-xs text-red-600">
              {errors.body}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="expected" className="text-sm font-medium">
            Expected category <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <select
            id="expected"
            className={inputClass}
            value={fields.expectedLabel}
            onChange={(e) => update("expectedLabel", e.target.value)}
          >
            <option value="">No expected label</option>
            {EMAIL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Used as ground truth for the Email Detector. Accuracy is only measured
            for emails that have a label.
          </p>
        </div>

        {submitError && (
          <ErrorBox title="Email not saved" message={submitError} />
        )}

        <div>
          <button type="submit" className={buttonPrimary} disabled={submitting}>
            {submitting && <Spinner />}
            {submitting ? "Saving…" : "Save email"}
          </button>
        </div>
      </form>
    </Card>
  );
}
