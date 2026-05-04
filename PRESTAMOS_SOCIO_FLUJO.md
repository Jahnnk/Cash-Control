# Préstamos del socio — Guía de uso

## ¿Qué es esto?

Una sección **exclusiva de Atelier** donde se registra el dinero personal
que Jahnn presta al negocio cuando hay falta de liquidez. Es un caso
aislado: la mayoría de los meses no debería tener movimientos aquí.

**Ejemplo real (30/04/2026):**
Jahnn prestó S/2,208.85 en efectivo a Atelier para pagar al propietario por
adelantado (alquiler S/1,800 + trifásico S/408.85). Esos S/2,208.85 son
una deuda de Atelier con Jahnn hasta que el negocio le devuelva el dinero.

## ¿Por qué existe esta sección separada?

Porque **estos movimientos no son operación del negocio** — son aporte
personal del socio. Si los mezclamos con ingresos/gastos normales:

- Los ingresos del mes se inflan artificialmente (Atelier no "vendió" S/2,208.85)
- El EBITDA se distorsiona
- Los reportes por categoría no reflejan el costo real
- La vista Grupo da un margen falso

Por eso, la app **excluye automáticamente** los préstamos del socio de:
ingresos del mes, gastos del mes, EBITDA, reportes por categoría,
presupuesto, conciliación bancaria, vista Grupo, y saldo BCP calculado.

## ¿Cómo registrar un préstamo?

1. Entra a **Atelier → Préstamos socio** (en la barra lateral, ícono de
   monedas)
2. Click en **"Registrar préstamo"** (botón verde)
3. Llena:
   - **Fecha:** día en que Jahnn prestó el dinero
   - **Monto:** cuánto prestó (S/)
   - **Método:** efectivo / transferencia / yape (según cómo entregó el dinero)
   - **Concepto:** descripción corta (ej: "Adelanto alquiler abril")
   - **Notas:** opcional (ej: para qué se usó)
4. Click en **"Guardar"**

El **"Saldo pendiente"** sube por ese monto.

## ¿Cómo registrar una devolución?

Cuando Atelier ya tiene liquidez y le paga a Jahnn:

1. Entra a **Atelier → Préstamos socio**
2. Click en **"Registrar devolución"** (botón naranja)
3. Llena los mismos campos. Puedes devolver parcial o todo.
4. Click en **"Guardar"**

El **"Saldo pendiente"** baja por ese monto.

## ¿Qué pasa si me equivoco?

Cada movimiento tiene un ícono de papelera (🗑️) al final. Click pide
confirmación y borra ese movimiento. Los saldos se recalculan al instante.

## ¿Dónde aparece el saldo?

- En el **Dashboard de Atelier**: si hay saldo pendiente > 0, sale una
  tarjeta naranja **"Deuda con socio"** que te lleva a la página.
- En la propia página: tres tarjetas resumen (saldo pendiente, total
  prestado, total devuelto) + historial completo de movimientos.

## ¿Qué pasa con el saldo del banco?

Los préstamos NO mueven el saldo BCP calculado por la app. Si Jahnn deposita
por transferencia un préstamo a la cuenta de Atelier, el banco real sí
sube — pero el saldo calculado por la app no incluye ese ingreso (porque
no es un ingreso operativo). Cuando actualices el saldo BCP manualmente
desde la app del banco, la app detectará la diferencia y ajustará el ancla.
