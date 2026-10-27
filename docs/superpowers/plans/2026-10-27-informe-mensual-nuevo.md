# Informe Mensual nuevo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reemplazar el Informe Mensual de Analytics por uno por cliente, con las hojas del lienzo, estilo del Reporte de Ventas y datos manuales guardados en tablas.

**Architecture:** backend Fastify lee gestión (BigQuery `vw_cajas`/`vw_pagos`/`vw_caja_detalles` + `dcsmartRo`) y lee/escribe tablas propias en Postgres de Analytics. El armado de números es frontend puro (`lib/informeMensual.js`) que reusa `lib/informe.js` (P&L por local y mes) y `lib/reporteVentas.js` (venta por canal, histórico). Las hojas son componentes React que dibujan 1456×819 y se imprimen como el Reporte de Ventas.

**Tech Stack:** Node 22, Fastify, pg, @google-cloud/bigquery; React 18 + Vite; tests `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-27-informe-mensual-nuevo-design.md` (leerlo antes de cada tarea). Maquetas: https://claude.ai/artifact/G9x3HXccoxvz1mjs5jxnNB — cada hoja tiene su artboard; copiar layout, tamaños y colores de ahí (`Artifact` read de `project/<Hoja>.dc.html` si hace falta el detalle).

## Global Constraints

- Todo texto visible en castellano rioplatense, sin tecnicismos ni inglés; errores con `msgError` (`components/reporteVentas/errores.js`).
- Nunca escribir en la base de gestión. Escritura solo equipo DC (`esInterno` de `backend/src/lib/reporteVentas.js`).
- Nada inventado: dato faltante = `null` → "—" en la hoja y "Falta cargar" en el editor. Nunca `NaN`, `Infinity` ni "0%" por división por cero.
- Montos con `fmtAR` (separador de miles `.`), % con 2 decimales y coma (`fmtPct` de `lib/informe.js`).
- Hoja 1456×819, colores del spec (`#19232f`, `#1e2b3a`, `#c9b086`, `#5fcb92`, `#f07b7b`, `#4fb3bb`), Montserrat.
- En costos subir = rojo; en venta y resultados subir = verde.
- Inputs con contador o autosize, nunca pelados (observación 0/280, comentario de resumen 0/400).
- Un commit por tarea como mínimo, mensaje en castellano, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: backend `cd backend && node --test`; frontend `node --test frontend/src/lib/*.test.js` (desde la raíz del worktree). Build: `cd frontend && npm ci && npm run build` (la primera vez).

## Review Focus

1. Mes con locales sin gastos o sin ventas (local nuevo, mes a medias) → la hoja sale con "—", no rompe ni muestra 0%.
2. Corrección (`im_linea.corrige`) de una línea automática que gestión ya no trae → la línea se sigue viendo con el monto corregido y marca "ya no está en gestión".
3. Mes cerrado → PUT de línea `pyl` o valor responde 409; texto, observación y hojas se guardan igual.
4. Rubro/categoría con mayúsculas o acentos distintos a la regla → la regla igual aplica (`norm` de `lib/informe.js`).
5. Cash flow y deuda sin cargar → esas hojas no entran al PDF ni al índice y el editor lo avisa.

---

### Task 1: Tablas nuevas y validadores del backend

**Files:**
- Create: `infra/00i_informe_mensual_nuevo.sql`
- Create: `backend/src/lib/informeMensual.js`, `backend/src/lib/informeMensual.test.js`

