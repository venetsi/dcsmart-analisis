# Reporte de Ventas Mensuales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva sección "Reporte Ventas Mensuales" en la app de análisis: P&L mensual por local que trae lo transaccional de BigQuery, permite carga manual de lo externo, y separa cada línea en dos columnas por tipo de comprobante (bancarizado vs efectivo).

**Architecture:** Sección nueva independiente del `/pyl` existente. Datos automáticos siempre en vivo desde BigQuery (`vw_pagos`/`vw_cajas`), agregados por rubro+categoría+**tipo de comprobante**. Capa manual persistida en la base propia Postgres `dcsmart_analytics`. El backend solo agrega; el frontend (`lib/reporteMensual.js`) arma la estructura de secciones y aplica el mapeo tipo→columna.

**Tech Stack:** Node + Fastify (backend), BigQuery (`@google-cloud/bigquery`), Postgres (`pg`), Vite + React + Chart.js (frontend). Sin framework de tests en el repo: verificación por `curl`/query/`build`, salvo el motor puro que usa `node:test` (built-in).

## Global Constraints

- El endpoint de lectura consulta **solo BigQuery** (`fastify.bq`), nunca Postgres de gestión. Patrón de `routes/datasets.js`.
- La escritura va **solo** a la base propia `dcsmart_analytics` vía pool `analyticsDb` (usuario `analytics_app`). Nunca escribir en la base de gestión.
- Autorización: mismos guards de acceso al grupo que el resto de `/api/data` y `/api`. Cualquier usuario con acceso a analytics puede ver **y** cargar.
- Filtros del UI hacia BigQuery siempre parametrizados con whitelist (nunca interpolar strings del cliente en SQL). Patrón existente en `datasets.js`.
- Fechas de calendario (mes) se manejan como primer día del mes `YYYY-MM-01`.
- No tocar `lib/pyl.js`, `PyLPage.jsx` ni el endpoint `/api/data/pyl`.
- Rama de trabajo: `MAIN-03-reporte-ventas-mensuales`.

## Decisiones por defecto (tomadas para no bloquear; VALIDAR con el usuario)

Estas resuelven los 3 puntos abiertos del spec. Son defaults razonables y explícitos; se pueden cambiar en un solo lugar:

1. **Mapeo tipo→columna incompleto:** el motor mapea solo los tipos confirmados (A/C/NCA/DC_1 → col 1; B/NCB/DC_2/STK → col 2). Cualquier otro tipo (M, NDA, ND, CM, DDJJ, FF, LF, X, vacío) NO se adivina: cae en un bucket visible `sin_asignar` que se muestra en el reporte con un aviso, para no perder importes ni contaminar columnas. El usuario asigna los faltantes editando `MAPEO_TIPOS`.
2. **Doble conteo manual vs automático:** las secciones manuales (`impositivos`, `pasivo`, `socios`, `alquileres_manual`, `otros_ingresos_manual`) se arman SOLO con datos manuales; el agregado automático de pagos excluye esos rubros (constante `RUBROS_EXCLUIDOS_AUTO`). Si un concepto está a la vez como pago y como manual, manda el manual.
3. **Precarga:** "traer del mes anterior" solo **pre-llena el formulario** en el cliente (no persiste); recién se guarda con el PUT explícito.

## File Structure

- `infra/00c_reporte_manual.sql` — **crear** — migración de la tabla `reporte_mensual_manual`.
- `backend/src/routes/datasets.js` — **modificar** — agregar endpoint `GET /reporte-mensual`.
- `backend/src/routes/reporte_manual.js` — **crear** — rutas RW de la capa manual.
- `backend/src/server.js` — **modificar** — registrar la ruta nueva.
- `frontend/src/lib/reporteMensual.js` — **crear** — motor: mapeo tipo→columna, merge auto+manual, estructura de secciones, cálculos.
- `frontend/src/lib/reporteMensual.test.js` — **crear** — test unitario del motor (node:test).
- `frontend/src/lib/api.js` — **modificar** — métodos cliente nuevos.
- `frontend/src/pages/ReporteMensualPage.jsx` — **crear** — página (KPIs + tabla 3 columnas + panel manual).
- `frontend/src/App.jsx` — **modificar** — ruta `/reporte-mensual`.
- `frontend/src/components/Sidebar.jsx` — **modificar** — item de menú.

---

### Task 1: Migración de la tabla de datos manuales

**Files:**
- Create: `infra/00c_reporte_manual.sql`

**Interfaces:**
- Produces: tabla `reporte_mensual_manual` en la base `dcsmart_analytics`, con unique `(grupo, local, mes, seccion, concepto)`.

- [ ] **Step 1: Crear el archivo SQL de migración**

Crear `infra/00c_reporte_manual.sql`:

```sql
-- Capa manual del Reporte de Ventas Mensuales (P&L).
-- Vive en la base propia dcsmart_analytics (NO en la base de gestión).
CREATE TABLE IF NOT EXISTS reporte_mensual_manual (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo       TEXT NOT NULL,
  local       TEXT NOT NULL,
  mes         DATE NOT NULL,
  seccion     TEXT NOT NULL,
  concepto    TEXT NOT NULL,
  monto       NUMERIC(14,2) NOT NULL DEFAULT 0,
  columna     SMALLINT NOT NULL CHECK (columna IN (1,2)),
  creado_por  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grupo, local, mes, seccion, concepto)
);
CREATE INDEX IF NOT EXISTS idx_rmm_scope ON reporte_mensual_manual (grupo, local, mes);
GRANT SELECT, INSERT, UPDATE, DELETE ON reporte_mensual_manual TO analytics_app;
```

