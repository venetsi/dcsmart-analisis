// Catálogo de reglas (título y explicación que salen en el mail) y la forma
// común de un hallazgo:
//   { regla, severidad, local, grupo, referencia, ref_id, fecha, valor,
//     esperado, cantidad, detalle }
// `fecha` es 'AAAA-MM-DD' o null; `valor` y `esperado` son números o null.

// El orden de este objeto es el orden de las secciones del mail dentro de
// cada severidad. `unidad` dice cómo se muestran valor y esperado.
export const REGLAS = {
  pago_factura_repetida: {
    titulo: 'Facturas cargadas dos veces',
    explicacion: 'La misma factura (proveedor, tipo, punto de venta, número e importe) está en dos pagos del grupo.',
    unidad: 'pesos',
  },
  caja_repetida: {
    titulo: 'Ventas cargadas dos veces',
    explicacion: 'Cajas del mismo local y día con el mismo total al peso. Suele ser una caja manual cargada además de la de Fudo o TapTap.',
    unidad: 'pesos',
  },
  pago_importe_no_positivo: {
    titulo: 'Pagos con importe en 0 o negativo',
    explicacion: 'Pagos cargados en la quincena con importe en 0, negativo o vacío, por local.',
    unidad: 'pesos',
  },
  caja_fecha_fuera_de_rango: {
    titulo: 'Cajas con fecha imposible',
    explicacion: 'Cajas con fecha anterior a 2025 o de más de 2 días después de cuando se cargaron (sin contar eventos).',
    unidad: 'pesos',
  },
  caja_dia_sin_caja: {
    titulo: 'Días sin caja',
    explicacion: 'Días en que el local no tiene ninguna caja, aunque abrió ese mismo día de la semana en al menos 7 de las 8 semanas anteriores.',
    unidad: null,
  },
  pago_mismo_importe_mismo_dia: {
    titulo: 'Posibles pagos repetidos',
    explicacion: 'Mismo local, proveedor, importe y fecha, sin número de factura que los distinga. Una línea por local y proveedor.',
    unidad: 'pesos',
  },
  pago_fecha_fuera_de_rango: {
    titulo: 'Pagos con fecha imposible',
    explicacion: 'Pagos con fecha anterior a 2025 o de más de 7 días después de cuando se cargaron.',
    unidad: 'pesos',
  },
  pago_datos_faltantes: {
    titulo: 'Pagos con datos faltantes',
    explicacion: 'Cantidad de pagos de la quincena sin rubro, sin proveedor o pagados sin fecha de pago, por local.',
    unidad: 'pesos',
  },
  caja_cierre_antes_del_inicio: {
    titulo: 'Cajas que cierran antes de abrir',
    explicacion: 'La hora de cierre es más de 5 minutos anterior a la de apertura.',
    unidad: 'pesos',
  },
  caja_sin_tickets: {
    titulo: 'Cajas sin tickets o comensales',
    explicacion: 'Cajas con venta pero sin tickets o comensales, en locales que casi siempre los informan. Una línea por local.',
    unidad: 'pesos',
  },
  venta_fuera_de_lo_normal: {
    titulo: 'Ventas fuera de lo normal',
    explicacion: 'Venta del día de al menos el doble, o del 40 % o menos, que el mismo día de la semana en las 12 semanas anteriores. "Habitual" es la mediana. Un feriado puede aparecer acá.',
    unidad: 'pesos',
  },
  egreso_fuera_de_lo_normal: {
    titulo: 'Gastos fuera de lo normal',
    explicacion: 'Gasto de la quincena por local y rubro de al menos el doble que la misma quincena de los 8 meses anteriores (y $1.000.000 más). "Habitual" es la mediana.',
    unidad: 'pesos',
  },
  venta_dia_atipico_general: {
    titulo: 'Días atípicos en muchos locales',
    explicacion: 'El mismo día muchos locales vendieron mucho más o mucho menos que lo habitual: suele ser un feriado o un evento general, no un error.',
    unidad: null,
  },
  pago_carga_masiva_fechas_viejas: {
    titulo: 'Cargas masivas de pagos con fechas imposibles',
    explicacion: '20 o más pagos con fecha imposible cargados el mismo día en un local: suele ser una migración.',
    unidad: 'pesos',
  },
  caja_carga_masiva_fechas_viejas: {
    titulo: 'Cargas masivas de cajas con fechas imposibles',
    explicacion: '20 o más cajas con fecha imposible cargadas el mismo día en un local: suele ser una migración.',
    unidad: 'pesos',
  },
  carga_masiva_datos_viejos: {
    titulo: 'Cargas masivas de datos viejos',
    explicacion: 'Días con muchas más cargas que lo habitual en el grupo, casi todas con fecha de hace más de 60 días: suele ser una migración.',
    unidad: 'cantidad',
  },
  pico_de_cargas: {
    titulo: 'Picos de carga',
    explicacion: 'Días con 40 cargas o más y al menos 4 veces lo habitual en el grupo (pagos o cajas).',
    unidad: 'cantidad',
  },
}

const SEVERIDADES = ['alta', 'media', 'baja']
const ORDEN_REGLA = Object.fromEntries(Object.keys(REGLAS).map((k, i) => [k, i]))

// BigQuery devuelve DATE como { value: 'AAAA-MM-DD' } y NUMERIC/INT64 como
// objetos o textos según el tipo: se pasa todo a valores planos.
function plano (v) {
  if (v == null) return null
  if (typeof v === 'object' && 'value' in v) return v.value
  return v
}
function numero (v) {
  const p = plano(v)
  return p == null ? null : Number(p)
}

export function normalizar (fila) {
  return {
    regla: fila.regla,
    severidad: fila.severidad,
    local: fila.local ?? null,
    grupo: fila.grupo ?? null,
    referencia: fila.referencia ?? null,
    ref_id: fila.ref_id ?? null,
    fecha: plano(fila.fecha),
    valor: numero(fila.valor),
    esperado: numero(fila.esperado),
    cantidad: numero(fila.cantidad) ?? 1,
    detalle: fila.detalle ?? null,
  }
}

// Ordena por severidad, después por regla (orden del catálogo), grupo, local y fecha.
export function ordenar (hallazgos) {
  const txt = (s) => s ?? ''
  return [...hallazgos].sort((a, b) =>
    SEVERIDADES.indexOf(a.severidad) - SEVERIDADES.indexOf(b.severidad) ||
    (ORDEN_REGLA[a.regla] ?? 99) - (ORDEN_REGLA[b.regla] ?? 99) ||
    txt(a.grupo).localeCompare(txt(b.grupo)) ||
    txt(a.local).localeCompare(txt(b.local)) ||
    txt(a.fecha).localeCompare(txt(b.fecha)))
}

// Conteo por severidad y por regla, para el resumen del mail y el backtest.
export function resumir (hallazgos) {
  const porSeveridad = { alta: 0, media: 0, baja: 0 }
  const porRegla = {}
  for (const h of hallazgos) {
    porSeveridad[h.severidad] = (porSeveridad[h.severidad] ?? 0) + 1
    porRegla[h.regla] = (porRegla[h.regla] ?? 0) + 1
  }
  return { total: hallazgos.length, porSeveridad, porRegla }
}
