@AGENTS.md

# Yayi's Cash Control

## Contexto
App de control de caja real para Yayi's Atelier (panadería/pastelería B2B en Cajamarca, Perú). El dueño es Jahnn. Usa Byte como sistema POS y BCP como banco.

## Problema que resuelve
Byte registra ventas diarias, pero el dinero real entra al banco días después. Esta app muestra la posición de caja REAL (banco), no las ventas teóricas.

## Stack
- Next.js 16 (App Router) + TypeScript
- Neon PostgreSQL (`@neondatabase/serverless`) + Drizzle ORM
- Tailwind CSS v4
- Recharts para gráficos
- Deploy: Vercel (auto-deploy desde GitHub)

## Flujo diario del usuario
1. Mañana: revisa saldo BCP real en la app del banco
2. Entra a Byte: ve cierre de caja del día anterior (crédito día, créditos cobrados, descuentos, totales por método)
3. Entra a BCP: ve movimientos individuales (ingresos y egresos)
4. Registra todo en la app

## Estructura de datos clave

### daily_records
Registro diario con datos de Byte + Banco:
- Byte: byte_cash_physical (efectivo caja), byte_digital (yape+transfer+tarjeta+plin), byte_credit_day, byte_credit_collected, byte_discounts, byte_total
- Banco: bank_income, bank_expense, bank_balance_real
- Total Byte = Crédito día + Efectivo + Digital (descuentos NO restan, son solo info)

### bank_income_items
Ingresos BCP individuales con cliente opcional:
- Sin cliente = ingreso del día (Byte)
- Con cliente = pago de crédito antiguo (Fonavi, Centro, Otros)

### expenses
Egresos con categoría y método de pago (transferencia/efectivo/yape)
- Categorías dinámicas desde tabla expense_categories

### Clientes activos
- Fonavi (familia, interdiario)
- Centro (familia, interdiario)
- Otros (b2b, variable)

## Lógica de negocio importante
- Conciliación bancaria: solo compara movimientos por transferencia/yape. Efectivo va aparte
- Verificación rápida: Byte esperado en banco (Digital + Créd. cobrados) vs Ingresos BCP sin pagos de clientes
- Saldo BCP se pre-llena con último saldo conocido en días nuevos
- Los pagos de Fonavi/Centro por créditos antiguos van al banco pero no se reflejan en el Byte del día

## Páginas
- `/dashboard` — 5 tarjetas (saldo, ingresos, gastos, CxC, cobertura) + últimos 7 días + conciliación bancaria + efectivo
- `/registro` — Tab Byte (campos Byte + verificación) + Tab Movimientos (estilo Board: feed de ingresos/egresos)
- `/clientes` — Lista de clientes con detalle
- `/reportes` — Semanal, Mensual, Antigüedad de deuda
- `/configuracion` — Gestión de categorías de egresos

## Preferencias del usuario
- Idioma: siempre español
- Moneda: soles peruanos (S/)
- Timezone: America/Lima
- Diseño: minimalista, colores #004C40 y #098B5F
- Formularios rápidos, mínimos clicks
- Estilo Board (BudgetBakers) para transacciones

## Repo y deploy
- GitHub: https://github.com/Jahnnk/Cash-Control
- Vercel: auto-deploy desde main
- DB: Neon PostgreSQL (sa-east-1)
