# Reporte de Ventas mensual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página nueva en Analytics que arma el Reporte de Ventas mensual de un cliente con los datos
de las cajas, muestra la fuente de cada número, permite corregirlo antes de descargar y baja un PDF
16:9 para entregar.

**Architecture:** Igual que el Informe Mensual: el backend junta lo automático de BigQuery
(`vw_cajas`, `vw_caja_detalles`) y lo guardado en la base propia (Postgres `dcsmart_analytics`), y
un motor puro en el frontend (`lib/reporteVentas.js`) arma los números. Lo que se corrige a mano se
guarda dato por dato, con historial. Al cerrar un mes se guarda una foto (snapshot) y los meses
cerrados alimentan el histórico. Un script carga los decks ya entregados como meses cerrados.

**Tech Stack:** Fastify 5 + `pg` + `@google-cloud/bigquery` (backend), React 18 + Vite + chart.js
(frontend), `node:test` para los tests, `jszip` (solo en el script de importación).

**Spec:** `docs/superpowers/specs/2026-10-20-reporte-ventas-mensual-design.md`

## Global Constraints

- Nunca inventar un dato. Si falta, es `null` con fuente `'falta'`; nunca `0` ni una estimación.
- Ningún texto interpretativo generado en las páginas.
- El total del local es el de las cajas y **no se mueve**: un canal agregado o corregido lo absorbe
  "Local" (= venta − suma de los otros canales). Total, Local, % de incidencia, variaciones y
  promedios son calculados y no se editan.
- "Local" negativo bloquea el cierre del mes.
- Fuentes posibles de un dato: `'auto'` (cajas), `'calc'`, `'mano'`, `'falta'`, `'cerrado'`
  (de un mes cerrado: deck o reporte).
- Editar, cerrar, configurar clientes y reglas: solo roles `super_admin` o `dcsmart`
  (`req.user.roles`). `req.user.admin` **no** alcanza, porque incluye externos con `is_admin`.
- Reabrir un mes: los mismos roles internos.
- Solo se cierran meses terminados (mes < mes actual).
- PDF: `window.print()` con CSS de impresión, una página 16:9 por hoja (patrón de
  `styles/informe.css:236-243`). Borrador con marca de agua "BORRADOR"; final sin marca.
- Estética DCSMART: azul noche `#0f1b2d`, dorado `#c9a24a`, Montserrat (ya viene con la app).
- Turnos, USD como columna y acceso del cliente quedan **fuera** de este plan.
- Lista de apps por defecto, copiada de gestión:
  `/^(rappi|pedidos\s*ya|peya|mp\s*delivery|uber\s*eats)(\s+efectivo)?$/i`.
- Todo cambio de esquema se aplica primero en `dcsmart_analytics_dev`. Nada de push ni deploy sin
  OK del usuario.

## Review Focus

- **Un local del cliente sin cajas en el mes:** la venta se ve "falta" y la hoja muestra "—"; no
  `$ 0`. → test en Task 2.
- **Cubiertos u órdenes en 0 o vacíos:** el promedio es `null`; no `Infinity` ni `NaN`. → Task 2.
- **Números escritos al estilo argentino** (`55.114.440`, `(14.352.110)`, `-4,34%`, `N/A`), en el
  editor y en los decks, se leen bien. → Task 1.
- **Guardar o cerrar un mes ya cerrado:** devuelve 409 con un mensaje en castellano y no pisa nada.
  → Task 4.
- **Columna de un deck que el importador no reconoce** (por ejemplo, turnos de Mafia): aparece en el
  resumen como "sin mapear"; no se descarta en silencio. → Task 5.

---

## File structure

| Archivo | Responsabilidad |
|---|---|
| `infra/00e_reporte_ventas.sql` | Tablas `rv_cliente`, `rv_regla_canal`, `rv_valor`, `rv_valor_historial`, `rv_cierre` |
| `frontend/src/lib/reporteVentas.js` | Motor puro: lectura de números, canales, armado por local y reporte, snapshot |
| `frontend/src/lib/reporteVentas.test.js` | Tests del motor con números reales de los decks |
| `backend/src/lib/reporteVentas.js` | Validaciones puras: `esInterno`, `okDato`, `mesCerrable` |
| `backend/src/lib/reporteVentas.test.js` | Tests de esas validaciones |
| `backend/src/routes/reporte_ventas.js` | Rutas `/api/reporte-ventas` (lectura y escritura) |
| `backend/scripts/importar-decks.mjs` | Lee los `.pptx`, muestra el resumen, carga los meses cerrados |
| `backend/scripts/decks.js` | Parser puro de tablas de pptx e interpretación de encabezados |
| `backend/scripts/decks.test.js` | Tests del parser |
| `backend/scripts/decks-mapa.json` | Qué deck es qué cliente y qué slide es qué local |
| `frontend/src/pages/ReporteVentasPage.jsx` | Editor A: miniaturas, hoja, panel de datos, barra |
| `frontend/src/components/reporteVentas/Paginas.jsx` | Las hojas: Portada, Consolidado, Mes, Histórico, Delivery, Contraportada |
| `frontend/src/components/reporteVentas/PanelDatos.jsx` | Tabla "Datos de esta hoja" con fuente y edición |
| `frontend/src/components/reporteVentas/ConfigCliente.jsx` | Alta y edición de cliente (locales) y reglas de canal |
| `frontend/src/styles/reporte-ventas.css` | Estilos de las hojas y de impresión |

