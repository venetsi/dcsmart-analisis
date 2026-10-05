/* Dashboard TV · DC-Smart — mismo contenido que dcsmart-rendimiento.web.app,
   con el diseño nuevo. Los cálculos de cada sección copian los de la página
   actual (renderKPIs, renderScatter, renderTop*); lo que cambia es cómo se ve.
   Los datos salen de /api/tv/resumen con la sesión de la TV (tv-login.js);
   tv-config.js dice dónde está la API según el sitio. */

const CONFIG = {
  FUENTE: window.TV_API_BASE + '/api/tv/resumen',
  REFRESCO_MS: 60 * 60 * 1000,
  REINTENTO_MS: 5 * 60 * 1000,
  CACHE: 'dcsmart_rendimiento_general_cache',
  CLIMA_KEY: 'AIzaSyDZcZnu3KNpXEECJ70GmjyRilxmqjGCISs', // restringida a localhost y al sitio de la TV
  CLIMA_LAT: -34.6037, CLIMA_LON: -58.3816,
  UMBRAL_MIN_PCT_AUDITADO: 5,   // igual que la página actual
};

const MOVIMIENTO = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const dur = (ms) => (MOVIMIENTO ? ms : 0);

const loc = d3.formatLocale({ decimal: ',', thousands: '.', grouping: [3], currency: ['$', ''] });
const fEntero = loc.format(',.0f');
const fUno = loc.format(',.1f');
const fMil = (n) => loc.format(',.1~f')((n || 0) / 1000);   // en miles; la unidad va aparte
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);   // entero, como la actual

// Estado de auditoría, mismos cortes que la página actual (80 / 60).
const estado = (p) => (p >= 80 ? 'bien' : p >= 60 ? 'aviso' : 'mal');
const COLOR = {
  ops: '#b8893a', opsClaro: '#e3c891', opsHondo: '#8f6a2c',
  cajas: '#2ba3ad', cajasClaro: '#6fd6de', cajasHondo: '#1b6f77',
  bien: '#6fd39e', aviso: '#f2c14e', mal: '#f08a8a',
};

