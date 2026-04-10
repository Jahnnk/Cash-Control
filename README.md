# Yayi's Cash Control

Control de caja real para Yayi's Atelier. Muestra la posicion de caja REAL (dinero en banco), no ventas teoricas de Byte.

## Stack

- Next.js 16 (App Router)
- Neon (PostgreSQL serverless)
- Drizzle ORM
- Tailwind CSS
- Recharts
- Deploy: Vercel

## Setup

1. Clonar el repo
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Crear archivo `.env.local` con tu DATABASE_URL de Neon:
   ```
   DATABASE_URL=postgresql://user:password@ep-xxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. Ejecutar migraciones y seed:
   ```bash
   npm run db:setup
   ```
5. Iniciar desarrollo:
   ```bash
   npm run dev
   ```

## Estructura

- `/dashboard` — Posicion de caja, cuentas por cobrar, ultimos 7 dias
- `/registro` — Registro diario de ventas Byte, cobros, egresos, saldo de banco
- `/clientes` — Gestion de clientes con historial
- `/reportes` — Reportes semanal, mensual, antiguedad de deuda

## Scripts

- `npm run dev` — Desarrollo local
- `npm run build` — Build de produccion
- `npm run db:migrate` — Crear tablas en Neon
- `npm run db:seed` — Insertar clientes iniciales
- `npm run db:setup` — migrate + seed

## Deploy en Vercel

1. Push a GitHub
2. Importar en Vercel
3. Agregar variable de entorno `DATABASE_URL`
4. Deploy automatico