Modificados: `backend/src/server.js` (registrar la ruta), `backend/package.json` (`jszip` en
devDependencies), `frontend/src/App.jsx` (ruta `reporte-ventas`) y
`frontend/src/components/Sidebar.jsx` (ítem "Reporte de Ventas").

---

### Task 1: Esquema y lectura de números

**Files:**
- Create: `infra/00e_reporte_ventas.sql`
- Create: `frontend/src/lib/reporteVentas.js` (solo `parseNumeroAR` y `fmtAR` en esta tarea)
- Test: `frontend/src/lib/reporteVentas.test.js`

**Interfaces:**
- Produces: tablas (abajo); `parseNumeroAR(s: string|number|null): number|null`;
  `fmtAR(n: number|null, decimales = 0): string` (`null` → `'—'`, negativos entre paréntesis como en
  los decks: `(14.352.110)`).

Esquema (estilo de `infra/00d_informe_mensual.sql`, con GRANT a `analytics_app` al final):

```sql
CREATE TABLE IF NOT EXISTS rv_cliente (
  id serial PRIMARY KEY, grupo text NOT NULL, nombre text NOT NULL,
  locales text[] NOT NULL, creado_por text, creado_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo, nombre));
CREATE TABLE IF NOT EXISTS rv_regla_canal (          -- qué es cada canal, por local
  cliente_id int NOT NULL REFERENCES rv_cliente(id), local text NOT NULL,
  match text NOT NULL CHECK (match IN ('metodo','origen')), valor text NOT NULL,
  canal text NOT NULL, delivery boolean NOT NULL DEFAULT false,
  actualizado_por text, actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, local, match, valor));
CREATE TABLE IF NOT EXISTS rv_valor (                -- dato corregido o cargado a mano
  cliente_id int NOT NULL REFERENCES rv_cliente(id), local text NOT NULL, mes char(7) NOT NULL,
  dato text NOT NULL, valor numeric(16,2) NOT NULL, original numeric(16,2),
  actualizado_por text NOT NULL, actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, local, mes, dato));
CREATE TABLE IF NOT EXISTS rv_valor_historial (
  id bigserial PRIMARY KEY, cliente_id int NOT NULL, local text NOT NULL, mes char(7) NOT NULL,
  dato text NOT NULL, antes numeric(16,2), despues numeric(16,2),
  por text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rv_cierre (
  cliente_id int NOT NULL REFERENCES rv_cliente(id), mes char(7) NOT NULL,
  origen text NOT NULL CHECK (origen IN ('reporte','deck')), snapshot jsonb NOT NULL,
  cerrado boolean NOT NULL DEFAULT true, cerrado_por text, cerrado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, mes));
```

- [ ] **Step 1: Escribir el test que falla**

```js
test('parseNumeroAR lee los formatos de los decks', () => {
  assert.equal(parseNumeroAR('55.114.440'), 55114440)
  assert.equal(parseNumeroAR('(14.352.110)'), -14352110)
  assert.equal(parseNumeroAR('-4,34%'), -4.34)
  assert.equal(parseNumeroAR('81,26%'), 81.26)
  assert.equal(parseNumeroAR('2.026'), 2026)
  assert.equal(parseNumeroAR('N/A'), null)
  assert.equal(parseNumeroAR(''), null)
  assert.equal(parseNumeroAR(' 1.490 '), 1490)
  assert.equal(parseNumeroAR(316106840), 316106840)
})
test('fmtAR', () => {
  assert.equal(fmtAR(316106840), '316.106.840')
  assert.equal(fmtAR(-14352110), '(14.352.110)')
  assert.equal(fmtAR(-4.34, 2), '-4,34')
  assert.equal(fmtAR(null), '—')
})
```

- [ ] **Step 2:** Correr `node --test frontend/src/lib/reporteVentas.test.js`. Esperado: FAIL
  (módulo inexistente).
- [ ] **Step 3:** Implementar las dos funciones y escribir `infra/00e_reporte_ventas.sql`. En
  `fmtAR`, los porcentajes con decimales usan el signo `-` y los importes enteros, paréntesis.
- [ ] **Step 4:** Correr el test. Esperado: PASS.
- [ ] **Step 5:** Aplicar el SQL en `dcsmart_analytics_dev` (proxy local; ver memoria
  `puertos-postgres-locales`). Verificar con `\dt rv_*`: 5 tablas.
- [ ] **Step 6: Commit** — `feat(reporte-ventas): esquema y lectura de números AR`

---

### Task 2: Motor del reporte

**Files:**
- Modify: `frontend/src/lib/reporteVentas.js`
- Test: `frontend/src/lib/reporteVentas.test.js`

**Interfaces:**
- Consumes: `parseNumeroAR`, `fmtAR` (Task 1).
- Produces (los usan las Tasks 3, 6, 7 y 8):

