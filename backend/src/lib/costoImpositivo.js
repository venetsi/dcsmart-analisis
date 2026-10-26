// Costo impositivo del mes por local: IVA a pagar, IIBB a pagar e impuestos
// internos. Las fórmulas son las que definió el usuario el 26/10/2026 (a
// partir del boceto del jefe) y se validaron contra Loreto, Togni's Pizza y
// Gran Latino de septiembre 2026:
//
//   IVA débito   = IVA de las facturas de INGRESO + (Z − Z / 1,21)
//                  + percepciones de IVA de los ingresos
//   IVA crédito  = IVA de las facturas de EGRESO + percepciones de IVA de los egresos
//   IVA AP       = débito − crédito
//
//   IIBB débito  = (Z / 1,21 + NETO de las facturas de ingreso) × alícuota del local
//                  + percepciones de IIBB de los ingresos
//   IIBB crédito = percepciones de IIBB de los egresos (el neto de las compras NO entra)
//   IIBB AP      = débito − crédito
//
//   Internos     = impuestos internos de las facturas (ingresos y egresos)
//
// Z = venta fiscal de las cajas (el "total Z" de gestión). Del IVA de las
// facturas se usa el que tiene cargado cada una (21 / 10,5 / 27), nunca el neto.
// Las cargas que no dicen de qué impuesto son (el tipo viejo "Percepción" y
// "Retención") no entran en ninguna cuenta: se informan aparte para corregirlas.

// Comprobantes que cuentan (los mismos para ingresos y egresos).
export const TIPOS = ['A', 'NCA', 'NDA', 'C', 'M', 'NCC', 'NDC']

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

// Alícuota en %, entre 0 y 20 (null = sin cargar).
export function alicuotaOk (v) {
  if (v === null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 && x <= 20 ? Math.round(x * 1000) / 1000 : undefined
}

const lado = (f = {}) => ({
  neto: n(f.neto), iva: n(f.iva), percIva: n(f.percIva), percIibb: n(f.percIibb),
  internos: n(f.internos), percVieja: n(f.percVieja), retencion: n(f.retencion), facturas: n(f.facturas)
})

// Un local: z (venta fiscal), ingresos y egresos con lo que traen sus facturas,
// y la alícuota de IIBB en % (null si no está cargada).
export function calcularLocal ({ z, ingresos, egresos, alicuota }) {
  const Z = n(z)
  const ing = lado(ingresos)
  const egr = lado(egresos)
  const netoZ = Z / 1.21
  const ivaZ = Z - netoZ

  const ivaDebito = ing.iva + ivaZ + ing.percIva
  const ivaCredito = egr.iva + egr.percIva

  const base = netoZ + ing.neto
  const tieneAlicuota = alicuota !== null && alicuota !== undefined
  const iibbDebito = tieneAlicuota ? base * (n(alicuota) / 100) + ing.percIibb : null
  const iibbCredito = egr.percIibb

  return {
    z: Z,
    iva: {
      debito: { facturas: ing.iva, cajas: ivaZ, percepciones: ing.percIva, total: ivaDebito },
      credito: { facturas: egr.iva, percepciones: egr.percIva, total: ivaCredito },
      ap: ivaDebito - ivaCredito
    },
    iibb: {
      alicuota: tieneAlicuota ? n(alicuota) : null,
      base: { cajas: netoZ, facturas: ing.neto, total: base },
      debito: tieneAlicuota ? { base: base * (n(alicuota) / 100), percepciones: ing.percIibb, total: iibbDebito } : null,
      credito: { percepciones: egr.percIibb, total: iibbCredito },
      ap: tieneAlicuota ? iibbDebito - iibbCredito : null
    },
    internos: ing.internos + egr.internos,
    facturas: ing.facturas + egr.facturas,
    // Cargado sin decir de qué impuesto es: no entra en ninguna cuenta.
    aRevisar: { percVieja: ing.percVieja + egr.percVieja, retencion: ing.retencion + egr.retencion }
  }
}

// Suma de los locales incluidos. El IIBB suma solo los que tienen alícuota y
// avisa cuántos quedaron sin ella.
export function totalizar (locales) {
  const inc = locales.filter((l) => l.incluir !== false)
  const s = (f) => inc.reduce((a, l) => a + f(l), 0)
  const conAlic = inc.filter((l) => l.calculo.iibb.ap !== null)
  return {
    iva: {
      debito: s((l) => l.calculo.iva.debito.total),
      credito: s((l) => l.calculo.iva.credito.total),
      ap: s((l) => l.calculo.iva.ap)
    },
    iibb: {
      debito: conAlic.reduce((a, l) => a + l.calculo.iibb.debito.total, 0),
      credito: conAlic.reduce((a, l) => a + l.calculo.iibb.credito.total, 0),
      ap: conAlic.reduce((a, l) => a + l.calculo.iibb.ap, 0),
      sinAlicuota: inc.filter((l) => l.calculo.iibb.ap === null).map((l) => l.nombre)
    },
    internos: s((l) => l.calculo.internos),
    aRevisar: {
      percVieja: s((l) => l.calculo.aRevisar.percVieja),
      retencion: s((l) => l.calculo.aRevisar.retencion)
    },
    locales: inc.length
  }
}
