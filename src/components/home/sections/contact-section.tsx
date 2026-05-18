import { Mail, MapPin, Phone } from "lucide-react";

import { offices } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";

export function ContactSection() {
  return (
    <section id="contact" className="home-section-space bg-slate-50">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
              Get In Touch
            </p>
            <h2 className="mt-2 text-[clamp(1.6rem,3.2vw,2.4rem)] font-bold tracking-tight text-blue-900">
              Contact Us
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.4vw,1.05rem)] leading-7 text-slate-600">
              Tell us your goals and we will guide your next best step.
            </p>
          </div>
        </SectionReveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {/* Contact form */}
          <div className="lg:col-span-2">
          <SectionReveal>
            <form className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <h3 className="mb-5 text-lg font-bold text-blue-900">Send Us a Message</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Your Name
                  </label>
                  <input
                  className="w-full rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  placeholder="e.g. Tenzin Dorji"
                />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="w-full rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    placeholder="you@email.com"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Subject
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  placeholder="e.g. Student visa inquiry"
                />
              </div>
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Message
                </label>
                <textarea
                  className="min-h-32 w-full rounded border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                  placeholder="Tell us about your goals and current situation..."
                />
              </div>
              <button
                type="button"
                className="mt-6 rounded bg-gradient-to-r from-rose-500 to-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Send Message
              </button>
            </form>
          </SectionReveal>
          </div>

          {/* Office cards */}
          <div className="space-y-4">
            {offices.map((office, index) => (
              <SectionReveal key={office.title} delay={index * 0.07}>
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 h-1 w-10 rounded-full bg-gradient-to-r from-rose-500 to-blue-600" />
                  <h3 className="font-bold text-blue-900">{office.title}</h3>
                  <div className="mt-3 space-y-2">
                    <p className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                      {office.address}
                    </p>
                    <a
                      href={`tel:${office.phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-2 text-sm text-slate-600 transition hover:text-blue-900"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-rose-500" />
                      {office.phone}
                    </a>
                    <a
                      href={`mailto:${office.email}`}
                      className="flex items-center gap-2 text-sm text-rose-500 transition hover:text-rose-600"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-rose-500" />
                      {office.email}
                    </a>
                  </div>
                </article>
              </SectionReveal>
            ))}

            {/* WhatsApp CTA */}
            <SectionReveal delay={0.14}>
              <a
                href="https://wa.me/97577781399"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded bg-[#25D366] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#20bd5a]"
              >
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                Chat on WhatsApp
              </a>
            </SectionReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
