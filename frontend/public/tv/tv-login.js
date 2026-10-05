// Sesión de la TV: login con Google contra /api/tv/login y token guardado en
// este navegador (30 días). Quién puede entrar lo decide el backend: ver
// backend/src/lib/tvAcceso.js.
//
// API para app.js:
//   tvSesion.token()          el token vigente o null
//   tvSesion.pedirLogin(msg)  tapa el dashboard con el botón (y el motivo, si hay)
//   tvSesion.alEntrar(fn)     qué correr cuando la persona entra
window.tvSesion = (function () {
  const CLAVE = 'dcsmart_tv_sesion'
  let alEntrarFn = () => {}
  let botonListo = false

  function leer () {
    try { return JSON.parse(localStorage.getItem(CLAVE) || 'null') } catch { return null }
  }
  function guardar (s) {
    try { s ? localStorage.setItem(CLAVE, JSON.stringify(s)) : localStorage.removeItem(CLAVE) } catch {}
  }

  // El vencimiento viaja en el propio token: si ya pasó, ni se intenta.
  function token () {
    const s = leer()
    if (!s?.token) return null
    try {
      const exp = JSON.parse(atob(s.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp
      if (exp && exp * 1000 < Date.now()) { guardar(null); return null }
    } catch { return null }
    return s.token
  }

  function mostrarError (msg) {
    document.getElementById('tvLoginError').textContent = msg || ''
  }

  async function alResponderGoogle (resp) {
    mostrarError('')
    try {
      const res = await fetch('/api/tv/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: resp.credential })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.token) {
        mostrarError(body.error || 'No se pudo entrar. Probá de nuevo en un rato.')
        return
      }
      guardar({ token: body.token, email: body.email })
      document.getElementById('tvLogin').hidden = true
      alEntrarFn()
    } catch {
      mostrarError('Sin conexión con el servidor. Revisá la red de la TV y probá de nuevo.')
    }
  }

  // El script de Google carga async: se reintenta hasta que esté.
  async function prepararBoton () {
    if (botonListo) return
    if (!window.google?.accounts?.id) { setTimeout(prepararBoton, 300); return }
    try {
      const { google_client_id: clientId } = await (await fetch('/api/tv/config')).json()
      if (!clientId) { mostrarError('El login con Google no está configurado en el servidor.'); return }
      google.accounts.id.initialize({ client_id: clientId, callback: alResponderGoogle })
      google.accounts.id.renderButton(document.getElementById('tvGoogleBtn'), {
        theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'es'
      })
      botonListo = true
    } catch {
      mostrarError('Sin conexión con el servidor. La página reintenta sola.')
      setTimeout(prepararBoton, 15000)
    }
  }

  function pedirLogin (msg) {
    guardar(null)
    document.getElementById('tvLogin').hidden = false
    mostrarError(msg)
    prepararBoton()
  }

  return { token, pedirLogin, alEntrar: (fn) => { alEntrarFn = fn } }
})()
