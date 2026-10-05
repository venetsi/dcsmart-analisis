// Dashboard "Rendimiento General" para la TV de oficina.
// Movido desde dcsmart-rendimiento.web.app (2026-10): la lógica es la misma;
// cambió de dónde salen los datos (sesión de Google en vez de una clave
// pública) y el script vive en un archivo porque la CSP de Analytics no
// permite scripts inline.
/* ═══════════════════════════════════════════════════════════════════════
   Config — único lugar a editar para apuntar al backend real.
   ═══════════════════════════════════════════════════════════════════════ */
const CONFIG = {
  // Mismo origen: Firebase Hosting reescribe /api/** al backend de Analytics.
  API_URL: '/api/tv/resumen',
  REFRESH_MS: 60 * 60 * 1000,  // 1h en condiciones normales
  RETRY_MS: 5 * 60 * 1000,     // 5min de backoff si falló el fetch
  CACHE_KEY: 'dcsmart_rendimiento_general_cache',
  // Pronóstico próximas 3h (Google Maps Platform Weather API). Key
  // restringida por HTTP referrer a este dominio — proyecto GCP dc-smart-mvp.
  WEATHER_API_KEY: 'AIzaSyDZcZnu3KNpXEECJ70GmjyRilxmqjGCISs',
  WEATHER_LAT: -34.6037,
  WEATHER_LON: -58.3816,
  WEATHER_REFRESH_MS: 30 * 60 * 1000,  // el clima cambia mucho más lento que los datos de auditoría
};

function fmtInt(n){ return new Intl.NumberFormat('es-AR').format(Math.round(n || 0)); }
function fmtMil(n){ return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format((n || 0) / 1000) + ' Mil'; }
// Barra tipo "pill" a rayas diagonales sobre el color semántico (verde/ámbar/
// rojo) — mismo color de base, con una textura de rayas más clara encima
// (no un color fijo) para que siga funcionando con cualquier color de fondo.
function stripedBg(color){
  return `repeating-linear-gradient(45deg, rgba(255,255,255,.28) 0 7px, rgba(255,255,255,0) 7px 14px), ${color}`;
}
function pct(num, den){ return den > 0 ? Math.round((num/den) * 100) : 0; }
function auditColorVar(p){ return p >= 80 ? 'var(--ok)' : p >= 60 ? 'var(--warn)' : 'var(--bad)'; }
// Mismos umbrales que auditColorVar, pero como literal hex — Canvas (Chart.js)
// no resuelve var(--x), a diferencia de estilos aplicados a elementos del DOM.
const HEX = { ok:'#4CAF7D', warn:'#D4952A', bad:'#E0615C' };
function auditColorHex(p){ return p >= 80 ? HEX.ok : p >= 60 ? HEX.warn : HEX.bad; }

/* ── reloj / fecha (hora real del dispositivo que muestra el TV) ────── */
function tickClock(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  document.getElementById('hdClock').innerHTML = `${hh}:${mm}<span class="sec">:${ss}</span>`;
  document.getElementById('hdDate').textContent =
    now.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });
}
setInterval(tickClock, 1000);

/* ── pronóstico próximas 3h (independiente del ciclo de datos: si falla,
   no debe tocar el resto del dashboard — solo deja el widget vacío) ──── */
async function loadWeather(){
  try {
    const url = `https://weather.googleapis.com/v1/forecast/hours:lookup`
      + `?key=${CONFIG.WEATHER_API_KEY}`
      + `&location.latitude=${CONFIG.WEATHER_LAT}&location.longitude=${CONFIG.WEATHER_LON}`
      + `&hours=3&languageCode=es`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const horas = (json.forecastHours || []).slice(0, 3);
    if (!horas.length) throw new Error('Respuesta sin forecastHours');
    renderWeather(horas);
  } catch (err) {
    console.error('[rendimiento-general] pronóstico falló', err);
  }
}
function renderWeather(horas){
  const html = horas.map(h => {
    const hh = String(h.displayDateTime.hours).padStart(2, '0');
    const icon = h.weatherCondition?.iconBaseUri ? `${h.weatherCondition.iconBaseUri}_dark.svg` : '';
    const temp = Math.round(h.temperature?.degrees ?? NaN);
    return `<div class="wx-hour">
      ${icon ? `<img src="${icon}" alt="${h.weatherCondition?.description?.text || ''}">` : ''}
      <span class="wx-t">${Number.isFinite(temp) ? temp + '°' : '—'}</span>
      <span class="wx-h">${hh}h</span>
    </div>`;
  }).join('');
  document.getElementById('hdWeather').innerHTML = html;
}
loadWeather();
setInterval(loadWeather, CONFIG.WEATHER_REFRESH_MS);
tickClock();

