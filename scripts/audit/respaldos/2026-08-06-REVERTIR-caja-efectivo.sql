-- REVERSIÓN — devuelve la caja en efectivo de Atelier al estado del 2026-08-06
-- Generado automáticamente ANTES de la corrección. Ejecutar solo si hay que deshacer.

BEGIN;

UPDATE expenses SET payment_method='efectivo', archived=false, amount=125, atelier_amount=NULL, is_shared=false WHERE id='2b42d464-8cd9-4c1c-9aad-61fad864c8bc';  -- 2026-04-10 Pago en efectivo por fletes
UPDATE expenses SET payment_method='efectivo', archived=false, amount=10, atelier_amount=NULL, is_shared=false WHERE id='53dced02-5664-49e6-ae7a-531fbc0433c6';  -- 2026-04-10 Packaging
UPDATE expenses SET payment_method='efectivo', archived=false, amount=67, atelier_amount=NULL, is_shared=false WHERE id='98e244f4-c1da-4bbc-9805-2071e9bf5346';  -- 2026-04-10 Insumos pagados por Luis
UPDATE expenses SET payment_method='efectivo', archived=false, amount=96, atelier_amount=NULL, is_shared=false WHERE id='336a5a6f-a1e0-4134-8fa3-731a8ef1e108';  -- 2026-04-10 Pago deliverys Luis
UPDATE expenses SET payment_method='efectivo', archived=false, amount=817.7, atelier_amount=408.85, is_shared=true WHERE id='4ff047ec-9b49-400f-b4ca-a5f5a6217081';  -- 2026-04-30 Trifásico (instalación solicitada por el
UPDATE expenses SET payment_method='efectivo', archived=false, amount=2700, atelier_amount=1800.09, is_shared=true WHERE id='7093d556-e767-4960-8466-15806e585054';  -- 2026-04-30 Alquiler abril (pago anticipado al propi
UPDATE expenses SET payment_method='efectivo', archived=false, amount=184.4, atelier_amount=NULL, is_shared=false WHERE id='dfa5eccd-dc7d-4eb1-8b06-83b4962dfb11';  -- 2026-05-04 Reembolso planilla Thalia
UPDATE expenses SET payment_method='efectivo', archived=false, amount=176.7, atelier_amount=NULL, is_shared=false WHERE id='19ca7ce4-3ae9-4f1f-ab2a-f896f832c407';  -- 2026-05-04 Reembolso planilla Luis
UPDATE expenses SET payment_method='efectivo', archived=false, amount=803, atelier_amount=NULL, is_shared=false WHERE id='326efb66-450c-4d83-937f-d05f74727ad5';  -- 2026-05-04 Reembolso planilla abril
UPDATE expenses SET payment_method='efectivo', archived=false, amount=90, atelier_amount=NULL, is_shared=false WHERE id='c129a41f-749b-4074-8892-7750bd4e7a8e';  -- 2026-05-04 Regalos día de la madre
UPDATE expenses SET payment_method='efectivo', archived=false, amount=642.1, atelier_amount=NULL, is_shared=false WHERE id='35cddd5d-cb14-43e0-9809-68542a576069';  -- 2026-05-05 Compras metro (01 harina panadera 50kg, 
UPDATE expenses SET payment_method='efectivo', archived=false, amount=780, atelier_amount=NULL, is_shared=false WHERE id='73cb51b7-d87b-462a-96a0-42d98106c13c';  -- 2026-05-05 Mantequilla y queso semanal
UPDATE expenses SET payment_method='efectivo', archived=false, amount=46.8, atelier_amount=0, is_shared=true WHERE id='9e134e25-3132-47f6-9f5d-634ee1dfde79';  -- 2026-05-05 Compras Metro F753-167564
UPDATE expenses SET payment_method='efectivo', archived=false, amount=6340, atelier_amount=NULL, is_shared=false WHERE id='aa1a62dd-b802-4fb6-9073-e821430628e3';  -- 2026-06-09 Depósito a BCP
UPDATE expenses SET payment_method='efectivo', archived=false, amount=900, atelier_amount=450, is_shared=false WHERE id='5a521180-acd7-480b-87e9-b0d9c7c12ca1';  -- 2026-06-11 Pago instalación nuevo medidor 2do pago
UPDATE expenses SET payment_method='efectivo', archived=false, amount=53.11, atelier_amount=NULL, is_shared=false WHERE id='52b51949-9db5-48f3-89fb-39e91047f917';  -- 2026-07-28 Devolución por cuadre

UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=300 WHERE id='41f471bc-205d-41c0-9e0d-87c9030c942a';  -- 2026-04-10
UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=3517.7 WHERE id='992aa5f0-bff2-4cb5-99e8-a155d39e4f10';  -- 2026-04-30
UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=2037 WHERE id='9be430cc-bf8d-42b8-95e7-50783fbd1270';  -- 2026-05-04
UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=720.4 WHERE id='a2cece48-4264-4927-a80d-417753197648';  -- 2026-05-04
UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=16.8 WHERE id='f6371efa-47d9-4407-aefa-c9a9a77f932f';  -- 2026-05-10
UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=899.91 WHERE id='811176f6-9ca0-4824-9bac-b54bb1954df0';  -- 2026-06-08
UPDATE bank_income_items SET payment_method='efectivo', archived=false, amount=6340 WHERE id='12b683f8-2888-4e52-aae5-1380df702335';  -- 2026-06-09

COMMIT;