/* ── Escala: lienzo de 1920×1080 que ocupa cualquier pantalla ──────── */
function escalar() {
  const tv = document.getElementById('tv');
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  tv.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px, ${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', escalar);
escalar();

/* ── Reloj ─────────────────────────────────────────────────────────── */
function reloj() {
  const a = new Date();
  const p = (n) => String(n).padStart(2, '0');
  document.getElementById('hora').innerHTML = `${p(a.getHours())}:${p(a.getMinutes())}<span class="seg">:${p(a.getSeconds())}</span>`;
  const f = a.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
}
setInterval(reloj, 1000);
reloj();

/* ── Clima, próximas 3 horas (si falla, el resto sigue) ────────────── */
async function clima() {
  try {
    const url = 'https://weather.googleapis.com/v1/forecast/hours:lookup'
      + `?key=${CONFIG.CLIMA_KEY}&location.latitude=${CONFIG.CLIMA_LAT}&location.longitude=${CONFIG.CLIMA_LON}`
      + '&hours=3&languageCode=es';
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const horas = ((await r.json()).forecastHours || []).slice(0, 3);
    document.getElementById('clima').innerHTML = horas.map((h) => {
      const ic = h.weatherCondition?.iconBaseUri ? `${h.weatherCondition.iconBaseUri}_dark.svg` : '';
      const t = Math.round(h.temperature?.degrees ?? NaN);
      return `<div class="clima-h">${ic ? `<img src="${ic}" alt="${h.weatherCondition?.description?.text || ''}">` : ''}
        <b>${Number.isFinite(t) ? t + '°' : '—'}</b><span>${String(h.displayDateTime.hours).padStart(2, '0')} h</span></div>`;
    }).join('');
  } catch (e) { console.warn('[tv] clima', e); }
}
clima();
setInterval(clima, 30 * 60 * 1000);

/* ── Utilidades ────────────────────────────────────────────────────── */
function contar(el, hasta, fmt, ms = 1300, retraso = 0) {
  const desde = Number(el.dataset.v ?? 0);
  el.dataset.v = hasta;
  d3.select(el).transition().delay(dur(retraso)).duration(dur(ms)).ease(d3.easeCubicOut)
    .tween('text', () => { const i = d3.interpolateNumber(desde, hasta); return (t) => { el.textContent = fmt(i(t)); }; });
}
function nombresConY(n) {
  if (n.length <= 1) return n[0] || '';
  return n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
}
// Variación porcentual contra el período anterior, como la página actual.
// `subirEsBueno` decide el color; la flecha sigue el sentido real del cambio.
function tendencia(actual, anterior, subirEsBueno) {
  if (anterior == null || !(anterior > 0) || actual == null) return 'Sin dato del período anterior';
  const d = actual - anterior;
  if (d === 0) return 'Igual que los 30 días anteriores';
  const p = Math.round(Math.abs(d / anterior) * 100);
  const bueno = subirEsBueno ? d > 0 : d < 0;
  return `<span class="trend ${bueno ? 'bien' : 'mal'}">${d > 0 ? '▲' : '▼'} ${fEntero(p)}%</span> vs. los 30 días anteriores`;
}

/* ── Indicadores ───────────────────────────────────────────────────── */
function indicadores(t) {
  document.querySelectorAll('.kpi-valor, .kpi-valor-m, .med-pct').forEach((el, i) => el.style.setProperty('--od', `${(i * 1.6).toFixed(1)}s`));
  contar(document.getElementById('kLocales'), t.locales_activos, fEntero, 1200, 100);
  contar(document.getElementById('kOps'), t.ops, fMil, 1300, 160);
  contar(document.getElementById('kCajas'), t.cajas, fMil, 1300, 200);

  const dias = document.getElementById('kDias');
  if (t.dias_hasta_auditar != null) contar(dias, t.dias_hasta_auditar, (v) => fUno(v) + ' d', 1300, 240);
  else dias.textContent = '—';
  document.getElementById('kDiasTrend').innerHTML = tendencia(t.dias_hasta_auditar, t.dias_hasta_auditar_semana_anterior, false);

  contar(document.getElementById('kPagos'), t.pagos_7d, fEntero, 1300, 420);
  document.getElementById('kPagosProm').textContent = `${fUno(t.pagos_promedio_dia)} por día en promedio`;

  contar(document.getElementById('kHorasIa'), t.horas_ahorradas_ia, (v) => fUno(v) + ' h', 1300, 480);
  document.getElementById('kIaAdopcion').textContent = `${fUno(t.pct_adopcion_ia)}% de adopción, ${fEntero(t.pagos_ia_30d)} facturas`;
  document.getElementById('kIaTrend').innerHTML = tendencia(t.pct_adopcion_ia, t.pct_adopcion_ia_anterior, true);
}

/* ── Medidores de auditoría ────────────────────────────────────────── */
const ARCO = { ini: -Math.PI * 0.75, fin: Math.PI * 0.75 };
function medidor(id, titulo, serie, aud, total, retraso) {
  const cont = document.getElementById(id);
  const c = serie === 'ops' ? [COLOR.opsHondo, COLOR.opsClaro] : [COLOR.cajasHondo, COLOR.cajasClaro];
  if (!cont.dataset.armado) {
    cont.innerHTML = `
      <div class="med-anillo">
        <svg width="124" height="124" viewBox="-70 -70 140 140" role="img" aria-label="${titulo}">
          <defs>
            <linearGradient id="${id}-g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient>
            <linearGradient id="${id}-luz" gradientUnits="userSpaceOnUse" x1="-90" y1="0" x2="-30" y2="0">
              <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
              ${MOVIMIENTO ? `<animateTransform attributeName="gradientTransform" type="translate" values="-20 0; 180 0; 180 0" keyTimes="0; .35; 1" dur="7s" begin="${serie === 'ops' ? 2 : 5.5}s" repeatCount="indefinite"/>` : ''}
            </linearGradient>
          </defs>
          <g class="marcas"></g>
          <path class="pista"></path><path class="arco"></path><path class="arco-luz"></path>
        </svg>
        <div class="med-centro"><div class="med-pct oro-texto"><span class="num"></span><small>%</small></div></div>
      </div>
      <div class="med-texto">
        <div class="med-titulo"><i class="pt ${serie}"></i>${titulo}</div>
        <div class="med-detalle"></div>
      </div>`;
    cont.dataset.armado = '1';
    const ang = d3.scaleLinear().domain([0, 100]).range([ARCO.ini, ARCO.fin]);
    d3.select(cont).select('.marcas').selectAll('line').data(d3.range(0, 101, 10)).join('line')
      .attr('x1', (d) => Math.sin(ang(d)) * 68).attr('y1', (d) => -Math.cos(ang(d)) * 68)
      .attr('x2', (d) => Math.sin(ang(d)) * (d % 50 ? 71 : 74)).attr('y2', (d) => -Math.cos(ang(d)) * (d % 50 ? 71 : 74))
      .attr('stroke', 'rgba(255,255,255,.18)').attr('stroke-width', 1.25).attr('stroke-linecap', 'round');
  }
  const arc = d3.arc().innerRadius(53).outerRadius(64).cornerRadius(5.5).startAngle(ARCO.ini);
  const p = pct(aud, total);
  d3.select(cont).select('.pista').attr('d', arc({ endAngle: ARCO.fin })).attr('fill', 'rgba(255,255,255,.07)');
  const a = d3.select(cont).select('.arco').attr('fill', `url(#${id}-g)`);
  const luz = d3.select(cont).select('.arco-luz').attr('fill', `url(#${id}-luz)`).attr('opacity', MOVIMIENTO ? 0.6 : 0);
  const prev = Number(a.attr('data-p') ?? 0);
  a.attr('data-p', p).transition().delay(dur(retraso)).duration(dur(1500)).ease(d3.easeCubicInOut)
    .attrTween('d', () => {
      const i = d3.interpolateNumber(prev, p);
      return (t) => { const d = arc({ endAngle: ARCO.ini + (ARCO.fin - ARCO.ini) * i(t) / 100 }); luz.attr('d', d); return d; };
    });
  if (!MOVIMIENTO) luz.attr('d', arc({ endAngle: ARCO.ini + (ARCO.fin - ARCO.ini) * p / 100 }));
  contar(cont.querySelector('.num'), p, fEntero, 1500, retraso);
  cont.querySelector('.med-detalle').innerHTML = `<b>${fEntero(aud)}</b><br>de ${fEntero(total)}`;
}

/* ── Ops / cajas por local: burbujas ───────────────────────────────── */
// Sigla de 2 caracteres, como la página actual.
function sigla2(nombre) {
  const partes = String(nombre || '').trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return ((partes[0] || '').slice(0, 2) || '??').toUpperCase();
}
function burbujas(id, rows, volCampo, audCampo, totalVol) {
  const cont = document.getElementById(id);
  const w = cont.clientWidth, h = cont.clientHeight;
  let svg = d3.select(cont).select('svg');
  if (svg.empty()) svg = d3.select(cont).append('svg');

  // mismo recorte que la actual: con volumen, ≥5 % auditado, los 20 peores
  const puntos = rows.filter((r) => r[volCampo] > 0)
    .map((r) => ({ ...r, p: pct(r[audCampo], r[volCampo]) }))
    .filter((r) => r.p >= CONFIG.UMBRAL_MIN_PCT_AUDITADO)
    .sort((a, b) => a.p - b.p).slice(0, 20);
  if (!puntos.length) { svg.selectAll('*').remove(); return; }

  const m = { t: 14, r: 18, b: 38, l: 52 };
  const maxVol = d3.max(puntos, (d) => d[volCampo]);
  const maxX = Math.max(1, Math.ceil(d3.max(puntos, (d) => d[volCampo] / totalVol * 100) * 1.15));
  const x = d3.scaleLinear().domain([0, maxX]).range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain([0, 100]).range([h - m.b, m.t]);
  const r = d3.scaleSqrt().domain([0, maxVol]).range([7, 22]);

  // grilla
  svg.selectAll('g.gx').data([0]).join('g').attr('class', 'eje gx').attr('transform', `translate(0,${h - m.b})`)
    .call(d3.axisBottom(x).ticks(Math.min(maxX, 6)).tickFormat((v) => v + '%').tickSize(-(h - m.t - m.b)).tickSizeOuter(0))
    .call((g) => g.select('.domain').remove()).call((g) => g.selectAll('text').attr('dy', '1.1em'));
  svg.selectAll('g.gy').data([0]).join('g').attr('class', 'eje gy').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).tickValues([0, 20, 40, 60, 80, 100]).tickFormat((v) => v + '%').tickSize(-(w - m.l - m.r)).tickSizeOuter(0))
    .call((g) => g.select('.domain').remove()).call((g) => g.selectAll('text').attr('dx', '-4'));
  svg.selectAll('text.eje-titulo').data([
    { t: '% del total', x: (m.l + w - m.r) / 2, y: h - 4, rot: 0 },
    { t: '% auditado', x: -(m.t + h - m.b) / 2, y: 13, rot: -90 },
  ]).join('text').attr('class', 'eje-titulo').attr('text-anchor', 'middle')
    .attr('transform', (d) => (d.rot ? `rotate(${d.rot})` : null)).attr('x', (d) => d.x).attr('y', (d) => d.y).text((d) => d.t);

  // Las burbujas se acomodan para no taparse: cada una tira hacia su posición
  // real y choca con las vecinas (en la actual esto era un "declutter" a mano).
  const nodos = puntos.map((d) => ({ ...d, tx: x(d[volCampo] / totalVol * 100), ty: y(d.p), rr: r(d[volCampo]) }));
  nodos.forEach((n) => { n.x = n.tx; n.y = n.ty; });
  const sim = d3.forceSimulation(nodos)
    .force('x', d3.forceX((d) => d.tx).strength(0.9))
    .force('y', d3.forceY((d) => d.ty).strength(0.9))
    .force('c', d3.forceCollide((d) => d.rr + 1.5).iterations(3)).stop();
  for (let i = 0; i < 160; i++) sim.tick();
  nodos.forEach((n) => {
    n.x = Math.max(m.l + n.rr, Math.min(w - m.r - n.rr, n.x));
    n.y = Math.max(m.t + n.rr, Math.min(h - m.b - n.rr, n.y));
  });

  const g = svg.selectAll('g.burbuja').data(nodos, (d) => d.nombre).join((e) => {
    const b = e.append('g').attr('class', 'burbuja').attr('transform', (d) => `translate(${d.x},${d.y}) scale(0)`);
    const f = b.append('g').attr('class', 'flota')
      .style('--fd', () => `${(5.5 + Math.random() * 4).toFixed(2)}s`)
      .style('--fdl', () => `-${(Math.random() * 8).toFixed(2)}s`);
    f.append('circle').attr('class', 'pulso').style('--pd', () => `-${(Math.random() * 3.2).toFixed(2)}s`);
    f.append('circle').attr('class', 'b-fondo');
    f.append('text').attr('class', 'sigla').attr('text-anchor', 'middle').attr('dy', '0.35em');
    b.append('title');
    return b;
  });
  g.select('.b-fondo').attr('r', (d) => d.rr).attr('fill', (d) => COLOR[estado(d.p)]).attr('fill-opacity', 0.82)
    .attr('stroke', '#0f151e').attr('stroke-width', 2);
  g.select('.pulso').attr('r', (d) => d.rr).style('display', (d) => (estado(d.p) === 'mal' && MOVIMIENTO ? null : 'none'));
  g.select('.sigla').text((d) => sigla2(d.nombre)).style('font-size', (d) => `${Math.max(9, Math.min(13, d.rr * 0.75))}px`);
  g.select('title').text((d) => `${d.nombre}: ${fEntero(d[audCampo])} de ${fEntero(d[volCampo])} auditadas (${d.p}%)`);
  g.transition().delay((d, i) => dur(500 + i * 35)).duration(dur(700)).ease(d3.easeBackOut.overshoot(1.2))
    .attr('transform', (d) => `translate(${d.x},${d.y}) scale(1)`);
}