/* ── gauge ────────────────────────────────────────────────────────────── */
function drawGauge(fillId, ratio){
  const R = 60, C = 2 * Math.PI * R;
  const fill = document.getElementById(fillId);
  fill.style.strokeDasharray = C;
  fill.style.strokeDashoffset = C;
  fill.style.stroke = auditColorVar(ratio);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fill.style.strokeDashoffset = C * (1 - ratio/100);
  }));
}

/* ── cumpleaños de hoy (al lado de "DC-SMART") ──────────────────────────
   data.cumpleanieros_hoy ya viene con el primer nombre solo, resuelto en la
   query de tv.js — acá solo se decide cómo unir 2+ nombres el mismo día. */
function nombresConY(nombres){
  if (nombres.length <= 1) return nombres[0] || '';
  if (nombres.length === 2) return nombres.join(' y ');
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}
function renderBirthday(data){
  const nombres = data.cumpleanieros_hoy || [];
  const el = document.getElementById('hdBirthday');
  if (!nombres.length){ el.style.display = 'none'; return; }
  document.getElementById('hdBirthdayNames').textContent = nombresConY(nombres);
  el.style.display = 'flex';
}

/* ── KPIs ─────────────────────────────────────────────────────────────── */
function renderKPIs(data){
  const t = data.total;

  const ratioOps = pct(t.ops_auditadas, t.ops);
  drawGauge('gaugeFillOps', ratioOps);
  document.getElementById('gaugeValueOps').textContent = ratioOps + '%';
  document.getElementById('gaugeCaptionOps').textContent =
    `${fmtInt(t.ops_auditadas)}/${fmtInt(t.ops)}`;

  const ratioCajas = pct(t.cajas_auditadas, t.cajas);
  drawGauge('gaugeFillCajas', ratioCajas);
  document.getElementById('gaugeValueCajas').textContent = ratioCajas + '%';
  document.getElementById('gaugeCaptionCajas').textContent =
    `${fmtInt(t.cajas_auditadas)}/${fmtInt(t.cajas)}`;

  const kpiDias = document.getElementById('kpiDiasAuditoria');
  const kpiDiasTrend = document.getElementById('kpiDiasAuditoriaTrend');
  if (t.dias_hasta_auditar != null){
    kpiDias.textContent = t.dias_hasta_auditar.toFixed(1) + ' d';
    const anterior = t.dias_hasta_auditar_semana_anterior;
    if (anterior != null && anterior > 0){
      // Menos días hasta auditar = mejora (auditan más rápido) — la
      // flecha sigue el sentido real del cambio; el color indica si eso
      // es bueno (bajó) o malo (subió).
      const delta = t.dias_hasta_auditar - anterior;
      const pctDelta = Math.round(Math.abs(delta / anterior) * 100);
      const arrow = delta < 0 ? '▼' : delta > 0 ? '▲' : '—';
      const color = delta < 0 ? 'var(--ok)' : delta > 0 ? 'var(--bad)' : 'var(--t3)';
      kpiDiasTrend.innerHTML = `<span style="color:${color}">${arrow} ${pctDelta}%</span> vs 30d ant.`;
    } else {
      kpiDiasTrend.textContent = 'Sin datos de semana anterior';
    }
  } else {
    kpiDias.textContent = '—';
    kpiDiasTrend.textContent = '';
  }

  document.getElementById('kpiPagos7d').textContent = fmtInt(t.pagos_7d);
  document.getElementById('kpiPagos7dProm').textContent = `${t.pagos_promedio_dia} /día prom.`;

  document.getElementById('kpiHorasIa').textContent = `${t.horas_ahorradas_ia} h`;
  document.getElementById('kpiIaAdopcion').textContent = `${t.pct_adopcion_ia}% adopción · ${fmtInt(t.pagos_ia_30d)} fact.`;
  const kpiIaTrend = document.getElementById('kpiIaTrend');
  if (t.pct_adopcion_ia_anterior != null && t.pct_adopcion_ia_anterior > 0){
    // Más adopción = mejor (al revés que "Tiempo hasta auditar"): la flecha
    // sigue el sentido del cambio, verde si subió, rojo si bajó.
    const delta = t.pct_adopcion_ia - t.pct_adopcion_ia_anterior;
    const pctDelta = Math.round(Math.abs(delta / t.pct_adopcion_ia_anterior) * 100);
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    const color = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--bad)' : 'var(--t3)';
    kpiIaTrend.innerHTML = `<span style="color:${color}">${arrow} ${pctDelta}%</span> vs 30d ant.`;
  } else {
    kpiIaTrend.textContent = 'Sin dato comparativo';
  }

  document.getElementById('kpiOps').textContent = fmtMil(t.ops);
  document.getElementById('kpiCajas').textContent = fmtMil(t.cajas);
  document.getElementById('kpiLocales').textContent = fmtInt(t.locales_activos);
}

