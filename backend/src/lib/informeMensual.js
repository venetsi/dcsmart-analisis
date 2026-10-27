// Informe mensual nuevo: validadores puros de lo que entra por la API.
// No tocan la base ni dependen de Fastify, para poder probarlos con node --test.

import { okMes } from './reporteVentas.js'

// Hojas del informe, en el orden por defecto.
export const HOJAS_IM = ['portada', 'indice', 'indicadores', 'ind_locales', 'historico', 'pyl_acumulado', 'pyl_historico', 'consolidado', 'cmv', 'detalle', 'apertura', 'cashflow', 'deuda', 'resumen', 'contraportada']

// Secciones permitidas por hoja. pyl = las claves de SECCIONES de frontend/src/lib/informe.js
// (se copian acá porque el backend no importa del frontend).
export const SECCIONES_LINEA = {
  pyl: ['ventas', 'cmv', 'alquiler', 'publicidad', 'descartables', 'instalaciones', 'representacion', 'financieros', 'sueldos', 'sueldos_socios', 'desvinculaciones', 'honorarios', 'otros', 'eventos', 'impositivos', 'pasivo', 'dividendos'],
  cashflow: ['disponible', 'pagar', 'mp_liquidar'],
  deuda: ['deuda', 'venta_periodo'],
}

const esMonto = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v))
const err = (error) => ({ ok: false, error })

// Normaliza una línea del informe (agregada al P&L, corrección de una automática, o renglón
// de cash flow / deuda). Devuelve { ok:true, linea } o { ok:false, error }.
export function lineaOk(body) {
  if (!body || typeof body !== 'object') return err('Faltan los datos de la línea.')
  const { id, mes, hoja, seccion } = body
  const local = body.local == null || body.local === '' ? null : body.local
  if (id != null && !(Number.isInteger(id) && id > 0)) return err('La línea no es válida.')
  if (!okMes(mes)) return err('El mes no es válido.')
  if (!HOJAS_LINEA.includes(hoja)) return err('La hoja no es válida.')
  if (hoja === 'pyl') {
    if (local == null) return err('Falta el local.')
    if (typeof local !== 'string' || local.length > 80) return err('El local no es válido.')
  } else if (local !== null) {
    return err('Esta hoja es del cliente, no de un local.')
  }
  if (!SECCIONES_LINEA[hoja].includes(seccion)) return err('La sección no es válida.')

  const corrige = body.corrige == null || body.corrige === '' ? null : body.corrige
  if (corrige !== null && (typeof corrige !== 'string' || corrige.length > 200)) return err('La línea que se corrige no es válida.')

  const concepto = typeof body.concepto === 'string' ? body.concepto.trim() : ''
  if (!corrige && (concepto.length < 1 || concepto.length > 80)) return err('El concepto tiene que tener entre 1 y 80 caracteres.')

  if (!esMonto(body.monto) || !esMonto(body.monto2)) return err('Los montos tienen que ser números.')
  const orden = body.orden == null ? 0 : body.orden
  if (!Number.isInteger(orden)) return err('El orden no es válido.')
  if (body.oculta != null && typeof body.oculta !== 'boolean') return err('El dato "oculta" no es válido.')

  return {
    ok: true,
    linea: {
      ...(id != null ? { id } : {}),
      local, mes, hoja, seccion, concepto, corrige,
      monto: body.monto ?? null,
      monto2: body.monto2 ?? null,
      oculta: body.oculta === true,
      orden,
    },
  }
}
const HOJAS_LINEA = Object.keys(SECCIONES_LINEA)

// Config de hojas: [{ clave, visible, orden }] solo con claves conocidas y sin repetir.
export function hojasOk(v) {
  if (!Array.isArray(v) || v.length > HOJAS_IM.length) return null
  const vistas = new Set()
  const out = []
  for (const h of v) {
    if (!h || !HOJAS_IM.includes(h.clave) || vistas.has(h.clave)) return null
    vistas.add(h.clave)
    out.push({ clave: h.clave, visible: h.visible !== false, orden: Number.isInteger(h.orden) ? h.orden : out.length })
  }
  return out
}

// Indicadores propios por local: { LOCAL: [{ clave, nombre, formato }] }, hasta 8 por local.
export function indicadoresOk(v, locales) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out = {}
  for (const [local, lista] of Object.entries(v)) {
    if (!Array.isArray(locales) || !locales.includes(local)) return null
    if (!Array.isArray(lista) || lista.length > 8) return null
    const claves = new Set()
    out[local] = []
    for (const i of lista) {
      if (!i || typeof i.clave !== 'string' || !/^[a-z0-9_]{1,30}$/.test(i.clave) || claves.has(i.clave)) return null
      const nombre = typeof i.nombre === 'string' ? i.nombre.trim() : ''
      if (nombre.length < 1 || nombre.length > 40) return null
      if (i.formato !== 'numero' && i.formato !== 'pesos') return null
      claves.add(i.clave)
      out[local].push({ clave: i.clave, nombre, formato: i.formato })
    }
  }
  return out
}

// Texto libre del informe. Devuelve el texto limpio, '' para borrar, o null si no vale.
export function textoOk(clave, texto) {
  if (typeof clave !== 'string' || typeof texto !== 'string') return null
  let max
  if (/^resumen:.+/.test(clave) && clave.length <= 60) max = 400
  else if (clave === 'cashflow:elaborado' || clave === 'cashflow:proyectado' || clave === 'deuda:fecha') max = clave === 'deuda:fecha' ? 40 : 400
  else return null
  const t = texto.trim()
  return t.length > max ? null : t
}

// Datos cargados a mano en rv_valor que usa el informe: pax, días e indicadores propios.
export function datoIm(d) {
  if (d === 'pax' || d === 'dias') return d
  return typeof d === 'string' && /^ind:[a-z0-9_]{1,30}$/.test(d) ? d : null
}

// Rango que lee el informe: desde enero del año anterior hasta el último día de `mes` (YYYY-MM).
export function rangoInforme(mes) {
  const [y, m] = mes.split('-').map(Number)
  return { desde: `${y - 1}-01-01`, hasta: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
}
