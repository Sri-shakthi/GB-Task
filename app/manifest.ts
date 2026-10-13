import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ganesh Bhavan Daily Tasks",
    short_name: "GB Tasks",
    description: "Daily task management for Ganesh Bhavan",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f1",
    theme_color: "#185c3b",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
