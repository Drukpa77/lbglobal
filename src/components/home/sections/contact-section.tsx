import { offices } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading } from "@/components/home/ui-primitives";

export function ContactSection() {
  return (
    <section id="contact" className="home-section-space">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <SectionHeading
            title="Contact Us"
            subtitle="Tell us your goals and we will guide your next best step."
          />
        </SectionReveal>
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <SectionReveal>
            <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] lg:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <input className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400" placeholder="Your name" />
                <input className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400" placeholder="Email" />
              </div>
              <input className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400" placeholder="Subject" />
              <textarea className="mt-4 min-h-32 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400" placeholder="Your message" />
              <button type="button" className="mt-6 rounded-xl bg-gradient-to-r from-rose-500 to-blue-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90">
                Send message
              </button>
            </form>
          </SectionReveal>

          <div className="space-y-4">
            {offices.map((office, index) => (
              <SectionReveal key={office.title} delay={index * 0.06}>
                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                  <h3 className="font-bold text-rose-600">{office.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{office.address}</p>
                  <p className="mt-1 text-sm text-slate-600">{office.phone}</p>
                  <a href={`mailto:${office.email}`} className="mt-1 block text-sm text-blue-600 hover:underline">
                    {office.email}
                  </a>
                </article>
              </SectionReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

