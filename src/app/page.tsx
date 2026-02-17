import Link from "next/link";

export default function Home() {
  return (
    <main className="bg-[#f7fbff] text-gray-900">
      <section className="bg-[#0c2c5b] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-blue-200">
              Overseas Education and Visa Services
            </p>
            <p className="text-2xl font-extrabold">L&amp;B Global</p>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm font-medium">
            <a href="#about" className="hover:text-blue-200">About Us</a>
            <a href="#destinations" className="hover:text-blue-200">Destination</a>
            <a href="#services" className="hover:text-blue-200">Services</a>
            <a href="#resources" className="hover:text-blue-200">Student Resource</a>
            <a href="#contact" className="hover:text-blue-200">Contact</a>
          </nav>
          <Link href="/login" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0c2c5b]">
            Sign in
          </Link>
        </div>
      </section>

      <section className="bg-gradient-to-r from-[#0c2c5b] via-[#14418a] to-[#0c2c5b] text-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-16 md:grid-cols-2 md:py-20">
          <HeroCard
            title="Study In Australia"
            description="Searching for the best education in Australia? Get free online counselling from L&B Global experts."
          />
          <HeroCard
            title="Study In Canada"
            description="Pursue higher studies in Canada with quality education, global exposure, and academic excellence."
          />
        </div>
      </section>

      <section id="services" className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-3xl font-bold text-[#0c2c5b]">Education Services</h2>
        <p className="mt-3 max-w-4xl text-sm text-gray-700">
          L&amp;B Global helps students choose the right program and country based on
          profile, career plan, and budget. We understand each student background
          and provide practical guidance for successful admission outcomes.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ServiceCard title="Course and Country Selection" description="Personalized guidance to match your profile with the best destination and institution." />
          <ServiceCard title="Application Documentation" description="Support with SOP, recommendation letters, CV, and complete application files." />
          <ServiceCard title="Visa and Pre-departure Briefing" description="Interview support and end-to-end preparation before you travel." />
        </div>
      </section>

      <section className="border-y bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-12 md:grid-cols-2">
          <InfoPanel
            title="Visa Services"
            content="Our team prepares students for visa interviews and documents with confidence-focused coaching. We guide applicants on question patterns, presentation quality, and embassy expectations."
          />
          <InfoPanel
            title="Student Resource"
            content="Resume preparation, SOP writing, recommendation guidance, visa interview training, and work-placement oriented profile support."
          />
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-3xl font-bold text-[#0c2c5b]">About Us</h2>
        <p className="mt-4 text-sm leading-7 text-gray-700">
          L&amp;B Global is an educational consultancy focused on overseas education
          and visa services, with a strong commitment to Bhutanese and regional
          students planning to study abroad. Our experienced team provides
          first-hand guidance from the initial counselling session to visa and
          pre-departure support.
        </p>
      </section>

      <section id="destinations" className="border-y bg-[#eef5ff]">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <h2 className="text-3xl font-bold text-[#0c2c5b]">Countries We Represent</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <DestinationCard
              country="Australia"
              description="Globally recognized qualifications, vibrant lifestyle, and strong post-study opportunities."
            />
            <DestinationCard
              country="Canada"
              description="High-quality education, safe environment, and excellent student support pathways."
            />
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-7xl px-6 py-12">
        <h2 className="text-3xl font-bold text-[#0c2c5b]">Contact Us</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <form className="rounded-xl border bg-white p-5 lg:col-span-2">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="rounded-md border px-3 py-2 text-sm" placeholder="Your name" />
              <input className="rounded-md border px-3 py-2 text-sm" placeholder="Email" />
            </div>
            <input className="mt-3 w-full rounded-md border px-3 py-2 text-sm" placeholder="Subject" />
            <textarea className="mt-3 min-h-28 w-full rounded-md border px-3 py-2 text-sm" placeholder="Your message (optional)" />
            <button type="button" className="mt-4 rounded-md bg-[#0c2c5b] px-4 py-2 text-sm font-semibold text-white">
              Send message
            </button>
          </form>
          <div className="space-y-4">
            <OfficeCard
              title="Bhutan Office"
              address="Thimphu, Bhutan"
              phone="+975 7778 1399"
              email="student@lbglobal.com"
            />
            <OfficeCard
              title="Australia Office"
              address="Perth, WA, Australia"
              phone="+61 451 106 077"
              email="student@lbglobal.com"
            />
          </div>
        </div>
      </section>

      <footer className="bg-[#0c2c5b]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-sm text-blue-100">
          <p>Copyright {new Date().getFullYear()} L&amp;B Global. All Rights Reserved.</p>
          <Link
            href="/apply"
            className="rounded-md bg-[#25D366] px-4 py-2 text-xs font-semibold text-white"
          >
            WhatsApp Us
          </Link>
        </div>
      </footer>
    </main>
  );
}

function HeroCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-sm text-blue-100">{description}</p>
      <div className="mt-6">
        <Link href="/apply" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#0c2c5b]">
          Learn More
        </Link>
      </div>
    </article>
  );
}

function ServiceCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-[#0c2c5b]">{title}</h3>
      <p className="mt-2 text-sm text-gray-700">{description}</p>
    </article>
  );
}

function InfoPanel({ title, content }: { title: string; content: string }) {
  return (
    <article className="rounded-xl border bg-[#f9fbff] p-6">
      <h3 className="text-2xl font-bold text-[#0c2c5b]">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-gray-700">{content}</p>
    </article>
  );
}

function DestinationCard({
  country,
  description,
}: {
  country: string;
  description: string;
}) {
  return (
    <article className="rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="text-2xl font-bold text-[#0c2c5b]">{country}</h3>
      <p className="mt-3 text-sm text-gray-700">{description}</p>
      <div className="mt-4">
        <Link href="/apply" className="text-sm font-semibold text-blue-700 underline">
          Learn More
        </Link>
      </div>
    </article>
  );
}

function OfficeCard({
  title,
  address,
  phone,
  email,
}: {
  title: string;
  address: string;
  phone: string;
  email: string;
}) {
  return (
    <article className="rounded-xl border bg-white p-4">
      <h3 className="text-base font-bold text-[#0c2c5b]">{title}</h3>
      <p className="mt-2 text-sm text-gray-700">{address}</p>
      <p className="text-sm text-gray-700">{phone}</p>
      <p className="text-sm text-gray-700">{email}</p>
    </article>
  );
}
