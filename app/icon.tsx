import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 112,
        background: "#185c3b",
        border: "24px solid #d59b19",
        color: "#f5bd32",
        fontFamily: "Georgia, serif",
        fontSize: 190,
        fontWeight: 700,
        letterSpacing: -12,
      }}
    >
      GB
    </div>,
    size,
  );
}
