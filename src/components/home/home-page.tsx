import dynamic from "next/dynamic";
import type { HomePostItem } from "@/components/home/types";
import { HomeNav } from "@/components/home/home-nav";
import { HeroSection } from "@/components/home/sections/hero-section";
import { ServicesSection } from "@/components/home/sections/services-section";
import { ProcessSection } from "@/components/home/sections/process-section";
import { AboutSection } from "@/components/home/sections/about-section";
import { UpdatesSection } from "@/components/home/sections/updates-section";
import { TestimonialsSection } from "@/components/home/sections/testimonials-section";

const DestinationsSection = dynamic(
  () =>
    import("@/components/home/sections/destinations-section").then(
      (m) => m.DestinationsSection,
    ),
  { loading: () => <div className="h-20" /> },
);

const ContactSection = dynamic(
  () =>
    import("@/components/home/sections/contact-section").then(
      (m) => m.ContactSection,
    ),
  { loading: () => <div className="h-20" /> },
);

const FooterSection = dynamic(
  () =>
    import("@/components/home/sections/footer-section").then(
      (m) => m.FooterSection,
    ),
  { loading: () => <div className="h-16" /> },
);

export function HomePage({ posts }: { posts: HomePostItem[] }) {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <HomeNav />
      <HeroSection />
      <ServicesSection />
      <ProcessSection />
      <AboutSection />
      <DestinationsSection />
      <TestimonialsSection />
      <UpdatesSection posts={posts} />
      <ContactSection />
      <FooterSection />
    </main>
  );
}