/* ── Rankings ──────────────────────────────────────────────────────── */
function ranking(id, filas, html) {
  const el = document.getElementById(id);
  if (!filas.length) { el.innerHTML = '<li class="rk-vacio">Sin datos</li>'; return; }
  const base = { rActivos: 0, rOpsPeor: 2.2, rCajasMejor: 4.4, rCajasPeor: 6.6, rCmv: 1.1 }[id] ?? 0;
  el.style.setProperty('--rd0', base);
  el.innerHTML = filas.map((r, i) => `<li class="rk" style="--rd:${(base + i * 0.12).toFixed(2)}s"><span class="rk-n">${i + 1}</span><span class="rk-nombre" title="${r.nombre}">${r.nombre}</span>${html(r)}</li>`).join('');
  // las barras se llenan en cascada
  d3.select(el).selectAll('.rk-relleno').style('width', '0%')
    .transition().delay((d, i) => dur(700 + i * 45)).duration(dur(800)).ease(d3.easeCubicOut)
    .style('width', function () { return this.dataset.w + '%'; });
}
const barraPct = (p, txt) =>
  `<span class="rk-barra"><span class="rk-relleno ${estado(p)}" data-w="${p}"></span><span class="rk-txt">${txt}</span></span>`;

function rankings(data, locales) {
  // Más activos: ops/día del backend, barra = % auditado del mismo período
  ranking('rActivos', (data.locales_activos_mes || []).slice(0, 10), (r) => {
    const p = pct(r.ops_auditadas, r.ops);
    return `<span class="rk-barra"><span class="rk-relleno ${estado(p)}" data-w="${p}"></span><span class="rk-txt lados"><b>${fUno(r.ops_por_dia)}/d</b><span>${p}%</span></span></span>`;
  });

  // Mejor CMV: ya viene ordenado del backend (descarta < 12 %)
  ranking('rCmv', (data.top_cmv_locales || []).slice(0, 10), (r) => {
    let delta = '';
    if (r.pct_cmv_anterior != null && r.pct_cmv_anterior > 0) {
      const d = r.pct_cmv - r.pct_cmv_anterior;
      if (d !== 0) delta = `<span class="rk-delta ${d < 0 ? 'bien' : 'mal'}">${d < 0 ? '▼' : '▲'} ${fUno(Math.abs(d))}</span>`;
    }
    return `<span class="rk-valor">${fUno(r.pct_cmv)}%${delta}</span>`;
  });

  const conPct = (campo, audCampo) => locales.filter((l) => l[campo] > 0)
    .map((l) => ({ ...l, ratio: pct(l[audCampo], l[campo]) }));
  ranking('rOpsPeor', conPct('ops', 'ops_auditadas').sort((a, b) => a.ratio - b.ratio || b.ops - a.ops).slice(0, 10), (r) => barraPct(r.ratio, r.ratio + '%'));
  ranking('rCajasMejor', conPct('cajas', 'cajas_auditadas').sort((a, b) => b.ratio - a.ratio || b.cajas - a.cajas).slice(0, 10), (r) => barraPct(r.ratio, r.ratio + '%'));
  ranking('rCajasPeor', conPct('cajas', 'cajas_auditadas').sort((a, b) => a.ratio - b.ratio || b.cajas - a.cajas).slice(0, 10), (r) => barraPct(r.ratio, r.ratio + '%'));
}

