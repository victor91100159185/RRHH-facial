/* =====================================================================
   Generación de PDF (jsPDF + autoTable) y Excel (SheetJS)
   ===================================================================== */
let _logo = null;
async function logoData() {
  if (_logo !== null) return _logo;
  try {
    const b = await (await fetch('logo.png')).blob();
    _logo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  } catch (e) { _logo = ''; }
  return _logo;
}
async function newPdf(titulo, sub, landscape = false) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 58, 117); doc.rect(0, 0, W, 26, 'F');
  const lg = await logoData();
  if (lg) { try { doc.addImage(lg, 'PNG', 8, 2, 22, 22); } catch (e) { } }
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(CFG.empresa.nombre || 'Empresa', 34, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`NIT ${CFG.empresa.nit || '—'}  ·  ${CFG.empresa.ciudad || ''}`, 34, 17);
  doc.setFontSize(9); doc.text(new Date().toLocaleString('es-CO'), W - 8, 17, { align: 'right' });
  doc.setTextColor(30, 58, 117); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo, 10, 36);
  if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(sub, 10, 42); }
  doc.setTextColor(0);
  return doc;
}
function pdfFooter(doc) {
  const n = doc.internal.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(`Cashless Colombia · RRHH — Página ${i} de ${n}`, W / 2, H - 6, { align: 'center' }); }
}
const AT_HEAD = { fillColor: [30, 58, 117], textColor: 255, fontSize: 8 };

/** Filas por día para tablas/PDF/Excel */
function filasDias(res, marks) {
  const porDia = groupBy(marks, 'fecha');
  return Object.keys(res.dias).sort().map(f => {
    const d = res.dias[f], ms = (porDia[f] || []).sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const ing = ms.find(m => m.tipo === 'ingreso'), sal = [...ms].reverse().find(m => m.tipo === 'salida');
    const dom = d.min.ODF + d.min.ONF + d.min.EDF + d.min.ENF;
    return {
      fecha: f, dow: DIAS[parseYmd(f).getDay()], ing, sal, total: d.total, od: d.min.OD, on: d.min.ON, ed: d.min.ED, en: d.min.EN, dom,
      extra: d.min.ED + d.min.EN + d.min.EDF + d.min.ENF, abierta: d.abierta, sinSalida: d.sinSalida, d,
      estado: ing ? PUNT_LABEL.ingreso[ing.puntualidad] || 'Manual' : '—', marcas: ms
    };
  });
}

async function pdfReporteIndividual(colab, turno, desde, hasta, res, marks) {
  const doc = await newPdf('Reporte de asistencia y horas laboradas', `${nombreCompleto(colab)} · C.C. ${colab.cedula} · ${colab.cargo || ''} · ${colab.area || ''}\nPeriodo: ${fmtDate(desde)} al ${fmtDate(hasta)}   ·   Turno: ${turno ? turno.nombre + ' (' + turnoTxt(turno) + ')' : 'Sin turno (08:00–17:00)'}`);
  const rows = filasDias(res, marks);
  doc.autoTable({
    startY: 52, head: [['Fecha', 'Día', 'Ingreso', 'Salida', 'Estado ingreso', 'Total', 'Ord. diurna', 'Rec. noct.', 'Extra diur.', 'Extra noct.', 'Dom/Fest']],
    body: rows.map(r => [fmtDate(r.fecha), r.dow, fmtTime(r.ing?.ts), r.sal ? fmtTime(r.sal.ts) : (r.sinSalida ? 'Sin salida' : (r.abierta ? 'En curso' : '—')), r.estado, hm(r.total), hm(r.od), hm(r.on), hm(r.ed), hm(r.en), hm(r.dom)]),
    headStyles: AT_HEAD, styles: { fontSize: 8 }, alternateRowStyles: { fillColor: [244, 246, 252] }
  });
  const t = res.total; let y = doc.lastAutoTable.finalY + 8;
  doc.autoTable({
    startY: y, head: [['Concepto legal (Colombia)', 'Horas', 'Factor s/ hora ordinaria']],
    body: [
      ...CATS.map(c => [CAT_LABEL[c], dec(t[c]), (factorTotal(c, hasta) * 100).toFixed(0) + '%']),
      [{ content: 'TOTAL HORAS LABORADAS', styles: { fontStyle: 'bold' } }, { content: dec(res.totalMin), styles: { fontStyle: 'bold' } }, ''],
      ['Días marcados', String(res.diasMarcados), ''], ['Horas extras totales', dec(res.extraMin), '']
    ],
    headStyles: AT_HEAD, styles: { fontSize: 9 }, tableWidth: 120
  });
  doc.setFontSize(8); doc.setTextColor(110);
  doc.text(`Jornada máxima vigente: ${jornadaSemanal(hasta)} h/semana · Recargo dominical/festivo: ${(recDominical(hasta) * 100).toFixed(0)}% · Nocturno: ${CFG.params.hora_nocturna_inicio}:00–0${CFG.params.hora_nocturna_fin}:00 (Ley 2101/2021 y Ley 2466/2025).`, 10, doc.lastAutoTable.finalY + 8, { maxWidth: 190 });
  // detalle de marcaciones
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 16, head: [['Fecha', 'Hora', 'Tipo', 'Origen', 'Puntualidad', 'Nota']],
    body: [...marks].sort((a, b) => new Date(a.ts) - new Date(b.ts)).map(m => [fmtDate(m.fecha), fmtTime(m.ts), m.tipo, m.origen, m.puntualidad ? PUNT_LABEL[m.tipo][m.puntualidad] : '—', m.nota || '']),
    headStyles: AT_HEAD, styles: { fontSize: 8 }, margin: { left: 10 }
  });
  pdfFooter(doc);
  doc.save(`reporte_${colab.cedula}_${desde}_${hasta}.pdf`);
}

