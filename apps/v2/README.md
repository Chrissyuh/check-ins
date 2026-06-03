# Check-ins V2

Cross-platform V2 prototype for Check-ins: a to-do app with project freshness, next actions, check-ins, accounts, and sync.

## Product Rules

- No payments.
- No ads.
- Accounts exist only for sync and user-owned data.
- Web reminders are honest: they only run while the page is open until a future PWA/service-worker layer is added.
- Mobile reminders use local notifications after permission is granted.

## Run

```bash
npm install
npm run web
npm run android
npm run ios
```

`npm run ios` needs macOS or an Expo/EAS workflow.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/20260603000000_v2_schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. Restart Expo.

If env vars are missing, the app offers local preview mode so the UI can still be reviewed without real accounts.

## Verification

```bash
npm run typecheck
npm run guard:no-monetization
npm run export:web
```
