# GB Tasks

Mobile-first daily task operations for Ganesh Bhavan. The repository contains a Next.js owner dashboard, staff task page, Postgres/Drizzle data model, WhatsApp Cloud API adapter, signed webhook boundary, and durable-job schema.

## What runs now

- Responsive owner dashboard with department filters, separate task/delivery statuses, attention queue, and a fast assignment sheet.
- Voice-first form interaction with recording timer states and a development send confirmation.
- Expiring task-link UI at `/t/<20-or-more-character-token>`; short/invalid tokens show a safe error state. Production lookup must hash the token before querying `staff_task_links`.
- Full relational schema for restaurant tenancy, staff, assignments, events, media, WhatsApp messages, webhook deduplication, job leases, task links, presets, and recurrence.
- Meta webhook verification and HMAC signature rejection.
- WhatsApp adapter that cannot send real messages unless `WHATSAPP_DEV_MODE=false` and all required template settings are present.
- Vercel cron entry point protected by `CRON_SECRET`.

The dashboard displays only records stored for the authenticated restaurant. New databases start with clean empty states.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and provide secrets. Keep `WHATSAPP_DEV_MODE=true` locally.
3. Create a separate Neon preview database and run `npm run db:generate`, then `npm run db:migrate`.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Verify with `npm run typecheck` and `npm run build`.

## Production configuration

### Authentication

Owner access uses signed, HTTP-only, Secure, SameSite session cookies backed by revocable database session records. Passwords use scrypt and constant-time comparison. Login attempts are limited to eight per email/IP combination in 15 minutes and every success, failure, throttle, reset, and logout is audited without storing raw IP addresses.

Run the migration, create the restaurant record, then provision one or more owners:

```bash
npm run db:migrate
npm run auth:create-owner -- "owner@example.com" "Owner Name" "a long unique password"
```

Set a random `AUTH_SECRET` of at least 32 characters and `RESTAURANT_ID`. Owner access always requires a database-backed account. A password reset increments the owner's session version and revokes every active session. Active sessions rotate after half their 12-hour lifetime. Logout requires a session-scoped CSRF token and a matching request origin.

Recovery uses single-use, SHA-256-hashed tokens that expire after 30 minutes. Configure `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `NEXT_PUBLIC_APP_URL`. The response is deliberately identical for known and unknown email addresses.

Optional TOTP MFA uses AES-256-GCM encrypted secrets. Generate `MFA_ENCRYPTION_KEY` with `openssl rand -base64 32`, then enable MFA for a provisioned owner:

```bash
npm run auth:enable-mfa -- "owner@example.com"
```

The command prints an `otpauth://` URI to add to the owner's authenticator. Handle that URI as a secret and clear the terminal scrollback after enrollment.

### Meta WhatsApp

Create approved templates in WhatsApp Manager and place their **actual** names in environment variables. Confirm language codes, variable order, and quick-reply payloads against the approved definitions. Voice tasks require a video-header template; each send supplies the generated media ID. The approval sample is never reused.

Configure the callback as `https://YOUR_DOMAIN/api/webhooks/whatsapp`, subscribe to messages and delivery statuses, and set identical `WHATSAPP_VERIFY_TOKEN` values in Meta and Vercel. Live sends remain disabled until `WHATSAPP_DEV_MODE=false`.

Voice recordings are uploaded to private Vercel Blob storage. The job worker sends the recording once to the media processor, which creates a temporary H.264/AAC MP4 using the restaurant cover image. The worker uploads that MP4 once to Meta, caches its media ID on the recording, and sends the approved video-header template (including its Flow button) to staff. No converted video is stored. Configure `MEDIA_PROCESSOR_URL` and `MEDIA_PROCESSOR_SECRET` as described in `services/media-processor/README.md`.

The worker uses database row locks with `SKIP LOCKED`, two-minute leases, bounded exponential retries, and an `uncertain` terminal state for ambiguous send timeouts. The webhook verifies Meta's raw-body signature, deduplicates provider events, applies monotonic delivery updates, and only accepts task-scoped button replies that reference the exact outbound message and come from the current assignee.

### Job safety

Workers should claim due jobs atomically (`FOR UPDATE SKIP LOCKED`), set a short `lease_until`, and commit before external work. Retry only definite failures with capped exponential backoff. A send that times out after request transmission must enter `uncertain`; reconcile it from provider status instead of blindly resending. Use unique provider IDs and `webhook_events.provider_event_id` for deduplication. Persist a valid webhook before returning 200 and process it asynchronously.

### Staff links

Generate at least 32 random bytes, put the raw token only in the URL, and store only SHA-256. Resolve by hash, expiry, revocation, assignment state, and current assignee. Reassignment must revoke every old link in the same transaction. GET renders only; status mutations require POST plus rate limiting. Forwarding a bearer link grants access, so enable OTP verification if the restaurant requires stronger identity proof.

### Data protection and operations

- Use separate Neon, Blob, and Meta credentials for preview and production. Preview must remain in development messaging mode.
- Store recordings in private Blob storage and return short-lived authenticated download URLs.
- Keep all timestamps in UTC; format restaurant-facing dates in `Asia/Kolkata`.
- Enable Neon point-in-time restore/backups and rehearse restoring into a separate project.
- Redact phone numbers, tokens, recording URLs, and webhook bodies from logs.
- Apply edge rate limits to login, recovery, staff-link actions, and webhook endpoints.

## Launch blockers

External credentials and approvals were not supplied, so real authentication, persistent UI mutations, private Blob upload, video encoding, approved-template sends, and inbound event processing cannot be verified here. These are called out rather than simulated as production-ready behavior. Meta media constraints and template definitions must be rechecked at launch because provider requirements can change.
