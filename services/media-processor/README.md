# GB Task media processor

This service converts a recording plus a static cover into a WhatsApp-compatible MP4. It has no database and stores no recordings or videos: both files exist only in its temporary directory while FFmpeg runs.

Put the restaurant's square logo/card at `services/media-processor/cover.png` before building. It is intentionally not provided by the app because it is the restaurant's own branding. If no cover is supplied, the service produces a plain dark background instead.

For local testing, build and run it wherever Docker can stay online:

```bash
docker build -t gb-task-media ./services/media-processor
docker run -d --name gb-task-media --restart unless-stopped -p 8080:8080 -e MEDIA_PROCESSOR_SECRET='choose-a-long-random-secret' gb-task-media
```

Set these in the Next.js/Vercel environment, then redeploy the app:

```env
MEDIA_PROCESSOR_URL=https://media.your-domain.example/
MEDIA_PROCESSOR_SECRET=the-same-long-random-secret
```

Use HTTPS and keep the processor URL private behind a firewall, reverse proxy, or platform authentication. The shared secret is mandatory and prevents unauthorised conversion requests.

## Railway retry scheduler

The Vercel app starts delivery immediately after an assignment is created. For
durable retries, create a second Railway service from this same repository with
the same root directory, then set its start command to:

```bash
node src/run-job-worker.mjs
```

Set its cron schedule to `*/5 * * * *` and give that service these variables:

```env
JOB_WORKER_URL=https://YOUR-VERCEL-DOMAIN/api/cron/jobs
CRON_SECRET=the-same-value-as-in-Vercel
```

The scheduler exits after each call. Railway Hobby cron jobs run no more often
than every five minutes; this is only a retry fallback, not the normal delivery
path.

## Production on an Oracle VM

Use `docker-compose.yml` with Caddy to run the processor behind HTTPS. Copy
`.env.production.example` to `.env`, set `MEDIA_DOMAIN` to a DNS name pointing
to the VM and set a long `MEDIA_PROCESSOR_SECRET`. Then run:

```bash
docker compose up -d --build
```

Caddy obtains and renews the TLS certificate automatically. Open TCP ports 80
and 443 on the VM and Oracle Cloud security list. The Node/FFmpeg service stays
private inside Docker; only Caddy is reachable from the internet.
