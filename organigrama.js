/* =====================================================================
   ORGANIGRAMA — se arma con el cargo, el área y el campo "Supervisor" de cada colaborador activo
   ===================================================================== */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const NIVELES = ['Dirección general', 'Gerencia / administración', 'Jefaturas y coordinación', 'Profesionales', 'Operativo y apoyo'];
function nivelCargo(cargo) {
  const c = norm(cargo);
  if (/gerente general|presidente|\bceo\b|director general|representante legal|propietari|dueno|fundador|socio|gerente de la empresa/.test(c)) return 0;
  if (/^(aux|auxiliar|asistente|operari|tecnico|mensajer|servicios generales|recepcion|vigilante|conductor|ayudante)|\b(auxiliar|asistente|operari)/.test(c)) return 4;
  if (/gerente|director|subgerente|subdirector|vicepres|\bvp\b|administrador/.test(c)) return 1;
  if (/jefe|coordinador|supervisor|lider|encargado|responsable/.test(c)) return 2;
  if (/analista|especialista|ingenier|medic|contador|abogad|psicolog|desarrollador|disenador|enfermer|profesional|asesor|consultor|reclutador|comercial|vendedor|cajero/.test(c)) return 3;
  return 4;
}
function armarArbol(cs) {
  const nodos = cs.map(c => ({ c, nivel: nivelCargo(c.cargo), hijos: [], padre: null, nombre: norm(nombreCompleto(c)) }));
  const porId = Object.fromEntries(nodos.map(n => [n.c.id, n]));
  const sube = (n, objetivo) => { for (let p = objetivo; p; p = p.padre) if (p === n) return true; return false; };
  nodos.forEach(n => {          // 1) supervisor explícito
    const s = norm(n.c.supervisor); if (!s) return;
    const jefe = nodos.find(o => o !== n && (o.nombre === s || o.nombre.includes(s) || s.includes(o.nombre)));
    if (jefe && !sube(n, jefe)) { n.padre = jefe; jefe.hijos.push(n); }
  });
  [...nodos].sort((a, b) => a.nivel - b.nivel).forEach(n => {   // 2) por cargo y área
    if (n.padre || n.nivel === 0) return;
    const arriba = nodos.filter(o => o !== n && o.nivel < n.nivel && !sube(n, o));
    if (!arriba.length) return;
    const misma = arriba.filter(o => (o.c.area || '') === (n.c.area || '') && n.c.area);
    const pool = misma.length ? misma : arriba, top = Math.max(...pool.map(o => o.nivel));
    const cand = pool.filter(o => o.nivel === top).sort((a, b) => a.hijos.length - b.hijos.length);
    n.padre = cand[0]; cand[0].hijos.push(n);
  });
  const raices = nodos.filter(n => !n.padre);
  const ord = a => { a.hijos.sort((x, y) => x.nivel - y.nivel || x.nombre.localeCompare(y.nombre)); a.hijos.forEach(ord); };
  nodos.forEach(ord); raices.sort((x, y) => x.nivel - y.nivel || x.nombre.localeCompare(y.nombre));
  return raices;
}
const nodoHtml = n => `<div class="node l${n.nivel}" data-id="${n.c.id}" style="cursor:pointer" title="Ver perfil">${avatarHtml(n.c)}<b>${h(nombreCompleto(n.c))}</b><span>${h(n.c.cargo || 'Sin cargo')}</span>${n.c.area ? `<span class="badge" style="margin-top:4px">${h(n.c.area)}</span>` : ''}</div>`;
const liHtml = n => `<li>${nodoHtml(n)}${n.hijos.length ? `<ul>${n.hijos.map(liHtml).join('')}</ul>` : ''}</li>`;

function renderOrganigrama(el) {
  const act = activos(), modo = S.orgModo || 'jerarquia', E = CFG.empresa.nombre || 'Organización';
  if (!act.length) { el.innerHTML = '<div class="card mt"><div class="empty">Sin colaboradores activos para armar el organigrama.</div></div>'; return; }
  let arbol;
  if (modo === 'area') {
    const por = groupBy(act, c => c.area || 'Sin área');
    arbol = `<ul><li><div class="node l0" style="border-top-color:#a020f0"><b>${h(E)}</b><span>${act.length} colaboradores</span></div><ul>${Object.entries(por).sort((a, b) => a[0].localeCompare(b[0])).map(([a, cs]) => {
      const raices = armarArbol(cs); return `<li><div class="node l1"><b>${h(a)}</b><span>${cs.length} persona(s)</span></div><ul>${raices.map(liHtml).join('')}</ul></li>`;
    }).join('')}</ul></li></ul>`;
  } else {
    const raices = armarArbol(act);
    arbol = raices.length === 1 ? `<ul>${liHtml(raices[0])}</ul>` : `<ul><li><div class="node l0"><b>${h(E)}</b><span>${act.length} colaboradores</span></div><ul>${raices.map(liHtml).join('')}</ul></li></ul>`;
  }
  el.innerHTML = `<div class="card mt"><div class="row between"><div><h3>Organigrama de la organización</h3><p class="muted small" style="margin:4px 0 0">Se arma con el <b>cargo</b> y el <b>área</b> de cada colaborador; si la ficha tiene <b>Supervisor</b>, se respeta esa línea de mando.</p></div>
    <div class="seg" id="orgSeg"><span data-m="jerarquia" class="${modo === 'jerarquia' ? 'on' : ''}">Por jerarquía</span><span data-m="area" class="${modo === 'area' ? 'on' : ''}">Por áreas</span></div></div>
    <div class="row mt small muted">${NIVELES.map((n, i) => `<span><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-right:5px;background:${['#a020f0', '#3b5bdb', '#22d3ee', '#94a3b8', '#94a3b8'][i]}"></span>${n}</span>`).join('')}</div>
    <div class="org">${arbol}</div></div>`;
  $$('#orgSeg span', el).forEach(s => s.onclick = () => { S.orgModo = s.dataset.m; renderOrganigrama(el); });
  $$('.node[data-id]', el).forEach(n => n.onclick = () => perfilColab(colabById(n.dataset.id)));
}
