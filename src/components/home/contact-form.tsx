"use client";

import { useState } from "react";

import { useGlobalLoading } from "@/components/loading/global-loading-provider";

const inputClass =
  "w-full rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400";

export function ContactForm() {
  const { withLoading } = useGlobalLoading();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
      company: String(formData.get("company") ?? ""),
    };

    try {
      await withLoading(async () => {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = (await response.json()) as { error?: string; ok?: boolean };

        if (!response.ok) {
          throw new Error(data.error ?? "Something went wrong. Please try again.");
        }

        form.reset();
      });
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Network error. Please check your connection and try again.",
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-skip-global-loading="true"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8"
    >
      <h3 className="mb-5 text-lg font-bold text-blue-900">Send Us a Message</h3>

      {status === "success" ? (
        <div
          className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          role="status"
        >
          Thank you! Your message has been sent. We will reply within 1–2 business days.
        </div>
      ) : null}

      {status === "error" && errorMessage ? (
        <div
          className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Your Name
          </label>
          <input
            id="contact-name"
            name="name"
            required
            minLength={2}
            maxLength={100}
            disabled={status === "loading"}
            className={inputClass}
            placeholder="e.g. Tenzin Dorji"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1.5 block text-xs font-semibold text-slate-700">
            Email Address
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={200}
            disabled={status === "loading"}
            className={inputClass}
            placeholder="you@email.com"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="contact-subject" className="mb-1.5 block text-xs font-semibold text-slate-700">
          Subject
        </label>
        <input
          id="contact-subject"
          name="subject"
          required
          minLength={2}
          maxLength={200}
          disabled={status === "loading"}
          className={inputClass}
          placeholder="e.g. Student visa inquiry"
        />
      </div>

      <div className="mt-4">
        <label htmlFor="contact-message" className="mb-1.5 block text-xs font-semibold text-slate-700">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          minLength={10}
          maxLength={5000}
          disabled={status === "loading"}
          className={`min-h-32 ${inputClass}`}
          placeholder="Tell us about your goals and current situation..."
        />
      </div>

      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-6 rounded bg-gradient-to-r from-rose-500 to-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