```js
export const ES_APP_RE = /^(rappi|pedidos\s*ya|peya|mp\s*delivery|uber\s*eats)(\s+efectivo)?$/i
// Claves de dato: 'venta' | 'cubiertos' | 'ordenes' | `canal:${nombre}` | `tickets:${app}`
export function canalesAuto({ detalles, cajasOrigen, reglas }) // → [{ nombre, valor, delivery }]
//   detalles: [{ metodo, monto }] (solo tipo 'cobro'); cajasOrigen: [{ origin, total }]
//   reglas: [{ match:'metodo'|'origen', valor, canal, delivery }]
//   Sin regla: un metodo que matchea ES_APP_RE es canal app (delivery=true), con nombre
//   normalizado (PedidosYa/Pedido Ya/peya → 'Pedidos Ya'; 'Rappi'; 'MP Delivery'; 'Uber Eats').
//   Con regla: manda la regla (metodo, sin distinguir mayúsculas; o el origin de la caja).
export function armarLocal({ local, mes, auto, valores, cierres })
//   auto: { meses: { 'YYYY-MM': { venta, cubiertos, ordenes } }, canales: { 'YYYY-MM': [{nombre, valor, delivery}] } }
//   valores: [{ local, mes, dato, valor, original, actualizado_por, actualizado_at }]
//   cierres: [{ mes, origen, snapshot }]   (snapshot.locales[local] = { venta, cubiertos, ordenes, canales:{}, tickets:{} })
//   → LocalMes = {
//       local, venta: Dato, cubiertos: Dato, ordenes: Dato, promCubierto: number|null, promOrden: number|null,
//       canales: [{ nombre, ...Dato, inc: number|null, delivery }],   // 'Local' último, fuente 'calc'
//       historico: [{ mes, venta: Dato, anterior: number|null, varPesos, varPct, varAnual, cubiertos: Dato, ordenes: Dato, promCubierto, promOrden }],
//       delivery: [{ mes, apps: { [nombre]: { venta, tickets, prom } }, total, varPct }],
//       alertas: string[] }
//   Dato = { valor: number|null, fuente: 'auto'|'calc'|'mano'|'falta'|'cerrado', original?: number, por?: string, at?: string }
export function armarReporte({ cliente, mes, porLocal, cierres }) // porLocal: { [local]: LocalMes }
//   → { cliente, mes, locales: LocalMes[], consolidado: { filas:[{local, valor, inc}], total, historico:[{mes, porLocal:{}, total, anterior, varPct, varAnual}] } | null,
//       paginas: [{ id, tipo:'portada'|'consolidado'|'mes'|'historico'|'delivery'|'contraportada', local? }],
//       puedeCerrar: boolean, motivos: string[] }
export function snapshotDe(reporte) // → { locales: { [local]: { venta, cubiertos, ordenes, canales:{nombre:valor}, tickets:{app:n} } } }
```

Reglas del armado:
- Un mes cerrado manda sobre auto y mano (fuente `'cerrado'`).
- Si no está cerrado: manda `mano` si existe (guarda `original` = auto); si no, `auto`; si no, `falta`.
- `historico` va de enero a `mes` del año de `mes`. `anterior` sale del mismo mes del año previo
  (cerrado, o auto).
- Variaciones redondeadas a 2 decimales. Si falta el divisor, `null`.
- `consolidado` existe solo si hay más de un local.
- Páginas: portada; consolidado (si más de un local); y por local: `mes`, `historico` y `delivery`
  (este último solo si hay canales delivery con valor en el año); contraportada.
- `puedeCerrar` es false si algún local tiene "Local" < 0 (motivo: `"<local>: Local queda negativo"`)
  o si el mes no terminó.

- [ ] **Step 1: Escribir los tests que fallan** (números reales, Grupo Perros sep-26 y Danzon):

