# Reporte de Ventas mensual (para clientes) — Diseño

**Fecha:** 2026-10-20
**App:** dcsmart-analisis
**Estado:** borrador para revisión del usuario (con las respuestas del 20/10 incorporadas)
**Maquetas:** companion visual en `.superpowers/brainstorm/2826-1792514170/content/` del checkout principal
(`direcciones.html`, `reporte-v2-completo.html`, `editor-a-fuentes-reales.html`).

## Por qué

Hoy el Reporte de Ventas de cada cliente se arma a mano: alguien del equipo saca los números de
gestión y de los sistemas de punto de venta (Fudo, TapTap) y los pasa a una presentación de
PowerPoint o Canva. En la carpeta de referencia (`Desktop/Reporte Ventas Finales`) hay 24 decks.
Ese armado manual genera errores; por ejemplo, la slide "Consolidado 2026" del deck de Grupo Perros
de septiembre tiene los números de Togni's Café copiados.

El reporte nuevo se arma solo con los datos de Analytics. Antes de descargarlo, el equipo ve de
dónde sale cada número y lo puede corregir. Lo que se descarga es un PDF presentable que se le
entrega al cliente.

## Objetivos

1. **Cubrir todo lo que muestran hoy los decks** (ver el inventario abajo). Ningún cliente puede
   perder información que hoy recibe.
2. **Cada número tiene su fuente visible**, con una de cuatro etiquetas: automático (sale de las
   cajas), calculado (se deriva de otros), a mano (cargado o corregido en el reporte) o falta
   (Analytics no lo tiene).
3. **Editable antes de descargar**: el valor corregido queda marcado y conserva el original.
4. **Descarga en PDF**, una página por hoja en formato 16:9, lista para presentar.
5. **Diseño nuevo**, con la estética DCSMART (azul noche, dorado y Montserrat). No se copia el look
   de los decks.

## No objetivos (por ahora)

- **Datos faltantes en origen:** arreglar tickets y órdenes vacíos, cubiertos que no coinciden y la
  falta de turno en Fudo/TapTap. El usuario lo marcó para después. Mientras tanto se cargan a mano
  en el editor.
- **Configuración de turnos:** día/noche, AM/PM. El usuario la va a explicar más adelante.
- **Envío automático** del reporte por mail.
- **Acceso del cliente:** el cliente no entra a Analytics; recibe el PDF. *(Decisión mía, a
  confirmar.)*

## Anti-objetivos (lo que lo haría un fracaso aunque funcione)

- **Datos inventados:** un número estimado, aproximado o "rellenado". Si un dato no está, se ve
  como faltante; nunca se completa solo.
- **Texto interpretativo generado:** frases tipo "Evelia explica la mitad de la venta". El reporte
  muestra datos; no redacta conclusiones.
- **Interactividad en lo que se entrega:** el PDF es estático.
- **Totales que no cierran:** el total y los % de incidencia siempre se recalculan a partir de las
  líneas; nunca se editan a mano.

## Inventario: qué tiene que poder mostrar

| Bloque | Contenido | Variantes vistas en los decks |
|---|---|---|
| Portada / contraportada | DC Management, "Tu Rentabilidad, Nuestra Gestión", grupo y mes | — |
| Consolidado del mes | Local · importe · % de incidencia | Grupo Perros, Tita, La Alacena, Gran Latino |
| Histórico consolidado | Una columna por local + total · variación vs mes anterior · total 2025 · interanual | Gran Latino, TiAmo |
| Mes por canal | Canal · importe · % de incidencia | Local, Rappi, Pedidos Ya, BigBox, Cheaf, Ecommerce, NoShow, Eventos; columna USD (Danzon); por turno (Mafia) |
| Histórico mes a mes del local | Venta del año · venta del año anterior · variación $ y % vs mes anterior · variación vs año anterior · total | Columnas opcionales: personas/cubiertos/PAX y promedio, órdenes y promedio, turno día/noche con cubiertos y promedio, delivery por turno, ventas a otro local, eventos, BigBox |
| Desempeño comercial | Gráfico de venta por mes del año | Varios |
| YTD año anterior vs actual | Gráfico mes a mes de los dos años | ETM también 2023 vs 2024 |
| Cubiertos por turno | AM vs PM por mes | Mafia |
| Delivery por aplicación | Venta delivery, variación, tickets; por app: venta, tickets, ticket promedio | Togni's Café, Cabrera (delivery AM/PM) |

Las páginas y columnas opcionales aparecen solo cuando el local tiene ese dato, ya sea automático
o cargado a mano. No hay una plantilla por cliente.

## Páginas del PDF

1. **Portada:** grupo, mes, locales.
2. **Consolidado:** solo si el grupo tiene más de un local. Tabla de locales con % y barras
   horizontales, más el histórico consolidado.
