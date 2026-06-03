# Check-ins

Cross-platform mobile/web app for Check-ins: a to-do app with project freshness, next actions, check-ins, accounts, and sync.

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

## App Identity

- iOS bundle identifier: `com.chrissyuh.checkins`
- Android package: `com.chrissyuh.checkins`
- App version: `1.0.0`
- iOS build number: `1`
- Android version code: `1`

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/20260603000000_v2_schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. Deploy `supabase/functions/delete-account`.
6. Set `SUPABASE_SERVICE_ROLE_KEY` for the Edge Function.
7. Configure auth redirect URLs for web and `checkinsv2://`.
8. Restart Expo.

If env vars are missing, development and preview builds offer local preview mode so the UI can still be reviewed without real accounts. Production EAS builds set `EXPO_PUBLIC_ALLOW_LOCAL_PREVIEW=false`.

## Store Submission

Use `store/submission-checklist.md` as the release checklist and `store/app-store-listing.md` as listing copy.

```bash
npm run eas:build:preview:android
npm run eas:build:preview:ios
npm run eas:build:android
npm run eas:build:ios
npm run eas:submit:android
npm run eas:submit:ios
```

## Verification

```bash
npm run typecheck
npm run guard:no-monetization
npm run export:web
```