/* ── sigla de 2 caracteres a partir del nombre del local ──────────────
   2 palabras -> primera letra de cada una; 1 palabra sola -> sus primeros
   2 caracteres. Con ~20 locales puede haber alguna sigla repetida — es
   esperable con solo 2 caracteres; el nombre completo sigue disponible
   al pasar el mouse (title nativo del canvas via tooltip de Chart.js). */
function sigla2(nombre){
  const partes = String(nombre || '').trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  const solo = partes[0] || '';
  return (solo.slice(0, 2) || '??').toUpperCase();
}

/* ── plugin propio de Chart.js: dibuja la sigla adentro de cada burbuja ─
   (no se suma chartjs-plugin-datalabels solo para esto — 15 líneas de
   canvas puro alcanzan y evitan otra dependencia externa). */
const bubbleSiglaPlugin = {
  id: 'bubbleSigla',
  afterDatasetsDraw(chart){
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, dsIndex) => {
      if (chart.getDatasetMeta(dsIndex).hidden) return;
      chart.getDatasetMeta(dsIndex).data.forEach((point, i) => {
        const raw = dataset.data[i];
        if (!raw || !raw.sigla) return;
        const fontPx = Math.max(8, Math.min(13, point.options.radius * 0.55));
        ctx.save();
        ctx.font = `700 ${fontPx}px Montserrat, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.55)';
        ctx.shadowBlur = 3;
        ctx.fillText(raw.sigla, point.x, point.y);
        ctx.restore();
      });
    });
  }
};
Chart.register(bubbleSiglaPlugin);

/* ── declutter: separa burbujas que quedarían pisadas entre sí ─────────
   Corre DESPUÉS de que Chart.js ya calculó las posiciones reales en
   píxeles. Con datos reales aparece un caso que la repulsión de a pares
   sola no resuelve bien: MUCHOS locales (12+) con el mismo % auditado
   exacto (típicamente 0%) y volúmenes muy parecidos — todos caen en una
   franja de pocos píxeles y no hay espacio físico para separarlos de a
   pares sin iterar casi sin fin. Se resuelve en dos pasos:
   1) Se agrupan (union-find) los puntos que arrancan pisados o casi
      pisados, y cada grupo de 2+ se alinea en una fila horizontal
      centrada en su posición real (ordenados por x real, o sea por
      volumen) — sin tocar el eje Y, así que nunca hace falta recortar
      contra 0%/100% ni se reintroduce solapamiento por el clamp.
   2) Una pasada corta de repulsión de a pares limpia lo que haya quedado
      cerca entre grupos distintos.
   xReal/yReal (el valor real, sin el nudge) quedan intactos para el
   tooltip — esto es una separación puramente visual. */
function declutterPixels(chart, xAxisMax){
  const meta = chart.getDatasetMeta(0);
  const ds = chart.data.datasets[0].data;
  const gap = 3;
  const pts = meta.data.map((m, i) => ({ x: m.x, y: m.y, r: m.options.radius, i }));

  // Paso 1 — agrupar por unión de puntos cercanos (con margen extra de
  // 1.4x para agrupar también los "casi" pisados, no solo los exactos).
  const parent = pts.map((_, i) => i);
  function find(i){ return parent[i] === i ? i : (parent[i] = find(parent[i])); }
  function union(i, j){ const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
  for (let i = 0; i < pts.length; i++){
    for (let j = i + 1; j < pts.length; j++){
      const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (dist < (pts[i].r + pts[j].r + gap) * 1.4) union(i, j);
    }
  }
  const grupos = {};
  pts.forEach((p, i) => { const raiz = find(i); (grupos[raiz] = grupos[raiz] || []).push(i); });

  const area = chart.chartArea;
  Object.values(grupos).forEach(idxs => {
    if (idxs.length < 2) return;
    idxs.sort((a, b) => pts[a].x - pts[b].x);
    let cx = idxs.reduce((s, i) => s + pts[i].x, 0) / idxs.length;

    // Si el cluster tiene muchos miembros, la fila puede ser más ancha que
    // TODO el área graficable (pasó con 16 locales en ~186px) — en ese
    // caso alinearla contra un borde no alcanza, porque el resto se sigue
    // saliendo por el otro lado y el clamp final contra el límite del eje
    // los vuelve a apilar a todos ahí (el bug que se veía). Se comprime el
    // radio SOLO de este cluster lo justo para que la fila entera entre
    // en el ancho disponible — una burbuja más chica pero separada es
    // preferible a una "del tamaño correcto" pero pisada e ilegible.
    const disponible = (area.right - area.left) - 4;
    let anchoTotal = idxs.reduce((s, i) => s + pts[i].r * 2 + gap, -gap);
    if (anchoTotal > disponible && disponible > idxs.length * (2 * 3 + gap)){
      const escala = disponible / anchoTotal;
      idxs.forEach(i => { pts[i].r = Math.max(3, pts[i].r * escala); });
      anchoTotal = idxs.reduce((s, i) => s + pts[i].r * 2 + gap, -gap);
    }

    const minCx = area.left + anchoTotal / 2 + 2;
    const maxCx = area.right - anchoTotal / 2 - 2;
    let cursor;
    if (minCx <= maxCx) {
      cx = Math.max(minCx, Math.min(maxCx, cx));
      cursor = cx - anchoTotal / 2;
    } else {
      cursor = area.left + 2;
    }
    idxs.forEach(i => {
      pts[i].x = cursor + pts[i].r;
      cursor += pts[i].r * 2 + gap;
    });
  });

  // Paso 2 — repulsión fina de a pares, para lo que quede cerca entre
  // grupos distintos (ya no tiene que resolver un amontonamiento de 12+).
  for (let iter = 0; iter < 120; iter++){
    let moved = false;
    for (let a = 0; a < pts.length; a++){
      for (let b = a + 1; b < pts.length; b++){
        const p1 = pts[a], p2 = pts[b];
        let dx = p1.x - p2.x, dy = p1.y - p2.y;
        let dist = Math.hypot(dx, dy);
        const minDist = p1.r + p2.r + gap;
        if (dist < 0.01){ const angle = (2 * Math.PI * a) / pts.length + b; dx = Math.cos(angle); dy = Math.sin(angle); dist = 1; }
        if (dist < minDist){
          const push = (minDist - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          p1.x += ux * push; p2.x -= ux * push;
          p1.y += uy * push; p2.y -= uy * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // Red de seguridad: si por algún caso límite quedó algún par exactamente
  // superpuesto, separarlo con un offset chico y fijo (no proporcional al
  // índice — con 20 puntos eso podía valer hasta +19px, de sobra para
  // mandar el punto más allá del borde del área graficable).
  for (let pasada = 0; pasada < 4; pasada++){
    let corrigioAlguna = false;
    for (let a = 0; a < pts.length; a++){
      for (let b = a + 1; b < pts.length; b++){
        const p1 = pts[a], p2 = pts[b];
        // Umbral chico y ABSOLUTO (no proporcional a minDist): esto es
        // solo para casos de convergencia incompleta entre 3+ vecinos que
        // dejan <2px de separación (indistinguible en pantalla aunque no
        // sea 0 matemático) — no para renegociar pares que ya quedaron
        // aceptablemente cerca pero separados a propósito.
        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 2){
          const minDist = p1.r + p2.r + gap;
          const dir = (a % 2 === 0) ? 1 : -1;
          p1.x -= dir * minDist / 2; p2.x += dir * minDist / 2;
          corrigioAlguna = true;
        }
      }
    }
    if (!corrigioAlguna) break;
  }

  // Límite final, ANTES de convertir a valor de eje: ningún punto puede
  // quedar fuera del área graficable en píxeles. Sin esto, cualquier paso
  // anterior (repulsión, red de seguridad) puede empujar un punto más
  // allá del borde; al convertirlo a dato y recortarlo contra 0/xAxisMax/
  // 100, dos puntos que se pasaron del mismo lado terminan otra vez
  // exactamente en el mismo límite — el bug que se estuvo viendo.
  pts.forEach(p => {
    p.x = Math.max(area.left + p.r, Math.min(area.right - p.r, p.x));
    p.y = Math.max(area.top + p.r, Math.min(area.bottom - p.r, p.y));
  });

  const xScale = chart.scales.x, yScale = chart.scales.y;
  pts.forEach(p => {
    const nuevoX = xScale.getValueForPixel(p.x);
    const nuevoY = yScale.getValueForPixel(p.y);
    ds[p.i].x = Math.max(0, Math.min(xAxisMax, nuevoX));
    ds[p.i].y = Math.max(0, Math.min(100, nuevoY));
    ds[p.i].r = p.r; // si el cluster se comprimió, el radio dibujado tiene que achicarse junto con la posición
  });
  chart.update('none');
}

/* ── scatter: locales por ops / por cajas — % del total (x, lineal) vs
   % auditado (y), burbuja por local con su sigla adentro. "Más afectados"
   = peor % auditado, tope 20 para que no se sature si la plataforma suma
   más locales con el tiempo. ─────────────────────────────────────────── */
const scatterInstances = {};
function renderScatter(canvasId, rows, volCampo, audCampo, totalVol){
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(canvasId + 'Empty');
  // Se ocultan los locales con menos del 5% AUDITADO — no del volumen.
  const UMBRAL_MIN_PCT_AUDITADO = 5;
  const activos = rows
    .filter(r => r[volCampo] > 0)
    .map(r => ({ ...r, pct: pct(r[audCampo], r[volCampo]) }))
    .filter(r => r.pct >= UMBRAL_MIN_PCT_AUDITADO);

  if (scatterInstances[canvasId]) { scatterInstances[canvasId].destroy(); scatterInstances[canvasId] = null; }
  if (!activos.length){
    canvas.style.display = 'none'; empty.style.display = 'flex';
    return;
  }
  canvas.style.display = ''; empty.style.display = 'none';

  const afectados = [...activos].sort((a,b) => a.pct - b.pct).slice(0, 20);
  const maxVol = Math.max(...afectados.map(r => r[volCampo]));
  const maxPctTotal = Math.max(...afectados.map(r => (r[volCampo] / totalVol) * 100));
  const xAxisMax = Math.max(1, Math.ceil(maxPctTotal * 1.15));
  const minR = 7, maxR = 22;
  const radioDe = (vol) => minR + (maxR - minR) * Math.sqrt(vol / maxVol);

  const points = afectados.map(r => {
    const xPct = (r[volCampo] / totalVol) * 100;
    return {
      x: xPct, y: r.pct, r: radioDe(r[volCampo]),
      nombre: r.nombre, sigla: sigla2(r.nombre), grupo: r.grupo, vol: r[volCampo], aud: r[audCampo],
      // xReal/yReal se preservan sin tocar — declutterPixels() mueve .x/.y
      // (en píxeles, después de crear el chart) para separar burbujas
      // pisadas, pero el tooltip debe mostrar el valor real, no la
      // posición ajustada.
      xReal: xPct, yReal: r.pct
    };
  });

  // Padding proporcional al radio máximo — sin esto, las burbujas más
  // grandes o las que caen en x=0/y=0/y=100 (bordes reales del rango de
  // datos) quedan cortadas por el borde del área del gráfico.
  const pad = maxR + 4;

  scatterInstances[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bubble',
    data: { datasets: [{
      data: points,
      backgroundColor: points.map(p => auditColorHex(p.y) + 'CC'),
      borderColor: points.map(p => auditColorHex(p.y)),
      borderWidth: 1.5,
      clip: false, // deja dibujar la burbuja aunque su borde caiga fuera del área de ejes
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      layout: { padding: pad },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const p = ctx.raw;
              return `${p.nombre} (${p.grupo || 'sin grupo'}): ${fmtInt(p.aud)} / ${fmtInt(p.vol)} auditadas (${Math.round(p.yReal)}%) · ${Math.round(p.xReal)}% del total`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear', min: 0, max: xAxisMax,
          title: { display: true, text: '% del total', color: 'rgba(243,240,234,.45)' },
          grid: { color: 'rgba(255,255,255,.07)' },
          ticks: { color: 'rgba(243,240,234,.45)', font: { family: 'Montserrat', size: 10 }, callback: (v) => Math.round(v) + '%' }
        },
        y: {
          min: 0, max: 100, title: { display: true, text: '% auditado', color: 'rgba(243,240,234,.45)' },
          grid: { color: 'rgba(255,255,255,.07)' },
          ticks: { color: 'rgba(243,240,234,.45)', font: { family: 'Montserrat', size: 10 }, callback: (v) => Math.round(v) + '%' }
        }
      }
    }
  });

  declutterPixels(scatterInstances[canvasId], xAxisMax);
}

/* ── ranking: top 10 locales más activos — cadencia de carga de ops por
   día en el último mes (ventana móvil de 30 días), según fecha de
   creación (no la de la transacción) — ya viene ordenado y calculado
   desde el backend. ───────────────────────────────────────────────── */
function renderTopLocalesActivos(data){
  const rows = (data.locales_activos_mes || []).slice(0, 10);
  const el = document.getElementById('rankLocalesActivos');
  if (!rows.length){ el.innerHTML = '<div class="rank-empty">Sin ops creadas en el último mes.</div>'; return; }
  el.innerHTML = rows.map((r, i) => {
    const ratioAud = pct(r.ops_auditadas, r.ops);
    return `
    <div class="rank-row">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${r.nombre}</div>
      </div>
      <div class="rank-bar-col">
        <div class="rank-bar rank-bar-tall">
          <div class="rank-bar-fill" style="width:${ratioAud}%; background:${ratioAud >= 100 ? auditColorVar(ratioAud) : stripedBg(auditColorVar(ratioAud))}; opacity:${ratioAud >= 100 ? 1 : .2}"></div>
          <span class="rank-bar-label-left">${r.ops_por_dia}/d</span>
          <span class="rank-bar-pct-label">${ratioAud}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── ranking: top 10 locales con mejor % de CMV (menor = mejor margen) —
   últimos 30 días vs los 30 anteriores. El backend ya descarta los <12%:
   en la práctica nunca hay un CMV real tan bajo, así que es carga de costos
   incompleta, no un margen genuino. Solo nombre y %, sin barra. ──────── */
function renderTopCmv(data){
  const rows = (data.top_cmv_locales || []).slice(0, 10);
  const el = document.getElementById('rankCmvLocales');
  if (!rows.length){ el.innerHTML = '<div class="rank-empty">Sin datos de CMV confiables.</div>'; return; }
  el.innerHTML = rows.map((r, i) => {
    let trendHtml = '';
    if (r.pct_cmv_anterior != null && r.pct_cmv_anterior > 0){
      // Menos CMV = mejor margen — la flecha sigue el sentido real del
      // cambio, el color indica si eso es bueno (bajó) o malo (subió).
      const delta = r.pct_cmv - r.pct_cmv_anterior;
      const arrow = delta < 0 ? '▼' : delta > 0 ? '▲' : '—';
      const color = delta < 0 ? 'var(--ok)' : delta > 0 ? 'var(--bad)' : 'var(--t3)';
      trendHtml = `<span class="rank-trend" style="color:${color}">${arrow}</span>`;
    }
    return `
    <div class="rank-row">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-info"><div class="rank-name">${r.nombre}</div></div>
      <div class="rank-bar-col"><div class="rank-value" style="color:var(--ok)">${r.pct_cmv}% ${trendHtml}</div></div>
    </div>`;
  }).join('');
}

/* ── ranking: top 10 locales por % de cajas auditadas vs sin auditar —
   histórico completo, mejor % (100% auditado) primero. ──────────────── */
function renderTopCajasLocal(data){
  const rows = (data.locales || [])
    .filter(l => l.cajas > 0)
    .map(l => ({ ...l, sin_auditar: l.cajas - l.cajas_auditadas, ratio: pct(l.cajas_auditadas, l.cajas) }))
    .sort((a, b) => b.ratio - a.ratio || b.cajas - a.cajas)
    .slice(0, 10);

  const el = document.getElementById('rankCajasLocal');
  if (!rows.length){ el.innerHTML = '<div class="rank-empty">Sin datos de cajas.</div>'; return; }
  el.innerHTML = rows.map((r, i) => `
    <div class="rank-row">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${r.nombre}</div>
      </div>
      <div class="rank-bar-col">
        <div class="rank-bar rank-bar-tall">
          <div class="rank-bar-fill" style="width:${r.ratio}%; background:${r.ratio >= 100 ? auditColorVar(r.ratio) : stripedBg(auditColorVar(r.ratio))}; opacity:${r.ratio >= 100 ? 1 : .2}"></div>
          <span class="rank-bar-pct-label-center">${r.ratio}%</span>
        </div>
      </div>
    </div>`).join('');
}

/* ── ranking: top 10 locales MENOS auditados en ops — histórico completo,
   peor % primero (espejo de renderTopCajasLocal). ────────────────────── */
function renderTopOpsPeorAuditados(data){
  const rows = (data.locales || [])
    .filter(l => l.ops > 0)
    .map(l => ({ ...l, sin_auditar: l.ops - l.ops_auditadas, ratio: pct(l.ops_auditadas, l.ops) }))
    .sort((a, b) => a.ratio - b.ratio || b.ops - a.ops)
    .slice(0, 10);

  const el = document.getElementById('rankOpsPeorAuditados');
  if (!rows.length){ el.innerHTML = '<div class="rank-empty">Sin datos de ops.</div>'; return; }
  el.innerHTML = rows.map((r, i) => `
    <div class="rank-row">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${r.nombre}</div>
      </div>
      <div class="rank-bar-col">
        <div class="rank-bar rank-bar-tall">
          <div class="rank-bar-fill" style="width:${r.ratio}%; background:${r.ratio >= 100 ? auditColorVar(r.ratio) : stripedBg(auditColorVar(r.ratio))}; opacity:${r.ratio >= 100 ? 1 : .2}"></div>
          <span class="rank-bar-pct-label-center">${r.ratio}%</span>
        </div>
      </div>
    </div>`).join('');
}

/* ── ranking: top 10 locales por % de cajas MENOS auditadas — histórico
   completo, peor % primero (espejo de renderTopCajasLocal). ─────────── */
function renderTopCajasPeorAuditadas(data){
  const rows = (data.locales || [])
    .filter(l => l.cajas > 0)
    .map(l => ({ ...l, sin_auditar: l.cajas - l.cajas_auditadas, ratio: pct(l.cajas_auditadas, l.cajas) }))
    .sort((a, b) => a.ratio - b.ratio || b.cajas - a.cajas)
    .slice(0, 10);

  const el = document.getElementById('rankCajasPeorAuditadas');
  if (!rows.length){ el.innerHTML = '<div class="rank-empty">Sin datos de cajas.</div>'; return; }
  el.innerHTML = rows.map((r, i) => `
    <div class="rank-row">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-info">
        <div class="rank-name">${r.nombre}</div>
      </div>
      <div class="rank-bar-col">
        <div class="rank-bar rank-bar-tall">
          <div class="rank-bar-fill" style="width:${r.ratio}%; background:${r.ratio >= 100 ? auditColorVar(r.ratio) : stripedBg(auditColorVar(r.ratio))}; opacity:${r.ratio >= 100 ? 1 : .2}"></div>
          <span class="rank-bar-pct-label-center">${r.ratio}%</span>
        </div>
      </div>
    </div>`).join('');
}

function renderUpdated(data){
  const d = new Date(data.actualizado);
  const txt = d.toLocaleString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  let etl = '';
  if (data.ultimo_corte_etl && data.ultimo_corte_etl.finished_at){
    const e = new Date(data.ultimo_corte_etl.finished_at);
    etl = ` · último corte ETL: ${e.toLocaleString('es-AR', { hour:'2-digit', minute:'2-digit' })}`;
  }
  document.getElementById('ftUpdated').textContent = `Última actualización: ${txt}${etl}`;
}

function renderAll(data){
  // #app tiene que estar visible ANTES de crear los charts: Chart.js mide
  // el contenedor del canvas al construirse, y con display:none esa medida
  // da 0×0 (se autocorrige en 1-2s vía ResizeObserver, pero mejor no
  // depender de eso — se ve mal ese primer instante en una pantalla fija).
  document.getElementById('boot').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  renderBirthday(data);
  renderKPIs(data);
  renderScatter('scatterOps', data.locales || [], 'ops', 'ops_auditadas', data.total.ops);
  renderScatter('scatterCajas', data.locales || [], 'cajas', 'cajas_auditadas', data.total.cajas);
  renderTopLocalesActivos(data);
  renderTopCmv(data);
  renderTopOpsPeorAuditados(data);
  renderTopCajasLocal(data);
  renderTopCajasPeorAuditadas(data);
  renderUpdated(data);
}

/* ── estado de conexión (footer badge) ───────────────────────────────── */
function setConnectionState(state, hoursAgo){
  const badge = document.getElementById('ftBadge');
  const text = document.getElementById('ftBadgeText');
  badge.className = 'ft-badge ' + state;
  if (state === 'live') text.textContent = 'En vivo';
  else if (state === 'stale') text.textContent = `Sin conexión — mostrando datos de hace ${hoursAgo}`;
  else text.textContent = 'Conectando…';
}

/* ── fetch + caché + refresco ─────────────────────────────────────────── */
async function loadData(){
  try {
    const res = await fetch(CONFIG.API_URL, {
      headers: { Authorization: 'Bearer ' + (tvSesion.token() || '') },
      cache: 'no-store'
    });
    // Sin sesión, vencida o sin permiso: se pide entrar de nuevo. Los datos
    // cacheados NO se muestran detrás del login -- la página dejó de ser pública.
    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({}));
      tvSesion.pedirLogin(res.status === 403 ? body.error : null);
      return null;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json || !json.locales || !json.total) throw new Error('Respuesta con forma inesperada');
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ data: json, fetchedAt: Date.now() }));
    setConnectionState('live');
    return json;
  } catch (err) {
    console.error('[rendimiento-general] fetch falló', err);
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || 'null'); } catch {}
    if (cached) {
      const horas = Math.max(1, Math.round((Date.now() - cached.fetchedAt) / 3600000));
      setConnectionState('stale', `${horas}h`);
      return cached.data;
    }
    setConnectionState('error');
    return null;
  }
}