async function pdfReporteGeneral(filas, desde, hasta) {
  const doc = await newPdf('Reporte general de asistencia', `Periodo: ${fmtDate(desde)} al ${fmtDate(hasta)} · ${filas.length} colaboradores`, true);
  doc.autoTable({
    startY: 48, head: [['Colaborador', 'Cédula', 'Área', 'Cargo', 'Días marcados', 'Horas laboradas', 'Extras', 'Rec. nocturno', 'Dom/Fest', 'Tardanzas', 'Sin salida']],
    body: filas.map(f => [f.nombre, f.cedula, f.area || '', f.cargo || '', f.dias, dec(f.total), dec(f.extra), dec(f.noct), dec(f.dom), f.tarde, f.sinSalida]),
    headStyles: AT_HEAD, styles: { fontSize: 8 }, alternateRowStyles: { fillColor: [244, 246, 252] }
  });
  const tot = filas.reduce((a, f) => ({ t: a.t + f.total, e: a.e + f.extra }), { t: 0, e: 0 });
  doc.setFontSize(9); doc.text(`Total horas laboradas: ${dec(tot.t)}    Total horas extras: ${dec(tot.e)}`, 10, doc.lastAutoTable.finalY + 8);
  pdfFooter(doc); doc.save(`reporte_general_${desde}_${hasta}.pdf`);
}

function xlsxReporte(nombreArchivo, hojas) { // hojas: {NombreHoja: [[fila],[fila]]}
  const wb = XLSX.utils.book_new();
  Object.entries(hojas).forEach(([n, rows]) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map(() => ({ wch: 18 })); XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31)); });
  XLSX.writeFile(wb, nombreArchivo);
}

