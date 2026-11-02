// Parser JSON que acepta un cuerpo vacío.
//
// Fastify responde 400 "Bad Request" (FST_ERR_CTP_EMPTY_JSON_BODY) a cualquier pedido con
// Content-Type: application/json y sin cuerpo, antes de llegar a la ruta. El front lo
// mandaba en los DELETE ("Borrar la línea" / "Volver al de gestión" del Informe Mensual,
// tarjeta #296). Un cuerpo vacío queda como `undefined`; todo lo demás pasa por el parser
// de Fastify de siempre (JSON roto = 400, __proto__ / constructor bloqueados).
export function aceptarJsonVacio (app) {
  const porDefecto = app.getDefaultJsonParser('error', 'error')
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (body.length === 0) return done(null, undefined)
    porDefecto(req, body, done)
  })
}
