# @forja/web

The Next.js app. Not scaffolded yet (milestone M0, after the plan is approved).

Planned layout:

- `app/(auth)/` — sign-in
- `app/(app)/today/` — what the plan asks for today
- `app/(app)/log/` — log a workout
- `app/(app)/history/` — past workouts
- `app/(app)/plan/` — create and manage the 6-week plan
- `app/(app)/exercises/`, `app/(app)/locations/`
- `components/ui/` — shadcn/ui components
- `lib/auth.ts` — Better Auth setup

Each route folder holds its own `page.tsx`, components and `actions.ts`.
