import { ImageResponse } from "next/og";

/**
 * La imagen que aparece cuando el link del vale se pega en WhatsApp. Sin esto
 * salía el «$» de la app y la frase interna «Control de caja real…». Es la
 * misma para todos los vales a propósito: no lleva código ni productos, así
 * que una vista previa nunca filtra qué cubre cada vale.
 */

export const alt = "Vale de consumo · Yayi's";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F4FAF7",
          padding: 72,
          borderLeft: "40px solid #004C40",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#098B5F" }}>Yayi&apos;s</div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, color: "#004C40" }}>¡Vale de</div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, color: "#E4472B" }}>consumo!</div>
        </div>
        <div style={{ display: "flex", fontSize: 38, color: "#004C40" }}>
          Muéstralo en caja al momento de pagar
        </div>
      </div>
    ),
    { ...size },
  );
}
