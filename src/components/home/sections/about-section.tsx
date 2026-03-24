import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading } from "@/components/home/ui-primitives";

export function AboutSection() {
  return (
    <section id="about" className="home-section-space">
      <div className="home-fluid-tight w-full">
        <SectionReveal>
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <SectionHeading
              title="About L&B Global"
              subtitle="We are an overseas education consultancy delivering end-to-end support for admissions and visa outcomes. Our system is built for proactive follow-up and transparent student progress tracking."
            />
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

