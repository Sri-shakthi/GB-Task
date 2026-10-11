import { createServer } from "node:http";
import { createWriteStream, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 8080);
const secret = process.env.MEDIA_PROCESSOR_SECRET;
const maxInputBytes = 10 * 1024 * 1024;
const maxOutputBytes = 16 * 1024 * 1024;

function authorized(request) {
  const value = request.headers.authorization;
  const expected = secret ? `Bearer ${secret}` : "";
  if (!secret || typeof value !== "string" || value.length !== expected.length)
    return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" }).end();
    return;
  }
  if (!authorized(request)) {
    response.writeHead(401).end("Unauthorized");
    return;
  }
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength <= 0 ||
    declaredLength > maxInputBytes
  ) {
    response.writeHead(413).end("Invalid recording size");
    return;
  }

  const workdir = await mkdtemp(join(tmpdir(), "gb-task-"));
  const input = join(workdir, "recording");
  const output = join(workdir, "task.mp4");
  try {
    let received = 0;
    request.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxInputBytes)
        request.destroy(new Error("Recording too large"));
    });
    await pipeline(request, createWriteStream(input, { flags: "wx" }));
    if (received === 0) throw new Error("Empty recording");

    const cover = process.env.COVER_IMAGE_PATH || "/app/cover.png";
    const videoInput = existsSync(cover)
      ? ["-loop", "1", "-i", cover]
      : ["-f", "lavfi", "-i", "color=c=0x12211d:s=720x720:r=25"];
    await runFfmpeg([
      "-y",
      ...videoInput,
      "-i",
      input,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "stillimage",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2",
      "-r",
      "25",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-shortest",
      output,
    ]);
    const video = await readFile(output);
    if (video.length === 0 || video.length > maxOutputBytes)
      throw new Error("Generated video is too large");
    response
      .writeHead(200, {
        "content-type": "video/mp4",
        "content-length": video.length,
        "cache-control": "no-store",
      })
      .end(video);
  } catch (error) {
    console.error("Media conversion failed", error);
    if (!response.headersSent)
      response.writeHead(500).end("Media conversion failed");
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});

server.listen(port, "0.0.0.0", () =>
  console.log(`Media processor listening on ${port}`),
);