3. **Por cada local:**
   - **El mes:** venta, variación vs mes anterior ($ y %), variación vs año anterior, tabla de
     canales y barras.
   - **Histórico:** tabla mes a mes con las columnas que tenga el local, gráfico de desempeño y el
     comparativo con el año anterior (barra del año actual con una marca fina del año anterior).
   - **Delivery por app:** solo si hay ventas por apps.
   - **Turnos:** solo si hay turnos (queda definido cuando se resuelva la configuración de turnos).
4. **Contraportada.**

El formato visual es el de la maqueta `reporte-v2-completo.html`.

## Editor (variante A, elegida por el usuario)

- **Barra superior:** grupo, mes, "Restaurar originales" y "Descargar PDF".
- **Columna izquierda:** miniaturas de las páginas.
- **Centro:** la página elegida, tal como sale en el PDF.
- **Derecha:** la tabla "Datos de esta hoja", con dato, valor y fuente.
  - El **valor** se edita en la celda. La página del centro se actualiza.
  - El dato editado se resalta, muestra el original tachado y quién lo cambió y cuándo.
  - Los datos **calculados** (total, Local = total − apps, % de incidencia, variaciones, promedios)
    no se editan. Se recalculan a partir de los demás.
  - Los datos **faltantes** se ven vacíos y marcados; se pueden cargar a mano.
- Se puede agregar una **línea a mano** en canales (por ejemplo "Eventos" o "NoShow") y en las
  columnas opcionales del histórico (órdenes, cubiertos, etc.).

## De dónde sale cada dato (verificado el 20/10/2026)

Se verificó contra BigQuery `dcsmart_analytics` con Grupo Perros, septiembre 2026. La venta por
local y los canales Rappi / Pedidos Ya / Local **coinciden al peso con el deck**.