**Interfaces:**
- Produces (en `backend/src/lib/informeMensual.js`):
  - `HOJAS_IM: string[]` = `['portada','indice','indicadores','ind_locales','historico','pyl_acumulado','pyl_historico','consolidado','cmv','detalle','apertura','cashflow','deuda','resumen','contraportada']`
  - `SECCIONES_LINEA: { pyl: string[] | null, cashflow: ['disponible','pagar','mp_liquidar'], deuda: ['deuda','venta_periodo'] }` (pyl = cualquier clave de SECCIONES de `frontend/src/lib/informe.js`, copiar la lista: ventas, cmv, alquiler, publicidad, descartables, instalaciones, representacion, financieros, sueldos, sueldos_socios, desvinculaciones, honorarios, otros, eventos, impositivos, pasivo, dividendos)
  - `lineaOk(body) -> { ok: true, linea } | { ok: false, error: string }` — normaliza `{ id?, local|null, mes, hoja, seccion, concepto (1–80), monto (número finito o null), monto2 (idem), corrige (string ≤ 200 o null), oculta (bool, default false), orden (int, default 0) }`. `hoja='pyl'` exige `local`; `cashflow`/`deuda` exigen `local=null`. Una línea con `corrige` puede no tener concepto.
  - `hojasOk(v) -> [{ clave, visible, orden }] | null` — solo claves de `HOJAS_IM`, sin repetidas.
  - `indicadoresOk(v, locales) -> { [local]: [{ clave, nombre, formato }] } | null` — clave `^[a-z0-9_]{1,30}$`, nombre 1–40, formato `numero|pesos`, máximo 8 por local, solo locales del cliente.
  - `textoOk(clave, texto) -> string | null` — claves `resumen:<renglón>` (≤400), `cashflow:elaborado`, `cashflow:proyectado`, `deuda:fecha` (≤40); `''` = borrar.
  - `datoIm(d) -> string | null` — acepta `pax`, `dias`, `ind:<clave>`.
- SQL: tablas del spec (`reporte_hojas`, `im_linea`, `im_linea_historial`, `im_texto`, `im_cierre`), `ALTER TABLE rv_cliente ADD COLUMN IF NOT EXISTS razon_social text`, `rv_observacion` + columna `reporte text NOT NULL DEFAULT 'ventas'` con PK `(cliente_id, mes, pagina, reporte)` (drop/add constraint idempotente con `DO $$`), índice `im_linea (cliente_id, mes)`, CHECKs de mes `^\d{4}-(0[1-9]|1[0-2])$`, `im_cierre.origen IN ('informe','planilla')`, GRANTs a `analytics_app` (tablas + secuencias) como en `00e`.

- [ ] **Step 1: Tests que fallan** en `informeMensual.test.js`: `lineaOk` acepta una línea pyl válida y devuelve `oculta:false, orden:0`; rechaza `hoja:'pyl'` sin local con error "Falta el local."; rechaza `cashflow` con `seccion:'otra'`; rechaza `monto: NaN`; acepta corrección `{ corrige:'cmv|quesos', monto: 100 }` sin concepto. `hojasOk([{clave:'cmv',visible:false,orden:3},{clave:'cmv',visible:true,orden:4}])` → `null`; `hojasOk([{clave:'xx'}])` → `null`. `indicadoresOk({ EVELIA:[{clave:'cub_dia',nombre:'Cubiertos día',formato:'numero'}] }, ['EVELIA'])` ok y con local ajeno → `null`. `textoOk('resumen:venta', 'x'.repeat(401))` → `null`. `datoIm('ind:r50')` → `'ind:r50'`, `datoIm('venta')` → `null`.
- [ ] **Step 2:** `cd backend && node --test` → FAIL (módulo no existe).
- [ ] **Step 3:** implementar `backend/src/lib/informeMensual.js` y escribir `infra/00i_informe_mensual_nuevo.sql`.
- [ ] **Step 4:** `cd backend && node --test` → PASS.
- [ ] **Step 5:** commit `Informe mensual nuevo: tablas y validadores`.

### Task 2: Rutas `/api/informe-mensual`