- [ ] **Step 2: Aplicar la migración contra la base (vía Cloud SQL proxy en 5433)**

Requiere el proxy corriendo (`cloud-sql-proxy ... --port 5433`). La base propia es `dcsmart_analytics` en la misma instancia. Construir la URL apuntando a esa base (usuario `analytics_app`; credenciales en el entorno de infra, no hardcodear).

Run (ajustar credenciales según el entorno):
```bash
psql "postgresql://analytics_app:PASS@localhost:5433/dcsmart_analytics" -f infra/00c_reporte_manual.sql
```
Expected: `CREATE TABLE`, `CREATE INDEX`, `GRANT` sin errores.

- [ ] **Step 3: Verificar que la tabla existe**

Run:
```bash
psql "postgresql://analytics_app:PASS@localhost:5433/dcsmart_analytics" -c "\d reporte_mensual_manual"
```
Expected: se listan las columnas id, grupo, local, mes, seccion, concepto, monto, columna, creado_por, updated_at y el unique constraint.

- [ ] **Step 4: Commit**

```bash
git add infra/00c_reporte_manual.sql
git commit -m "feat(infra): tabla reporte_mensual_manual para capa manual del P&L mensual"
```

---

### Task 2: Endpoint de lectura — agregado por tipo de comprobante

**Files:**
- Modify: `backend/src/routes/datasets.js`

**Interfaces:**
- Produces: `GET /api/data/reporte-mensual?mes=YYYY-MM&grupo=<g>&local=<l>` que devuelve:
  ```
  {
    mes, scope: { grupo, local },
    ventas: { total, comensales, tickets, por_origen: [{origin, total}] },
    gastos: [{ rubro, categoria, tipo, total }]   // tipo = tipo de comprobante (id_tipo)
  }
  ```

- [ ] **Step 1: Agregar el handler en `datasets.js`**

Ubicar el bloque de rutas existente (junto a `/pyl`, ~línea 208). Agregar:

```js
// Reporte de Ventas Mensuales: ventas del mes + gastos agrupados por
// rubro/categoria/TIPO de comprobante (para el split en 2 columnas).
fastify.get('/reporte-mensual', async (req, reply) => {
  const { mes, grupo, local } = req.query
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return reply.code(400).send({ error: 'Parametro "mes" requerido (YYYY-MM)' })
  }
  const desde = `${mes}-01`
  // primer dia del mes siguiente
  const [y, m] = mes.split('-').map(Number)
  const hasta = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const localFilter = local ? 'AND local = @local' : ''
  const params = { grupo, desde, hasta, ...(local ? { local } : {}) }

  const ventasSql = `
    SELECT IFNULL(SUM(total),0) total, IFNULL(SUM(comensales),0) comensales,
           IFNULL(SUM(tickets),0) tickets
    FROM \`${BQ_DATASET}.vw_cajas\`
    WHERE grupo = @grupo AND fecha >= @desde AND fecha < @hasta ${localFilter}`

  const origenSql = `
    SELECT origin, IFNULL(SUM(total),0) total
    FROM \`${BQ_DATASET}.vw_cajas\`
    WHERE grupo = @grupo AND fecha >= @desde AND fecha < @hasta ${localFilter}
    GROUP BY origin`

  const gastosSql = `
    SELECT rubro, categoria, IFNULL(tipo,'') tipo, IFNULL(SUM(importe),0) total
    FROM \`${BQ_DATASET}.vw_pagos\`
    WHERE grupo = @grupo AND ingresa_egreso = 'EGRESO'
      AND fecha >= @desde AND fecha < @hasta ${localFilter}
    GROUP BY rubro, categoria, tipo`

  const [ventas, porOrigen, gastos] = await Promise.all([
    fastify.bq.query({ query: ventasSql, params }).then(r => r[0][0] || {}),
    fastify.bq.query({ query: origenSql, params }).then(r => r[0]),
    fastify.bq.query({ query: gastosSql, params }).then(r => r[0]),
  ])

  return {
    mes,
    scope: { grupo: grupo || null, local: local || null },
    ventas: {
      total: Number(ventas.total || 0),
      comensales: Number(ventas.comensales || 0),
      tickets: Number(ventas.tickets || 0),
      por_origen: porOrigen.map(o => ({ origin: o.origin, total: Number(o.total || 0) })),
    },
    gastos: gastos.map(g => ({
      rubro: g.rubro, categoria: g.categoria, tipo: g.tipo,
      total: Number(g.total || 0),
    })),
  }
})
```

> Nota: verificar el nombre exacto de la variable del dataset BQ (`BQ_DATASET`) y del filtro por local (`local` vs `id_local`) leyendo el `/pyl` existente en el mismo archivo; usar los mismos identificadores.

- [ ] **Step 2: Verificar con curl contra un mes/local reales**

Levantar el backend (`npm run dev` en `backend/`, con proxy y credenciales BQ). Autenticar según el flujo de la app (token). Luego:

Run:
```bash
curl -s "http://localhost:8080/api/data/reporte-mensual?mes=2026-03&grupo=GRUPO%203MONOS&local=3MONOS" -H "Authorization: Bearer <TOKEN>" | node -e "const d=JSON.parse(require('fs').readFileSync(0));console.log('ventas',d.ventas.total,'| filas gastos',d.gastos.length,'| tipos:',[...new Set(d.gastos.map(g=>g.tipo))].join(','))"
```
Expected: `ventas` > 0 y una lista de tipos que incluya A/B/C/STK/etc. (los que existan ese mes).

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/datasets.js
git commit -m "feat(backend): endpoint GET /reporte-mensual agregando gastos por tipo de comprobante"
```

