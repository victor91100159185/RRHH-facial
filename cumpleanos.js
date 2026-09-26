/* =====================================================================
   CUMPLEAÑOS — tarjetas ordenadas por mes y día, con la fecha de nacimiento de cada colaborador
   ===================================================================== */
VIEWS.cumpleanos = async el => {
  await loadBase();
  const hoy = new Date(), y = hoy.getFullYear(), hoyD = new Date(y, hoy.getMonth(), hoy.getDate());
  const filtroMes = S.bdMes ?? 'todos', q = (S.bdQ || '').toLowerCase();
  const act = activos(), con = act.filter(c => c.fecha_nacimiento), sin = act.filter(c => !c.fecha_nacimiento);
  const lista = con.map(c => {
    const n = parseYmd(c.fecha_nacimiento), este = new Date(y, n.getMonth(), n.getDate());
    let prox = este < hoyD ? new Date(y + 1, n.getMonth(), n.getDate()) : este;
    return { c, mes: n.getMonth(), dia: n.getDate(), edad: y - n.getFullYear(), dias: Math.round((prox - hoyD) / 864e5), paso: este < hoyD };
  }).sort((a, b) => a.mes - b.mes || a.dia - b.dia || nombreCompleto(a.c).localeCompare(nombreCompleto(b.c)));
  const hoyL = lista.filter(x => x.dias === 0), prox = lista.filter(x => x.dias > 0 && x.dias <= 30).sort((a, b) => a.dias - b.dias);
  const tarjeta = x => `<div class="bday ${x.dias === 0 ? 'hoy' : x.dias <= 7 ? 'prox' : ''}"><div class="day">${x.dia} ${MESES[x.mes].slice(0, 3)}</div>${avatarHtml(x.c, 'lg')}<b style="display:block">${h(nombreCompleto(x.c))}</b><div class="small muted">${h(x.c.cargo || '')}${x.c.area ? ' · ' + h(x.c.area) : ''}</div>
    <div class="mt">${x.dias === 0 ? '<span class="badge amber">🎂 ¡Hoy cumple ' + x.edad + ' años!</span>' : x.paso ? `<span class="badge">Cumplió ${x.edad} años</span>` : `<span class="badge blue">Cumple ${x.edad} años${x.dias <= 30 ? ' · en ' + x.dias + ' día' + (x.dias === 1 ? '' : 's') : ''}</span>`}</div>
    <div class="mt"><button class="btn sm" data-f="${x.c.id}">🎉 Enviar felicitación</button></div></div>`;
  const meses = [...Array(12).keys()].filter(m => (filtroMes === 'todos' || Number(filtroMes) === m));
  const vis = lista.filter(x => !q || nombreCompleto(x.c).toLowerCase().includes(q));
  el.innerHTML = pageHead('Cumpleaños', `${con.length} de ${act.length} colaboradores tienen fecha de nacimiento registrada`) +
    `<div class="card mb"><div class="row between"><div><b>🔊 Alerta sonora de cumpleaños</b><div class="small muted">Un día antes del cumpleaños suena una alerta y una voz dice “Te recuerdo que [nombre] cumple años mañana”. Se repite 2 veces al día (${BDAY_HORAS.map(x => x + ':00').join(' y ')}) mientras el panel esté abierto en este equipo.</div></div>
      <div class="row"><label class="chk"><input type="checkbox" id="bAl" ${bdayOn() ? 'checked' : ''}> Activada</label><button class="btn sm" id="bTest">🔊 Probar alerta</button></div></div></div>` +
    (hoyL.length ? `<div class="card mb" style="background:linear-gradient(90deg,#fff8e6,#fff);border-color:#f59e0b"><h3>🎂 Hoy cumplen años</h3><div class="bday-grid mt">${hoyL.map(tarjeta).join('')}</div></div>` : '') +
    (prox.length ? `<div class="card mb"><h3>Próximos 30 días</h3><div class="bday-grid mt">${prox.slice(0, 8).map(tarjeta).join('')}</div></div>` : '') +
    `<div class="row mb"><div><label>Mes</label><select id="bM"><option value="todos">Todos los meses</option>${MESES.map((m, i) => `<option value="${i}" ${String(filtroMes) === String(i) ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select></div><div class="grow"><label>Buscar</label><input id="bQ" value="${h(S.bdQ || '')}" placeholder="Nombre del colaborador"></div></div>` +
    (meses.map(m => { const ms = vis.filter(x => x.mes === m); return ms.length ? `<h2 style="margin:18px 0 10px;text-transform:capitalize">${MESES[m]} <span class="badge blue">${ms.length}</span></h2><div class="bday-grid">${ms.map(tarjeta).join('')}</div>` : ''; }).join('') || '<div class="card empty">No hay cumpleaños para mostrar. Registre la fecha de nacimiento en la ficha del colaborador (Colaboradores → Editar).</div>') +
    (sin.length ? `<div class="card mt"><div class="row between"><h3>Sin fecha de nacimiento (${sin.length})</h3><button class="btn sm primary" id="bfAll">Guardar todas</button></div><p class="muted small">Escriba la fecha de cada colaborador y guarde: aparecerán en el calendario y en las alertas.</p>
      <table><tbody>${sin.map(c => `<tr><td>${colabCell(c.id)}</td><td style="width:190px"><input type="date" class="bfd" data-id="${c.id}" max="${ymd(new Date())}"></td><td class="right" style="width:110px"><button class="btn sm" data-bf="${c.id}">Guardar</button></td></tr>`).join('')}</tbody></table></div>` : '');
  const guardarFN = async (ids) => {
    let n = 0; for (const id of ids) { const v = $(`.bfd[data-id="${id}"]`, el).value; if (!v) continue; const { error } = await sb.from('colaboradores').update({ fecha_nacimiento: v }).eq('id', id); if (error) return toast(dbErr(error), 'err'); n++; }
    if (n) { toast(`${n} fecha(s) guardada(s)`, 'ok'); go('cumpleanos'); } else toast('Seleccione una fecha primero', 'err');
  };
  $$('[data-bf]', el).forEach(b => b.onclick = () => guardarFN([b.dataset.bf]));
  $('#bfAll', el)?.addEventListener('click', () => guardarFN(sin.map(c => c.id)));
  $('#bAl', el).onchange = e => { localStorage.setItem('rrhh_bday_alert', e.target.checked ? 'on' : 'off'); toast(e.target.checked ? 'Alerta de cumpleaños activada' : 'Alerta de cumpleaños desactivada', 'ok'); };
  $('#bTest', el).onclick = () => chequearCumple(true);
  $('#bM').onchange = e => { S.bdMes = e.target.value; go('cumpleanos'); };
  $('#bQ').oninput = debounce(e => { S.bdQ = e.target.value; go('cumpleanos'); }, 400);
  $$('[data-f]', el).forEach(b => b.onclick = async () => {
    const c = colabById(b.dataset.f), { error } = await sb.from('mensajes').insert({ colaborador_id: c.id, remitente: 'admin', texto: `🎂 ¡Feliz cumpleaños, ${c.nombres.split(' ')[0]}! Todo el equipo te desea un día maravilloso. 🎉` });
    if (error) return toast(dbErr(error), 'err'); toast('Felicitación enviada por el chat', 'ok');
  });
};
