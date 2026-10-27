# Informe Mensual nuevo (DC Management) — diseño

Fecha: 2026-10-27. Rama `MAIN-19-informe-mensual-nuevo`.
Maquetas aprobadas: lienzo de Claude Design https://claude.ai/artifact/G9x3HXccoxvz1mjs5jxnNB
(18 hojas + pantalla del editor + mapa de datos).

## Por qué

Cada mes "las chicas" arman en Canva un informe por cliente (P&L, CMV, gastos, cash flow, deuda,
resumen). Es trabajo manual y tiene errores (en el de ATTE de septiembre la columna TOTALES del P&L
no suma: faltan $ 34,2 M de venta). Analytics ya tiene un Informe Mensual (PR #10) que imita el
Canva en blanco y turquesa, por local, guardando todo en un JSON. El usuario no lo quiere más:
quiere uno nuevo con las prácticas y el estilo del Reporte de Ventas (oscuro, hojas 16:9, la hoja a
la izquierda y los datos a la derecha, borrador / cierre, cliente con varios locales), con **todas**
las hojas de los informes de referencia (`Desktop/Reporte mensual/`: Grupo Latino, ATTE, Club
Lucero, Grupo Perros) y con los datos **guardados de verdad** en tablas, porque se hace todos los
meses.

## Objetivos

- Un informe por cliente (`rv_cliente`) y mes, descargable en PDF, con las hojas del lienzo.
- Lo que está en gestión sale solo; lo que no, se carga en el panel y queda guardado en tablas de
  Analytics (una fila por dato, con quién y cuándo).
- Elegir qué hojas salen y en qué orden, por cliente. Observación opcional en cada hoja.
- Cerrar el mes congela lo presentado; el acumulado y los comparativos usan esas fotos.
- Reemplaza la pantalla y las tablas del Informe Mensual viejo.

## No objetivos (por ahora)

- Variables de rentabilidad (falta la fórmula de "Rentabilidad VMA"): la hoja no se construye.
- Saldos de bancos y Mercado Pago automáticos (no se sabe si la conciliación los guarda): a mano.
- Deuda corriente automática desde las OP sin pagar: a mano en esta versión (vw_pagos trae
  `pagado` y `estado_op`, se puede automatizar cuando el usuario confirme la definición).
- Importar los meses viejos desde planillas: los meses abiertos se calculan desde gestión; la
  importación de planillas, si existen, es otro trabajo.
- Agregar/quitar hojas en el Reporte de Ventas: después, usando la misma tabla `reporte_hojas`.

## Antiobjetivos

- Inventar datos: si un dato no está, la hoja muestra "Falta cargar" en el editor y "—" en el PDF
  (memoria `reportes-sin-datos-inventados`). Nada de textos de análisis redactados por el sistema:
  el resumen ejecutivo arma solo cifras; el comentario lo escribe una persona.
- Escribir en la base de gestión.
- Guardar el informe como un JSON opaco por mes (lo que hacía el viejo).

## Hojas

Claves estables (se guardan en `reporte_hojas`). "Por local" = en un cliente con varios locales
sale una por local; "grupo" = solo en clientes con más de un local.

| Clave | Hoja | Alcance |
|---|---|---|
| `portada` | Portada (logo DC Management, mes, nombre del cliente, razón social, logos de locales) | cliente |
| `indice` | Índice con número de hoja | cliente |
| `indicadores` | Principales indicadores con flechas vs mes anterior (venta, días, prom. día, pax, prom. pax salón, CMV %, labor %, EERR %, RF %) | cliente (1 local) |
| `ind_locales` | Indicadores por local + franja del grupo; cada local con sus indicadores propios | grupo |
| `historico` | Histórico de ventas año anterior vs actual (columnas), vs año anterior, vs mes anterior, cubiertos, promedio | por local |
| `pyl_acumulado` | P&L acumulado del año en 2 hojas (ventas/operación/CMV y egresos/resultado), meses en columnas + total | por local + grupo |
| `pyl_historico` | P&L año anterior vs actual (YTD): peso de cada rubro sobre la venta, diferencia en pts, tarjetas de resultado | por local |
| `consolidado` | P&L del mes por local y total del grupo | grupo |
| `cmv` | CMV total, alimentos/bebidas/stock con pts vs mes anterior, reparto por categoría | por local |
| `detalle` | Detalle de gastos: mes vs mes anterior por categoría, una hoja por sección del P&L con datos (CMV, fijos y variables, gastos generales, financieros, sueldos y honorarios, impositivos) | por local |
| `apertura` | Apertura por rubro con / sin factura (columnas 1 y 2) con barra de reparto, una hoja por sección | por local |
| `cashflow` | Cash flow: disponibilidades, pagos a realizar, resultado proyectado, MP a liquidar, fechas | cliente |
| `deuda` | Deuda corriente: total, % sobre la venta del período, fecha de corte | cliente |
| `resumen` | Resumen ejecutivo: cifras vs mes anterior armadas solas + comentario opcional por renglón | por local |
| `contraportada` | Contraportada | cliente |

Por defecto todas visibles salvo `apertura` (visible en clientes de un solo local). Una hoja cuyo
dato es 100% manual y está vacío (cash flow, deuda) no sale en el PDF y el editor lo avisa.
Cada hoja tiene pie con DC Management · Informe mensual · cliente · número / total, y la franja de
observación arriba del pie si hay una.

Diseño visual: el del lienzo y el de `styles/reporte-ventas.css` (fondo #19232f, tarjetas
#1e2b3a, dorado #c9b086, verde #5fcb92, rojo #f07b7b, turquesa #4fb3bb, Montserrat, 1456×819).
Hojas nuevas en `styles/informe-mensual.css` con prefijo `im-`, reusando las clases `rv-` donde
sirvan (cabecera, pie, tarjetas, tablas).

## Datos: de dónde sale cada cosa

### De gestión (solo lectura)

- **Ventas por canal**: igual que el Reporte de Ventas (`vw_cajas` + `vw_caja_detalles` cobros +
  `rv_regla_canal`, motor `lib/reporteVentas.js`). En el P&L la sección Ventas tiene una línea por
  canal. Columna 2 (sin factura) de ventas = `vw_cajas.efectivo`, y va dentro de la línea "Local".
- **Días con venta, pax**: `vw_cajas` (como el informe viejo). Pax se corrige a mano (rv_valor).
- **CMV y egresos**: `vw_pagos` por período (`COALESCE(periodo_dia, fecha_dia)`), NC restan,
  clasificados con `informe_reglas` + `seccionPorDefecto` (motor `lib/informe.js`, se reusa
  `construirInforme`). Columna 1/2 por tipo de comprobante (`COLUMNA_POR_TIPO`).
- **Gastos pagados con la caja**: total de `vw_caja_detalles` tipo gasto; el reparto se carga.
- **Razón social**: proveedor vinculado al local (dcsmartRo), pisable en el cliente.
- **Logos de locales**: `locales.logo_url` (ya lo hace el Reporte de Ventas).
- **Histórico de ventas**: los mismos números del Reporte de Ventas del cliente (incluye 2025
  importado de decks y Excel, y los cierres de RV). La hoja histórica debe coincidir con el RV.

El backend trae los datos automáticos de **cada mes desde enero del año anterior hasta el mes del
informe** (agrupado por mes), así el acumulado y el comparativo se calculan aunque los meses no se
hayan cerrado en el sistema nuevo.

### Tablas de Analytics que se reusan

- `rv_cliente` (+ columna `razon_social text`): el cliente es el mismo para los dos reportes.
- `rv_regla_canal`: canales de venta.
- `rv_valor` + `rv_valor_historial`: números por local y mes cargados o corregidos. Datos nuevos:
  `pax`, `dias` y `ind:<clave>` para los indicadores propios de cada local.
- `rv_observacion` + columna `reporte text NOT NULL DEFAULT 'ventas'` (PK pasa a incluirla):
  observación por hoja y mes; las del informe usan `reporte = 'informe'`.
- `rv_ipc`: inflación (no se usa en v1 salvo que haga falta en el histórico).
- `informe_reglas`: clasificación rubro/categoría → sección, por grupo. Se conserva.

### Tablas nuevas (`infra/00i_informe_mensual_nuevo.sql`)

- `reporte_hojas (cliente_id, reporte, hojas jsonb, indicadores jsonb, actualizado_por, actualizado_at)`,
  PK `(cliente_id, reporte)`. `hojas` = `[{ clave, visible, orden }]`; `indicadores` =
  `{ local: [{ clave, nombre, formato: 'numero'|'pesos' }] }`. Sin fila = valores por defecto.
- `im_linea (id bigserial, cliente_id, local text NULL, mes, hoja, seccion, concepto, monto
  numeric, monto2 numeric, corrige text NULL, oculta bool, orden int, actualizado_por, actualizado_at)`.
  - `hoja = 'pyl'`: línea agregada al P&L (`seccion` = clave de SECCIONES, `monto` = columna 1,
    `monto2` = columna 2, `concepto`), o corrección de una automática (`corrige` = clave de la
    línea, montos = valores nuevos; `oculta` = no se cuenta). Reemplaza `datos.ajustes` y
    `datos.manuales` del informe viejo.
  - `hoja = 'cashflow'`: `seccion` ∈ `disponible`, `pagar`, `mp_liquidar`.
  - `hoja = 'deuda'`: `seccion` ∈ `deuda`, `venta_periodo`.
  - `local` NULL = del cliente (cash flow, deuda).
- `im_linea_historial (id, linea_id, cliente_id, mes, accion, antes jsonb, despues jsonb, por, at)`.
- `im_texto (cliente_id, local text NOT NULL DEFAULT '', mes, clave, texto, actualizado_por,
  actualizado_at)`, PK `(cliente_id, local, mes, clave)`. Claves: `resumen:<renglón>` (hasta 400
  caracteres), `cashflow:elaborado`, `cashflow:proyectado`, `deuda:fecha`.
- `im_cierre (cliente_id, mes, origen 'informe'|'planilla', snapshot jsonb, snapshot_anterior,
  cerrado bool, cerrado_por, cerrado_at)`, PK `(cliente_id, mes)`. Mismo esquema que `rv_cierre`.
  `snapshot` = `{ locales: { [local]: { valores, secciones resumidas (clave, concepto, seccion, sub,
  col1, col2, total), canales } } }`.

GRANT a `analytics_app` al final (como 00e/00g). Idempotente.

### Se retiran

`informe_mensual` e `informe_local`, la ruta `/api/informe` y la pantalla `InformePage` con
`components/informe/*`. Antes de borrar: contar filas en dev y prod; si hay meses cerrados o
razón social/logos cargados, migrarlos (razón social → `rv_cliente.razon_social` del cliente que
contiene ese local; cierres → se informa al usuario, no se migran solos porque son por local y no
por cliente). Las tablas viejas no se borran en esta rama (DROP aparte, con OK).

## Reglas de cálculo

- Motor por local y mes: `construirInforme({ auto, reglas, datos })` del motor existente, con
  `datos` armado desde `im_linea` (ajustes + manuales) y `rv_valor` (pax, días).
- Consolidado del grupo = suma de los `valores` de los locales (`sumarValores`) y suma de líneas
  por (sección, concepto).
- Mes cerrado → se usa la foto (`im_cierre.snapshot`); abierto → se calcula.
- Acumulado = meses de enero al mes del informe; total = suma; % = sobre la venta de cada columna
  (los % se recalculan, nunca se copian).
- Prom. pax = venta del canal Local / pax (como el Canva). Prom. día = venta / días.
- Flechas y "vs mes anterior": en costos, subir es rojo; en venta y resultados, subir es verde.
- 2025 vs 2026: mismos meses (enero al mes del informe) de los dos años; si un mes del año
  anterior no tiene datos se muestra "—" y se avisa.
- Resumen ejecutivo: renglones fijos (venta, días, pax/prom, CMV total/alimentos/bebidas/stock,
  cada egreso del resumen con dato, resultado económico, resultado final) con la diferencia
  nominal y en pts vs el mes anterior; el comentario es opcional.

## API (`/api/informe-mensual`, backend/src/routes/informe_mensual.js)

Lectura con `authenticate`; escritura solo equipo DC (`esInterno`, como RV). En mes cerrado se
rechaza con 409 todo lo que cambie números (líneas pyl, valores); textos, observaciones y hojas
se pueden editar siempre.

- `GET /clientes` → reusa la lista de `rv_cliente` con `razon_social` y config de hojas.
- `GET /:id?mes=YYYY-MM` → cliente (con logos), hojas e indicadores configurados, `auto` por
  local y mes (ventas por canal, efectivo, días, pax, gastos por rubro/categoría/tipo, gastos de
  caja), `lineas` (im_linea del rango), `textos`, `valores` (rv_valor), `observaciones`
  (reporte = 'informe'), `cierres` (im_cierre del rango), `reglas` (informe_reglas), razón social
  de gestión.
- `PUT /:id/linea` (alta o modificación; body `{ id?, local, mes, hoja, seccion, concepto,
  monto, monto2, corrige, oculta, orden }`), `DELETE /:id/linea/:lineaId`.
- `PUT /:id/valor` (rv_valor, mismo contrato que RV pero chequea `im_cierre`).
- `PUT /:id/texto`, `PUT /:id/observacion`, `PUT /:id/hojas`, `PUT /regla` (informe_reglas).
- `POST /:id/cerrar` (`{ mes, snapshot }`), `POST /:id/reabrir`.
- `PUT /clientes/:id/razon-social`.

Validadores puros en `backend/src/lib/informeMensual.js` con tests (`node --test`).

## Frontend

- Ruta `/informe-mensual` (menú "Informe mensual"), página `InformeMensualPage.jsx`, reemplaza
  `/informe`.
- Motor puro `lib/informeMensual.js` (tests): arma por cliente y mes todo lo que las hojas
  necesitan a partir de la respuesta del GET, reusando `lib/informe.js` y `lib/reporteVentas.js`.
- Hojas en `components/informeMensual/Hojas.jsx`, una función por clave; gráficos en SVG a mano
  como en `reporteVentas/Paginas.jsx`.
- Editor como el del lienzo: barra (cliente, mes, estado Borrador/Cerrado, Configurar, Descargar
  PDF, Cerrar/Reabrir), lista de hojas con interruptor y orden (guarda en `reporte_hojas`), la hoja
  escalada al medio con tira de miniaturas, panel de datos a la derecha según la hoja:
  - indicadores / ind_locales: indicadores propios por local (alta de indicador: nombre + formato,
    guardado en `reporte_hojas.indicadores`; valor del mes en `rv_valor`), pax y días.
  - hojas del P&L, CMV, detalle, apertura: editor de líneas por local (corregir monto, ocultar,
    mover de sección = regla, agregar línea), reusando lo que sirva de `TablaDetalle`.
  - cash flow y deuda: líneas con concepto + monto, agregar/quitar, fechas.
  - resumen: comentario por renglón (contador 0/400).
  - todas: observación (contador 0/280). Inputs con contador / autosize, nunca pelados.
  - portada: razón social.
- PDF: igual que el Reporte de Ventas (impresión del mazo de hojas 16:9).
- Errores visibles en castellano sin tecnicismos.

## Despliegue

Dev primero: SQL 00i en `dcsmart_analytics_dev` (proxy 5437) → API dev (build + `run services
update --image`, revisión anterior anotada) → hosting `analytics-dev`. Prod solo con OK del
usuario (SQL en `dcsmart_analytics` antes del merge, PR a main del repo del jefe).

## Decisiones tomadas sin el usuario (revisar)

1. Meses abiertos del año se calculan desde gestión (no quedan vacíos).
2. Cash flow y deuda a mano; hoja vacía no sale en el PDF.
3. Línea "Local" de ventas lleva el efectivo como columna 2.
4. Sin Variables de rentabilidad hasta tener la fórmula.
5. Apertura por rubro oculta por defecto en clientes de varios locales.
6. Las tablas viejas no se borran en esta rama.
