/* =====================================================================
   ASISTENCIA (marcaciones, turnos) y REPORTES
   ===================================================================== */
const getTurnoFn = c => { const t = turnoById(c.turno_id); return () => t; };

/** Recalcula puntualidad de todas las marcaciones de un día (tras crear/editar/eliminar manualmente) */
async function recalcDia(colabId, fecha) {
  const c = colabById(colabId);
  const { data } = await sb.from('marcaciones').select('*').eq('colaborador_id', colabId).eq('fecha', fecha).order('ts');
  // se usa el turno con el que se hizo el registro ese día (historial inmutable); solo si no hay copia, el turno actual
  const t = (data || []).find(m => m.turno)?.turno || snapTurno(turnoById(c?.turno_id)), tol = t.tolerancia_min ?? 5;
  const partida = t.tipo === 'partida' && t.almuerzo_inicio && t.almuerzo_fin; let ing = 0; const ups = [];
  (data || []).forEach((m, i) => {
    let esp = null;
    if (m.tipo === 'ingreso') { ing++; if (ing === 1) esp = tAt(fecha, t.hora_inicio); else if (partida && data[i - 1]?.tipo === 'salida') esp = tAt(fecha, t.almuerzo_fin); }
    else if (!(data[i + 1] && data[i + 1].tipo === 'ingreso')) { esp = tAt(fecha, t.hora_fin); if (tMin(t.hora_fin) <= tMin(t.hora_inicio)) esp = addDays(esp, 1); }
    const pu = esp ? evaluarPuntualidad(m.tipo, m.ts, esp, tol) : { puntualidad: null, diff_min: null };
    const upd = { ...pu }; if (!m.turno) upd.turno = t;
    if (pu.puntualidad !== m.puntualidad || pu.diff_min !== m.diff_min || upd.turno) ups.push(sb.from('marcaciones').update(upd).eq('id', m.id));
  });
  await Promise.all(ups);
}

VIEWS.asistencia = async el => {
  el.innerHTML = pageHead('Asistencia', 'Marcaciones y horas trabajadas', '<button class="btn" id="aTur">🗓️ Crear turno</button>') + '<div id="aBody"></div>';
  $('#aTur').onclick = () => go('turnos');
  await tabAsistencias($('#aBody'));
};
/** Pestaña independiente "Crear turno": los turnos creados aquí alimentan el desplegable del formulario de colaborador */
VIEWS.turnos = async el => {
  el.innerHTML = pageHead('Crear turno', 'Cree las jornadas (continuas o partidas) que podrá asignar a cada colaborador') + '<div id="aBody"></div>';
  await tabTurnos($('#aBody'));
};

