# L&B Global Web App

Next.js platform for students applying to Australia with two access levels:

- Consultancy agent (`SUB_ADMIN`)
- Platform owner (`ADMIN`)

## Implemented in Phase 1

- Role-based authentication with NextAuth credentials
- Prisma schema for users, profiles, questionnaire templates, and submissions
- Protected dashboards for Student / Sub Admin / Admin
- Middleware route protection and role-aware redirects

## Implemented in Phase 2 and 3

- Dynamic student questionnaire loaded from database templates
- Submission workflow with status updates by Sub Admin/Admin
- Admin assignment of submissions to consultancy agents
- Submission filters and CSV export for Sub Admin and Admin
- Admin analytics charts (country, course, application funnel)
- Admin questionnaire template manager (`/dashboard/admin/questionnaire`)

## Quick Start

1. Copy environment variables:

```bash
copy .env.example .env
```

2. Update `DATABASE_URL` and `AUTH_SECRET` in `.env`.

3. Generate Prisma client and push schema:

```bash
npm run db:generate
npm run db:push
```

4. Seed test users:

```bash
npm run db:seed
```

5. Start the app:

```bash
npm docker start "name of DB"
```


```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Seeded Login Accounts

- Admin: `admin@lbglobal.test` / `AdminPass123!`
- Sub Admin: `agent@lbglobal.test` / `AgentPass123!`
- Student: `student@lbglobal.test` / `StudentPass123!`

## Project Scripts

- `npm run dev` - start local development server
- `npm run build` - create production build
- `npm run db:generate` - generate Prisma client
- `npm run db:push` - push schema to database
- `npm run db:migrate` - create/apply migration
- `npm run db:seed` - seed demo users
