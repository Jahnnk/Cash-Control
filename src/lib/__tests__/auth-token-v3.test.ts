/**
 * Tokens v3 (usuarios del personal): la firma usa el password_hash
 * GUARDADO — por eso cambiar la contraseña o desactivar al usuario
 * mata la sesión al instante. Estos tests protegen esa propiedad.
 */
import { describe, it, expect } from "vitest";
import { createUserToken, parseUserTokenId, verifyUserToken } from "../auth-token";

const HASH = "s1.aabbccdd00112233445566778899aabb.deadbeef".padEnd(100, "0");
const NOW = 1_800_000_000;
const EXP = NOW + 3600;

describe("tokens v3 por persona", () => {
  it("crear → parsear id → verificar con el hash correcto", async () => {
    const t = await createUserToken(HASH, 7, EXP);
    expect(parseUserTokenId(t, NOW)).toBe(7);
    expect(await verifyUserToken(t, HASH, NOW)).toBe(true);
  });

  it("cambiar la contraseña (hash nuevo) invalida el token viejo AL INSTANTE", async () => {
    const t = await createUserToken(HASH, 7, EXP);
    expect(await verifyUserToken(t, "s1.otro.hash-distinto", NOW)).toBe(false);
  });

  it("token expirado no parsea ni verifica", async () => {
    const t = await createUserToken(HASH, 7, NOW - 1);
    expect(parseUserTokenId(t, NOW)).toBeNull();
    expect(await verifyUserToken(t, HASH, NOW)).toBe(false);
  });

  it("manipular el userId del token rompe la firma (no puedes volverte otro)", async () => {
    const t = await createUserToken(HASH, 7, EXP);
    const forged = t.replace(`.7.`, `.8.`);
    expect(parseUserTokenId(forged, NOW)).toBe(8); // el parse es solo forma...
    expect(await verifyUserToken(forged, HASH, NOW)).toBe(false); // ...la firma manda
  });

  it("tokens v1/v2/basura → parseUserTokenId null (no toca la BD)", () => {
    expect(parseUserTokenId("v1.123.abc", NOW)).toBeNull();
    expect(parseUserTokenId(`v2.${EXP}.admin-fonavi.abc`, NOW)).toBeNull();
    expect(parseUserTokenId("", NOW)).toBeNull();
    expect(parseUserTokenId(`v3.${EXP}.-4.abc`, NOW)).toBeNull();
    expect(parseUserTokenId(`v3.${EXP}.abc.def`, NOW)).toBeNull();
  });

  it("sin hash (usuario borrado) → false, fail-closed", async () => {
    const t = await createUserToken(HASH, 7, EXP);
    expect(await verifyUserToken(t, "", NOW)).toBe(false);
  });
});