**Files:**
- Create: `backend/src/routes/informe_mensual.js`
- Modify: `backend/src/server.js` (registrar con prefix `/api/informe-mensual`, junto a reporte-ventas)
- Modify: `backend/src/routes/reporte_ventas.js` — la PK de `rv_observacion` pasa a incluir `reporte`: el GET filtra `AND reporte = 'ventas'`, el PUT inserta `reporte = 'ventas'` y usa `ON CONFLICT (cliente_id, mes, pagina, reporte)`, el DELETE filtra `reporte = 'ventas'`. Sin esto el Reporte de Ventas se rompe al aplicar 00i.
- Test: agregar a `backend/src/lib/informeMensual.test.js` lo puro que salga (p. ej. `rangoInforme`)

**Interfaces:**
- Consumes: Task 1 (validadores). De `backend/src/lib/reporteVentas.js`: `okMes`, `esInterno`, `mesCerrable`, `snapshotOk`, `obsOk`, `paginaOk`, `OBS_MAX`. Patrón de `routes/reporte_ventas.js` (transacciones, `quien(req)`, mensajes) y consultas de `routes/informe.js` (gastos por período, NC restan, gastos de caja, razón social por `dcsmartRo`).
- Produces:
  - `rangoInforme(mes) -> { desde: 'YYYY-01-01' del año anterior, hasta: último día de mes }` en el lib.
  - `GET /clientes` → `[{ id, grupo, nombre, locales, nombres, logos, logosLocal, razon_social }]` (logosLocal igual que RV, reusar `crearLogosLocales`).
  - `GET /:id?mes` → `{ cliente, mes, razonSocialGestion, hojas: { hojas, indicadores } | null, auto: { [local]: { [mes]: { efectivo, dias, pax, gastos: [{ rubro, categoria, tipo, total }], cajaGastos } } }, lineas: [im_linea con montos Number], textos: [{ local, mes, clave, texto }], valores: [rv_valor del rango con dato pax|dias|ind:*], observaciones: { [pagina]: { texto, actualizado_por, actualizado_at } } (reporte='informe', mes), cierres: [im_cierre cerrados del rango], reglas: [informe_reglas del grupo] }`. Una sola consulta BigQuery por fuente con `GROUP BY local, FORMAT_DATE('%Y-%m', …)`.
  - `PUT /:id/linea` → `{ ok, id }`; `DELETE /:id/linea/:lineaId` → `{ ok }`; ambos dejan fila en `im_linea_historial` (accion `alta|cambio|baja`, antes/despues jsonb). Línea `pyl` en mes cerrado → 409 "El mes está cerrado. Reabrilo para hacer cambios."; `cashflow`/`deuda` también 409 (son números del mes).
  - `PUT /:id/valor` `{ local, mes, dato, valor|null, original }` → rv_valor + historial (copiar de RV), 409 si `im_cierre` cerrado.
  - `PUT /:id/texto` `{ local?, mes, clave, texto }`, `PUT /:id/observacion` `{ mes, pagina, texto }` (reporte='informe'), `PUT /:id/hojas` `{ hojas, indicadores }` (upsert `reporte_hojas` con `reporte='informe'`), `PUT /regla` `{ grupo, rubro, categoria, seccion|null, concepto? }` (copiar de `routes/informe.js`), `PUT /clientes/:id/razon-social` `{ razon_social|null }`: siempre permitidos.
  - `POST /:id/cerrar` `{ mes, snapshot }` (upsert como `rv_cierre`, `snapshot_anterior`), `POST /:id/reabrir`.

- [ ] **Step 1:** test de `rangoInforme('2026-09')` → `{ desde:'2025-01-01', hasta:'2026-09-30' }` y `rangoInforme('2026-02')` → hasta `'2026-02-28'`.
- [ ] **Step 2:** `node --test` → FAIL.
- [ ] **Step 3:** implementar `rangoInforme` y la ruta completa; registrar en `server.js`.
- [ ] **Step 4:** `node --test` → PASS y `node -e "import('./src/routes/informe_mensual.js')"` sin error de sintaxis.
- [ ] **Step 5:** commit `Informe mensual nuevo: API`.

