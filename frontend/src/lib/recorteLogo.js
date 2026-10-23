// Recorta los márgenes vacíos de un logo (transparentes o blancos) para que en la
// portada se vea del tamaño del dibujo y no del lienzo: hay logos de 800×800 con el
// dibujo ocupando una franja de 424×112 en el medio.

const CLARO = 245 // de acá para arriba, en los tres canales, cuenta como fondo blanco
const OPACO = 16 // alfa mínimo para que un píxel cuente como dibujo

// Caja del dibujo dentro de un RGBA (Uint8ClampedArray de ancho×alto×4):
// { x, y, w, h }, o null si no hay nada que no sea fondo.
export function cajaDelDibujo (rgba, ancho, alto) {
  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      if (rgba[i + 3] < OPACO) continue
      if (rgba[i] >= CLARO && rgba[i + 1] >= CLARO && rgba[i + 2] >= CLARO) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

const LADO_MAX = 1200
const cache = new Map() // src → Promise<src recortado>

// Devuelve un data URL PNG con el logo recortado. Si no se puede (imagen rota, todo
// blanco, casi sin margen), devuelve el src original.
export function recortarLogo (src) {
  if (!src) return Promise.resolve(src)
  if (!cache.has(src)) {
    cache.set(src, new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        try {
          const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
          const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k))
          const lienzo = document.createElement('canvas')
          lienzo.width = w; lienzo.height = h
          const ctx = lienzo.getContext('2d')
          ctx.drawImage(img, 0, 0, w, h)
          const caja = cajaDelDibujo(ctx.getImageData(0, 0, w, h).data, w, h)
          // Sin dibujo (un logo blanco sobre transparente) o casi sin margen: se deja como está.
          if (!caja || caja.w * caja.h > 0.9 * w * h) return resolve(src)
          const borde = Math.round(Math.max(caja.w, caja.h) * 0.04)
          const x = Math.max(0, caja.x - borde), y = Math.max(0, caja.y - borde)
          const cw = Math.min(w, caja.x + caja.w + borde) - x, ch = Math.min(h, caja.y + caja.h + borde) - y
          const salida = document.createElement('canvas')
          salida.width = cw; salida.height = ch
          salida.getContext('2d').drawImage(lienzo, x, y, cw, ch, 0, 0, cw, ch)
          resolve(salida.toDataURL('image/png'))
        } catch {
          resolve(src)
        }
      }
      img.onerror = () => resolve(src)
      img.src = src
    }))
  }
  return cache.get(src)
}
