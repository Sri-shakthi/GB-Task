import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ganesh Bhavan Daily Tasks",
    short_name: "GB Tasks",
    description: "Daily task management for Ganesh Bhavan",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#faf8f1",
    theme_color: "#185c3b",
    icons: [
      {
        src: "/api/app-icon/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/api/app-icon/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    prefer_related_applications: false,
  };
}
