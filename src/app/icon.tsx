import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#004C40",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          borderRadius: 6,
        }}
      >
        $
      </div>
    ),
    { ...size }
  );
}
