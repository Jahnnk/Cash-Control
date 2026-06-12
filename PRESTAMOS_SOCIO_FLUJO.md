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
   - **¿Cómo entró el dinero?** — esto decide qué saldo se mueve:
     - **Directo (Jahnn pagó el gasto):** Jahnn pagó a un tercero con su
       dinero. No toca el banco ni la caja; solo queda la deuda. (El caso
       más común históricamente.)
     - **A la cuenta BCP:** Jahnn depositó/transfirió al banco de Atelier.
       El saldo BCP calculado **sí sube** — igual que el banco real.
     - **A caja (efectivo):** Jahnn puso efectivo en la caja física. El
       saldo de caja **sí sube**.
   - **Concepto:** descripción corta (ej: "Adelanto alquiler abril")
   - **Notas:** opcional (ej: para qué se usó)
4. Click en **"Guardar"**

El **"Saldo pendiente"** sube por ese monto.

## También se puede registrar desde "Movimientos diarios"

Si Jahnn deposita un préstamo al BCP mientras concilia los movimientos
del día: en **Reportes → Movimientos diarios → Nuevo ingreso**, elige
tipo de ingreso **"No operativo · Préstamos / financiamiento recibido"**
y marca el check **"Es préstamo del socio (Jahnn → Atelier)"**.

El ingreso suma al banco (el dinero entró de verdad) y a la vez queda
registrado en esta pantalla como deuda pendiente con Jahnn — es el MISMO
registro, no hay doble conteo. Desde ese momento se gestiona (editar /
eliminar) solo desde Préstamos del socio.

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

Depende de **cómo se movió el dinero** (junio 2026 — antes ningún
préstamo tocaba el saldo BCP calculado, lo que descuadraba el banco
cuando un préstamo SÍ pasaba por la cuenta):

| Movimiento | Saldo BCP | Caja física |
|---|---|---|
| Préstamo **directo** (Jahnn pagó el gasto) | no cambia | no cambia |
| Préstamo **a la cuenta BCP** | **sube** | no cambia |
| Préstamo **a caja (efectivo)** | no cambia | **sube** |
| Devolución por **transferencia/yape** | **baja** | no cambia |
| Devolución en **efectivo** | no cambia | **baja** |

En todos los casos el préstamo queda **fuera** de ingresos del mes,
EBITDA, reportes por categoría y presupuesto: prestar/devolver no es
venta ni gasto operativo.
