import { proofBullets } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading } from "@/components/home/ui-primitives";

export function ProofSection() {
  return (
    <section id="proof" className="home-section-space border-y border-slate-200/90 bg-white">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="grid gap-6 rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-6 md:grid-cols-2 md:p-8">
            <div>
              <SectionHeading
                eyebrow="Why students trust us"
                title="Transparent process, tracked progress, and proactive follow-up"
                subtitle="Every inquiry is recorded, assigned, and tracked through clear stages so students are never left guessing what happens next."
              />
            </div>
            <div className="grid gap-3 text-sm">
              {proofBullets.map((item) => (
                <article
                  key={item}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700 shadow-sm"
                >
                  {item}
                </article>
              ))}
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

