/**
 * Tests de las actions de adjuntos (constancias): lectura con URL firmada,
 * borrado sin huérfanos (blob primero, fila después) y scope por negocio.
 * Driver y blob falsos — no tocan Neon ni Vercel Blob.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => {
  const state = {
    rows: [] as Record<string, unknown>[],
    executed: [] as string[],
    blobDeleted: [] as string[],
    blobDeleteFails: false,
  };
  return { state };
});

vi.mock("@neondatabase/serverless", () => ({
  neon: () => {
    const tag = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      const text = strings.join(" $ ");
      return {
        then(onRes: (v: unknown) => unknown, onRej?: (e: unknown) => unknown) {
          fake.state.executed.push(text);
          return Promise.resolve(fake.state.rows).then(onRes, onRej);
        },
      };
    };
    return tag;
  },
}));
vi.mock("@/lib/active-business", () => ({ activeBusinessId: vi.fn(async () => 2) })); // Kelly en Fonavi
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/blob-storage", () => ({
  getSignedReadUrl: vi.fn(async (pathname: string) => `https://firmada.test/${pathname}?firma=abc&exp=600`),
  deletePrivateBlob: vi.fn(async (pathname: string) => {
    if (fake.state.blobDeleteFails) throw new Error("blob no disponible");
    fake.state.blobDeleted.push(pathname);
  }),
  uploadPrivateBlob: vi.fn(async (pathname: string) => ({ pathname })),
}));

import { listAttachments, deleteAttachment } from "./attachments";
import { deletePrivateBlob } from "@/lib/blob-storage";

beforeEach(() => {
  fake.state.rows = [];
  fake.state.executed = [];
  fake.state.blobDeleted = [];
  fake.state.blobDeleteFails = false;
  vi.mocked(deletePrivateBlob).mockClear();
});

describe("listAttachments", () => {
  it("devuelve URL FIRMADA temporal por adjunto (nunca el pathname crudo como URL)", async () => {
    fake.state.rows = [{
      id: "a1", pathname: "adjuntos/2/expense/e1/uuid-pago.jpg",
      filename: "pago.jpg", content_type: "image/jpeg", size_bytes: 120000, created_at: "2026-06-10",
    }];
    const items = await listAttachments("expense", "e1");
    expect(items).toHaveLength(1);
    expect(items[0].signedUrl).toContain("firma=");
    expect(items[0].signedUrl).toContain("adjuntos/2/expense/e1");
    // scope por negocio en la query
    expect(fake.state.executed.some((q) => q.includes("business_id ="))).toBe(true);
  });
});

describe("deleteAttachment — sin huérfanos", () => {
  it("borra PRIMERO el blob y DESPUÉS la fila", async () => {
    fake.state.rows = [{ pathname: "adjuntos/2/expense/e1/uuid-pago.jpg" }];
    const r = await deleteAttachment("a1");
    expect(r.success).toBe(true);
    expect(fake.state.blobDeleted).toEqual(["adjuntos/2/expense/e1/uuid-pago.jpg"]);
    expect(fake.state.executed.some((q) => q.includes("DELETE FROM attachments"))).toBe(true);
  });

  it("si el blob falla, la fila NO se borra (reintentable, sin fila apuntando a archivo muerto)", async () => {
    fake.state.rows = [{ pathname: "adjuntos/2/expense/e1/uuid-pago.jpg" }];
    fake.state.blobDeleteFails = true;
    const r = await deleteAttachment("a1");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Intenta de nuevo");
    expect(fake.state.executed.some((q) => q.includes("DELETE FROM attachments"))).toBe(false);
  });

  it("adjunto inexistente (u otro negocio) → error claro sin tocar blob", async () => {
    fake.state.rows = [];
    const r = await deleteAttachment("a-ajeno");
    expect(r.success).toBe(false);
    expect(deletePrivateBlob).not.toHaveBeenCalled();
  });
});