---

### Task 3: Endpoints RW de la capa manual

**Files:**
- Create: `backend/src/routes/reporte_manual.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Consumes: pool `fastify.analyticsDb` (verificar el nombre exacto del decorator en `plugins/db.js`).
- Produces:
  - `GET /api/reporte-manual?grupo&local&mes` → `[{ seccion, concepto, monto, columna }]`
  - `PUT /api/reporte-manual` body `{ grupo, local, mes, filas: [{seccion,concepto,monto,columna}] }` → upsert (reemplaza el set del mes); responde `{ ok: true, count }`
  - `GET /api/reporte-manual/anterior?grupo&local&mes` → filas del mes anterior (para precargar en el cliente)

- [ ] **Step 1: Crear `backend/src/routes/reporte_manual.js`**

```js
// Capa manual del Reporte de Ventas Mensuales. Escribe SOLO en dcsmart_analytics.
export default async function reporteManualRoutes(fastify) {
  const db = fastify.analyticsDb // verificar nombre real del pool en plugins/db.js

  function mesAnterior(mes) { // 'YYYY-MM' -> 'YYYY-MM' anterior
    const [y, m] = mes.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  fastify.get('/reporte-manual', async (req, reply) => {
    const { grupo, local, mes } = req.query
    if (!grupo || !local || !/^\d{4}-\d{2}$/.test(mes || '')) {
      return reply.code(400).send({ error: 'grupo, local y mes (YYYY-MM) requeridos' })
    }
    const { rows } = await db.query(
      `SELECT seccion, concepto, monto::float8 AS monto, columna
       FROM reporte_mensual_manual
       WHERE grupo=$1 AND local=$2 AND mes=$3
       ORDER BY seccion, concepto`,
      [grupo, local, `${mes}-01`]
    )
    return rows
  })

  fastify.get('/reporte-manual/anterior', async (req, reply) => {
    const { grupo, local, mes } = req.query
    if (!grupo || !local || !/^\d{4}-\d{2}$/.test(mes || '')) {
      return reply.code(400).send({ error: 'grupo, local y mes (YYYY-MM) requeridos' })
    }
    const { rows } = await db.query(
      `SELECT seccion, concepto, monto::float8 AS monto, columna
       FROM reporte_mensual_manual
       WHERE grupo=$1 AND local=$2 AND mes=$3
       ORDER BY seccion, concepto`,
      [grupo, local, `${mesAnterior(mes)}-01`]
    )
    return rows
  })

  fastify.put('/reporte-manual', async (req, reply) => {
    const { grupo, local, mes, filas } = req.body || {}
    if (!grupo || !local || !/^\d{4}-\d{2}$/.test(mes || '') || !Array.isArray(filas)) {
      return reply.code(400).send({ error: 'grupo, local, mes y filas[] requeridos' })
    }
    const email = req.user?.email || null // verificar como se expone el user autenticado
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `DELETE FROM reporte_mensual_manual WHERE grupo=$1 AND local=$2 AND mes=$3`,
        [grupo, local, `${mes}-01`]
      )
      for (const f of filas) {
        if (![1, 2].includes(Number(f.columna))) continue
        if (!f.concepto || !f.seccion) continue
        await client.query(
          `INSERT INTO reporte_mensual_manual (grupo, local, mes, seccion, concepto, monto, columna, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [grupo, local, `${mes}-01`, f.seccion, f.concepto, Number(f.monto || 0), Number(f.columna), email]
        )
      }
      await client.query('COMMIT')
      return { ok: true, count: filas.length }
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  })
}
```

- [ ] **Step 2: Registrar la ruta en `server.js`**

Ubicar donde se registran las rutas (`fastify.register(...)`). Seguir el patrón existente de `access`/`presets` (mismo prefijo `/api` y mismos guards de auth). Agregar:

```js
import reporteManualRoutes from './routes/reporte_manual.js'
// ... junto a los otros register, con el mismo preHandler/scope de auth:
await fastify.register(reporteManualRoutes, { prefix: '/api' })
```

> Verificar en `server.js` cómo se aplica el guard de autenticación a `access.js`/`presets.js` y replicarlo (no dejar la ruta abierta).

- [ ] **Step 3: Verificar con curl (PUT y luego GET)**

```bash
curl -s -X PUT "http://localhost:8080/api/reporte-manual" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"grupo":"GRUPO 3MONOS","local":"3MONOS","mes":"2026-03","filas":[{"seccion":"impositivos","concepto":"IVA","monto":6589497,"columna":1}]}'
curl -s "http://localhost:8080/api/reporte-manual?grupo=GRUPO%203MONOS&local=3MONOS&mes=2026-03" -H "Authorization: Bearer <TOKEN>"
```
Expected: PUT devuelve `{"ok":true,"count":1}`; GET devuelve la fila IVA con monto 6589497 y columna 1.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/reporte_manual.js backend/src/server.js
git commit -m "feat(backend): endpoints RW de la capa manual del reporte mensual"
```

---

### Task 4: Motor de cálculo (lib puro + test)

**Files:**
- Create: `frontend/src/lib/reporteMensual.js`
- Test: `frontend/src/lib/reporteMensual.test.js`

**Interfaces:**
- Produces:
  - `MAPEO_TIPOS: Record<string, 1|2>` — solo tipos confirmados.
  - `columnaDeTipo(tipo): 1 | 2 | null` — null = sin asignar.
  - `SECCIONES: Array<{key,titulo,rubros:string[],manual?:boolean,op?:boolean,cmv?:boolean,labor?:boolean,fin?:boolean,belowLine?:boolean}>`
  - `RUBROS_EXCLUIDOS_AUTO: string[]`
  - `buildReporte({ ventas, gastos, manuales }): { secciones, totales, sinAsignar }` donde cada sección tiene `{ key, titulo, lineas:[{concepto, total, col1, col2}], total, col1, col2 }` y `totales` incluye `ventas, cmv, resultadoBruto, gastosOperativos, resultadoEconomico, resultadoMes, foodCostPct, primeCostPct`. `sinAsignar` = `{ total, col1, col2, tipos:[] }` con lo que cayó fuera del mapeo.

- [ ] **Step 1: Escribir el test del motor**

Crear `frontend/src/lib/reporteMensual.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnaDeTipo, buildReporte } from './reporteMensual.js'

test('columnaDeTipo mapea confirmados y deja null los no asignados', () => {
  assert.equal(columnaDeTipo('A'), 1)
  assert.equal(columnaDeTipo('NCA'), 1)
  assert.equal(columnaDeTipo('DC_1'), 1)
  assert.equal(columnaDeTipo('B'), 2)
  assert.equal(columnaDeTipo('STK'), 2)
  assert.equal(columnaDeTipo('DDJJ'), null) // sin asignar
  assert.equal(columnaDeTipo(''), null)
})

test('buildReporte separa gastos por columna segun tipo', () => {
  const r = buildReporte({
    ventas: { total: 1000, comensales: 10, tickets: 5, por_origen: [] },
    gastos: [
      { rubro: 'CMV Alimentos', categoria: 'Carnes', tipo: 'A', total: -100 },
      { rubro: 'CMV Alimentos', categoria: 'Carnes', tipo: 'B', total: -40 },
      { rubro: 'CMV MovStock', categoria: 'Merma', tipo: 'STK', total: -30 },
    ],
    manuales: [],
  })
  const cmv = r.secciones.find(s => s.key === 'cmv')
  assert.equal(cmv.col1, -100)   // A
  assert.equal(cmv.col2, -70)    // B + STK
  assert.equal(cmv.total, -170)
})

test('buildReporte suma manuales en su seccion y columna', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [],
    manuales: [{ seccion: 'impositivos', concepto: 'IVA', monto: -200, columna: 1 }],
  })
  const imp = r.secciones.find(s => s.key === 'impositivos')
  assert.equal(imp.col1, -200)
  assert.equal(imp.total, -200)
})

test('buildReporte acumula tipos sin asignar sin perderlos', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [{ rubro: 'CMV Alimentos', categoria: 'X', tipo: 'DDJJ', total: -50 }],
    manuales: [],
  })
  assert.equal(r.sinAsignar.total, -50)
  assert.ok(r.sinAsignar.tipos.includes('DDJJ'))
})

