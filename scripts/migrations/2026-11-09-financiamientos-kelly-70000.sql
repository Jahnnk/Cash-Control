-- Corrección con el resumen del crédito de Kelly (Jahnn, 9-nov-2026): S/70,000 en 47 meses, mayo 2025 a marzo 2029.
-- 46 cuotas de S/1,500 (750 por sede) + última de S/1,000 (500 por sede) = S/35,000 por sede.
UPDATE financiamientos SET cuotas_total=47, desde='2025-05-01', monto_original=35000,
  nota='Crédito de Kelly S/70,000 (35,000 por sede): 47 cuotas, mayo 2025 a marzo 2029. 46 de S/750 por sede y la última de S/500 por sede.'
  WHERE nombre='Préstamo de Kelly' AND business_id IN (1, 2);
