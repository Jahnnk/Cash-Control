-- Datos de las deudas que dio Kelly (Jahnn, 9-nov-2026). Solo completa filas de `financiamientos` (tabla informativa).
-- Total a pagar = cuota × número de cuotas (referencia: no sabemos cuánto se prestó realmente).
UPDATE financiamientos SET acreedor='Diners Club', cuota=1595.89, cuotas_total=24, desde='2026-03-01', monto_original=38301.36, incluye_intereses=true,
  nota='Datos de Kelly: marzo 2026 a febrero 2028. Total = cuota × 24.' WHERE business_id=1 AND nombre='Préstamo Diners';
UPDATE financiamientos SET acreedor='Diners Club', cuota=411.60, cuotas_total=24, desde='2026-03-01', monto_original=9878.40, incluye_intereses=true,
  nota='Datos de Kelly: marzo 2026 a febrero 2028. Total = cuota × 24.' WHERE business_id=2 AND nombre='Préstamo Diners';
UPDATE financiamientos SET nombre='Préstamo de Kelly', acreedor='Kelly', patron='antiguo', cuota=750, cuotas_total=49, desde='2025-03-01', monto_original=36750,
  nota='Datos de Kelly: marzo 2025 a marzo 2029 (49 cuotas). Total = cuota × 49. Si fueran 48, el total es 36,000.' WHERE business_id=1 AND nombre='Deuda antigua';
UPDATE financiamientos SET nombre='Préstamo de Kelly', acreedor='Kelly', patron='antiguo', cuota=750, cuotas_total=49, desde='2025-03-01', monto_original=36750,
  nota='Datos de Kelly: marzo 2025 a marzo 2029 (49 cuotas). Total = cuota × 49. Si fueran 48, el total es 36,000.' WHERE business_id=2 AND nombre='Deuda antigua';
UPDATE financiamientos SET cuota=653, cuotas_total=6, desde='2026-08-01', monto_original=3918, incluye_intereses=true,
  nota='Congeladora S/7,799 en 12 cuotas de S/653: las 6 primeras (ago-2026 a ene-2027) las paga Fonavi.' WHERE business_id=2 AND nombre='Congeladora';
INSERT INTO financiamientos (business_id, nombre, patron, dia_pago, cuota, cuotas_total, desde, monto_original, incluye_intereses, nota) VALUES
  (1, 'Congeladora', 'congeladora', 4, 653, 6, '2027-02-01', 3918, true, 'Congeladora S/7,799 en 12 cuotas de S/653: las 6 últimas (feb a jul 2027) las paga Atelier.')
ON CONFLICT (business_id, nombre) DO NOTHING;