test('resultado bruto = ventas - cmv', () => {
  const r = buildReporte({
    ventas: { total: 1000, por_origen: [] },
    gastos: [{ rubro: 'CMV Alimentos', categoria: 'C', tipo: 'A', total: -300 }],
    manuales: [],
  })
  assert.equal(r.totales.ventas, 1000)
  assert.equal(r.totales.cmv, -300)
  assert.equal(r.totales.resultadoBruto, 700)
})
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `node --test frontend/src/lib/reporteMensual.test.js`
Expected: FAIL (`Cannot find module './reporteMensual.js'` o export inexistente).

- [ ] **Step 3: Implementar `frontend/src/lib/reporteMensual.js`**

```js
// Motor del Reporte de Ventas Mensuales (P&L por tipo de comprobante).
// No depende de React ni del DOM: lógica pura, testeable con node:test.

// Mapeo tipo de comprobante -> columna. SOLO los confirmados por el usuario.
// Cualquier tipo ausente cae en "sin asignar" (visible), no se adivina.
// Col 1 = bancarizado/blanco/facturado. Col 2 = efectivo/sin factura.
// OJO: los valores REALES en vw_pagos.tipo son strings de display, no el
// enum de gestión. Verificado contra BigQuery (todos los grupos):
//   "A"(13032) "B"(12589) "STK"(1325) "C"(752) "DC (1)"(578) "NCA"(239)
//   "CM"(67) NULL(55) "DC (2)"(53) "X"(13) "M"(9) "NCB"(8) "NDA"(6)
//   "DDJJ"(4) "FF"(3) "LF"(1) "ND"(1)
export const MAPEO_TIPOS = {
  'A': 1, 'C': 1, 'NCA': 1, 'DC (1)': 1,
  'B': 2, 'NCB': 2, 'DC (2)': 2, 'STK': 2,
  // PENDIENTE VALIDAR con el usuario (bajo volumen, hoy caen en "sin asignar"):
  // 'CM', 'X', 'M', 'NDA', 'DDJJ', 'FF', 'LF', 'ND', y NULL/''.
}

export function columnaDeTipo(tipo) {
  return MAPEO_TIPOS[tipo] ?? null
}

// Rubros que se cargan a mano: se EXCLUYEN del agregado automático de pagos
// para no contarlos dos veces (el manual manda).
export const RUBROS_EXCLUIDOS_AUTO = ['Impositivo', 'Plan de Pagos', 'Socios', 'Aportes']

// Estructura de secciones del P&L (orden de presentación). Basada en la del
// PDF de referencia y en lib/pyl.js (no se importa para no acoplar).
// `manual: true` => sección alimentada solo por la capa manual.
// `op: true`     => gasto operativo (resta del resultado económico).
// `belowLine`    => se muestra debajo del resultado económico (no opera).
export const SECCIONES = [
  { key: 'cmv',          titulo: 'CMV — Costo Mercadería Vendida', rubros: ['CMV Alimentos','CMV Bebidas','CMV MovStock','CMV MovStock B2B'], op: true, cmv: true },
  { key: 'alquiler',     titulo: 'Alquiler y Servicios',           rubros: ['Fijos/Variables','Fijos/Variable'], op: true },
  { key: 'generales',    titulo: 'Gastos Generales',               rubros: ['Publicidad','Descartables/Limpieza','Instalaciones/Otros'], op: true },
  { key: 'financieros',  titulo: 'Costos Financieros',             rubros: ['Costos Financieros','Comisiones por Ventas'], op: true, fin: true },
  { key: 'labor',        titulo: 'Sueldos y Cargas',               rubros: ['Sueldos'], op: true, labor: true },
  { key: 'honorarios',   titulo: 'Honorarios',                     rubros: ['Honorarios'], op: true },
  { key: 'eventos',      titulo: 'Eventos',                        rubros: ['Eventos','Musicos'], op: true },
  { key: 'otros',        titulo: 'Otros gastos operativos',        rubros: [], op: true, cajon: true },
  // Secciones manuales:
  { key: 'impositivos',  titulo: 'Impositivos (AFIP/ARCA)',        rubros: [], op: true, manual: true },
  { key: 'pasivo',       titulo: 'Pasivo / Plan de pagos',         rubros: [], manual: true, belowLine: true },
  { key: 'socios',       titulo: 'Socios',                          rubros: [], manual: true, belowLine: true },
]

// Índice rubro -> key de sección (para el cajón "otros" cae lo no mapeado).
const rubroToSection = {}
for (const s of SECCIONES) for (const r of s.rubros) rubroToSection[r] = s.key

function nuevaLineaMap() { return new Map() }
function addLinea(map, concepto, col, monto) {
  const cur = map.get(concepto) || { concepto, total: 0, col1: 0, col2: 0 }
  if (col === 1) cur.col1 += monto
  else if (col === 2) cur.col2 += monto
  cur.total += monto
  map.set(concepto, cur)
}

export function buildReporte({ ventas, gastos = [], manuales = [] }) {
  const acc = {}
  for (const s of SECCIONES) acc[s.key] = nuevaLineaMap()
  const sinAsignar = { total: 0, col1: 0, col2: 0, tipos: new Set() }

  // 1) Gastos automáticos por rubro/categoria/tipo.
  for (const g of gastos) {
    if (RUBROS_EXCLUIDOS_AUTO.includes(g.rubro)) continue
    const key = rubroToSection[g.rubro] || 'otros'
    const col = columnaDeTipo(g.tipo)
    if (col === null) {
      sinAsignar.total += g.total
      sinAsignar.tipos.add(g.tipo || '(vacío)')
      // igual lo mostramos en su sección, en una subcolumna aparte:
      addLinea(acc[key], `${g.categoria} · tipo ${g.tipo || '?'} (sin asignar)`, 0, g.total)
      continue
    }
    addLinea(acc[key], g.categoria || g.rubro, col, g.total)
  }

  // 2) Capa manual.
  for (const m of manuales) {
    if (!acc[m.seccion]) acc[m.seccion] = nuevaLineaMap()
    addLinea(acc[m.seccion], m.concepto, Number(m.columna), Number(m.monto || 0))
  }

  // 3) Armar secciones con totales.
  const secciones = SECCIONES.map(s => {
    const lineas = [...acc[s.key].values()]
    const total = lineas.reduce((a, l) => a + l.total, 0)
    const col1 = lineas.reduce((a, l) => a + l.col1, 0)
    const col2 = lineas.reduce((a, l) => a + l.col2, 0)
    return { ...s, lineas, total, col1, col2 }
  })

  const byKey = Object.fromEntries(secciones.map(s => [s.key, s]))
  const ventasTotal = Number(ventas?.total || 0)
  const cmv = byKey.cmv?.total || 0
  const resultadoBruto = ventasTotal + cmv // cmv es negativo
  const gastosOperativos = secciones
    .filter(s => s.op && s.key !== 'cmv')
    .reduce((a, s) => a + s.total, 0)
  const resultadoEconomico = resultadoBruto + gastosOperativos
  const belowLine = secciones.filter(s => s.belowLine).reduce((a, s) => a + s.total, 0)
  const resultadoMes = resultadoEconomico + belowLine
  const labor = byKey.labor?.total || 0
  const foodCostPct = ventasTotal ? Math.abs(cmv) / ventasTotal * 100 : 0
  const primeCostPct = ventasTotal ? Math.abs(cmv + labor) / ventasTotal * 100 : 0

  return {
    secciones,
    totales: {
      ventas: ventasTotal, cmv, resultadoBruto, gastosOperativos,
      resultadoEconomico, resultadoMes, foodCostPct, primeCostPct,
    },
    sinAsignar: { ...sinAsignar, tipos: [...sinAsignar.tipos] },
  }
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `node --test frontend/src/lib/reporteMensual.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/reporteMensual.js frontend/src/lib/reporteMensual.test.js
git commit -m "feat(frontend): motor del reporte mensual (split por tipo + merge manual) con tests"
```

---

### Task 5: Métodos del cliente API

**Files:**
- Modify: `frontend/src/lib/api.js`

**Interfaces:**
- Consumes: el objeto/cliente `api` existente (ver cómo define `getPyl`).
- Produces: `api.getReporteMensual({mes,grupo,local})`, `api.getReporteManual({grupo,local,mes})`, `api.getReporteManualAnterior({grupo,local,mes})`, `api.putReporteManual({grupo,local,mes,filas})`.

- [ ] **Step 1: Agregar los métodos siguiendo el patrón de `getPyl`**

Localizar `getPyl` en `api.js` y replicar su forma (mismo helper de fetch/query params/headers). Agregar:

```js
getReporteMensual: ({ mes, grupo, local }) =>
  get('/api/data/reporte-mensual', { mes, grupo, local }),
