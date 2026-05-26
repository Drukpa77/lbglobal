/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * One-off seeder that publishes 4 SEO-friendly immigration articles
 * into the HomePost table. Safe to re-run — uses upsert by slug.
 *
 * Run with:
 *   node prisma/seed-newsletter-articles.js
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function htmlToPlainText(html) {
  return html
    .replace(/<\/(p|h\d|li|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const ARTICLES = [
  {
    slug: "australian-student-visa-subclass-500-2026-requirements-costs-processing",
    title:
      "Australian Student Visa (Subclass 500) in 2026: Requirements, Costs & Processing Times",
    publishOffsetDays: -2,
    featuredThumbnail:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80&auto=format&fit=crop",
    featuredThumbnailAlt:
      "Passport, world map, and travel notebook — symbolising an Australian student visa application",
    metaTitle:
      "Australian Student Visa 2026: Subclass 500 Requirements & Costs",
    metaDescription:
      "Everything you need to apply for the Australian Subclass 500 student visa in 2026 — eligibility, financial requirements, English scores, fees, and current processing timelines.",
    metaKeywords:
      "Australian student visa 2026, subclass 500, student visa requirements, study in Australia, DHA visa processing",
    focusKeyword: "Australian student visa 2026",
    contentHtml: `
<p><strong>Planning to study in Australia in 2026?</strong> The Subclass 500 student visa is the document that turns your offer letter into a boarding pass. This guide walks you through what's actually required this year — not the old 2022 rules — so you can plan with confidence.</p>

<h2>What is the Subclass 500 student visa?</h2>
<p>The Subclass 500 is Australia's primary student visa. Granted by the Department of Home Affairs (DHA), it allows you to:</p>
<ul>
  <li>Study a CRICOS-registered course full time at an Australian institution</li>
  <li>Work up to <strong>48 hours per fortnight</strong> during term and unlimited hours during scheduled breaks</li>
  <li>Bring eligible family members as dependants</li>
  <li>Travel in and out of Australia for the duration of your course</li>
  <li>Stay onshore for the entire length of your enrolment plus a short post-course buffer</li>
</ul>

<h2>Eligibility checklist for 2026</h2>
<p>To qualify, you need to satisfy DHA on five fronts:</p>

<h3>1. A Confirmation of Enrolment (CoE)</h3>
<p>This is issued by your Australian education provider after you accept your offer and pay your initial deposit. Without a CoE, your application cannot be lodged. Most universities accept conditional offers, but the CoE is only released once tuition fees are paid.</p>

<h3>2. The Genuine Student (GS) requirement</h3>
<p>Replacing the old GTE in late 2024, the GS requirement asks you to answer five short questions in your own words. The assessor wants evidence that you are coming to study — not just to migrate. Read our full <a href="/newsletter/genuine-student-requirement-australia-2026-gte-replacement">Genuine Student guide</a> for the exact questions and how to answer them.</p>

<h3>3. Financial capacity</h3>
<p>From 10 May 2024, the minimum savings benchmark is <strong>AUD 29,710 per year</strong> for the primary applicant, plus AUD 10,394 for a partner and AUD 4,449 for each dependent child. You'll also need to evidence one full year of tuition and a return airfare on top of this.</p>
<p>Funds should typically be held for at least 3 months before application. Funds from a third-party sponsor (parent, sibling) need a complete documentation trail back to the original source — bank statements, payslips, business registrations, and tax returns.</p>

<h3>4. English language proficiency</h3>
<p>For most universities you'll need <strong>IELTS 6.0 overall (no band below 5.5)</strong>, PTE Academic 50+, or TOEFL iBT 64+. Some packaged ELICOS courses accept applicants from IELTS 5.0 with pre-sessional English. Some programs (Nursing, Teaching, Law) need IELTS 7.0+.</p>

<h3>5. Health and character</h3>
<p>You must hold Overseas Student Health Cover (OSHC) for the entire visa period, pass a health examination at an approved panel clinic, and provide police clearances where required.</p>

<h2>Visa application fee in 2026</h2>
<p>As of 1 July 2025, the Subclass 500 base application charge is <strong>AUD 2,000</strong> for the primary applicant, with additional charges for dependants. This has more than doubled from AUD 710 in 2023, so factor it into your budgeting — and it's non-refundable, even if your application is refused.</p>

<h2>Current processing times</h2>
<p>Processing varies by your country of citizenship and the course level. As a rough guide for 2026:</p>
<ul>
  <li><strong>Higher Education sector:</strong> 75% within ~25 days; 90% within ~65 days</li>
  <li><strong>VET sector:</strong> 75% within ~3 months; 90% within ~6 months</li>
  <li><strong>ELICOS-only:</strong> 75% within ~6 weeks</li>
</ul>
<p>Apply at least <strong>3–4 months before</strong> your course start date to allow buffer for additional document requests, biometric appointments, and health examinations.</p>

<h2>Common reasons applications are refused in 2026</h2>
<blockquote>
  <p>Refusal rates for South Asian student visa applications have nearly doubled since 2023. Most refusals are preventable.</p>
</blockquote>
<p>The most common refusal reasons we see in our case files:</p>
<ul>
  <li>Weak or contradictory Genuine Student responses</li>
  <li>Insufficient evidence of financial sponsorship — particularly family-funded applications without a clear income trail</li>
  <li>Mismatch between previous study and the proposed Australian course (course-hopping)</li>
  <li>Unexplained gaps in study or work history</li>
  <li>Outdated English test results (older than 2 years)</li>
</ul>

<h2>What L&B Global does for you</h2>
<p>We prepare your CoE, draft and review GS responses against the latest DHA assessment guidance, audit your financial documents, and submit the application via ImmiAccount on your behalf. If a Request for Information arrives, we respond within 48 hours.</p>

<p><strong>Ready to apply for the February 2026 intake?</strong> <a href="/apply">Submit your inquiry</a> and we'll send you a personalised document checklist within one business day.</p>
`,
  },

  {
    slug: "genuine-student-requirement-australia-2026-gte-replacement",
    title:
      "Genuine Student (GS) Requirement Explained: How to Pass Australia's Replacement for the GTE",
    publishOffsetDays: -7,
    featuredThumbnail:
      "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1600&q=80&auto=format&fit=crop",
    featuredThumbnailAlt:
      "Student writing application answers at a desk with books and laptop",
    metaTitle:
      "Genuine Student (GS) Requirement Australia 2026: How to Pass It",
    metaDescription:
      "Australia replaced the GTE with the Genuine Student (GS) requirement. Here's exactly what the five GS questions assess and how to answer them with confidence in 2026.",
    metaKeywords:
      "Genuine Student requirement, GS test Australia, GTE replacement, student visa GS, Australia visa 2026",
    focusKeyword: "Genuine Student requirement",
    contentHtml: `
<p>In November 2024, the Australian Government replaced the long-standing Genuine Temporary Entrant (GTE) requirement with a simpler — but stricter — test called the <strong>Genuine Student (GS) requirement</strong>. If you're preparing a Subclass 500 application in 2026, here's what you need to know to pass it.</p>

<h2>Why was the GTE replaced?</h2>
<p>The old GTE statement was a free-form essay where applicants explained why they wouldn't overstay. It was inconsistent across applications and difficult for case officers to assess at scale. The new GS requirement breaks the question into five clear prompts answered directly inside your ImmiAccount application.</p>
<p>The goal is the same: prove you are coming to <em>study</em>, not to migrate. But the framing is now stricter, more specific, and much harder to fake with a templated answer.</p>

<h2>The five Genuine Student questions</h2>
<p>You'll be asked to write 150–500 words in response to each prompt. Here's what each one is really asking:</p>

<h3>1. Current circumstances — ties to your home country</h3>
<p>Describe your family, work, financial, and social ties in your home country. Documents matter: bank statements, business registrations, family certificates, employment letters, property titles. The case officer is testing whether you have strong reasons to return home after your course.</p>

<h3>2. Reasons for choosing this course</h3>
<p>Explain why <em>this specific course</em> at <em>this specific provider</em> is right for you. Generic answers like "Australia has good universities" will be marked low. Reference unit syllabi, faculty research, industry placements, accreditation by professional bodies, and how the course aligns with your prior study.</p>

<h3>3. Reasons for choosing Australia</h3>
<p>Why Australia and not Canada, the UK, or your home country? Talk about course recognition back home, the regulatory environment for your profession, specific research clusters, or post-study pathways. Be honest — but be specific.</p>

<h3>4. Benefits to you on completion</h3>
<p>This is the most important question. Connect your course outcomes to a concrete career plan — ideally back in your home country. Reference specific employers, salary ranges (use World Bank or local labour-market data), and your 3-year and 5-year career goals.</p>

<h3>5. Any other relevant information</h3>
<p>Use this section to address weak points proactively: study gaps, multiple refused visas, age above 30, financial sponsor's relationship to you. Don't leave it blank — a strong proactive answer here is worth a thousand defensive ones in a Request for Information later.</p>

<h2>What the case officer actually looks for</h2>
<blockquote>
  <p>"Consistency between your GS answers, your previous study history, your declared occupation, and your financial sponsor is the single biggest predictor of approval." — L&B Case Manager, 2026 update</p>
</blockquote>
<p>Three internal benchmarks we use when reviewing client drafts:</p>
<ul>
  <li><strong>Specificity:</strong> Can a stranger reading your answer name the employer you'll target after graduation?</li>
  <li><strong>Documentation:</strong> Every claim must be backed by a document already in your application bundle.</li>
  <li><strong>Honesty:</strong> Never overstate qualifications or family wealth. Officers cross-reference declared assets with bank statements and tax records.</li>
</ul>

<h2>Red flags that trigger refusals</h2>
<ul>
  <li>Course completely unrelated to previous study with no career justification</li>
  <li>Family-funded applications with no documented income trail</li>
  <li>Multiple previously refused visas to Australia, the UK, Canada, or New Zealand</li>
  <li>Vague answers that read like a template</li>
  <li>Applicants over 30 with no logical "return" reason articulated</li>
  <li>Course choice that doesn't match your declared occupation back home</li>
</ul>

<h2>How to prepare strong GS responses</h2>
<ol>
  <li>Map your career timeline — last 5 years of study and work, plus next 5 years of goals.</li>
  <li>List 3 concrete reasons per question, then expand each into 2–3 sentences with specifics (names, numbers, places).</li>
  <li>Cross-check claims against your CV, transcripts, employment letters, and financial documents.</li>
  <li>Have an experienced agent or migration lawyer redline the final draft before lodging.</li>
  <li>Save your responses outside ImmiAccount — you'll likely re-use them in interview prep.</li>
</ol>

<h2>What we do for clients</h2>
<p>We don't write your GS for you — that's against MARA conduct standards and DHA hates copy-pasted answers. Instead, we:</p>
<ul>
  <li>Send you a structured 30-question intake so your story comes out organised</li>
  <li>Map your timeline visually to find inconsistencies</li>
  <li>Redline each draft for clarity, evidence, and specificity</li>
  <li>Run a mock case-officer review before submission</li>
</ul>

<p><a href="/apply">Book a free GS review</a> — we draft, redline, and rewrite your responses against the current DHA assessment guidelines.</p>
`,
  },

  {
    slug: "australia-intake-2026-february-july-november-comparison",
    title:
      "Australia Intake 2026: February, July or November — Which One Is Right for You?",
    publishOffsetDays: -14,
    featuredThumbnail:
      "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=1600&q=80&auto=format&fit=crop",
    featuredThumbnailAlt:
      "Sydney Opera House on a clear day — symbolising studying in Australia",
    metaTitle:
      "Australia Intake 2026: February, July or November Compared",
    metaDescription:
      "Compare Australia's three university intakes in 2026 — February, July, and November. Find the right intake based on your visa timeline, finances, and course choice.",
    metaKeywords:
      "Australia intake 2026, February intake, July intake, November intake, study in Australia, best intake Australia",
    focusKeyword: "Australia intake 2026",
    contentHtml: `
<p>Australian universities run on three intakes — February, July, and November. Picking the right one shapes your visa timeline, your scholarship eligibility, and even your job prospects after graduation. Here's how to decide.</p>

<h2>The three intakes at a glance</h2>
<table>
  <thead>
    <tr>
      <th>Intake</th>
      <th>Applications open</th>
      <th>Applications close</th>
      <th>Course starts</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>February 2026</td><td>Aug 2025</td><td>Nov 2025</td><td>Late Feb 2026</td></tr>
    <tr><td>July 2026</td><td>Feb 2026</td><td>May 2026</td><td>Late Jul 2026</td></tr>
    <tr><td>November 2026</td><td>Jun 2026</td><td>Sep 2026</td><td>Early Nov 2026</td></tr>
  </tbody>
</table>

<h2>February intake (Semester 1)</h2>
<p>The main intake for almost every Australian university and college. Around <strong>80% of courses</strong> open seats in February, and most government and university scholarships only run from this start date.</p>
<p><strong>Best for:</strong></p>
<ul>
  <li>Bachelor's students chasing full or partial scholarships</li>
  <li>Cohort-locked courses (Medicine, Law, Architecture, Pharmacy)</li>
  <li>Students who want maximum course choice and competition</li>
  <li>Anyone planning honours or research streams</li>
</ul>
<p><strong>Plan to apply:</strong> 9–12 months before the start date. Lock in your IELTS or PTE by July 2025.</p>

<h2>July intake (Semester 2)</h2>
<p>The second-largest intake — slightly smaller course catalogue but still very strong. Most universities offer it for Master's degrees and many Bachelor courses, especially in <em>Business, IT, Engineering, Public Health, and Education</em>.</p>
<p><strong>Best for:</strong></p>
<ul>
  <li>Students who finished +2 or Bachelor's on a mid-year calendar (Bhutan, Nepal, India)</li>
  <li>Re-takers of English tests who missed the November deadline</li>
  <li>Master's graduates wanting to enter the workforce by late 2027</li>
  <li>Anyone who needs an extra 5 months to demobilise financially</li>
</ul>
<p><strong>Plan to apply:</strong> Submit by April 2026 to allow a relaxed visa processing and pre-departure window.</p>

<h2>November intake (Trimester 3)</h2>
<p>Smaller but growing. Most popular at trimester-based providers — <em>Deakin, Swinburne, Bond, RMIT (selected courses), Torrens, IH Sydney</em> — and many TAFEs and pathway colleges.</p>
<p><strong>Best for:</strong></p>
<ul>
  <li>Students who narrowly missed the July deadline</li>
  <li>ELICOS + main course packages that need a soft landing</li>
  <li>Master's students who want to graduate in late 2027 instead of mid-2028</li>
  <li>Trimester-loving institutions where you can finish faster</li>
</ul>

<h2>How to choose your intake — a 4-step framework</h2>
<ol>
  <li><strong>Check course availability.</strong> Not every course runs in every intake. Pull your shortlist from each provider's CRICOS listing before deciding — don't just check the marketing site.</li>
  <li><strong>Match your finances.</strong> February intake usually requires fund evidence by November — earlier than July. If your sponsor's funds need time to mature in your account (recommended: 3+ months), July may suit better.</li>
  <li><strong>Check scholarship deadlines.</strong> Most government and university scholarships (Destination Australia, John Allwright, Australia Awards, faculty-level) are February-only.</li>
  <li><strong>Plan around English tests.</strong> Aim to have your IELTS/PTE result at least 5 months before the intake to allow for one retake without panic.</li>
</ol>

<h2>A real-world example</h2>
<blockquote>
  <p>"One of our 2025 clients finished his Bachelor's in Bhutan in June and originally targeted Feb 2026. We moved him to July 2026 instead — same university, same course, but he saved AUD 14,000 by becoming eligible for an early-bird scholarship that only opens for mid-year intakes." — L&B Case Manager</p>
</blockquote>

<h2>L&B's intake planner</h2>
<p>We map your eligibility, finances, and English results against every running intake before you commit. <a href="/apply">Request your free intake planner</a> and we'll send you a personalised timeline within 2 business days.</p>
`,
  },

  {
    slug: "post-study-work-visa-subclass-485-2026-changes-eligibility",
    title:
      "Post-Study Work Visa (Subclass 485) in 2026: What Changed & Who Still Qualifies",
    publishOffsetDays: -21,
    featuredThumbnail:
      "https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1600&q=80&auto=format&fit=crop",
    featuredThumbnailAlt:
      "Graduation caps thrown into the air — symbolising post-study work visa graduates",
    metaTitle:
      "Post-Study Work Visa (Subclass 485) 2026: New Rules Explained",
    metaDescription:
      "The Subclass 485 visa rules tightened in 2024–25. Here's the 2026 update on age limits, English scores, course duration, and how Bhutanese & Nepalese graduates can still qualify.",
    metaKeywords:
      "subclass 485, post study work visa, temporary graduate visa, Australia 485 visa 2026, post-study work visa Bhutan Nepal",
    focusKeyword: "post-study work visa 485",
    contentHtml: `
<p>The Subclass 485 — Australia's Temporary Graduate (post-study work) visa — went through major changes in 2024 and 2025. If you're enrolling for a course in 2026 with permanent residency in mind, these are the new rules you need to plan around from day one.</p>

<h2>Quick recap: What is the Subclass 485?</h2>
<p>The 485 lets recent graduates of an Australian qualification live, work, and study in Australia <strong>temporarily without sponsorship</strong>. It's the most common bridge between studying and skilled migration (Subclass 189, 190, 491, 482).</p>

<h2>What changed in 2024–25</h2>
<ul>
  <li><strong>Age limit reduced</strong> from 50 to <strong>35</strong> at time of application (with exemptions for Hong Kong, BNO passport holders, and some Masters-by-Research / PhD applicants up to 50).</li>
  <li><strong>English requirement raised</strong> to IELTS 6.5 overall, no band below 5.5 (PTE Academic 58+).</li>
  <li><strong>Course duration test</strong> tightened — the Australian Study Requirement (ASR) remains 2 years (92 weeks).</li>
  <li><strong>New visa lengths from 1 July 2024:</strong>
    <ul>
      <li>Bachelor's (incl. Honours) → <strong>2 years</strong></li>
      <li>Master's by Coursework → <strong>2 years</strong></li>
      <li>Master's by Research → <strong>3 years</strong></li>
      <li>PhD → <strong>3 years</strong></li>
      <li>Indian nationals under MATES → +1 year extension on Bachelor's/Master's</li>
      <li>Regional study bonus → up to +2 extra years if you studied <em>and</em> lived in a designated regional area</li>
    </ul>
  </li>
</ul>

<h2>Who still qualifies in 2026</h2>
<ol>
  <li>You held a Student visa within the 6 months before applying.</li>
  <li>You completed a CRICOS course of at least 2 academic years (92 weeks) on a recognised qualification.</li>
  <li>You are under 35 at the time of application (with exemptions noted above).</li>
  <li>You meet the English language requirement.</li>
  <li>You apply within <strong>6 months</strong> of your course completion date.</li>
  <li>You have not previously held a Subclass 485 visa.</li>
</ol>

<h2>What it means for Bhutanese and Nepalese graduates</h2>
<p>For most South Asian students who started a Bachelor's at 22–24 or a Master's at 24–26, the age cap is rarely a blocker. The bigger watch-out is the English benchmark — <strong>IELTS 6.5 with no band below 5.5</strong> is now non-negotiable, even if you finished a coursework Master's taught in English.</p>
<p>Plan to retake your test if your highest score was the one used for your student visa.</p>

<blockquote>
  <p>"We're advising every 2026 client to budget AUD 510 for the PTE Academic and to test 4 months before course completion. Walking into a 485 application with last-minute test bookings is the #1 timeline mistake we see." — L&B Migration Lead</p>
</blockquote>

<h2>Stream comparison</h2>
<table>
  <thead>
    <tr><th>Stream</th><th>Who it's for</th><th>Duration</th></tr>
  </thead>
  <tbody>
    <tr><td>Post-Vocational Education Work</td><td>Diploma and Trade graduates with a skilled occupation</td><td>18 months</td></tr>
    <tr><td>Post-Higher Education Work</td><td>Bachelor, Honours, Master's, PhD graduates</td><td>2–3 years</td></tr>
    <tr><td>Replacement stream</td><td>Hong Kong / BNO passport holders, COVID extensions</td><td>Varies</td></tr>
  </tbody>
</table>

<h2>Cost and processing time (2026)</h2>
<ul>
  <li>Application charge: <strong>AUD 2,235</strong> (primary applicant), additional for dependants</li>
  <li>Bridging Visa A granted at lodgement — work rights continue</li>
  <li>Processing: 75% within 4 months, 90% within 6 months</li>
</ul>

<h2>How to set yourself up for the 485 from day one</h2>
<ol>
  <li>Choose a CRICOS-registered course of at least 92 weeks. Avoid "fast-track" arrangements that compress the timeline below this.</li>
  <li>Consider regional providers (anywhere outside Sydney, Melbourne, and Brisbane CBD) if you want the extra 1–2 years.</li>
  <li>Maintain full-time enrolment and stay onshore for the majority of your course.</li>
  <li>Lock in your English test result before your final semester. Don't leave it until after graduation.</li>
  <li>Apply within 6 months of course completion — earlier is better, because retakes leave room.</li>
  <li>Keep your passport valid for at least 18 months beyond your 485 application date.</li>
</ol>

<h2>The PR pathway after 485</h2>
<p>Most clients use the 485 to gain skilled work experience in their nominated occupation and then move on to:</p>
<ul>
  <li><strong>Subclass 189</strong> — Skilled Independent (points-tested, no sponsor)</li>
  <li><strong>Subclass 190</strong> — Skilled Nominated (state-sponsored)</li>
  <li><strong>Subclass 491</strong> — Skilled Work Regional (state or family-sponsored)</li>
  <li><strong>Subclass 482</strong> — Skills in Demand (employer-sponsored, temporary)</li>
</ul>

<p><a href="/apply">Talk to us about your PR pathway</a> — we map the 485 to your eventual skilled migration route from day one of your course, not after you graduate.</p>
`,
  },
];

async function findAuthor() {
  const admin =
    (await prisma.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    })) ||
    (await prisma.user.findFirst({
      where: { role: "SUB_ADMIN" },
      orderBy: { createdAt: "asc" },
    }));
  if (!admin) {
    throw new Error(
      "No ADMIN or SUB_ADMIN user found in the database. Run `npx prisma db seed` first to create the default admin.",
    );
  }
  return admin;
}

async function main() {
  const author = await findAuthor();
  console.log(`Using author: ${author.email} (${author.role})`);

  for (const article of ARTICLES) {
    const cleanHtml = article.contentHtml.trim();
    const plainContent = htmlToPlainText(cleanHtml);
    const publishDate = new Date(
      Date.now() + (article.publishOffsetDays ?? 0) * 24 * 60 * 60 * 1000,
    );

    const data = {
      title: article.title,
      slug: article.slug,
      content: plainContent,
      contentHtml: cleanHtml,
      mediaType: article.featuredThumbnail ? "IMAGE" : "NONE",
      mediaUrl: article.featuredThumbnail ?? null,
      featuredThumbnail: article.featuredThumbnail ?? null,
      featuredThumbnailAlt: article.featuredThumbnailAlt ?? null,
      isPublished: true,
      publishDate,
      metaTitle: article.metaTitle,
      metaDescription: article.metaDescription,
      metaKeywords: article.metaKeywords ?? null,
      focusKeyword: article.focusKeyword ?? null,
      ogImage: article.featuredThumbnail ?? null,
      authorId: author.id,
      authorNameSnapshot: author.name ?? "L&B Global Editorial",
      authorEmailSnapshot: author.email ?? "",
    };

    const existing = await prisma.homePost.findUnique({
      where: { slug: article.slug },
    });

    if (existing) {
      await prisma.homePost.update({
        where: { id: existing.id },
        data,
      });
      console.log(`Updated: ${article.title}`);
    } else {
      await prisma.homePost.create({ data });
      console.log(`Created: ${article.title}`);
    }
  }

  console.log("\nDone. 4 articles ready at /newsletter.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