async function tabAsistencias(el) {
  S.asisFecha = S.asisFecha || ymd(new Date());
  el.innerHTML = `<div class="row mb"><div><label>Fecha</label><input type="date" id="aF" value="${S.asisFecha}"></div><div><label>Área</label><select id="aArea"><option value="">Todas</option>${areas().map(a => `<option>${h(a)}</option>`).join('')}</select></div><div class="grow"><label>Buscar</label><input id="aQ" placeholder="Nombre o cédula"></div><div style="align-self:end"><button class="btn" id="aRef">↻ Actualizar</button></div></div><div class="card flush"><div class="table-wrap" id="aT"><div class="empty">Cargando…</div></div></div>`;
  const load = async () => {
    const fecha = S.asisFecha = $('#aF').value || ymd(new Date()), lun = ymd(mondayOf(parseYmd(fecha)));
    const [marks, perm] = await Promise.all([fetchMarcas(null, lun, fecha), sb.from('permisos').select('*').eq('estado', 'aceptado').lte('fecha_inicio', fecha).gte('fecha_fin', fecha)]);
    const by = groupBy(marks, 'colaborador_id'), pset = new Set((perm.data || []).map(p => p.colaborador_id));
    const q = $('#aQ').value.toLowerCase(), ar = $('#aArea').value, dow = parseYmd(fecha).getDay(), esHoy = fecha === ymd(new Date());
    const rows = S.colabs.filter(c => c.estado === 'activo' && (!ar || c.area === ar) && (!q || `${nombreCompleto(c)} ${c.cedula}`.toLowerCase().includes(q))).map(c => {
      const ms = by[c.id] || [], gt = getTurnoHist(ms, turnoById(c.turno_id), S.turnos), t = gt(fecha), r = calcHoras(ms, gt, lun, fecha, new Date());
      const dia = r.dias[fecha], del = ms.filter(m => m.fecha === fecha), first = del.find(m => m.tipo === 'ingreso'), lastS = [...del].reverse().find(m => m.tipo === 'salida'), last = del[del.length - 1];
      let est = ['Ausente', 'red'];
      if (pset.has(c.id)) est = ['Permiso', 'blue']; else if (last) est = last.tipo === 'ingreso' ? [esHoy ? 'Presente' : 'Sin salida', esHoy ? 'green' : 'amber'] : ['Finalizó', '']; else if (!(t?.dias || DEFAULT_TURNO.dias).includes(dow)) est = ['No programado', ''];
      return { c, t, first, lastS: last?.tipo === 'salida' ? lastS : null, hoy: dia?.total || 0, sem: r.totalMin, est, n: del.length };
    });
    $('#aT').innerHTML = `<table><thead><tr><th>Colaborador</th><th>Turno asignado</th><th>Ingreso</th><th>Salida</th><th>Estado</th><th class="num">Horas del día</th><th class="num">Horas semana</th><th></th></tr></thead><tbody>` +
      (rows.map(r => `<tr><td><div class="person">${avatarHtml(r.c)}<div><b>${h(nombreCompleto(r.c))}</b><span>${h(r.c.area || '')}</span></div></div></td>
        <td><b style="font-weight:600">${h(r.t?.nombre || 'Sin turno')}</b><div class="small muted">${turnoTxt(r.t)} · ${r.t?.tipo === 'continua' ? 'continua' : 'partida'}</div></td>
        <td>${r.first ? `${fmtTime(r.first.ts)}<div>${puntBadge(r.first)}</div>` : '—'}</td><td>${r.lastS ? `${fmtTime(r.lastS.ts)}<div>${puntBadge(r.lastS)}</div>` : '—'}</td>
        <td><span class="badge ${r.est[1]}">${r.est[0]}</span></td><td class="num">${hm(r.hoy)}</td><td class="num">${hm(r.sem)}</td>
        <td class="right" style="white-space:nowrap"><button class="btn sm" data-d="${r.c.id}">Detalle / modificar</button> <button class="icon-btn" title="Eliminar registros del día" data-x="${r.c.id}" ${r.n ? '' : 'disabled'}>🗑</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin colaboradores</td></tr>') + '</tbody></table>';
    $$('[data-d]', el).forEach(b => b.onclick = () => detalleColab(colabById(b.dataset.d), lun, fecha, load));
    $$('[data-x]', el).forEach(b => b.onclick = async () => {
      const c = colabById(b.dataset.x); if (!await confirmDlg(`¿Eliminar TODAS las marcaciones de <b>${h(nombreCompleto(c))}</b> del ${fmtDate(fecha)}?`)) return;
      const { error } = await sb.from('marcaciones').delete().eq('colaborador_id', c.id).eq('fecha', fecha); if (error) return toast(dbErr(error), 'err'); toast('Registros eliminados', 'ok'); load();
    });
  };
  $('#aF').onchange = load; $('#aArea').onchange = load; $('#aQ').oninput = debounce(load, 300); $('#aRef').onclick = load;
  S.timers.push(setInterval(() => { if (!document.querySelector('.modal-back')) load(); }, 30000));
  await load();
}

/** Ventana con todas las marcaciones de un colaborador en un rango, con edición y eliminación */
async function detalleColab(c, desde, hasta, onChange) {
  const m = modal({ title: `Marcaciones · ${h(nombreCompleto(c))}`, wide: true, html: '<div class="empty">Cargando…</div>', buttons: [{ t: 'Cerrar' }] });
  const pintar = async () => {
    const d1 = $('#dD', m.el)?.value || desde, d2 = $('#dH', m.el)?.value || hasta;
    const marks = await fetchMarcas([c.id], ymd(mondayOf(parseYmd(d1))), d2);
    const gt = getTurnoHist(marks, turnoById(c.turno_id), S.turnos), t = gt(d2);
    const res = calcHoras(marks, gt, d1, d2, new Date()), rows = filasDias(res, marks.filter(x => x.fecha >= d1 && x.fecha <= d2));
    m.body.innerHTML = `<div class="row mb"><div><label>Desde</label><input type="date" id="dD" value="${d1}"></div><div><label>Hasta</label><input type="date" id="dH" value="${d2}"></div>
      <div class="grow"></div><button class="btn" id="dAdd">+ Agregar marcación</button><button class="btn" id="dPdf">⬇ PDF</button></div>
      <div class="card" style="background:#f7f8fd;margin-bottom:12px"><b>${hm(res.totalMin)}</b> laboradas · <b>${hm(res.extraMin)}</b> extras · <b>${res.diasMarcados}</b> días marcados · Turno actual: ${h(turnoById(c.turno_id)?.nombre || 'Sin turno')}</div>
      ${rows.map(r => `<div class="card" style="margin-bottom:10px"><div class="row between"><b>${r.dow} ${fmtDate(r.fecha)}</b><span class="small muted">${h(gt(r.fecha)?.nombre || 'Sin turno')} · ${turnoTxt(gt(r.fecha))}</span><span>${hm(r.total)} ${r.extra ? `· <span class="badge amber">${hm(r.extra)} extra</span>` : ''} ${r.sinSalida ? '<span class="badge red">Sin salida</span>' : ''}</span></div>
        <table class="mt"><tbody>${r.marcas.map(x => `<tr><td width="90"><span class="badge ${x.tipo === 'ingreso' ? 'green' : 'red'}">${x.tipo}</span></td><td>${fmtTime(x.ts)}</td><td>${puntBadge(x)}</td><td class="small muted">${x.origen}${x.nota ? ' · ' + h(x.nota) : ''}</td><td class="right"><button class="icon-btn" data-e="${x.id}">✏</button><button class="icon-btn" data-x="${x.id}">🗑</button></td></tr>`).join('')}</tbody></table></div>`).join('') || '<div class="empty">Sin marcaciones en el rango</div>'}`;
    $('#dD', m.el).onchange = pintar; $('#dH', m.el).onchange = pintar;
    $('#dAdd', m.el).onclick = () => formMarca(c, null, d2, async () => { await pintar(); onChange && onChange(); });
    $('#dPdf', m.el).onclick = () => pdfReporteIndividual(c, t, d1, d2, res, marks.filter(x => x.fecha >= d1 && x.fecha <= d2));
    $$('[data-e]', m.el).forEach(b => b.onclick = () => formMarca(c, marks.find(x => x.id === b.dataset.e), d2, async () => { await pintar(); onChange && onChange(); }));
    $$('[data-x]', m.el).forEach(b => b.onclick = async () => {
      const mk = marks.find(x => x.id === b.dataset.x); if (!await confirmDlg('¿Eliminar esta marcación?')) return;
      const { error } = await sb.from('marcaciones').delete().eq('id', mk.id); if (error) return toast(dbErr(error), 'err');
      await recalcDia(c.id, mk.fecha); await pintar(); onChange && onChange();
    });
  };
  pintar();
}
function formMarca(c, mk, fechaDef, done) {
  const F = [{ k: 'tipo', l: 'Tipo', type: 'select', opts: [['ingreso', 'Ingreso'], ['salida', 'Salida']] }, { k: 'fecha', l: 'Fecha del turno', type: 'date', req: true }, { k: 'hora', l: 'Hora', type: 'time', req: true }, { k: 'sig', l: 'La hora es del día siguiente (turno nocturno)', type: 'checkbox', full: true }, { k: 'nota', l: 'Nota (motivo del cambio)', full: true }];
  const d = mk ? new Date(mk.ts) : null;
  const m = modal({
    title: mk ? 'Modificar marcación' : 'Agregar marcación manual', html: formHtml(F, mk ? { tipo: mk.tipo, fecha: mk.fecha, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`, sig: ymd(d) !== mk.fecha, nota: mk.nota } : { fecha: fechaDef, hora: '08:00' }),
    buttons: [{ t: 'Cancelar' }, {
      t: 'Guardar', cls: 'primary', fn: async () => {
        const v = readForm(m.el, F); if (!v) return false;
        const [hh, mm] = v.hora.split(':').map(Number), ts = parseYmd(v.fecha); ts.setHours(hh, mm, 0, 0);
        if (v.sig) ts.setDate(ts.getDate() + 1);
        const row = { colaborador_id: c.id, fecha: v.fecha, ts: ts.toISOString(), tipo: v.tipo, nota: v.nota || (mk ? 'Modificada por administrador' : 'Registro manual'), origen: 'manual' };
        if (!mk) { const { data: dd } = await sb.from('marcaciones').select('turno,turno_id').eq('colaborador_id', c.id).eq('fecha', v.fecha).limit(1); row.turno = dd?.[0]?.turno || snapTurno(turnoById(c.turno_id)); row.turno_id = dd?.[0]?.turno_id ?? c.turno_id; }
        const { error } = mk ? await sb.from('marcaciones').update(row).eq('id', mk.id) : await sb.from('marcaciones').insert(row);
        if (error) { toast(dbErr(error), 'err'); return false; }
        await recalcDia(c.id, v.fecha); if (mk && mk.fecha !== v.fecha) await recalcDia(c.id, mk.fecha);
        toast('Marcación guardada', 'ok'); await done();
      }
    }]
  });
}

