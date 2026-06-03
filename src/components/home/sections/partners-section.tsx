import { PartnerLogoMarquee } from "@/components/home/partner-logo-marquee";
import { partnerLogosRowBottom, partnerLogosRowTop } from "@/components/home/partner-logos";
import { SectionReveal } from "@/components/home/section-reveal";

export function PartnersSection() {
  return (
    <section
      id="partners"
      className="home-section-space relative overflow-hidden border-t border-slate-100 bg-gradient-to-b from-white via-slate-50/90 to-white"
      aria-labelledby="partners-heading"
    >
      <div
        className="pointer-events-none absolute -left-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-rose-200/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-blue-200/25 blur-3xl"
        aria-hidden
      />

      <div className="home-fluid-shell relative w-full">
        <SectionReveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2
              id="partners-heading"
              className="text-[clamp(1.5rem,3vw,2.25rem)] font-bold tracking-tight text-blue-900"
            >
              Education &amp; migration partners
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-[clamp(0.95rem,1.35vw,1.05rem)] leading-7 text-slate-600">
              We collaborate with leading institutions and service providers across Australia and
              the region — giving you clearer pathways and stronger outcomes.
            </p>
          </div>
        </SectionReveal>

        <div className="mt-12 space-y-5 sm:mt-14 sm:space-y-6">
          <SectionReveal delay={0.12}>
            <PartnerLogoMarquee logos={partnerLogosRowTop} direction="left" durationSeconds={45} />
          </SectionReveal>
          <SectionReveal delay={0.18}>
            <PartnerLogoMarquee logos={partnerLogosRowBottom} direction="right" durationSeconds={45} />
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
