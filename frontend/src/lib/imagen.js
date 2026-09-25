// Achica una imagen en el navegador antes de subirla: el logo y la foto del
// local viajan como data URL y no tiene sentido guardar una foto de 6 MB.
// El logo conserva la transparencia (PNG); la foto va en WEBP.
export async function comprimirImagen(file, { maxLado = 1600, tipo = 'image/webp', calidad = 0.82 } = {}) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  if (file.type === 'image/svg+xml') return leerComoDataUrl(file)
  const url = await leerComoDataUrl(file)
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    i.src = url
  })
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * escala)
  canvas.height = Math.round(img.height * escala)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL(tipo, calidad)
}

function leerComoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    r.readAsDataURL(file)
  })
}
