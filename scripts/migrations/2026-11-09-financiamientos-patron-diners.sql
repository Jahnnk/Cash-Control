-- Una cuota «DINERS – CONGELADORA» es de la congeladora, no del préstamo Diners: el patrón de Diners excluye la palabra congeladora.
UPDATE financiamientos SET patron='^(?!.*congeladora).*diners' WHERE nombre='Préstamo Diners';
