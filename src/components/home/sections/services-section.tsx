import { services } from "@/components/home/content";
import { SectionReveal } from "@/components/home/section-reveal";
import { SectionHeading, SurfaceCard } from "@/components/home/ui-primitives";

export function ServicesSection() {
  return (
    <section id="services" className="home-section-space bg-gradient-to-b from-white to-slate-50">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <SectionHeading
            title="Education Services"
            subtitle="Outcome-focused support for choosing the right course, submitting stronger applications, and completing visa steps with fewer mistakes."
          />
        </SectionReveal>

        <div className="mt-10 grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {services.map((service, index) => (
            <SectionReveal key={service.title} delay={index * 0.05}>
              <SurfaceCard>
                <div className="mb-4 h-1 w-12 rounded-full bg-gradient-to-r from-rose-500 to-blue-500" />
                <h3 className="text-lg font-bold text-slate-900">{service.title}</h3>
                <p className="mt-2 text-slate-600">{service.description}</p>
              </SurfaceCard>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