getReporteManual: ({ grupo, local, mes }) =>
  get('/api/reporte-manual', { grupo, local, mes }),
getReporteManualAnterior: ({ grupo, local, mes }) =>
  get('/api/reporte-manual/anterior', { grupo, local, mes }),
putReporteManual: ({ grupo, local, mes, filas }) =>
  put('/api/reporte-manual', { grupo, local, mes, filas }),
```

> Usar los helpers reales del archivo (`get`/`put` o `client.get`/etc.). Si no existe helper `put`, seguir cómo se hace el POST/PUT de `updateUserAccess`.

- [ ] **Step 2: Verificar que el frontend compila**

Run: `cd frontend && npm run build`
Expected: build OK, sin errores de import/undefined.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat(frontend): metodos api para reporte mensual y capa manual"
```

---

### Task 6: Página del reporte (KPIs + tabla 3 columnas)

**Files:**
- Create: `frontend/src/pages/ReporteMensualPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

**Interfaces:**
- Consumes: `api.getReporteMensual`, `api.getReporteManual`, `buildReporte`, `GroupContext` (grupo activo), formato `lib/format.js`.
- Produces: ruta `/reporte-mensual` navegable desde el sidebar.

- [ ] **Step 1: Crear `ReporteMensualPage.jsx`**

Usar `PyLPage.jsx` como referencia de estructura (filtros mes+local, KPI cards, carga de opciones de local, tabla, botón imprimir). Diferencias: llamar a `getReporteMensual` + `getReporteManual`, pasar ambos a `buildReporte`, y renderizar 3 columnas (Total / Col 1 / Col 2). Contenido:

```jsx
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useGroup } from '../context/GroupContext.jsx' // verificar nombre real del hook
import { buildReporte } from '../lib/reporteMensual.js'
import { fmtMoney, fmtPct } from '../lib/format.js'      // verificar exports reales