/* ── Lector de Mejor CMV: una franja que baja fila por fila ────────── */
let lectorTimer = null;
function lector() {
  clearInterval(lectorTimer);
  const lista = document.getElementById('rCmv');
  const filas = [...lista.querySelectorAll('.rk')];
  if (!filas.length || !MOVIMIENTO) return;
  let band = lista.querySelector('.lector');
  if (!band) { band = document.createElement('div'); band.className = 'lector'; lista.prepend(band); }
  let i = 0;
  const mover = () => {
    const f = filas[i % filas.length];
    band.style.height = f.offsetHeight + 'px';
    band.style.transform = `translateY(${f.offsetTop}px)`;
    i++;
  };
  mover();
  lectorTimer = setInterval(mover, 2600);
}

/* ── Armado ────────────────────────────────────────────────────────── */
function leyendaEstado() {
  document.querySelectorAll('[data-leyenda-estado]').forEach((el) => {
    el.innerHTML = '<span><i class="pt bien"></i>80% o más</span><span><i class="pt aviso"></i>60 a 79%</span><span><i class="pt mal"></i>Menos de 60%</span>';
  });
}

function render(data) {
  // los locales de prueba no son locales: afuera de todo el tablero
  const locales = (data.locales || []).filter((l) => !/test/i.test(l.nombre) && !/test/i.test(l.grupo || ''));
  const t = data.total;
  indicadores(t);
  medidor('medOps', 'Ops auditadas', 'ops', t.ops_auditadas, t.ops, 300);
  medidor('medCajas', 'Cajas auditadas', 'cajas', t.cajas_auditadas, t.cajas, 380);
  burbujas('gOps', locales, 'ops', 'ops_auditadas', t.ops);
  burbujas('gCajas', locales, 'cajas', 'cajas_auditadas', t.cajas);
  rankings(data, locales);
  lector();

  const nombres = data.cumpleanieros_hoy || [];
  document.getElementById('cumple').hidden = !nombres.length;
  document.getElementById('cumpleNombres').textContent = nombresConY(nombres);

  const d = new Date(data.actualizado);
  let etl = '';
  if (data.ultimo_corte_etl?.finished_at) {
    etl = `, último corte de datos ${new Date(data.ultimo_corte_etl.finished_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  document.getElementById('pieActualizado').textContent =
    `Última actualización: ${d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}${etl}`;
}

/* ── Conexión: En vivo / datos de hace Nh / sin conexión ───────────── */
function conexion(est, horas) {
  const el = document.getElementById('envivo');
  el.classList.remove('viejo', 'error');
  if (est === 'viejo') el.classList.add('viejo');
  if (est === 'error') el.classList.add('error');
  document.getElementById('envivoTexto').textContent =
    est === 'vivo' ? 'En vivo' : est === 'viejo' ? `Sin conexión, datos de hace ${horas}` : 'Sin conexión';
}

let ultimo = null;
let timer = null;
async function ciclo() {
  let ok = false;
  try {
    const r = await fetch(CONFIG.FUENTE, {
      headers: { Authorization: 'Bearer ' + (tvSesion.token() || '') },
      cache: 'no-store',
    });
    // Sin sesión, vencida o sin permiso: se pide entrar de nuevo, y los datos
    // guardados NO se muestran detrás del login (la página no es pública).
    if (r.status === 401 || r.status === 403) {
      const b = await r.json().catch(() => ({}));
      tvSesion.pedirLogin(r.status === 403 ? b.error : null);
      return;
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const json = await r.json();
    if (!json?.total || !json?.locales) throw new Error('Respuesta con forma inesperada');
    try { localStorage.setItem(CONFIG.CACHE, JSON.stringify({ data: json, fetchedAt: Date.now() })); } catch {}
    ultimo = json; conexion('vivo'); ok = true;
  } catch (e) {
    console.error('[tv] datos', e);
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CONFIG.CACHE) || 'null'); } catch {}
    if (cache) { ultimo = cache.data; conexion('viejo', `${Math.max(1, Math.round((Date.now() - cache.fetchedAt) / 3600000))} h`); }
    else conexion('error');
  }
  try { if (ultimo) render(ultimo); } catch (e) { console.error('[tv] render', e); }
  clearTimeout(timer);
  timer = setTimeout(ciclo, ok ? CONFIG.REFRESCO_MS : CONFIG.REINTENTO_MS);
}
leyendaEstado();
// Arranca solo con sesión; si no hay, tv-login.js muestra el botón y llama a
// ciclo() cuando la persona entra.
tvSesion.alEntrar(ciclo);
if (tvSesion.token()) ciclo(); else tvSesion.pedirLogin();
// Recarga completa cada hora, por si algo se colgó sin que nadie lo note.
setInterval(() => location.reload(), 60 * 60 * 1000);

// Solo para revisar el diseño: R repite la animación de entrada.
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'r' || !ultimo) return;
  document.querySelectorAll('.graf svg').forEach((s) => s.remove());
  document.querySelectorAll('.kpi-medidor').forEach((m) => { delete m.dataset.armado; });
  document.querySelectorAll('[data-v]').forEach((n) => { n.dataset.v = 0; });
  render(ultimo);
});