### Task 3: Reusar el armado del Reporte de Ventas y cliente de API

**Files:**
- Modify: `frontend/src/lib/reporteVentas.js` (mover `ticketsDelMes` y `armarPorLocal` desde `pages/ReporteVentasPage.jsx` y exportarlos), `frontend/src/pages/ReporteVentasPage.jsx` (importarlos), `frontend/src/lib/api.js` (métodos `im*`)
- Test: `frontend/src/lib/reporteVentas.test.js`

**Interfaces:**
- Produces: `autoDeLocal(data, local) -> { meses, canales: { [mes]: [{ nombre, valor, delivery }] } } | null` (lo que hoy arma el bucle de la página antes de `armarLocal`) y `armarPorLocal(data) -> { [local]: LocalMes }` que lo usa (misma salida que hoy en la página). En `api`: `imClientes(grupo)`, `imGet(id, mes)`, `imPutLinea(id, body)`, `imDelLinea(id, lineaId)`, `imPutValor(id, body)`, `imPutTexto(id, body)`, `imPutObs(id, body)`, `imPutHojas(id, body)`, `imPutRegla(body)`, `imPutRazonSocial(id, body)`, `imCerrar(id, mes, snapshot)`, `imReabrir(id, mes)`.

- [ ] **Step 1:** test `armarPorLocal` con un `data` mínimo de un local (copiar la forma de la respuesta de `rvGet` de los tests existentes): devuelve el local con `venta.valor` del mes.
- [ ] **Step 2:** FAIL (no exportado). **Step 3:** mover el código sin cambiar comportamiento. **Step 4:** todos los tests del frontend PASS y `npm run build` OK.
- [ ] **Step 5:** commit `Reporte de ventas: armado por local reutilizable`.

### Task 4: Motor del informe — P&L por local, meses, acumulado y consolidado

**Files:**
- Create: `frontend/src/lib/informeMensual.js`, `frontend/src/lib/informeMensual.test.js`

**Interfaces:**
- Consumes: `construirInforme`, `sumarValores`, `armarResumen`, `indicadores`, `claveLinea`, `SECCIONES` de `lib/informe.js`; `LocalMes` de Task 3.
- Produces:
  - `datosDeLineas(lineas, local, mes) -> { ajustes: { [clave]: { col1, col2, oculto } }, manuales: [{ id, seccion, concepto, col1, col2, sub }] }` (de `im_linea` hoja `pyl`).
  - `ventasDeLocal({ rvLocal, rvAuto, efectivo, mes, esMesInforme }) -> { lineas: [{ canal, total, col1, col2 }] }` — mes del informe: canales resueltos de `rvLocal.canales`; otros meses: canales automáticos de `rvAuto.canales[mes]`; "Local" lleva `col2 = efectivo`, `col1 = total − efectivo`; sin venta → `[]`.
  - `pylMes({ local, mes, im, rv }) -> InformeMes | null` — cerrado → desde `im.cierres` snapshot; abierto → `construirInforme` con auto de `im.auto[local][mes]`, ventas por canal, `datos` de `datosDeLineas` + pax/días de `rv_valor` (`pax`, `dias`). `null` si el mes no tiene ni ventas ni gastos. Agrega `canales` y `editadoEnLineas` y marca `huérfana: true` en correcciones cuya clave ya no existe (Review Focus 2).
  - `armarInformeMensual({ im, rv, mes }) -> Informe` con `{ cliente, mes, locales: [{ local, nombre, meses: { [mes]: InformeMes|null }, acumulado: { meses, total }, anioAnterior: { total } }], grupo: null | { meses, acumulado, porLocalMes }, indicadoresConfig, valores, textos, lineasCliente, observaciones, cerrado, avisos }`. Meses = enero..mes del año del informe; año anterior = mismos meses.
  - `pct(valor, base) -> number | null` (null si base es 0 o null).
