// Quién puede ver el dashboard de la TV de oficina ("Rendimiento General").
//
// Antes la página era pública y leía los datos con una clave de servicio escrita
// en el propio HTML: cualquiera con el link veía el dashboard y podía sacar la
// clave. Ahora se entra con Google y pasa si:
//   - el mail está en TV_EMAILS (variable de entorno, separados por coma o ;),
//     aunque no sea usuario de gestión; o
//   - es un usuario ACTIVO de gestión con rol super_admin.
//
// La regla se vuelve a evaluar en cada pedido de datos, no solo al entrar: sacar
// un mail de la lista o el rol a alguien corta el acceso en el próximo refresco
// de la TV, sin esperar a que venza la sesión.

export function listaDeMails (texto) {
  return new Set(
    String(texto ?? '')
      .split(/[;,\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.includes('@'))
  )
}

// `usuario`: { activo, roles: string[] } de gestión, o null si el mail no existe ahí.
export function puedeVerTv (email, lista, usuario) {
  const mail = String(email ?? '').trim().toLowerCase()
  if (!mail) return false
  if (lista.has(mail)) return true
  return Boolean(usuario?.activo) && (usuario.roles ?? []).includes('super_admin')
}