let refreshTimer = null;
async function tick(){
  // Todo lo que puede fallar (fetch O render) queda adentro del try: si
  // scheduleNext() no llegara a ejecutarse por una excepción sin atrapar,
  // el ciclo de refresco se muere para siempre (nadie vuelve a programar
  // el próximo intento) — la pantalla queda mostrando datos viejos
  // indefinidamente hasta que alguien la recargue a mano. Ya pasó: quedó
  // 74hs sin actualizar por esto.
  let data = null;
  try {
    data = await loadData();
    if (data) renderAll(data);
  } catch (err) {
    console.error('[rendimiento-general] tick() falló', err);
  }
  scheduleNext(data ? CONFIG.REFRESH_MS : CONFIG.RETRY_MS);
}
function scheduleNext(ms){
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(tick, ms);
}
window.addEventListener('online', () => { if (refreshTimer) clearTimeout(refreshTimer); tick(); });

// Red de seguridad adicional: recarga completa de la página cada hora,
// independiente del refresco in-place de arriba. Si algo se rompe de una
// forma que el try/catch de tick() no anticipó (fuga de memoria, un bug
// nuevo, lo que sea), esto garantiza que la pantalla nunca queda colgada
// por más de 1h — se resetea sola sin depender de que nadie la note.
setInterval(() => location.reload(), 60 * 60 * 1000);

// Arranca solo con sesión; si no hay, tv-login.js muestra el botón y llama a
// tick() cuando la persona entra.
tvSesion.alEntrar(tick);
if (tvSesion.token()) tick(); else tvSesion.pedirLogin();
