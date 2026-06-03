# Check-ins

Check-ins is a project tracker for long-term work. V1 is a lightweight local-first Vite app. V2 is a cross-platform Expo app that merges the check-ins concept with a to-do list and account-backed sync.

## V1

V1 lives at the repo root.

```bash
npm install
npm run dev
npm run build
```

V1 stores all data in browser localStorage. It has no backend and no account system.

## V2

V2 lives in `apps/v2`.

```bash
npm run v2:web
npm run v2:typecheck
npm run v2:guard
npm run v2:eas:build:android
npm run v2:eas:build:ios
```

V2 is built with Expo, React Native, and Supabase. It supports local preview mode in development/preview builds and real account-backed sync once the Supabase env vars, schema, and `delete-account` Edge Function are configured.

## Product Rules

- No payments.
- No ads.
- Accounts are for sync only.
- Browser reminders must be honest about only working while the app is open unless a future PWA/service-worker system is added.
