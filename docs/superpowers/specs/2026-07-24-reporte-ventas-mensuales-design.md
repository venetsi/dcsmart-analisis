# Reporte de Ventas Mensuales (P&L por tipo de comprobante) — Diseño

**Fecha:** 2026-07-24
**App:** dcsmart-analisis
**Estado:** diseño aprobado (sujeto a correcciones), pendiente completar tabla de tipos.

## Objetivo

Nueva sección en la app de análisis que arma el **P&L (Estado de Resultados) mensual por local**,
replicando el reporte que hoy los chicos arman a mano en planillas. El reporte:

1. Trae automáticamente de la base todo lo transaccional (ventas de cajas, CMV y gastos de pagos,
   agrupados por rubro/categoría).
2. Permite cargar a mano lo que no vive en la app como transacción (impositivos AFIP/ARCA, pasivo,
   socios, alquileres en USD, otros ingresos por acuerdos).
3. Separa cada línea en **dos columnas según el tipo de comprobante**: bancarizado/blanco vs
   efectivo/sin factura.

Es una **sección nueva e independiente** de la página `/pyl` existente, que queda intacta. Se
reutiliza la lógica de estructura de secciones de `lib/pyl.js` como referencia, pero el motor de
split es distinto (por tipo de comprobante, no por método de pago).

## Contexto: qué ya existe (no se toca)

- **`/pyl`** (`PyLPage.jsx` + `lib/pyl.js` + `GET /api/data/pyl`): P&L mensual que separa fiscal
  (método ≠ Efectivo) vs efectivo (método = Efectivo). Mismo filtro mes+local. Sirve de referencia
  de estructura de secciones y de la UI (KPIs, tabla colapsable, waterfall, export PDF).
- **BigQuery `vw_pagos`** ya expone el campo `tipo` (= `id_tipo` de gestión) — el split por tipo de
  comprobante es viable sin tocar el ETL.
- **No existe hoy** ningún mecanismo de carga manual ni upload en la app. Hay que crearlo.
- Base propia Postgres `dcsmart_analytics` (misma instancia Cloud SQL) con patrón RW ya usado por
  `presets` y `access_grants`, sobre el pool `analyticsDb` (usuario `analytics_app`).

## Decisiones tomadas (brainstorming)

| Tema | Decisión |
|---|---|
| Encuadre | Sección nueva separada; `/pyl` queda como está. |
| Columnas 1 y 2 | Split por **tipo de comprobante** (ver tabla abajo), no por método de pago. |
| Modelo de datos | **En vivo + capa manual**: automáticos siempre desde BigQuery; solo se persisten los manuales. |
| Carga manual | **Formulario con precarga del mes anterior**. Upload de archivo → fase 2. |
| Bloques manuales | Impositivos AFIP/ARCA, Pasivo/plan de pagos, Socios, Alquileres USD y otros. |
| Formato | Estilo `/pyl` (KPIs + tabla colapsable + waterfall + export PDF), con 3 columnas Total/Col1/Col2. |
| Alcance | Por local (como el entregable); consolidado por grupo = suma de locales. Manuales por local. |
| Permisos | Cualquier usuario con acceso a analytics puede ver **y cargar** (se registra quién y cuándo). |

## Motor de las dos columnas (split por tipo de comprobante)

Cada línea automática (y cada línea manual) se asigna a una de dos columnas:

- **Col 1 — Bancarizado / blanco / facturado**
- **Col 2 — Efectivo / ticket / sin factura**

Mapeo confirmado por el usuario:

| Tipo | Columna |
|---|---|
| A | 1 |
| C | 1 |
| NCA | 1 |
| DC_1 | 1 |
| B | 2 |
| NCB | 2 |
| DC_2 | 2 |
| STK (MovStock) | 2 (siempre) |

**Pendiente de confirmar** — tipos existentes en gestión sin asignar todavía (propuesta tentativa,
a validar con el usuario antes de implementar):

| Tipo | Descripción tentativa | Columna propuesta |
|---|---|---|
| M | Factura M (fiscal) | 1 (?) |
| NDA | Nota de Débito A | 1 (?) |
| ND | Nota de Débito | ? |
| CM | ? | ? |
| DDJJ | Declaración jurada | 1 (?) |
| FF | ? | ? |
| LF | ? | ? |
| X | ? | ? |

> ⚠️ El mapeo completo es un bloqueante de implementación: cualquier tipo sin asignar debe tener un
> destino explícito (col 1, col 2, o excluido del reporte) para no perder importes silenciosamente.
> El sistema debe loguear/mostrar cualquier tipo que aparezca en los datos y no esté en el mapeo.

## Arquitectura

### Frontend
- Página nueva `frontend/src/pages/ReporteMensualPage.jsx`.
- Ruta nueva `/reporte-mensual` en `App.jsx`, bajo `AppShell` (requiere auth + grupo).
- Item nuevo en `components/Sidebar.jsx`, sección "Tableros".
- Motor de armado en `frontend/src/lib/reporteMensual.js` (nuevo). No se modifica `pyl.js`.
- Componente de carga manual (form con precarga) — inline en la tabla o panel lateral.

