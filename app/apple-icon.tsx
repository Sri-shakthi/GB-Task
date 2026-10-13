import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 38,
        background: "#185c3b",
        border: "9px solid #d59b19",
        color: "#f5bd32",
        fontFamily: "Georgia, serif",
        fontSize: 68,
        fontWeight: 700,
        letterSpacing: -4,
      }}
    >
      GB
    </div>,
    size,
  );
}
