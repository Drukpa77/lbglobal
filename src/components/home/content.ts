export const homeNavLinks = [
  { href: "#services", label: "Services" },
  { href: "#about", label: "About" },
  { href: "#destinations", label: "Destinations" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "#contact", label: "Contact" },
] as const;

export const heroData = {
  eyebrow: "Admissions + Visa Execution",
  title: "Making Your Study Abroad",
  titleHighlight: "Journey a Success Story",
  subtitle:
    "We help students choose the right course, prepare stronger applications, and move through visa steps with confidence and practical timelines.",
  primaryCta: { href: "/apply", label: "Book Free Assessment" },
  secondaryCta: { href: "#process", label: "See How It Works" },
};

export const trustStats = [
  { label: "Students Guided", value: "1,000+" },
  { label: "Visa Success Rate", value: "95%+" },
  { label: "Country Offices", value: "2" },
  { label: "Response Window", value: "1–2 Days" },
] as const;

export const featureBullets = [
  "Course-country strategy mapped to profile and budget",
  "Document quality checks and SOP support",
  "Visa guidance with clear milestone tracking",
  "End-to-end support from first inquiry to departure",
] as const;

export const proofBullets = [
  "Dedicated counselor workflow from inquiry to enrollment",
  "Structured document checks and SOP preparation support",
  "Role-based team tracking for faster follow-up and accountability",
  "Live update stream on policy/news changes via newsletter",
] as const;

export const processSteps = [
  {
    step: "01",
    title: "Submit Inquiry",
    description: "Tell us your profile and goals through a quick form.",
  },
  {
    step: "02",
    title: "Strategy Call",
    description: "Get course-country options with realistic timeline and costs.",
  },
  {
    step: "03",
    title: "Apply + Prepare",
    description: "We guide documents, SOP, and institution submissions.",
  },
  {
    step: "04",
    title: "Visa + Departure",
    description: "Final visa stage support and pre-departure checklist.",
  },
] as const;

export const services = [
  {
    title: "Student Admission",
    description:
      "Full guidance from course selection and institution matching to offer letter receipt.",
  },
  {
    title: "Visa Application",
    description:
      "End-to-end student visa support with documentation, compliance, and timeline planning.",
  },
  {
    title: "Health Insurance",
    description:
      "OSHC and health cover setup for international students studying abroad.",
  },
  {
    title: "PTE / IELTS Preparation",
    description:
      "Structured language test preparation with experienced coaches and practice resources.",
  },
  {
    title: "Student Accommodation",
    description:
      "Guidance on finding safe, affordable, and convenient housing near your institution.",
  },
  {
    title: "Skills Assessment",
    description:
      "Professional qualification assessments and recognition for further study pathways.",
  },
] as const;

export const destinations = [
  {
    country: "Australia",
    flag: "🇦🇺",
    tagline: "Study Destination",
    description:
      "Globally recognised qualifications, post-study work rights, and strong graduate outcomes.",
    highlights: ["Top-ranked universities", "Post-study work visa", "Multicultural society"],
  },
  {
    country: "Canada",
    flag: "🇨🇦",
    tagline: "Study Destination",
    description:
      "High quality education ecosystem with excellent student support and permanent residency pathways.",
    highlights: ["World-class institutions", "PR pathway options", "Safe and inclusive"],
  },
  {
    country: "India",
    flag: "🇮🇳",
    tagline: "Study Destination",
    description:
      "On-the-ground counselling and full application support for students across Bhutan planning to study in India.",
    highlights: [
      "Free profile & course assessment",
      "Admission and visa documentation",
      "PTE / IELTS preparation support",
    ],
  },
] as const;

export const testimonials = [
  {
    name: "Tenzin D.",
    location: "Bhutan → Australia",
    quote:
      "L&B Global made my study abroad journey completely stress-free. From course selection to visa approval, they handled everything with incredible care and professionalism.",
    rating: 5,
  },
  {
    name: "Karma W.",
    location: "Bhutan → Canada",
    quote:
      "The team was always available to answer my questions. My student visa was approved without issues thanks to their thorough preparation and support.",
    rating: 5,
  },
  {
    name: "Sonam P.",
    location: "Bhutan → Australia",
    quote:
      "Professional, honest, and genuinely supportive. I would not have gotten into my first-choice university without their guidance. Highly recommend L&B Global.",
    rating: 5,
  },
] as const;

export const offices = [
  {
    title: "Bhutan Office",
    address: "Thimphu, Kingdom of Bhutan",
    details:
      "Bhutanese student - free assessment, course-country counselling, document checks, SOP support, and visa application guidance.",
    phone: "+975 7778 1399",
    email: "student@lbglobal.com",
    hours: "Mon–Fri, 9:00 AM – 5:00 PM (Bhutan Time)",
  },
  {
    title: "Australia Office",
    address:
      "Level 5, Unit 32, 25 Walters Dr, Osborne Park, Perth, Western Australia 6017",
    details:
      "Perth-based team for enrolment follow-up, provider liaison, and onshore student support in Western Australia.",
    phone: "0424 919 833",
    email: "student@lbglobal.com",
    hours: "Mon–Fri, 9:00 AM – 5:00 PM (AWST)",
  },
] as const;

export const accreditations = [
  "QEAC Certified",
  "PIER Registered",
  "Student Visa Specialists",
  "Partner Institutions",
  "Licensed Consultants",
] as const;
