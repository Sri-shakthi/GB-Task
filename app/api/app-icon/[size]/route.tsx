import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const requested = Number((await params).size),
    pixels = requested === 192 ? 192 : requested === 512 ? 512 : null;
  if (!pixels) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: pixels * 0.22,
        background: "#185c3b",
        border: `${Math.round(pixels * 0.047)}px solid #d59b19`,
        color: "#f5bd32",
        fontFamily: "Georgia, serif",
        fontSize: pixels * 0.37,
        fontWeight: 700,
        letterSpacing: pixels * -0.023,
      }}
    >
      GB
    </div>,
    { width: pixels, height: pixels },
  );
}