| Dato | Fuente | Estado |
|---|---|---|
| Venta del mes por local | `vw_cajas.total`, sumado por `fecha_dia` (= fecha de inicio de la caja) | Automático, verificado |
| Grupo → locales | `vw_cajas.grupo` / `local` (grupo = `apps.nombre`) | Automático. Ojo: va por nombre, así que un renombre lo rompe (Trello #273) |
| Apps (Rappi, Pedidos Ya, MP Delivery…) | `vw_caja_detalles` con `tipo='cobro'` y `metodo` según la lista de apps de gestión (`ES_APP` en `dcsmart/backend/src/lib/reporteCierreCaja.js:27`) | Automático, verificado |
| Local / salón | Calculado: total − apps − otros canales identificados | Calculado, verificado |
| Cheaf, Ecommerce (Togni's Café) | Cajas cargadas a mano en gestión (`origin='DCSMART'`); las 5 de septiembre suman Cheaf + Ecommerce | Automático en total. **No está resuelto cómo separar una de otra** |
| BigBox, NoShow, Eventos, ventas a otro local | No hay un dato propio; NoShow de Evelia no aparece como método | Falta → a mano |
| USD | No hay columna de moneda en las cajas | Falta → a mano |
| Cubiertos / personas / PAX | `vw_cajas.comensales` | Automático, **no confiable**: Evelia da 6.274 y el deck 6.125; 40% de las cajas TapTap de Grupo Perros vacías. Se muestra y se puede corregir |
| Órdenes / tickets | `vw_cajas.tickets` | Casi vacío (TapTap 84–94%, manuales ~99%) → a mano por ahora |
| Ticket promedio | Calculado (total/órdenes, total/cubiertos) | Calculado; vacío si falta el divisor |
| Turno | `cajas.tipo_turno` existe en gestión, pero la vista no lo expone y Fudo/TapTap no lo llenan | Fuera de alcance por ahora |
| Delivery: tickets por app | `caja_detalles.cantidad` existe en gestión, pero `vw_caja_detalles` no lo trae | Falta → a mano (exponerlo es una mejora posible) |
| Histórico año anterior | `vw_cajas` de meses previos | Depende del grupo: Grupo Perros, 878 y La Fuerza tienen desde ene-2025; Tita desde abr-2026; Loreto desde jul-2026; Gris Gris desde jun-2025. Lo que falte → a mano |

## Reglas de cálculo (decididas por el usuario)

- **El total del local es el de las cajas y no se mueve.** Si se agrega un canal a mano (por
  ejemplo "Eventos") o se corrige uno, **baja "Local"**, que absorbe la diferencia. Si "Local"
  quedara negativo, el editor lo marca y no deja cerrar el mes.
- El total, la venta del mes y los % de incidencia siguen siendo calculados.

## Carga inicial: los decks ya entregados (decidido por el usuario)

Los meses que ya se entregaron en decks (2026 hasta septiembre) se cargan **desde los decks**, como
meses cerrados. Así el histórico de los reportes nuevos coincide con lo que el cliente ya recibió.
No se recalculan desde Analytics.

- **Fuente:** los `.pptx` de `Desktop/Reporte Ventas Finales`. Las tablas son tablas reales de
  PowerPoint y se pueden leer automáticamente (período, venta, año anterior, cubiertos, órdenes,
  canales del mes, delivery por app, etc.).
- **Valores que solo están en gráficos pegados como imagen** (por ejemplo, algunas barras YTD con
  los valores del año anterior) no se leen solos: se cargan a mano en el editor o se dejan como
  faltantes.
- **Antes de guardar se muestra un resumen por cliente** con lo leído, para revisarlo. Los errores
  conocidos de los decks (por ejemplo, el "Consolidado 2026" de Grupo Perros, que repite Togni's
  Café) no se importan como consolidado: el consolidado se calcula siempre de los locales.
- La carga se corre una sola vez por cliente. Después, cada mes nuevo sale del reporte nuevo.

## Datos guardados

- **Lo automático no se guarda:** se lee en vivo de BigQuery.
- **Lo editado o cargado a mano se guarda** en la base propia `dcsmart_analytics` (Postgres), con
  una fila por (reporte de cliente, local, mes, dato): valor, valor original (si era automático), usuario y
  fecha. *(Decisión mía.)* Cada cambio también queda en un historial; hoy `informe_mensual` guarda
  solo al último que tocó, y eso no alcanza para datos que van al cliente.
- **Cierre de mes:** al descargar el PDF "final", el mes queda cerrado y se guarda una foto de
  todos sus valores (ver "Borrador, final y cierre"). Los meses cerrados alimentan el histórico de los reportes siguientes con lo
  que se le entregó al cliente, no con lo que diga la base hoy. Reabrir un mes queda restringido a
  admin, como en el informe actual. *(Decisión mía, a confirmar.)*
- **Mapeo de canales por grupo:** qué método o caja es qué canal. Por defecto, la lista de apps de
  gestión; el resto es "Local". Configurable por grupo para casos como Cheaf / Ecommerce.

## Un reporte = un cliente, no siempre un grupo

Comparé los decks contra los grupos de Analytics (locales con cajas desde ago-2026):

- **Coinciden:** Grupo Perros, Tita, Gran Latino (4 locales) y Pritany (Sorellina / Ti Amo /
  Caprichito, el deck "TiAmo").
- **Un grupo, varios decks:** GRUPO MONOS (Victor / 3MONOS / UAT) se entrega en 3 decks separados
  (Mono Gordo-Victor, 3 Monos, Cacho e Hijos-UAT).
- **Otro nombre:** el deck "Gran Bar Danzon" es GRAN-DANZON del GRUPO BASA.
- **Sin datos en Analytics:** La Alacena (Cabrera / Gascón), ETM y RVR no aparecen como locales.
  **Quedan fuera** (decidido por el usuario): no se arma su reporte hasta que tengan datos.

Por eso el reporte se define como **cliente = nombre + lista de locales elegidos**, configurable.
Por defecto se propone un reporte por grupo. *(Decisión mía.)* Lo editado y lo cerrado se guarda
por reporte de cliente y mes; los valores van por local dentro de ese reporte.

## Borrador, final y cierre *(decisiones mías)*

- **"Descargar borrador":** baja el PDF con marca de agua "Borrador" y no cierra nada.
- **"Cerrar y descargar final":** cierra el mes de ese reporte de cliente, todos sus locales
  juntos, guarda la foto y baja el PDF sin marca.
- **Solo se cierran meses terminados.** Si el mes anterior no está cerrado, se avisa, pero se
  permite cerrar igual.
- **Mapeo de canales:** va por local. Una regla puede apuntar a un método de cobro (por nombre) o
  a un conjunto de cajas (por ejemplo, cajas manuales de un local); la forma exacta queda para
  quien construya.
- **Editar y cerrar:** solo los roles internos (`super_admin` y `dcsmart`). Un externo, aunque
  sea `is_admin`, puede ver pero no editar.

## Construcción

- **Dónde va:** página nueva en Analytics, separada del Informe Mensual (P&L) actual. Se reutiliza
  lo que sirva: `informe_local` para logo y razón social, y el patrón de rutas de `informe.js`.
- **PDF:** con el mecanismo que ya usa la app, `window.print()` con CSS de impresión, configurado
  en páginas 16:9. *(Decisión mía: no agrega dependencias. Si el resultado no queda prolijo en
  Chrome, se pasa a generar el PDF en el servidor.)*
- **Gráficos:** SVG propio o `chart.js`, que ya está en el proyecto, con impresión nítida.
- **Permisos:** los mismos que el resto de Analytics para ver. Editar y cerrar quedan para el
  equipo DC. *(Decisión mía.)*

## Lo que queda a criterio de quien construya

Nombres de tablas y rutas, estructura de componentes, cómo se dibujan los gráficos, tests del
cálculo (como mínimo: que Grupo Perros sep-2026 reproduzca el deck al peso en ventas y canales).

## Pendientes conocidos

- Cómo separar Cheaf de Ecommerce en Togni's Café.
- Dónde está el NoShow de Evelia.
- Configuración de turnos (la explica el usuario más adelante).
- Logo oficial de DC Management (hoy hay una aproximación en SVG).