function mesAnteriorInput() {
  const d = new Date()
  d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function ReporteMensualPage() {
  const { grupo } = useGroup()                 // ajustar al context real
  const [mes, setMes] = useState(mesAnteriorInput())
  const [local, setLocal] = useState('')
  const [localOpts, setLocalOpts] = useState([])
  const [auto, setAuto] = useState(null)
  const [manuales, setManuales] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDatasetOptions?.('pagos', { grupo })
      .then(o => setLocalOpts(o?.local || o?.locales || []))
      .catch(() => {})
  }, [grupo])

  useEffect(() => {
    if (!grupo) return
    setLoading(true)
    Promise.all([
      api.getReporteMensual({ mes, grupo, local: local || undefined }),
      local ? api.getReporteManual({ grupo, local, mes }) : Promise.resolve([]),
    ])
      .then(([a, m]) => { setAuto(a); setManuales(m || []) })
      .finally(() => setLoading(false))
  }, [grupo, mes, local])

  const rep = auto ? buildReporte({ ventas: auto.ventas, gastos: auto.gastos, manuales }) : null

  return (
    <div className="page reporte-mensual">
      <div className="page-head">
        <h1>Reporte de Ventas Mensuales</h1>
        <div className="filters">
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <select value={local} onChange={e => setLocal(e.target.value)}>
            <option value="">Consolidado (grupo)</option>
            {localOpts.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={() => window.print()}>Exportar / Imprimir PDF</button>
        </div>
      </div>

      {loading && <p>Cargando…</p>}
      {rep && (
        <>
          <div className="kpi-row">
            <KpiCard label="Ventas" value={fmtMoney(rep.totales.ventas)} />
            <KpiCard label="Resultado bruto" value={fmtMoney(rep.totales.resultadoBruto)} />
            <KpiCard label="Resultado económico" value={fmtMoney(rep.totales.resultadoEconomico)} />
            <KpiCard label="Resultado del mes" value={fmtMoney(rep.totales.resultadoMes)} />
            <KpiCard label="Food cost" value={fmtPct(rep.totales.foodCostPct)} />
            <KpiCard label="Prime cost" value={fmtPct(rep.totales.primeCostPct)} />
          </div>

          {rep.sinAsignar.tipos.length > 0 && (
            <div className="warn">
              ⚠️ Hay {fmtMoney(rep.sinAsignar.total)} en tipos sin asignar a columna:
              {' '}{rep.sinAsignar.tipos.join(', ')}. Asignalos en <code>MAPEO_TIPOS</code>.
            </div>
          )}

          <table className="pyl-table">
            <thead>
              <tr><th>Concepto</th><th>Total</th><th>Col 1 · Bancarizado</th><th>Col 2 · Efectivo</th></tr>
            </thead>
            <tbody>
              <tr className="row-total"><td>INGRESOS · Ventas</td><td>{fmtMoney(rep.totales.ventas)}</td><td>—</td><td>—</td></tr>
              {rep.secciones.map(s => (
                <SeccionRows key={s.key} s={s} />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value }) {
  return <div className="kpi-card"><span className="kpi-label">{label}</span><span className="kpi-value">{value}</span></div>
}

function SeccionRows({ s }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr className="row-section" onClick={() => setOpen(o => !o)}>
        <td>{open ? '▾' : '▸'} {s.titulo}</td>
        <td>{fmtMoney(s.total)}</td>
        <td>{fmtMoney(s.col1)}</td>
        <td>{fmtMoney(s.col2)}</td>
      </tr>
      {open && s.lineas.map((l, i) => (
        <tr className="row-line" key={i}>
          <td className="indent">{l.concepto}</td>
          <td>{fmtMoney(l.total)}</td>
          <td>{fmtMoney(l.col1)}</td>
          <td>{fmtMoney(l.col2)}</td>
        </tr>
      ))}
    </>
  )
}
```

> Verificar los nombres reales de: hook de grupo (`useGroup`/`GroupContext`), helpers de formato en `lib/format.js`, y componente `KpiCard` (si ya existe uno en `components/`, usar ese en vez de redefinirlo).

- [ ] **Step 2: Agregar la ruta en `App.jsx`**

Junto a la ruta `pyl` existente:
```jsx
<Route path="reporte-mensual" element={<ReporteMensualPage />} />
```
Y el import correspondiente arriba.

- [ ] **Step 3: Agregar el item en `Sidebar.jsx`**

En la sección "Tableros", junto a "P&L", agregar un link a `/reporte-mensual` con label "Reporte Mensual" (seguir el patrón exacto de los links existentes, incluido su ícono si aplica).

- [ ] **Step 4: Verificar build + navegación**

Run: `cd frontend && npm run build`
Expected: build OK.
Luego levantar `npm run dev`, entrar a la app, seleccionar grupo, ir a "Reporte Mensual", elegir mes 2026-03 y local 3MONOS. Verificar que aparecen KPIs, la tabla con secciones colapsables y las 3 columnas con montos.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ReporteMensualPage.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(frontend): pagina Reporte Mensual con tabla P&L de 3 columnas"
```

---

### Task 7: Panel de carga manual con precarga

**Files:**
- Modify: `frontend/src/pages/ReporteMensualPage.jsx`

**Interfaces:**
- Consumes: `api.getReporteManualAnterior`, `api.putReporteManual`.
- Produces: edición de las filas manuales + guardado + "traer del mes anterior".

- [ ] **Step 1: Agregar estado y acciones de edición manual**

Dentro de `ReporteMensualPage`, agregar un panel (solo visible cuando hay `local` seleccionado, porque los manuales son por local). Permite: listar las filas manuales actuales agrupadas por sección, editar monto/columna, agregar/quitar filas, "traer del mes anterior" y "guardar".

Las secciones editables incluyen `alquiler` porque es **mixta** (servicios automáticos de pagos + alquileres USD cargados a mano); el motor ya soporta líneas manuales dentro de una sección con datos automáticos (paso 2 de `buildReporte`). La sección `otros_ingresos` (acuerdos que suman a ingresos) queda pendiente — ver Notas de cierre.

```jsx
// dentro del componente:
const SECCIONES_MANUALES = ['alquiler', 'impositivos', 'pasivo', 'socios']
const [dirty, setDirty] = useState(false)

function editFila(i, patch) {
  setManuales(ms => ms.map((m, idx) => idx === i ? { ...m, ...patch } : m)); setDirty(true)
}
function addFila(seccion) {
  setManuales(ms => [...ms, { seccion, concepto: '', monto: 0, columna: 1 }]); setDirty(true)
}
function removeFila(i) { setManuales(ms => ms.filter((_, idx) => idx !== i)); setDirty(true) }

async function traerMesAnterior() {
  const prev = await api.getReporteManualAnterior({ grupo, local, mes })
  setManuales(prev || []); setDirty(true)
}
async function guardar() {
  await api.putReporteManual({ grupo, local, mes, filas: manuales })
  setDirty(false)
}
```

Y el JSX del panel (después de la tabla), solo si `local`:

```jsx
{local && (
  <div className="manual-panel no-print">
    <div className="manual-head">
      <h2>Carga manual — {local} · {mes}</h2>
      <div>
        <button onClick={traerMesAnterior}>Traer del mes anterior</button>
        <button disabled={!dirty} onClick={guardar}>Guardar</button>
      </div>
    </div>
    {SECCIONES_MANUALES.map(sec => (
      <fieldset key={sec}>
        <legend>{sec}</legend>
        {manuales.map((m, i) => m.seccion === sec && (
          <div className="manual-row" key={i}>
            <input value={m.concepto} placeholder="concepto"
                   onChange={e => editFila(i, { concepto: e.target.value })} />
            <input type="number" value={m.monto}
                   onChange={e => editFila(i, { monto: Number(e.target.value) })} />
            <select value={m.columna} onChange={e => editFila(i, { columna: Number(e.target.value) })}>
              <option value={1}>Col 1 · Bancarizado</option>
              <option value={2}>Col 2 · Efectivo</option>
            </select>
            <button onClick={() => removeFila(i)}>✕</button>
          </div>
        ))}
        <button onClick={() => addFila(sec)}>+ agregar</button>
      </fieldset>
    ))}
  </div>
)}
```

- [ ] **Step 2: Verificar el ciclo completo (build + manual)**

Run: `cd frontend && npm run build`
Expected: build OK.
Luego en la app (mes 2026-03, local 3MONOS): agregar una fila en "impositivos" (ej. IVA, monto, col 1), Guardar, recargar la página y verificar que la fila persiste y que el monto se sumó en la sección Impositivos de la tabla. Probar "Traer del mes anterior" en un mes vacío y ver que trae las filas del mes previo.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ReporteMensualPage.jsx
git commit -m "feat(frontend): carga manual del reporte mensual con precarga del mes anterior"
```

---

### Task 8: Estilos y modo impresión

**Files:**
- Modify: `frontend/src/pages/ReporteMensualPage.jsx` (o el CSS que corresponda según el patrón del repo)

**Interfaces:**
- Produces: estilos de la tabla/KPIs y ocultar el panel manual al imprimir (`.no-print`).

- [ ] **Step 1: Agregar estilos**

Seguir cómo estiliza `PyLPage` (CSS module, global.css, o inline según el repo). Asegurar: tabla legible con columnas alineadas a la derecha para montos, filas de sección resaltadas, y regla de impresión:

```css
@media print {
  .no-print { display: none !important; }
  .page-head .filters { display: none; }
}
```

- [ ] **Step 2: Verificar impresión**

Run: `cd frontend && npm run build` → OK.
En la app, con un reporte cargado, usar "Exportar / Imprimir PDF" y verificar en la vista previa de impresión que se ve la tabla completa (Total/Col1/Col2) y que el panel de carga manual y los filtros NO aparecen.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ReporteMensualPage.jsx
git commit -m "style(frontend): estilos y modo impresion del reporte mensual"
```

---

## Notas de cierre

- **Completar `MAPEO_TIPOS`** con los tipos faltantes (M, NDA, ND, CM, DDJJ, FF, LF, X) que el usuario confirme. El aviso de "sin asignar" en la UI marca cuáles aparecen en datos reales.
- **Otros ingresos manuales (acuerdos):** el PDF de referencia tiene "Otros Ingresos - Acuerdos" que suma a INGRESOS. El motor actual solo toma ventas automáticas (`ventas.total`). Pendiente de decidir con el usuario: agregar una sección manual `otros_ingresos` que sume al total de ingresos (impacta `resultadoBruto` y todos los KPIs). No implementado en este plan por requerir su confirmación.
- **Sección `alquiler` mixta:** confirmar con el usuario que los alquileres USD NO se cargan además como pago en la app (si se cargaran, habría doble conteo, porque `alquiler` no está en `RUBROS_EXCLUIDOS_AUTO`).
- Fase 2 (fuera de este plan): upload de Excel/CSV (ej. reporte AFIP) que complete líneas manuales.
- El cambio pendiente en `infra/04_backend.sh` (GOOGLE_CLIENT_ID + INTERNAL_SHARED_SECRET) es independiente de este plan.
