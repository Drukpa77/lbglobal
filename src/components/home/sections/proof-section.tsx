import { SectionReveal } from "@/components/home/section-reveal";
import { trustStats } from "@/components/home/content";

export function ProofSection() {
  return (
    <section id="proof" className="bg-gradient-to-r from-rose-500 to-blue-600 py-14">
      <div className="home-fluid-shell w-full">
        <SectionReveal>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trustStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-[clamp(2.5rem,5vw,3.5rem)] font-bold leading-none text-white">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-rose-100">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}