```js
const pizzaAuto = { meses: { '2026-08': { venta: 330458950 }, '2026-09': { venta: 316106840 }, '2025-09': { venta: 242799580 } },
  canales: { '2026-09': canalesAuto({ detalles: [{ metodo: 'Rappi', monto: 55114440 }, { metodo: 'PedidosYa', monto: 39544560 }, { metodo: 'MP QR', monto: 77167295 }], cajasOrigen: [], reglas: [] }) } }

test('Togni\'s Pizza sep-26 reproduce el deck al peso', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: pizzaAuto, valores: [], cierres: [] })
  const c = Object.fromEntries(l.canales.map((x) => [x.nombre, x]))
  assert.equal(c['Local'].valor, 221447840); assert.equal(c['Local'].fuente, 'calc')
  assert.equal(c['Rappi'].valor, 55114440); assert.equal(c['Rappi'].inc, 17.44)
  assert.equal(c['Pedidos Ya'].valor, 39544560); assert.equal(c['Pedidos Ya'].inc, 12.51)
  assert.equal(c['Local'].inc, 70.05)
  const sep = l.historico.find((h) => h.mes === '2026-09')
  assert.equal(sep.varPesos, -14352110); assert.equal(sep.varPct, -4.34); assert.equal(sep.varAnual, 30.19)
})
test('Togni\'s Café: las cajas manuales van al canal de la regla', () => {
  const canales = canalesAuto({ detalles: [{ metodo: 'Rappi', monto: 6946500 }], cajasOrigen: [{ origin: 'DCSMART', total: 1504016 }],
    reglas: [{ match: 'origen', valor: 'DCSMART', canal: 'Cheaf', delivery: true }] })
  const l = armarLocal({ local: 'TOGNIS-CAFE', mes: '2026-09', auto: { meses: { '2026-09': { venta: 80003001 } }, canales: { '2026-09': canales } }, valores: [], cierres: [] })
  assert.equal(l.canales.find((x) => x.nombre === 'Local').valor, 71552485)
})
test('Danzon: Eventos a mano baja Local, el total no se mueve', () => {
  const l = armarLocal({ local: 'GRAN-DANZON', mes: '2026-09', auto: { meses: { '2026-09': { venta: 144913430 } }, canales: { '2026-09': [] } },
    valores: [{ local: 'GRAN-DANZON', mes: '2026-09', dato: 'canal:Eventos', valor: 22358161 }, { local: 'GRAN-DANZON', mes: '2026-09', dato: 'canal:Rappi/PY', valor: 232608 }], cierres: [] })
  assert.equal(l.venta.valor, 144913430)
  assert.equal(l.canales.find((x) => x.nombre === 'Local').valor, 122322661)
  assert.equal(l.canales.find((x) => x.nombre === 'Eventos').fuente, 'mano')
})
test('Evelia: cubiertos corregidos guardan el original', () => {
  const l = armarLocal({ local: 'EVELIA', mes: '2026-09', auto: { meses: { '2026-09': { venta: 396160370, cubiertos: 6274 } }, canales: {} },
    valores: [{ local: 'EVELIA', mes: '2026-09', dato: 'cubiertos', valor: 6125, original: 6274, actualizado_por: 'x@dcsmart.app' }], cierres: [] })
  assert.deepEqual([l.cubiertos.valor, l.cubiertos.fuente, l.cubiertos.original], [6125, 'mano', 6274])
  assert.equal(Math.round(l.promCubierto), 64679)
})
test('un mes cerrado manda sobre lo automático', () => {
  const l = armarLocal({ local: 'TOGNIS-PIZZA', mes: '2026-09', auto: { meses: { '2026-08': { venta: 1 }, '2026-09': { venta: 316106840 } }, canales: {} },
    valores: [], cierres: [{ mes: '2026-08', origen: 'deck', snapshot: { locales: { 'TOGNIS-PIZZA': { venta: 330458950 } } } }] })
  const ago = l.historico.find((h) => h.mes === '2026-08')
  assert.deepEqual([ago.venta.valor, ago.venta.fuente], [330458950, 'cerrado'])
})
test('sin cajas es falta, no cero; sin cubiertos no hay promedio', () => {
  const l = armarLocal({ local: 'X', mes: '2026-09', auto: { meses: {}, canales: {} }, valores: [], cierres: [] })
  assert.deepEqual([l.venta.valor, l.venta.fuente], [null, 'falta'])
  assert.equal(l.promCubierto, null)
  const l2 = armarLocal({ local: 'X', mes: '2026-09', auto: { meses: { '2026-09': { venta: 100, cubiertos: 0 } }, canales: {} }, valores: [], cierres: [] })
  assert.equal(l2.promCubierto, null)
})
test('Local negativo bloquea el cierre', () => {
  const l = armarLocal({ local: 'X', mes: '2026-09', auto: { meses: { '2026-09': { venta: 100 } }, canales: {} },
    valores: [{ local: 'X', mes: '2026-09', dato: 'canal:Eventos', valor: 150 }], cierres: [] })
  const r = armarReporte({ cliente: { nombre: 'X', locales: ['X'] }, mes: '2026-09', porLocal: { X: l }, cierres: [] })
  assert.equal(r.puedeCerrar, false); assert.match(r.motivos[0], /X: Local queda negativo/)
})
test('consolidado de Grupo Perros sep-26', () => { /* armarReporte con ventas 80003001 / 316106840 / 396160370 →
  total 792270211, inc 10.10 / 39.90 / 50.00; páginas: portada, consolidado, 3×(mes, historico), contraportada
  (más 'delivery' en los locales con apps) */ })
```

- [ ] **Step 2:** Correr el test. Esperado: FAIL.
- [ ] **Step 3:** Implementar `canalesAuto`, `armarLocal`, `armarReporte` y `snapshotDe` en
  `frontend/src/lib/reporteVentas.js`.
- [ ] **Step 4:** Correr el test. Esperado: PASS (los tests de la Task 1 también).
- [ ] **Step 5: Commit** — `feat(reporte-ventas): motor de armado con fuentes`

---

### Task 3: API de lectura

**Files:**
- Create: `backend/src/routes/reporte_ventas.js`
- Create: `backend/src/lib/reporteVentas.js`
- Test: `backend/src/lib/reporteVentas.test.js`
- Modify: `backend/src/server.js` (`app.register(reporteVentasRoutes, { prefix: '/api/reporte-ventas' })`)

**Interfaces:**
- Produces:
  - `esInterno(user): boolean`: `user.roles` incluye `super_admin` o `dcsmart`.
  - `okDato(d: string): boolean`: acepta `venta`, `cubiertos`, `ordenes`, `canal:<1-40 chars>` y
    `tickets:<1-40 chars>`, y rechaza `canal:Local` (es calculado).
  - `mesCerrable(mes: 'YYYY-MM', hoy: Date): boolean`.
  - `GET /api/reporte-ventas/clientes?grupo=` → `[{ id, grupo, nombre, locales }]`.
  - `GET /api/reporte-ventas/:id?mes=YYYY-MM` →
    `{ cliente, mes, auto: { [local]: { meses: {mes:{venta,cubiertos,ordenes}}, detalles: {mes:[{metodo,monto}]}, cajasOrigen: {mes:[{origin,total}]} } }, valores, cierres, reglas, historial }`.
    Trae de enero del año anterior a `mes`. `historial` es el de ese mes, los últimos 200 cambios.
    `ordenes` = `SUM(tickets)`, `cubiertos` = `SUM(comensales)`. Un `SUM` sobre todos `NULL` llega
    como `null`, no como 0 (usar `SUM` sin `COALESCE`). Los detalles son solo `tipo = 'cobro'`.
    Las cajas por origen se agrupan por `origin`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
