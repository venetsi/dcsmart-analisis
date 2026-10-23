// Logo que cada local tiene cargado en gestión (locales.logo_url, un gs://), listo
// para usar como imagen: { [local]: 'data:image/png;base64,...' }. Es el logo por
// defecto del Reporte de Ventas; el que se sube en Configurar lo reemplaza.
//
// Nada de esto puede romper el reporte: sin acceso a gestión o al bucket, o con un
// archivo que no sirve, el local simplemente queda sin logo.

const TIPOS = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
const MAX_BYTES = 1024 * 1024
const MAX_CACHE = 200

export function parseGs (gs) {
  if (typeof gs !== 'string' || !gs.startsWith('gs://')) return null
  const resto = gs.slice('gs://'.length)
  const corte = resto.indexOf('/')
  if (corte <= 0 || corte === resto.length - 1) return null
  return { bucket: resto.slice(0, corte), archivo: resto.slice(corte + 1) }
}

export function tipoDe (archivo) {
  return TIPOS[String(archivo).split('.').pop().toLowerCase()] || null
}

// `consultar(grupo, locales)` devuelve [{ nombre, logo_url }]; `descargar({ bucket, archivo })`
// devuelve un Buffer. El nombre de cada archivo en el bucket es único (lleva la hora de
// subida), así que lo descargado se guarda por URL sin vencimiento.
export function crearLogosLocales ({ consultar, descargar, log = { warn () {} } }) {
  const cache = new Map() // gs:// → Promise<data URL | null>

  const dataUrl = (gs) => {
    if (!cache.has(gs)) {
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
      const p = (async () => {
        const g = parseGs(gs)
        const tipo = g && tipoDe(g.archivo)
        if (!tipo) return null
        const buf = await descargar(g)
        if (!buf?.length || buf.length > MAX_BYTES) return null
        return `data:${tipo};base64,${buf.toString('base64')}`
      })().catch((err) => {
        cache.delete(gs) // que un fallo de red no quede guardado
        log.warn({ err, logo: gs }, 'reporte-ventas: no se pudo leer el logo del local')
        return null
      })
      cache.set(gs, p)
    }
    return cache.get(gs)
  }

  return async function logosDe (grupo, locales) {
    if (!grupo || !locales?.length) return {}
    let filas
    try { filas = await consultar(grupo, locales) } catch (err) {
      log.warn({ err }, 'reporte-ventas: sin acceso a los logos de gestión')
      return {}
    }
    const out = {}
    await Promise.all(filas.filter((f) => f.logo_url).map(async (f) => {
      const url = await dataUrl(f.logo_url)
      if (url) out[f.nombre] = url
    }))
    return out
  }
}
