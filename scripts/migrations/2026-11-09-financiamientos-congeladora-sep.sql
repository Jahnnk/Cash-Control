-- Congeladora: la 1ra cuota se pagó el 4-sep-2026 (Excel), no en agosto (Jahnn, 9-nov-2026).
-- Fonavi paga 6 cuotas (sep-2026 a feb-2027) y Atelier las 6 siguientes (mar a ago 2027).
UPDATE financiamientos SET desde='2026-09-01',
  nota='Congeladora S/7,799 en 12 cuotas de S/653: las 6 primeras (sep-2026 a feb-2027) las paga Fonavi. La 2da cuota (5-oct, S/661.13) está en EQUIPOS en el Excel: pendiente de confirmar con Kelly.'
  WHERE business_id=2 AND nombre='Congeladora';
UPDATE financiamientos SET desde='2027-03-01',
  nota='Congeladora S/7,799 en 12 cuotas de S/653: las 6 últimas (mar a ago 2027) las paga Atelier.'
  WHERE business_id=1 AND nombre='Congeladora';