test('esInterno: el is_admin externo no alcanza', () => {
  assert.equal(esInterno({ roles: ['dcsmart'] }), true)
  assert.equal(esInterno({ roles: ['super_admin'] }), true)
  assert.equal(esInterno({ roles: ['externo'], admin: true }), false)
})
test('okDato', () => {
  for (const d of ['venta', 'cubiertos', 'ordenes', 'canal:Eventos', 'tickets:Rappi']) assert.equal(okDato(d), true)
  for (const d of ['canal:Local', 'canal:', 'otra', 'canal:' + 'x'.repeat(41)]) assert.equal(okDato(d), false)
})
test('mesCerrable: solo meses terminados', () => {
  assert.equal(mesCerrable('2026-09', new Date('2026-10-20')), true)
  assert.equal(mesCerrable('2026-10', new Date('2026-10-20')), false)
})
```

- [ ] **Step 2:** Correr `cd backend && node --test src/lib/reporteVentas.test.js`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `lib/reporteVentas.js` y las dos rutas GET, con el estilo de
  `routes/informe.js` (`plainRows`, `txt` y consultas BigQuery con parámetros; locales con
  `local IN UNNEST(@locales)`).
- [ ] **Step 4:** Correr el test. Esperado: PASS.
- [ ] **Step 5:** Smoke contra dev: crear a mano en `dcsmart_analytics_dev` el cliente Grupo Perros
  (`TOGNIS-CAFE`, `TOGNIS-PIZZA`, `EVELIA`) y pedir `GET /api/reporte-ventas/<id>?mes=2026-09` con un
  token firmado (memoria `verificar-api-sin-navegador`). Esperado: `auto['EVELIA'].meses['2026-09'].venta = 396160370`,
  `auto['TOGNIS-PIZZA'].meses['2026-09'].venta = 316106840`, y entre los detalles de Pizza,
  `Rappi = 55114440`.
- [ ] **Step 6: Commit** — `feat(reporte-ventas): API de lectura`

---

### Task 4: API de escritura (valores, cierre, clientes, reglas)

**Files:**
- Modify: `backend/src/routes/reporte_ventas.js`

**Interfaces:**
- Consumes: `esInterno`, `okDato`, `mesCerrable` (Task 3).
- Produces (todas exigen `esInterno`; si no, 403 "Solo el equipo DC puede editar el reporte."):
  - `PUT /:id/valor { local, mes, dato, valor: number|null, original: number|null }`. `valor: null`
    borra la corrección (restaurar). Upsert en `rv_valor` más una fila en `rv_valor_historial`, en
    la misma transacción. Si el mes está cerrado: 409 "El mes está cerrado. Reabrilo para hacer
    cambios." Si `local` no es del cliente: 400.
  - `POST /:id/restaurar { mes }`: borra todas las correcciones del mes, con historial.
  - `POST /:id/cerrar { mes, snapshot }`: si `!mesCerrable`, 400 "Solo se cierran meses
    terminados." Si ya estaba cerrado, 409. Inserta `origen = 'reporte'`.
  - `POST /:id/reabrir { mes }`: pone `cerrado = false` (el snapshot queda como referencia).
  - `POST /clientes { grupo, nombre, locales[] }` y `PUT /clientes/:id { nombre, locales[] }`.
  - `PUT /:id/regla { local, match, valor, canal, delivery }` y `DELETE /:id/regla { local, match, valor }`.
- Un mes con `cerrado = false` en `rv_cierre` cuenta como abierto: el motor lo ignora. Filtrar en el
  GET de la Task 3 con `WHERE cerrado`.

- [ ] **Step 1:** Implementar las rutas.
- [ ] **Step 2: Smoke contra dev, en este orden y con estos resultados:**
  1. `PUT valor` de Evelia `cubiertos` = 6125, `original` 6274 → 200.
  2. `GET` → `valores` contiene la corrección e `historial` tiene 1 fila.
  3. `POST cerrar` de `2026-10` → 400.
  4. `POST cerrar` de `2026-09` → 200.
  5. `PUT valor` de nuevo → 409.
  6. Lo mismo con un token de rol externo con `is_admin` → 403.
  7. `POST reabrir` → 200.
  8. Limpiar las filas de prueba.
- [ ] **Step 3: Commit** — `feat(reporte-ventas): guardar correcciones, cerrar y configurar`

---

### Task 5: Importador de decks

**Files:**
- Create: `backend/scripts/decks.js`, `backend/scripts/decks.test.js`, `backend/scripts/importar-decks.mjs`, `backend/scripts/decks-mapa.json`
- Modify: `backend/package.json` (devDependency `jszip`)

**Interfaces:**
- Consumes: `parseNumeroAR` (importado de `../../frontend/src/lib/reporteVentas.js`), tablas de la
  Task 1.
- Produces:
  - `leerTablas(buffer): Promise<[{ slide: number, titulo: string, filas: string[][] }]>`. Usa jszip;
    las celdas son el texto de `<a:t>` de cada `<a:tc>`, y el título, el texto de la slide fuera de
    la tabla.
  - `interpretarHistorico(filas, { anio }): { meses: { 'YYYY-MM': { venta?, cubiertos?, ordenes? } }, anterior: { 'YYYY-MM': { venta } }, sinMapear: string[], diferencias: string[] }`
  - `interpretarCanales(filas): { canales: { [nombre]: valor }, total: number }`. Saltea `Total` y
    verifica que la suma de las líneas dé el total; si no, va a `diferencias`.
  - `interpretarDelivery(filas, { anio })` → `{ meses: { 'YYYY-MM': { [app]: { venta, tickets } } } }`
- Encabezados (sin distinguir mayúsculas ni acentos):
  - **Período:** `PERIODO`. Acepta `ene`, `ene 26`, `ene-26`, `enero` y `sept 26`/`sept-26`; si no
    trae año, usa `anio`.
  - **Venta:** la columna del año mayor (`2026`/`2.026`). Si hay una sola columna de año, o
    ninguna, `VENTAS`, el nombre del local, `TOTAL DE VENTAS` o la primera columna después de
    PERIODO.
  - **Anterior:** la columna del año menor (`2025`/`2.025`/`CLUB LUCERO 2025`).
  - **Cubiertos:** `PERSONAS` | `CUBIERTOS` | `PAX`.
  - **Órdenes:** `ORDENES` | `ÓRDENES`.
  - **Calculadas, se usan solo para verificar:** promedios, `EVOLUCION…`, `Variable…`. Se recalculan
    y, si difieren en más de 1 peso o 0,01 punto, van a `diferencias`.
  - **Todo lo demás va a `sinMapear`:** turnos, BigBox, Eventos, Delivery por turno, etc.
- `decks-mapa.json`: `[{ archivo, grupo, cliente, locales: [..], mes: 'YYYY-MM', slides: [{ n, local, tipo: 'historico'|'canales'|'delivery' }] }]`.
  Se arma con `node scripts/importar-decks.mjs --listar <carpeta>`, que imprime slide, título y
  encabezado de cada tabla. Quedan afuera La Alacena, ETM y RVR. GRUPO MONOS va en 3 clientes
  (Victor, 3 Monos, UAT), y Danzon en el cliente "Gran Bar Danzon" del grupo `GRUPO BASA` con el
  local `GRAN-DANZON`.
- `importar-decks.mjs <carpeta> [--aplicar] [--pisar]`. Sin `--aplicar` imprime el resumen por
  cliente: meses leídos, valores por local, `sinMapear` y `diferencias`, sin escribir nada. Con
  `--aplicar`, crea el cliente si no existe y escribe `rv_cierre` (`origen = 'deck'`), un registro
  por mes (incluidos los del año anterior que vengan en la columna "anterior"), con los locales
  combinados en el snapshot. No pisa un mes cerrado salvo con `--pisar`. Los canales solo se cargan
  en el mes del deck.

- [ ] **Step 1: Escribir los tests que fallan** con filas reales del inventario:

```js
test('histórico 878: dos años, personas y órdenes', () => {
  const r = interpretarHistorico([
    ['PERIODO','2.025','2.026','PERSONAS','PROM PERSONAS','ORDENES','PROM ORDENES','EVOLUCION PESOS','EVOLUCION PORCENTUAL','VARIABLE VS 2025'],
    ['ene','28.556.999','37.005.243','1.490','24.836','680','54.419','(66.413.090)','-64,22%','29,58%']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-01'], { venta: 37005243, cubiertos: 1490, ordenes: 680 })
  assert.deepEqual(r.anterior['2025-01'], { venta: 28556999 })
})
test('histórico Evelia: venta en la columna del local, "ene 26"', () => {
  const r = interpretarHistorico([['PERIODO','EVELIA','Cubiertos','Promedio','Variable $ VMA','Variable % VMA','Variable VS 2025'],
    ['ene 26','312.054.740','5.912','52.783','18.965.180','6,47%','31,07%']], { anio: 2026 })
  assert.deepEqual(r.meses['2026-01'], { venta: 312054740, cubiertos: 5912 })
})
test('histórico Mafia: los turnos quedan sin mapear', () => {
  const r = interpretarHistorico([['PERIODO','TOTAL DE VENTAS','TURNO DIA','CUBIERTOS TURNO DIA','PROMEDIO CUBIERTOS','TURNO NOCHE','CUBIERTOS TURNO NOCHE','PROMEDIO CUBIERTOS','BIGBOX','EVOLUCION PESOS','EVOLUCION PORCENTUAL'],
    ['ene-26','25.348.700','','','','','619','40.951','','(7.715.085)','-23,33%']], { anio: 2026 })
  assert.equal(r.meses['2026-01'].venta, 25348700)
  assert.ok(r.sinMapear.includes('TURNO DIA') && r.sinMapear.includes('BIGBOX'))
})
test('canales Pizza sep-26 cierran contra el total', () => {
  const r = interpretarCanales([['Canal de Venta','Importe','INC'],['Local','221.447.840','70,05%'],['Rappi','55.114.440','17,44%'],['Pedidos Ya','39.544.560','12,51%'],['Total','316.106.840','100,00%']])
  assert.deepEqual(r.canales, { 'Local': 221447840, 'Rappi': 55114440, 'Pedidos Ya': 39544560 }); assert.equal(r.total, 316106840)
})
test('una diferencia en un promedio se informa', () => { /* fila con PROM PERSONAS 99.999 → diferencias.length === 1 */ })
```

- [ ] **Step 2:** Correr `cd backend && node --test scripts/decks.test.js`. Esperado: FAIL.
- [ ] **Step 3:** Implementar `decks.js` y el script con `--listar`.
- [ ] **Step 4:** Correr el test. Esperado: PASS.
- [ ] **Step 5:** Correr `--listar` sobre `C:/Users/DcSmart/Desktop/Reporte Ventas Finales` y
  completar `decks-mapa.json` con los 19 decks del alcance (los decks de abril, Grupo LF y RVR,
  quedan afuera; LF no tiene tablas de texto).
- [ ] **Step 6:** Correr sin `--aplicar` y revisar el resumen. Esperado: Grupo Perros, mes
  2026-09, ventas 80.003.001 / 316.106.840 / 396.160.370, sin `diferencias` inesperadas. Anotar en
  el commit las diferencias reales que traen los decks.
- [ ] **Step 7: Commit** — `feat(reporte-ventas): importador de decks (sin aplicar)`
- [ ] **Step 8:** `--aplicar` **solo en `dcsmart_analytics_dev`**. La carga en prod es aparte, con
  OK del usuario y después de que revise el resumen.

---

### Task 6: Las hojas del PDF

**Files:**
- Create: `frontend/src/components/reporteVentas/Paginas.jsx`, `frontend/src/styles/reporte-ventas.css`

**Interfaces:**
- Consumes: el resultado de `armarReporte` (Task 2) y `fmtAR`.
- Produces: `<Hoja pagina reporte local borrador />` renderiza una página por `pagina.tipo`.
  `<Mazo reporte borrador />` renderiza todas las páginas (para imprimir). Cada hoja es un
  `div.rv-hoja` de 1456×819 px.

Contenido por hoja, igual que en la maqueta `reporte-v2-completo.html`:
- **Portada:** `LogoDcManagement` (el existente, hasta tener el oficial), cliente, mes en palabras
  ("Septiembre 2026") y lista de locales.
- **Consolidado:** venta total del grupo, tabla Local | Importe | INC con fila Total, barras
  horizontales y, debajo, el histórico consolidado.
- **Mes:** 4 indicadores (venta, variable $ vs mes anterior, variable %, vs año anterior), tabla de
  canales y barras.
- **Histórico:** tabla enero..mes. Las columnas de cubiertos/promedio y órdenes/promedio aparecen
  solo si algún mes del año tiene dato. A la derecha, barras del año actual con una marca fina del
  año anterior.
- **Delivery:** tabla por app (venta, tickets, promedio) y mini-tendencias por app.
- **Contraportada:** "Tu Rentabilidad, Nuestra Gestión".

Para todas:
- Pie de página con `cliente · n / total`.
- Los negativos en rojo y entre paréntesis.
- Un valor `null` se muestra "—".
- Gráficos en SVG propio (sin canvas), para que impriman nítidos.
- Si `borrador`, marca de agua "BORRADOR" en diagonal.

- [ ] **Step 1:** Implementar los componentes y el CSS. `@media print` copia el patrón de
  `styles/informe.css:236-243` con `@page { size: 1456px 819px; margin: 0 }` y la clase
  `body.imprimiendo-rv`.
- [ ] **Step 2:** Revisión visual. Con la API falsa o con dev, mirar Grupo Perros sep-26 y comparar
  cada número de las hojas Mes e Histórico de Togni's Pizza contra el deck. Deben ser iguales.
  Capturas con puppeteer (memoria `capturas-dev-puppeteer`).
- [ ] **Step 3: Commit** — `feat(reporte-ventas): hojas del reporte`

---

### Task 7: Editor A (página, panel de datos, guardado)

**Files:**
- Create: `frontend/src/pages/ReporteVentasPage.jsx`, `frontend/src/components/reporteVentas/PanelDatos.jsx`
- Modify: `frontend/src/App.jsx` (`<Route path="reporte-ventas" element={<ReporteVentasPage />} />`) y
  `frontend/src/components/Sidebar.jsx` (ítem "Reporte de Ventas")

**Interfaces:**
- Consumes: el `GET` (Task 3), `PUT valor` y `POST restaurar` (Task 4), `canalesAuto`, `armarLocal` y
  `armarReporte` (Task 2), `<Hoja>` (Task 6).
- Produces: `ReporteVentasPage`, con el estado `{ clienteId, mes, data, reporte, paginaId }`.

Comportamiento:
- **Barra:** selector de cliente (los del grupo actual, del `GroupContext`), mes con flechas
  (por defecto, el mes anterior), "Restaurar originales", "Descargar borrador" y
  "Cerrar y descargar final".
- **Columna izquierda:** miniaturas, que son `<Hoja>` escaladas con CSS `transform`.
- **Centro:** la hoja elegida.
- **Derecha:** `PanelDatos`, con los datos de esa hoja. Mes: venta, cubiertos, órdenes y cada
  canal. Histórico: venta, cubiertos y órdenes de cada mes abierto. Delivery: `tickets:<app>`.
  Muestra dato, valor y una etiqueta de fuente (AUTOMÁTICO verde, CALCULADO gris, A MANO dorado
  con el original tachado y "por/fecha", FALTA rojo, CERRADO gris con candado).
- **Edición:** solo los datos `auto`, `mano` y `falta` de meses abiertos, y solo si el usuario es
  interno (`user.roles`). La celda es un campo numérico formateado (miles con punto, sin flechitas
  de `type=number`, lee con `parseNumeroAR`). Se guarda al salir del campo o con Enter. Con Escape
  o vaciando el campo se vuelve al original (`valor: null`).
- **"+ Agregar canal"** en la hoja Mes: nombre (texto, hasta 40) e importe → `canal:<nombre>`.
- **Al guardar:** se rearma el reporte con lo que devuelve el servidor y la hoja se actualiza.
- **Errores:** en castellano, sin códigos (memoria `errores-visibles-sin-tecnicismos`).
- Un mes cerrado muestra el banner "Mes cerrado por <por> el <fecha>" y no deja editar.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2: Verificación en dev**, con Grupo Perros sep-26:
  1. Editar los cubiertos de Evelia a 6.125: la hoja muestra $ 64.679 de promedio y el panel tiene
     el 6.274 tachado.
  2. Agregar "Eventos" 1.000 en Pizza: Local baja exactamente 1.000.
  3. "Restaurar originales" vuelve todo.
  4. Un usuario externo ve el panel sin poder editar.
- [ ] **Step 3: Commit** — `feat(reporte-ventas): editor con fuentes y correcciones`

---

### Task 8: Borrador, final y cierre

**Files:**
- Modify: `frontend/src/pages/ReporteVentasPage.jsx`

**Interfaces:**
- Consumes: `<Mazo>` (Task 6), `snapshotDe` y `puedeCerrar`/`motivos` (Task 2), y `POST cerrar` /
  `POST reabrir` (Task 4).

Comportamiento:
- **"Descargar borrador":** `<Mazo borrador />` en un portal, `body.imprimiendo-rv`,
  `window.print()`. Con `document.title` = `Reporte de Ventas - <cliente> - <Mes AAAA> (borrador)`
  como nombre del archivo, restaurado en `afterprint`, igual que `InformePage.jsx:204-211`.
- **"Cerrar y descargar final":** si `!puedeCerrar`, se muestran los `motivos` y no hace nada. Si
  el mes anterior no está cerrado, avisa "El mes anterior no está cerrado" y pide confirmar. Después,
  `POST cerrar` con `snapshotDe(reporte)`, se recarga y se imprime sin marca de agua, con el título
  sin "(borrador)".
- **Mes cerrado:** el botón pasa a "Descargar final". Para internos aparece "Reabrir mes".

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Verificación en dev. El borrador sale con la marca y la cantidad de páginas
  correcta (Grupo Perros: portada, consolidado, 3×mes, 3×histórico, delivery de los locales con
  apps, contraportada). Al cerrar 2026-09 queda bloqueado; el reporte de 2026-10 (con el mes en
  curso, abierto) muestra septiembre con fuente CERRADO. Con un Local negativo, el cierre se niega
  con el motivo.
- [ ] **Step 3: Commit** — `feat(reporte-ventas): descarga en PDF y cierre de mes`

---

### Task 9: Configurar cliente y canales

**Files:**
- Create: `frontend/src/components/reporteVentas/ConfigCliente.jsx`
- Modify: `frontend/src/pages/ReporteVentasPage.jsx` (botón "Configurar", solo para internos)

**Interfaces:**
- Consumes: `POST/PUT clientes` y `PUT/DELETE regla` (Task 4); los locales del grupo salen de
  `GET /api/data/...` (los mismos que lista `InformePage`).

Comportamiento:
- **Cliente:** nombre y locales con casillas, entre los del grupo. Si el grupo no tiene ningún
  cliente, se ofrece crear uno con todos los locales y el nombre del grupo (camino obvio, APB-C8).
- **Reglas, por local:** lista de "métodos de cobro y orígenes de caja del mes" con su monto (sale
  del GET de la Task 3). Al lado de cada uno, un selector de canal (texto libre, con sugerencias de
  los canales ya usados) y una casilla "delivery". Lo que no tiene regla muestra el canal por
  defecto (app detectada o "—"). Sin datos inventados: solo lista lo que trajo la consulta.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Verificación en dev: crear la regla Togni's Café `origen DCSMART → Cheaf
  (delivery)`. La hoja Mes de Café muestra Cheaf 1.504.016 y Local 71.552.485. Separar Cheaf de
  Ecommerce sigue pendiente (spec).
- [ ] **Step 3: Commit** — `feat(reporte-ventas): configuración de cliente y canales`

---

### Task 10: Verificación final

- [ ] `node --test frontend/src/lib/reporteVentas.test.js` y
  `cd backend && node --test src/lib scripts` → todo PASS.
- [ ] `cd frontend && npx vite build` sin errores. Además, buscar referencias sin definir a mano en
  los archivos nuevos (vite no las detecta; memoria `lint-no-undef-y-parches-parciales`):
  `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=ecmaVersion:latest,sourceType:module,ecmaFeatures:{jsx:true} --rule 'no-undef:error' src/pages/ReporteVentasPage.jsx src/components/reporteVentas`.
- [ ] Recorrido completo en dev con Grupo Perros sep-26. Las hojas coinciden con el deck en venta
  por local, canales de Pizza, histórico de Pizza (ene–sep) y delivery de Café. Lo que no coincida
  tiene que estar explicado por un dato que falta en Analytics y está marcado (cubiertos de Evelia,
  órdenes).
- [ ] Informar al usuario lo pendiente para prod: SQL en `dcsmart_analytics`, carga de decks con
  `--aplicar` en prod, deploy de API y hosting. Todo con su OK y nada de push sin pedirlo.
