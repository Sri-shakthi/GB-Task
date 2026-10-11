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
