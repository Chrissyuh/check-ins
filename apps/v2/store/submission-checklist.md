# Check-ins Mobile Submission Checklist

## External Accounts

- Apple Developer Program account exists.
- Google Play Console developer account exists.
- Expo account exists.
- Supabase production project exists.

## Supabase

- Run every SQL file in `supabase/migrations` in timestamp order.
- Deploy `supabase/functions/delete-account`.
- Set `SUPABASE_SERVICE_ROLE_KEY` for the Edge Function.
- Configure redirect URLs for web and `checkinsv2://`.
- Create one reviewer demo account.

## EAS

- Run `npx eas-cli@latest init` from `apps/v2` if the project has not been linked to EAS.
- Set EAS env vars/secrets:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_PRIVACY_URL`
  - `EXPO_PUBLIC_SUPPORT_URL`
- Build Android preview and iOS preview.
- Test on physical Android and iPhone.
- Build production Android and iOS.
- Submit production builds.

## Store Metadata

- Privacy Policy URL points to the final hosted privacy policy.
- Support URL points to the final support page or issue tracker.
- Screenshots are captured for Android and iOS.
- Apple App Privacy answers match `privacy-policy.md`.
- Google Data Safety answers match `data-safety.md`.
- Review notes include demo account credentials.

## Final Verification

- `npm run v2:typecheck`
- `npm run v2:guard`
- `npm run v2:export:web`
- Production build does not show local preview.
- Delete account works with the production Supabase project.