/* ---------- desprendible de nómina ---------- */
async function pdfDesprendible(colab, n) {
  const doc = await newPdf('Comprobante de pago de nómina (desprendible)', `Periodo: ${fmtDate(n.ini)} al ${fmtDate(n.fin)}`);
  doc.autoTable({
    startY: 46, theme: 'plain', styles: { fontSize: 9 },
    body: [['Colaborador', nombreCompleto(colab), 'Cédula', colab.cedula], ['Cargo', colab.cargo || '', 'Área', colab.area || ''], ['Salario base', money(colab.salario), 'Fecha ingreso', fmtDate(colab.fecha_ingreso)], ['Banco', colab.banco || '—', 'Cuenta', colab.cuenta_bancaria || '—']],
    columnStyles: { 0: { fontStyle: 'bold' }, 2: { fontStyle: 'bold' } }
  });
  const dev = [['Salario básico (' + n.dias.pagados + ' días)', money(n.basico)]];
  if (n.incap) dev.push([`Incapacidad (${n.dias.incapacidad} días · 66,67%)`, money(n.incap)]);
  (n.extrasDet || []).forEach(e => dev.push([`${CAT_LABEL[e.cat]} (${dec(e.min)} h × ${(e.factor * 100).toFixed(0)}%)`, money(e.valor)]));
  if (n.bonif) dev.push(['Bonificaciones', money(n.bonif)]);
  if (n.aux) dev.push(['Auxilio de transporte', money(n.aux)]);
  dev.push([{ content: 'TOTAL DEVENGADO', styles: { fontStyle: 'bold' } }, { content: money(n.devengado), styles: { fontStyle: 'bold' } }]);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, head: [['Devengados', 'Valor']], body: dev, headStyles: AT_HEAD, styles: { fontSize: 9 }, columnStyles: { 1: { halign: 'right' } } });
  const ded = [['Salud (4%)', money(n.salud)], ['Pensión (4%)', money(n.pension)]];
  if (n.fsp) ded.push(['Fondo de solidaridad pensional', money(n.fsp)]);
  if (n.adelantos) ded.push(['Adelantos de sueldo', money(n.adelantos)]);
  if (n.otrosDesc) ded.push(['Otros descuentos', money(n.otrosDesc)]);
  ded.push([{ content: 'TOTAL DEDUCCIONES', styles: { fontStyle: 'bold' } }, { content: money(n.deducciones), styles: { fontStyle: 'bold' } }]);
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, head: [['Deducciones', 'Valor']], body: ded, headStyles: AT_HEAD, styles: { fontSize: 9 }, columnStyles: { 1: { halign: 'right' } } });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, body: [[{ content: 'NETO A PAGAR', styles: { fontStyle: 'bold', fontSize: 12 } }, { content: money(n.neto), styles: { fontStyle: 'bold', fontSize: 12, halign: 'right' } }]], theme: 'grid', styles: { fillColor: [227, 235, 255] } });
  doc.setFontSize(8); doc.setTextColor(110);
  doc.text(`IBC: ${money(n.ibc)} · Valor hora ordinaria: ${money(n.vh)} · Documento generado electrónicamente.`, 10, doc.lastAutoTable.finalY + 8);
  doc.text('_______________________________', 10, doc.lastAutoTable.finalY + 30); doc.text('Firma del colaborador', 10, doc.lastAutoTable.finalY + 34);
  pdfFooter(doc); doc.save(`desprendible_${colab.cedula}_${n.periodo}.pdf`);
}

/* ---------- certificado laboral ---------- */
async function pdfCertificado(colab, conSalario = true) {
  const E = CFG.empresa, doc = await newPdf('CERTIFICADO LABORAL', '');
  const hoy = new Date(); const W = doc.internal.pageSize.getWidth();
  doc.setFont('times', 'normal'); doc.setFontSize(12); doc.setTextColor(0);
  doc.text(`${E.ciudad || ''}, ${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`, 20, 58);
  doc.setFont('times', 'bold'); doc.text('A QUIEN INTERESE:', 20, 74);
  doc.setFont('times', 'normal');
  const activo = colab.estado === 'activo';
  let txt = `${E.nombre}, identificada con NIT ${E.nit || '________'}, hace constar que el(la) señor(a) ${nombreCompleto(colab).toUpperCase()}, identificado(a) con cédula de ciudadanía No. ${Number(colab.cedula) ? Number(colab.cedula).toLocaleString('es-CO') : colab.cedula}, ${activo ? 'labora' : 'laboró'} en nuestra empresa desde el ${fmtDateLong(colab.fecha_ingreso)}, desempeñando el cargo de ${colab.cargo || '________'}${colab.area ? ' en el área de ' + colab.area : ''}, mediante contrato a ${String(colab.tipo_contrato || '').toLowerCase()}`;
  txt += conSalario ? `, con una asignación salarial mensual de ${money(colab.salario)} (${Number(colab.salario).toLocaleString('es-CO')} pesos m/cte).` : '.';
  txt += `\n\nLa presente certificación se expide a solicitud del interesado, en ${E.ciudad || 'la ciudad'}, a los ${hoy.getDate()} días del mes de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}.`;
  doc.text(doc.splitTextToSize(txt, W - 40), 20, 88, { align: 'left', lineHeightFactor: 1.6 });
  doc.text('Cordialmente,', 20, 190);
  doc.text('______________________________', 20, 216);
  doc.setFont('times', 'bold'); doc.text(E.representante || '', 20, 223);
  doc.setFont('times', 'normal'); doc.text(E.cargo_rep || '', 20, 229); doc.text(E.nombre || '', 20, 235);
  if (E.telefono || E.correo) doc.text(`${E.telefono || ''} ${E.correo || ''}`, 20, 241);
  doc.save(`certificado_laboral_${colab.cedula}.pdf`);
}
