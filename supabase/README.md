# Supabase (EIE v2)

SQL migrations live in `migrations/`. Schema is defined in `docs/EIE-v2-upgrade-plan.md` §3.

**Apply locally / to your project**

- [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` then `supabase db push`, or
- Dashboard → **SQL Editor** → paste and run the migration file contents.

The Next.js app does not run migrations automatically; configure your project and apply when ready.