### Backend — lectura (BigQuery)
- Endpoint nuevo `GET /api/data/reporte-mensual?mes=&grupo=&local=` en `routes/datasets.js`.
- Consultas en paralelo:
  1. Ventas del mes de `vw_cajas` (total, comensales, tickets, por origen).
  2. Gastos/CMV de `vw_pagos` con `ingresa_egreso='EGRESO'`, agrupados por **rubro + categoría +
     tipo**, para poder repartir cada línea en las dos columnas.
- El backend solo agrega; el frontend arma la estructura de secciones (mismo patrón que `/pyl`).

### Backend — escritura (Postgres propio, lo nuevo)
- Tabla nueva en `dcsmart_analytics` (migración en `infra/00b_analytics_db.sql` o nuevo archivo):

  ```sql
  CREATE TABLE reporte_mensual_manual (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo       TEXT NOT NULL,        -- nombre de app/grupo
    local       TEXT NOT NULL,        -- nombre de local (los manuales son por local)
    mes         DATE NOT NULL,        -- primer día del mes (YYYY-MM-01)
    seccion     TEXT NOT NULL,        -- p.ej. 'impositivos', 'pasivo', 'socios', 'alquileres'
    concepto    TEXT NOT NULL,        -- p.ej. 'IVA', 'Deuda ART', 'Alquiler Bar'
    monto       NUMERIC(14,2) NOT NULL,
    columna     SMALLINT NOT NULL CHECK (columna IN (1,2)),
    creado_por  TEXT,                 -- email del usuario
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (grupo, local, mes, seccion, concepto)
  );
  ```

- Endpoints RW nuevos (ruta nueva, p.ej. `routes/reporte_manual.js`, sobre `analyticsDb`):
  - `GET /api/reporte-manual?grupo&local&mes` — filas manuales del mes.
  - `PUT /api/reporte-manual` — upsert de las filas del mes (guardar el form completo).
  - `POST /api/reporte-manual/precargar?grupo&local&mes` — copia las filas del mes anterior al mes
    actual si el mes actual está vacío (devuelve las filas copiadas, no las persiste hasta el PUT;
    decisión de implementación a afinar en el plan).
  - Autorización: mismos guards de acceso al grupo que el resto de `/api/data`.

## Flujo de datos

```
BigQuery (vw_cajas, vw_pagos)  ──►  GET /api/data/reporte-mensual  ──┐
                                                                     ├─►  lib/reporteMensual.js  ──►  tabla P&L
Postgres propio (reporte_mensual_manual)  ──►  GET /api/reporte-manual ──┘        (merge auto + manual,
                                                                                  split por tipo → 2 columnas)
```

El frontend pide ambas fuentes, las fusiona por sección, aplica el mapeo tipo→columna a lo
automático, y ubica cada línea manual en su columna guardada.

## UI

- Filtros: mes (`<input type=month>`, default mes anterior) + local (dropdown; vacío = consolidado).
- KPIs: Ventas, Resultado bruto, Resultado económico, Resultado del mes, Food cost %, Prime cost %.
- Tabla P&L: secciones colapsables; columnas **Concepto | Total | Col 1 (bancarizado) | Col 2
  (efectivo)** con sus %. Resultados intermedios (bruto, económico, del mes) como en `/pyl`.
- Las líneas de secciones manuales se editan (inline o panel), con botón "traer del mes anterior".
- Botón exportar/imprimir PDF (`window.print()`, como `/pyl`).

## Fases

- **MVP (este spec):** reporte en vivo + capa manual por formulario con precarga; split por tipo;
  UI estilo `/pyl`; por local y consolidado.
- **Fase 2 (fuera de este spec):** subir Excel/CSV (ej. reporte AFIP) que complete líneas manuales.

## Fuera de alcance (YAGNI)

- Cierre/congelado de meses y versionado de reportes.
- Ratios de balance (ROA/ROE/liquidez) — requieren saldos que no tenemos.
- Conversión automática de alquileres en USD — se carga el monto final en pesos a mano.
- Upload de archivos (es fase 2).

## Riesgos / puntos abiertos

1. **Mapeo de tipos incompleto** (bloqueante) — ver tabla arriba.
2. **Criterio col 1 vs col 2**: el usuario lo definió por tipo de comprobante. Validar que no haya
   pagos relevantes con tipo vacío/nulo que queden sin columna.
3. **Definición de qué rubros son "manuales" vs "automáticos"**: si un concepto manual (p.ej. un
   alquiler) también existe cargado como pago en la app, se contaría dos veces. Hay que decidir por
   sección/rubro qué origen manda (probablemente: las secciones manuales se excluyen del agregado
   automático de pagos).
4. **Precarga**: definir si "traer del mes anterior" persiste al instante o solo pre-llena el form.