- [ ] **Step 1: tests** — con un `im` armado a mano (1 local, 2 meses):
  - `datosDeLineas` convierte una corrección y una manual.
  - `pylMes` con mes cerrado devuelve el snapshot aunque `auto` cambie.
  - `ventasDeLocal`: efectivo 100, Local 1000, Rappi 200 → Local `{ col1: 900, col2: 100 }`, Rappi `{ col1: 200, col2: 0 }`.
  - `armarInformeMensual`: acumulado de dos meses = suma; consolidado de 2 locales suma `valores`; local sin datos en un mes → `meses[m] === null`; `pct(5, 0) === null`.
  - Corrección huérfana sigue sumando y queda marcada.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS (todos los tests del frontend).
- [ ] **Step 5:** commit `Informe mensual nuevo: motor del P&L por cliente`.

### Task 5: Motor — hojas, resumen, detalle, CMV, cash flow y deuda

**Files:**
- Modify: `frontend/src/lib/informeMensual.js`, `frontend/src/lib/informeMensual.test.js`

**Interfaces:**
- Consumes: Task 4.
- Produces:
  - `HOJAS_DEFECTO` (orden del spec) y `paginasDe(informe, config) -> [{ id, clave, local?, seccion?, parte? }]` — ids `clave`, `clave:local`, `detalle:local:seccion`, `apertura:local:seccion`, `pyl_acumulado:local:1|2`, `pyl_acumulado:grupo:1|2`. Reglas: hojas "por local" se repiten por local; `ind_locales`, `consolidado` y el P&L acumulado de grupo solo con >1 local; `indicadores` solo con 1 local; `detalle`/`apertura` una por sección con datos en el mes (CMV, alquiler, publicidad+descartables+instalaciones+representacion, financieros, sueldos+sueldos_socios+desvinculaciones+honorarios, impositivos); `cashflow`/`deuda` fuera si no tienen líneas; `apertura` oculta por defecto con >1 local; `config.hojas` pisa visible/orden.
  - `resumenDe(informe, local) -> [{ clave, titulo, actual, anterior, diferencia, diferenciaPts, sentido: 'costo'|'resultado', comentario }]` — claves `venta`, `dias`, `pax`, `prom_pax`, `cmv`, `cmv_alimentos`, `cmv_bebidas`, `cmv_movstock`, una por egreso del resumen con dato (`fijos`, `publicidad`, …), `eerr`, `rf`; comentario desde `textos` clave `resumen:<clave>`.
  - `detalleDe(informe, local, seccionGrupo) -> [{ concepto, anterior, pctAnterior, actual, pctActual, diferencia }]` + totales.
  - `aperturaDe(informe, local, seccionGrupo) -> [{ concepto, total, pct, col1, pct1, col2, pct2, reparto }]` + totales y venta col1/col2.
  - `cmvDe(informe, local) -> { total, pct, porSub: { alimentos, bebidas, movstock } con pct y pts vs mes anterior, categorias por sub ordenadas desc }`.
  - `cashflowDe(informe) -> { disponible:{lineas,total}, pagar:{lineas,total}, mpLiquidar, resultado, cobertura, elaborado, proyectado }`, `deudaDe(informe) -> { total, ventaPeriodo, pct, fecha }` (`ventaPeriodo` por defecto = venta del mes del cliente).
  - `snapshotIm(informe) -> { locales: { [local]: { valores, secciones, canales } } }`.
- [ ] **Step 1: tests** con los números de ATTE del spec/lienzo donde sirvan: `detalleDe` CMV ago 44.209.493 vs sep 41.209.956 → diferencia −2.999.537; `cashflowDe` disponible 29.949.357, pagar 38.577.751 → resultado −8.628.394, cobertura 77,6; `deudaDe` 32.994.552,98 / 222.823.794 → 14,81%; `paginasDe` sin cash flow cargado no incluye `cashflow`; con 2 locales incluye `ind_locales` y no `indicadores`; `config.hojas` con `cmv` invisible lo saca; `resumenDe` CMV bajó → `diferencia < 0` y `sentido:'costo'`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** commit `Informe mensual nuevo: armado de cada hoja`.