/* ---------- TURNOS ---------- */
async function tabTurnos(el) {
  await loadBase();
  el.innerHTML = `<div class="row between mb"><p class="muted" style="margin:0">Los turnos creados aquí aparecen en el desplegable “Turno / horario” al crear o editar un colaborador. Los cambios aplican solo a marcaciones nuevas: los registros anteriores conservan el turno con el que se hicieron. Tolerancia por defecto: ${CFG.params.tolerancia_min} min.</p><button class="btn primary" id="tNew">+ Nuevo turno</button></div>
  <div class="card flush"><div class="table-wrap"><table><thead><tr><th>Turno</th><th>Tipo</th><th>Horario</th><th>Días</th><th class="num">Horas/día</th><th>Tolerancia</th><th>Colaboradores</th><th></th></tr></thead><tbody>
  ${S.turnos.map(t => `<tr><td><b>${h(t.nombre)}</b> ${t.activo ? '' : '<span class="badge">inactivo</span>'}</td><td><span class="badge ${t.tipo === 'partida' ? 'amber' : 'blue'}">${t.tipo === 'partida' ? 'Partida' : 'Continua'}</span></td><td>${turnoTxt(t)}</td><td>${(t.dias || []).map(d => DIAS[d]).join(' ')}</td><td class="num">${(turnoMinutos(t) / 60).toFixed(2)}</td><td>${t.tolerancia_min} min</td><td>${S.colabs.filter(c => c.turno_id === t.id).length}</td>
  <td class="right"><button class="btn sm" data-e="${t.id}">Editar</button> <button class="icon-btn" data-x="${t.id}">🗑</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin turnos</td></tr>'}</tbody></table></div></div>`;
  $('#tNew').onclick = () => formTurno(); $$('[data-e]', el).forEach(b => b.onclick = () => formTurno(turnoById(b.dataset.e)));
  $$('[data-x]', el).forEach(b => b.onclick = async () => {
    if (!await confirmDlg('¿Eliminar el turno? Los colaboradores asignados quedarán con el horario por defecto.')) return;
    const { error } = await sb.from('turnos').delete().eq('id', b.dataset.x); if (error) return toast(dbErr(error), 'err'); go('turnos');
  });
}
function formTurno(t) {
  const F = [{ k: 'nombre', l: 'Nombre del turno', req: true, full: true }, { k: 'tipo', l: 'Tipo de jornada', type: 'select', opts: [['continua', 'Continua (solo inicio y salida)'], ['partida', 'Partida (con hora de almuerzo)']] },
    { k: 'tolerancia_min', l: 'Tolerancia (minutos)', type: 'number', def: 5, min: 0 }, { k: 'hora_inicio', l: 'Hora de inicio', type: 'time', req: true, def: '08:00' }, { k: 'hora_fin', l: 'Hora de salida', type: 'time', req: true, def: '17:00' },
    { k: 'almuerzo_inicio', l: 'Inicio de almuerzo', type: 'time', def: '12:00' }, { k: 'almuerzo_fin', l: 'Fin de almuerzo', type: 'time', def: '13:00' }, { k: 'activo', l: 'Turno activo', type: 'checkbox', def: true }];
  const dias = t?.dias || [1, 2, 3, 4, 5];
  const v0 = t ? { ...t, hora_inicio: tShort(t.hora_inicio), hora_fin: tShort(t.hora_fin), almuerzo_inicio: tShort(t.almuerzo_inicio), almuerzo_fin: tShort(t.almuerzo_fin) } : {};
  const m = modal({
    title: t ? 'Editar turno' : 'Nuevo turno', html: formHtml(F, v0) + `<label>Días laborales</label><div class="row">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="chk"><input type="checkbox" data-dia="${d}" ${dias.includes(d) ? 'checked' : ''}>${DIAS[d]}</label>`).join('')}</div>
      <div class="hint mt">En jornada partida, si el colaborador no marca salida a almuerzo, el sistema asume que salió y descuenta la hora de almuerzo; en jornada continua el almuerzo no aplica.</div><div id="tPrev" class="badge blue mt"></div>`,
    buttons: [{ t: 'Cancelar' }, {
      t: 'Guardar', cls: 'primary', fn: async () => {
        const v = readForm(m.el, F); if (!v) return false;
        if (v.tipo === 'partida' && (!v.almuerzo_inicio || !v.almuerzo_fin)) { toast('Indique el horario de almuerzo', 'err'); return false; }
        if (v.tipo === 'continua') { v.almuerzo_inicio = null; v.almuerzo_fin = null; }
        v.tolerancia_min = v.tolerancia_min ?? 5; v.dias = $$('[data-dia]', m.el).filter(i => i.checked).map(i => Number(i.dataset.dia));
        const { error } = t ? await sb.from('turnos').update(v).eq('id', t.id) : await sb.from('turnos').insert(v);
        if (error) { toast(dbErr(error), 'err'); return false; } toast('Turno guardado', 'ok'); go('turnos');
      }
    }]
  });
  const upd = () => {
    const tipo = $('#f_tipo', m.el).value; ['almuerzo_inicio', 'almuerzo_fin'].forEach(k => $('#f_' + k, m.el).closest('.field').style.display = tipo === 'partida' ? '' : 'none');
    const tt = { tipo, hora_inicio: $('#f_hora_inicio', m.el).value, hora_fin: $('#f_hora_fin', m.el).value, almuerzo_inicio: $('#f_almuerzo_inicio', m.el).value, almuerzo_fin: $('#f_almuerzo_fin', m.el).value };
    if (tt.hora_inicio && tt.hora_fin) $('#tPrev', m.el).textContent = `Horas ordinarias por día: ${(turnoMinutos(tt) / 60).toFixed(2)} h`;
  };
  $$('input,select', m.el).forEach(i => i.onchange = upd); upd();
}

/* =====================================================================
   REPORTES
   ===================================================================== */
async function computeReport(list, desde, hasta) {
  const ini = ymd(mondayOf(parseYmd(desde)));
  const marks = await fetchMarcas(list.length > 40 ? null : list.map(c => c.id), ini, hasta), by = groupBy(marks, 'colaborador_id');
  return list.map(c => {
    const ms = by[c.id] || [], t = turnoById(c.turno_id), res = calcHoras(ms, getTurnoHist(ms, t, S.turnos), desde, hasta, new Date());
    return { colab: c, turno: t, res, marks: ms.filter(m => m.fecha >= desde && m.fecha <= hasta) };
  });
}
function filaGeneral(r) {
  const T = r.res.total;
  return {
    id: r.colab.id, nombre: nombreCompleto(r.colab), cedula: r.colab.cedula, area: r.colab.area, cargo: r.colab.cargo, turno: r.turno?.nombre || 'Sin turno',
    dias: r.res.diasMarcados, total: r.res.totalMin, extra: r.res.extraMin, noct: T.ON + T.EN + T.ONF + T.ENF, dom: T.ODF + T.ONF + T.EDF + T.ENF,
    tarde: r.marks.filter(m => m.tipo === 'ingreso' && m.puntualidad === 'tarde').length, sinSalida: Object.values(r.res.dias).filter(d => d.sinSalida).length
  };
}
VIEWS.reportes = async el => {
  await loadBase();
  const hoy = new Date(), ini = ymd(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  el.innerHTML = pageHead('Reportes', 'Descargue PDF o Excel de horas laboradas, áreas, días marcados y detalle de marcaciones') +
    `<div class="card mb"><div class="grid3"><div class="field"><label>Tipo de reporte</label><select id="rTipo"><option value="general">General (todos los colaboradores)</option><option value="individual">Individual</option></select></div>
    <div class="field" id="rColW"><label>Colaborador</label><select id="rCol">${S.colabs.map(c => `<option value="${c.id}">${h(nombreCompleto(c))} (${c.cedula})</option>`).join('')}</select></div>
    <div class="field" id="rAreaW"><label>Área</label><select id="rArea"><option value="">Todas</option>${areas().map(a => `<option>${h(a)}</option>`).join('')}</select></div>
    <div class="field"><label>Desde</label><input type="date" id="rD" value="${ini}"></div><div class="field"><label>Hasta</label><input type="date" id="rH" value="${ymd(hoy)}"></div>
    <div class="field" style="align-self:end"><button class="btn primary" id="rGo" style="width:100%">Generar reporte</button></div></div></div><div id="rOut"></div>`;
  const tipo = () => $('#rTipo').value;
  const vis = () => { $('#rColW').style.display = tipo() === 'individual' ? '' : 'none'; $('#rAreaW').style.display = tipo() === 'general' ? '' : 'none'; };
  $('#rTipo').onchange = vis; vis();
  $('#rGo').onclick = async () => {
    const d = $('#rD').value, hh = $('#rH').value; if (!d || !hh || d > hh) return toast('Rango de fechas inválido', 'err');
    const out = $('#rOut'); out.innerHTML = '<div class="empty">Calculando…</div>';
    try {
      if (tipo() === 'individual') {
        const c = colabById($('#rCol').value), [r] = await computeReport([c], d, hh); reporteIndividual(out, r, d, hh);
      } else {
        const ar = $('#rArea').value, list = S.colabs.filter(c => !ar || c.area === ar), rs = await computeReport(list, d, hh); reporteGeneral(out, rs, d, hh);
      }
    } catch (e) { out.innerHTML = `<div class="card">${h(dbErr(e))}</div>`; }
  };
};
function reporteGeneral(out, rs, d, hh) {
  const filas = rs.map(filaGeneral), tot = filas.reduce((a, f) => ({ t: a.t + f.total, e: a.e + f.extra, d: a.d + f.dias }), { t: 0, e: 0, d: 0 });
  const porArea = {}; filas.forEach(f => { const a = f.area || 'Sin área'; (porArea[a] ||= { n: 0, t: 0, e: 0 }); porArea[a].n++; porArea[a].t += f.total; porArea[a].e += f.extra; });
  out.innerHTML = `<div class="kpis mb"><div class="card kpi"><div><div class="v">${filas.length}</div><div class="l">Colaboradores</div></div></div><div class="card kpi"><div><div class="v">${dec(tot.t)}</div><div class="l">Horas laboradas</div></div></div><div class="card kpi"><div><div class="v">${dec(tot.e)}</div><div class="l">Horas extras</div></div></div><div class="card kpi"><div><div class="v">${tot.d}</div><div class="l">Días marcados (suma)</div></div></div></div>
  <div class="row mb"><button class="btn primary" id="xPdf">⬇ Descargar PDF</button><button class="btn ok" id="xXls">⬇ Descargar Excel</button></div>
  <div class="card flush"><div class="table-wrap"><table><thead><tr><th>Colaborador</th><th>Área</th><th>Turno</th><th class="num">Días marcados</th><th class="num">Horas laboradas</th><th class="num">Extras</th><th class="num">Rec. nocturno</th><th class="num">Dom/Fest</th><th class="num">Tardanzas</th><th></th></tr></thead><tbody>
  ${filas.map(f => `<tr><td><b style="font-weight:600">${h(f.nombre)}</b><div class="small muted">C.C. ${h(f.cedula)}</div></td><td>${h(f.area || '')}</td><td>${h(f.turno)}</td><td class="num">${f.dias}</td><td class="num">${dec(f.total)}</td><td class="num">${dec(f.extra)}</td><td class="num">${dec(f.noct)}</td><td class="num">${dec(f.dom)}</td><td class="num">${f.tarde}</td><td class="right"><button class="btn sm" data-v="${f.id}">Ver detalle</button></td></tr>`).join('')}</tbody></table></div></div>
  <div class="card mt"><h3>Horas por área</h3><table class="mt"><thead><tr><th>Área</th><th class="num">Colaboradores</th><th class="num">Horas</th><th class="num">Extras</th></tr></thead><tbody>${Object.entries(porArea).map(([a, v]) => `<tr><td>${h(a)}</td><td class="num">${v.n}</td><td class="num">${dec(v.t)}</td><td class="num">${dec(v.e)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#xPdf').onclick = () => pdfReporteGeneral(filas, d, hh);
  $('#xXls').onclick = () => xlsxReporte(`reporte_general_${d}_${hh}.xlsx`, {
    Resumen: [['Colaborador', 'Cédula', 'Cargo', 'Área', 'Turno', 'Días marcados', 'Horas laboradas', 'Horas extras', 'Recargo nocturno (h)', 'Dom/Fest (h)', 'Tardanzas', 'Días sin salida'], ...filas.map(f => [f.nombre, f.cedula, f.cargo, f.area, f.turno, f.dias, +dec(f.total), +dec(f.extra), +dec(f.noct), +dec(f.dom), f.tarde, f.sinSalida])],
    'Detalle marcaciones': [['Colaborador', 'Cédula', 'Área', 'Fecha', 'Hora', 'Tipo', 'Origen', 'Puntualidad', 'Diferencia (min)', 'Nota'], ...rs.flatMap(r => r.marks.map(m => [nombreCompleto(r.colab), r.colab.cedula, r.colab.area, m.fecha, fmtTime(m.ts), m.tipo, m.origen, m.puntualidad ? PUNT_LABEL[m.tipo][m.puntualidad] : '', m.diff_min ?? '', m.nota || '']))],
    'Horas legales': [['Colaborador', 'Cédula', ...CATS.map(c => CAT_LABEL[c])], ...rs.map(r => [nombreCompleto(r.colab), r.colab.cedula, ...CATS.map(c => +dec(r.res.total[c]))])]
  });
  $$('[data-v]', out).forEach(b => b.onclick = () => detalleColab(colabById(b.dataset.v), d, hh));
}
function reporteIndividual(out, r, d, hh) {
  const rows = filasDias(r.res, r.marks), c = r.colab, T = r.res.total;
  out.innerHTML = `<div class="card mb"><div class="row between"><div class="person">${avatarHtml(c)}<div><b>${h(nombreCompleto(c))}</b><span>${h(c.cargo || '')} · ${h(c.area || '')} · ${h(r.turno?.nombre || 'Sin turno')}</span></div></div>
    <div class="row"><button class="btn primary" id="xPdf">⬇ PDF</button><button class="btn ok" id="xXls">⬇ Excel</button></div></div></div>
  <div class="kpis mb"><div class="card kpi"><div><div class="v">${dec(r.res.totalMin)}</div><div class="l">Horas laboradas</div></div></div><div class="card kpi"><div><div class="v">${r.res.diasMarcados}</div><div class="l">Días marcados</div></div></div><div class="card kpi"><div><div class="v">${dec(r.res.extraMin)}</div><div class="l">Horas extras</div></div></div></div>
  <div class="card flush mb"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Ingreso</th><th>Salida</th><th>Estado</th><th class="num">Total</th><th class="num">Ord.</th><th class="num">Rec. noct.</th><th class="num">Extras</th><th class="num">Dom/Fest</th></tr></thead><tbody>
  ${rows.map(x => `<tr><td>${x.dow} ${fmtDate(x.fecha)}</td><td>${fmtTime(x.ing?.ts)}</td><td>${x.sal ? fmtTime(x.sal.ts) : (x.sinSalida ? '<span class="badge red">Sin salida</span>' : '—')}</td><td>${x.ing ? puntBadge(x.ing) : '—'}</td><td class="num">${hm(x.total)}</td><td class="num">${hm(x.od)}</td><td class="num">${hm(x.on)}</td><td class="num">${hm(x.extra)}</td><td class="num">${hm(x.dom)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Sin marcaciones en el rango</td></tr>'}</tbody></table></div></div>
  <div class="card"><h3>Detalle legal de horas</h3><table class="mt"><tbody>${CATS.map(k => `<tr><td>${CAT_LABEL[k]}</td><td class="num">${dec(T[k])} h</td></tr>`).join('')}</tbody></table></div>
  <div class="card mt"><h3>Detalle de marcaciones</h3><table class="mt"><thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Origen</th><th>Puntualidad</th><th>Nota</th></tr></thead><tbody>${r.marks.map(m => `<tr><td>${fmtDate(m.fecha)}</td><td>${fmtTime(m.ts)}</td><td>${m.tipo}</td><td>${m.origen}</td><td>${puntBadge(m)}</td><td class="small muted">${h(m.nota || '')}</td></tr>`).join('')}</tbody></table></div>`;
  $('#xPdf').onclick = () => pdfReporteIndividual(c, r.turno, d, hh, r.res, r.marks);
  $('#xXls').onclick = () => xlsxReporte(`reporte_${c.cedula}_${d}_${hh}.xlsx`, {
    Días: [['Fecha', 'Día', 'Ingreso', 'Salida', 'Estado', 'Total (h)', 'Ordinaria diurna', 'Recargo nocturno', 'Extra diurna', 'Extra nocturna', 'Dom/Fest'], ...rows.map(x => [x.fecha, x.dow, fmtTime(x.ing?.ts), x.sal ? fmtTime(x.sal.ts) : '', x.estado, +dec(x.total), +dec(x.od), +dec(x.on), +dec(x.ed), +dec(x.en), +dec(x.dom)])],
    Marcaciones: [['Fecha', 'Hora', 'Tipo', 'Origen', 'Puntualidad', 'Diferencia (min)', 'Nota'], ...r.marks.map(m => [m.fecha, fmtTime(m.ts), m.tipo, m.origen, m.puntualidad ? PUNT_LABEL[m.tipo][m.puntualidad] : '', m.diff_min ?? '', m.nota || ''])],
    'Horas legales': [['Concepto', 'Horas'], ...CATS.map(k => [CAT_LABEL[k], +dec(T[k])]), ['TOTAL', +dec(r.res.totalMin)]]
  });
}
