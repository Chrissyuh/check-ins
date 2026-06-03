# Google Play Data Safety Draft

Use this draft when filling out Google Play Console. Confirm against the final production implementation before submitting.

## Data Types

- Email address: collected for account authentication.
- User-generated content: projects, tasks, check-ins, notes, reminders, settings.
- App interactions: not intentionally collected for analytics in this implementation.

## Use Purposes

- App functionality.
- Account management.

## Sharing

- Data is stored with Supabase for authentication and syncing.
- Data is not sold.
- Data is not shared with advertising networks.

## Security

- Data is transmitted over HTTPS.
- Supabase row-level security restricts access to the signed-in user's rows.

## Deletion

- Users can request/delete their account in-app from Settings.
- Account deletion removes synced Check-ins data.