### Task 6: Hojas — portada, índice, indicadores, contraportada, cash flow, deuda, resumen

**Files:**
- Create: `frontend/src/components/informeMensual/Hojas.jsx`, `frontend/src/styles/informe-mensual.css`
- Modify: `frontend/src/main.jsx` o donde se importe `reporte-ventas.css` (importar el css nuevo igual)

**Interfaces:**
- Consumes: Task 5. Reusar de `components/reporteVentas/Paginas.jsx` lo que exporte o copiar el patrón `Marco` (cabecera `rv-cab`, pie `rv-pie` con logo, franja de observación, número / total, marca de borrador).
- Produces: `export function HojaIm({ pagina, informe, numero, total, borrador })` y `export function MazoIm({ informe, paginas, borrador, imprimir })` (contenedor `im-mazo`, `im-print` oculto en pantalla y visible con `body.imprimiendo-im`, como RV). Mapa `HOJAS_IM_COMPONENTES` de clave → componente; esta tarea implementa `portada`, `indice`, `indicadores`, `ind_locales`, `cashflow`, `deuda`, `resumen`, `contraportada` copiando los artboards `Main`, `Indice`, `Indicadores`, `IndLocales`, `CashFlow`, `Deuda`, `Resumen`, `Contra`. Logo DC Management: `/logos/DC-MANAGEMENT.png`.
- [ ] **Step 1:** implementar. **Step 2:** `npm run build` OK. **Step 3:** commit `Informe mensual nuevo: hojas de portada, indicadores, cash flow, deuda y resumen`.

### Task 7: Hojas — histórico, P&L acumulado, P&L año anterior, consolidado, CMV, detalle, apertura

**Files:**
- Modify: `frontend/src/components/informeMensual/Hojas.jsx`, `frontend/src/styles/informe-mensual.css`

**Interfaces:**
- Consumes: Task 5 y 6 (`Marco`, mapa de componentes).
- Produces: componentes para `historico` (columnas SVG año anterior gris `#5b6b7d` / actual dorado, filas vs año anterior, vs mes anterior, cubiertos, prom. — datos del `rvLocal.historico`), `pyl_acumulado` partes 1 y 2 (tabla meses + total, mes del informe resaltado, % debajo o al lado como el lienzo), `pyl_historico` (puntos por rubro + tarjetas), `consolidado`, `cmv`, `detalle`, `apertura` copiando `Historico`, `PylVentas`, `PylEgresos`, `PylHistorico`, `Consolidado`, `Cmv`, `DetalleCmv`, `Apertura` del lienzo. Con 10+ filas de detalle, partir en dos columnas como `DetalleCmv`; si pasa de ~34 filas, continuar en otra hoja (`parte`).
- [ ] **Step 1:** implementar. **Step 2:** `npm run build` OK. **Step 3:** commit `Informe mensual nuevo: hojas del P&L, CMV y detalle`.

### Task 8: Pantalla del informe y editor

**Files:**
- Create: `frontend/src/pages/InformeMensualPage.jsx`, `frontend/src/components/informeMensual/PanelIm.jsx`, `frontend/src/components/informeMensual/ListaHojas.jsx`
- Modify: `frontend/src/App.jsx` (ruta `informe-mensual`; `reporte-mensual` redirige a `informe-mensual`), `frontend/src/components/Sidebar.jsx` (entrada "Informe mensual" → `/informe-mensual`, sub "P&L, gastos, cash flow y resumen del mes")

