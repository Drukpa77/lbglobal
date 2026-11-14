# L&B Global Website

Customer-facing website for L&B Global (overseas education and visa services), built with Next.js.

There is no database, login, or admin dashboard. The site has:

- **Homepage** (`/`): services, process, partners, testimonials, latest articles, and a contact form
- **Apply** (`/apply`): visa and immigration enquiry form
- **Newsletter** (`/newsletter`): articles stored in [src/content/newsletter-posts.ts](src/content/newsletter-posts.ts)

## How enquiries work

The contact form and the Apply form both **email** the enquiry to `CONTACT_INBOX_EMAIL` through Google
Workspace SMTP, with the applicant's address set as Reply-To. The applicant also receives an automatic
confirmation email. Nothing is stored on the server: the email is the only record.

If SMTP credentials are missing in development, emails are logged to the console instead of sent.
In production, missing credentials make the forms show an error.

## Quick start

1. Copy the environment template and fill in the Google Workspace SMTP credentials:

   ```bash
   copy .env.example .env
   ```

2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Adding a newsletter article

Add an entry to the list in [src/content/newsletter-posts.ts](src/content/newsletter-posts.ts) and redeploy.
The homepage shows the three newest articles. Remote images must be on a host allowed in
[next.config.ts](next.config.ts).

## Scripts

- `npm run dev`: start the local development server
- `npm run build`: create a production build
- `npm run lint`: run ESLint
- `npm run typecheck`: run the TypeScript compiler
- `npm run test:e2e`: run the Playwright smoke tests
