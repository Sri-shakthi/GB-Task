FROM node:24-bookworm-slim

# FFmpeg is installed once while building the image, never per assignment.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.mjs"]