**Interfaces:**
- Consumes: Tasks 3–7. La página pide en paralelo `api.imGet(id, mes)` y `api.rvGet(id, mes)`; con la segunda arma `rv = armarReporte({ cliente, mes, porLocal: armarPorLocal(rvData), ipc, observaciones: {} })` y se lo pasa a `armarInformeMensual({ im, rv, mes })` (`rv.locales[i]` = `rvLocal`, `autoDeLocal(rvData, local)` = `rvAuto`). Patrón de `ReporteVentasPage.jsx` (selector de grupo/cliente/mes, `recargar`, miniaturas, `ocupado`, `error`, imprimir con portal, confirmaciones) y `PanelDatos.jsx` (`CampoNum`).
- Produces: página como el artboard `Editor`: barra (cliente, mes, estado, Configurar → `ConfigCliente` de RV, Descargar PDF, Cerrar/Reabrir con `snapshotIm`), `ListaHojas` (interruptor + subir/bajar, guarda con `imPutHojas`), hoja escalada + miniaturas, `PanelIm` según `pagina.clave`:
  - `indicadores`/`ind_locales`: pax y días (`imPutValor`), indicadores propios: alta (nombre, formato) → `imPutHojas` indicadores; valor del mes → `imPutValor` dato `ind:<clave>`.
  - `pyl_*`, `consolidado`, `cmv`, `detalle`, `apertura`: editor de líneas del local (corregir col1/col2 → `imPutLinea` con `corrige`; ocultar; volver al de gestión = `imDelLinea`; agregar línea manual; mover categoría de sección → `imPutRegla`; avisos del motor: sin sección, tipos sin columna, gastos de caja).
  - `cashflow`/`deuda`: líneas por sección (concepto + monto, agregar/quitar) y fechas (`imPutTexto`).
  - `resumen`: comentario por renglón (`imPutTexto`, contador 0/400).
  - `portada`: razón social (`imPutRazonSocial`, muestra la de gestión como sugerencia).
  - Todas: observación (`imPutObs`, contador 0/280).
  - Mes cerrado: todo lo que cambia números deshabilitado con el texto "El mes está cerrado. Reabrilo para hacer cambios."; solo equipo DC edita.
- [ ] **Step 1:** implementar. **Step 2:** `npm run build` OK y todos los tests PASS. **Step 3:** commit `Informe mensual nuevo: pantalla y editor`.

### Task 9: Retirar el informe viejo

**Files:**
- Delete: `frontend/src/pages/InformePage.jsx`, `frontend/src/components/informe/` (salvo lo que Tasks 6–8 importen), `frontend/src/styles/informe.css` si queda sin uso, `backend/src/routes/informe.js`
- Modify: `backend/src/server.js`, `frontend/src/lib/api.js` (sacar `getInforme`, `guardarInforme`, `cerrarInforme`, `reabrirInforme`, `guardarRegla`, `guardarLocalInforme`), `frontend/src/App.jsx`
- Keep: `frontend/src/lib/informe.js` y su test (los usa el motor nuevo), `infra/00d_*` (las tablas viejas no se borran).

- [ ] **Step 1:** borrar y ajustar imports. **Step 2:** `rg "informe/|InformePage|getInforme|guardarRegla" frontend/src backend/src` sin resultados fuera de lo que se conserva; build y tests PASS. **Step 3:** commit `Informe mensual: fuera la versión vieja`.

### Task 10 (lo hace la sesión principal, no un subagente): dev

- [ ] Contar filas de `informe_mensual`/`informe_local` en dev y prod; avisar al usuario si hay datos.
- [ ] `infra/00i` en `dcsmart_analytics_dev` (proxy 5437, usuario `dcsmart_dev_app`).
- [ ] Build de la API dev (imagen `dev-informe-mensual-<sha>`) y `run services update --image`; anotar revisión anterior.
- [ ] `firebase deploy --only hosting:analytics-dev`.
- [ ] Probar con token firmado: `GET /api/informe-mensual/clientes` y `GET /:id?mes=2026-09` de un cliente con datos; capturas de las hojas con puppeteer.
