import type { Metadata, Viewport } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/lora/600.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "GB Tasks",
  description: "Daily operations for Ganesh Bhavan",
  applicationName: "GB Tasks",
  appleWebApp: {
    capable: true,
    title: "GB Tasks",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#185c3b",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
