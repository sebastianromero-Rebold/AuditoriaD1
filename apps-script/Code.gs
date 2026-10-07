/**
 * D1 · Rebold Audit — backend del cuadro de mando (Google Apps Script).
 *
 * Fuente: Google Sheet "D1_Rebold_Audit_Seguimiento".
 * - Lee Indicadores, Criterios, Rubrica_Scoring y Mediciones_Mensuales (línea base del ORI).
 * - Los hallazgos viven en Alertas_QuickWins_Acciones (los carga operaciones). El script les asigna
 *   un ID en la columna L y guarda el seguimiento (estado de Zelva, validación de Rebold, tiempos)
 *   en la hoja "Seguimiento". La columna "Estado" de Alertas se mantiene sincronizada.
 * - Cada cambio queda en "Log_Cambios" y en un Google Sheet de respaldo independiente.
 * - Cada cambio de estado notifica a Rebold por Slack.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   ZELVA_CODE         código de acceso de Zelva (reporta estados)
 *   REBOLD_CODE        código de Rebold (valida y sube hallazgos)
 *   LECTURA_CODE       opcional, solo lectura (ej. D1)
 *   SLACK_BOT_TOKEN    xoxb-… (scope chat:write). Alternativa: SLACK_WEBHOOK_URL
 *   SLACK_REBOLD_ID    usuario (U…) o canal (C…) de Rebold que recibe las notificaciones
 *   DASHBOARD_URL      https://sebastianromero-rebold.github.io/AuditoriaD1/
 *   LOG_BACKUP_ID      lo crea setup()
 */
var VERSION = '2.0.0';
var SHEET_ID = '1mUT5FFzteufgbQ1owWbaIWVq-5g4l5Sc79xcF_JAT80';
var SH_ALERTAS = 'Alertas_QuickWins_Acciones';
var SH_SEG = 'Seguimiento';
var SH_LOG = 'Log_Cambios';
var COL_ID = 12; // columna L de Alertas_QuickWins_Acciones
var SEG_COLS = ['id', 'criterio', 'horizonte', 'delta', 'fecha_alta', 'estado', 'comentario', 'fecha_estado', 'fecha_realizado',
  'validacion', 'validado_por', 'fecha_validacion', 'comentario_validacion', 'horas_resolucion', 'horas_validacion'];
var LOG_COLS = ['ts', 'usuario', 'rol', 'accion', 'id', 'antes', 'despues', 'comentario', 'snapshot'];
var INICIO_PLAN = '2026-10-05';
var CORTOS = { AES: 'Activación', CES: 'Creatividad', UXCS: 'Experiencia', AIS: 'Audiencias' };
var ESTADOS_ZELVA = ['En curso', 'Realizado', 'Necesita apoyo', 'No se pudo realizar'];
var TZ = 'America/Bogota';

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

/* ---------------- Instalación ---------------- */
function setup() {
  var ss = ss_();
  ensureSheet_(ss, SH_SEG, SEG_COLS);
  ensureSheet_(ss, SH_LOG, LOG_COLS);
  var al = ss.getSheetByName(SH_ALERTAS);
  if (!al.getRange(1, COL_ID).getValue()) al.getRange(1, COL_ID).setValue('ID_Seguimiento').setFontWeight('bold');
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('LOG_BACKUP_ID')) {
    var bk = SpreadsheetApp.create('D1_Rebold_Audit_Log_Respaldo');
    ensureSheet_(bk, SH_LOG, LOG_COLS);
    var def = bk.getSheetByName('Hoja 1') || bk.getSheetByName('Sheet1');
    if (def) bk.deleteSheet(def);
    p.setProperty('LOG_BACKUP_ID', bk.getId());
    Logger.log('Respaldo creado: ' + bk.getUrl());
  }
  var n = sync_();
  Logger.log('Listo. Backend v' + VERSION + ' · hallazgos nuevos registrados: ' + n);
}
function ensureSheet_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Asigna ID a las filas nuevas de Alertas y les crea su fila de Seguimiento. Devuelve cuántas registró. */
function sync_() {
  var ss = ss_(), al = ss.getSheetByName(SH_ALERTAS), seg = ss.getSheetByName(SH_SEG);
  var last = al.getLastRow(); if (last < 2) return 0;
  var vals = al.getRange(2, 1, last - 1, COL_ID).getValues();
  var nuevos = vals.some(function (r) { return r[0] && !r[COL_ID - 1]; });
  if (!nuevos) return 0;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    vals = al.getRange(2, 1, last - 1, COL_ID).getValues();
    var max = vals.reduce(function (m, r) { return Math.max(m, parseInt(String(r[COL_ID - 1]).slice(1), 10) || 0); }, 0);
    var n = 0, ts = now_();
    vals.forEach(function (r, i) {
      if (!r[0] || r[COL_ID - 1]) return;
      var id = 'S' + ('0' + (++max)).slice(-2);
      al.getRange(i + 2, COL_ID).setValue(id);
      var seed = (typeof SEED_CLASIFICACION !== 'undefined' && SEED_CLASIFICACION[id]) || {};
      var estado = { 'En curso': 'En curso', 'Descartado': 'Descartado', 'Completado': 'Realizado' }[String(r[10])] || 'Pendiente';
      var prio = String(r[4]), desc = String(r[5]);
      var rec = {
        id: id, criterio: seed.criterio || '', horizonte: seed.horizonte || horizonte_(String(r[3]), dateOnly_(r[9])),
        delta: seed.delta !== undefined ? seed.delta : deltaDef_(prio, estado, desc),
        fecha_alta: r[8] ? dateOnly_(r[8]) + 'T00:00:00' : ts, estado: estado, comentario: '', fecha_estado: '', fecha_realizado: '',
        validacion: estado === 'Realizado' ? 'Pendiente validación' : 'Sin enviar', validado_por: '', fecha_validacion: '',
        comentario_validacion: '', horas_resolucion: '', horas_validacion: ''
      };
      seg.appendRow(SEG_COLS.map(function (k) { return rec[k]; }));
      log_({ usuario: 'Rebold', role: 'rebold' }, 'Alta de hallazgo', rec, '', estado, String(r[3]) + ' · ' + prio);
      n++;
    });
    return n;
  } finally { lock.releaseLock(); }
}
function horizonte_(tipo, lim) {
  if (tipo === 'Quick Win') return 'Quick win';
  if (lim && lim <= '2026-10-25' && tipo !== 'Proceso en curso') return 'Quick win';
  if (lim && lim <= '2026-11-15') return 'Mediano plazo';
  return 'Largo plazo';
}
function deltaDef_(prio, estado, desc) {
  if (estado === 'Descartado' || /^PENDIENTE POR AUDITAR/i.test(desc)) return 0;
  return { Alta: 1, Media: 0.5, Baja: 0.3 }[prio] || 0.5;
}

/* ---------------- HTTP ---------------- */
function doGet(e) {
  try {
    var who = auth_(e.parameter.code);
    if (e.parameter.action === 'ping') return json_({ ok: true, version: VERSION, role: who.role });
    sync_();
    return json_({ ok: true, role: who.role, data: readAll_() });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var b = JSON.parse(e.postData.contents);
    var who = auth_(b.code);
    who.usuario = String(b.usuario || who.role).slice(0, 80);
    if (!lock.tryLock(25000)) throw new Error('El sistema está ocupado, intenta de nuevo.');
    var out;
    if (b.action === 'estado') out = cambiarEstado_(who, b);
    else if (b.action === 'validar') out = validar_(who, b);
    else if (b.action === 'alta') out = alta_(who, b.rec || {});
    else throw new Error('Acción desconocida');
    return json_(Object.assign({ ok: true }, out));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally { try { lock.releaseLock(); } catch (x) { } }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function auth_(code) {
  var p = PropertiesService.getScriptProperties();
  code = String(code || '');
  var map = { zelva: 'ZELVA_CODE', rebold: 'REBOLD_CODE', lectura: 'LECTURA_CODE' };
  for (var role in map) { var c = p.getProperty(map[role]); if (c && code === c) return { role: role }; }
  throw new Error('Código de acceso inválido');
}

/* ---------------- Acciones ---------------- */
function cambiarEstado_(who, b) {
  if (who.role !== 'zelva') throw new Error('Solo Zelva reporta el estado de un ajuste.');
  if (ESTADOS_ZELVA.indexOf(b.estado) < 0) throw new Error('Estado inválido');
  var com = String(b.comentario || '').trim();
  if (b.estado !== 'En curso' && !com) throw new Error('El comentario es obligatorio para este estado.');
  var f = findSeg_(b.id), r = f.rec;
  if (r.estado === 'Descartado') throw new Error('Este hallazgo está descartado.');
  if (r.validacion === 'Aprobado' || r.validacion === 'Cierre ratificado') throw new Error('Este ajuste ya fue validado por Rebold.');
  var antes = r.estado, ts = now_();
  r.estado = b.estado; r.comentario = com; r.fecha_estado = ts;
  if (b.estado === 'Realizado') { r.fecha_realizado = ts; r.horas_resolucion = hrs_(r.fecha_alta, ts); }
  r.validacion = b.estado === 'En curso' ? 'Sin enviar' : 'Pendiente validación';
  r.validado_por = ''; r.fecha_validacion = ''; r.comentario_validacion = ''; r.horas_validacion = '';
  writeSeg_(f.row, r);
  syncEstadoAlerta_(r);
  log_(who, 'Cambio de estado', r, antes, b.estado, com);
  var a = alerta_(r.id);
  var txt = '*D1 · Rebold Audit* — ' + who.usuario + ' (Zelva) reportó un cambio\n' +
    '*' + r.id + '* · ' + a.tipo + ' · ' + a.indicador + (r.criterio ? ' · ' + r.criterio : '') + '\n' + corta_(a.descripcion) + '\n' +
    'Estado: ' + antes + ' → *' + b.estado + '*' + (com ? '\n> ' + com : '') +
    (r.validacion === 'Pendiente validación' ? '\n:hourglass: Requiere validación de Rebold para mover el ORI.' : '') + link_(r.id);
  var sent = slack_(txt);
  return { rec: r, slack: { sent: sent, text: r.id + ': ' + antes + ' → ' + b.estado } };
}
function validar_(who, b) {
  if (who.role !== 'rebold') throw new Error('Solo Rebold valida los ajustes.');
  var map = { aprobar: 'Aprobado', devolver: 'Devuelto', ratificar: 'Cierre ratificado', apoyo: 'Apoyo en gestión' };
  var nueva = map[b.decision]; if (!nueva) throw new Error('Decisión inválida');
  var com = String(b.comentario || '').trim();
  if (b.decision !== 'aprobar' && !com) throw new Error('El comentario es obligatorio.');
  var f = findSeg_(b.id), r = f.rec;
  if (r.validacion !== 'Pendiente validación') throw new Error('Este ajuste no está pendiente de validación.');
  if (b.decision === 'aprobar' && r.estado !== 'Realizado') throw new Error('Solo se aprueba lo que Zelva marcó como Realizado.');
  if (b.decision === 'ratificar' && r.estado !== 'No se pudo realizar') throw new Error('Solo se ratifica un cierre no realizable.');
  var antes = r.validacion, ts = now_();
  r.validacion = nueva; r.validado_por = who.usuario; r.fecha_validacion = ts; r.comentario_validacion = com;
  if (b.decision === 'aprobar') r.horas_validacion = hrs_(r.fecha_realizado, ts);
  if (b.decision === 'devolver') { r.estado = 'En curso'; r.fecha_estado = ts; }
  writeSeg_(f.row, r);
  syncEstadoAlerta_(r);
  log_(who, nueva, r, antes, nueva, com);
  if (b.decision === 'aprobar') slack_(':white_check_mark: *' + r.id + ' aprobado* por Rebold (' + who.usuario + '). El ORI se recalcula.' + link_(r.id));
  return { rec: r };
}
function alta_(who, x) {
  if (who.role !== 'rebold') throw new Error('Solo Rebold sube hallazgos.');
  if (!x.titulo || !x.criterio || !x.fecha_limite) throw new Error('Faltan descripción, criterio o fecha límite.');
  var ss = ss_(), al = ss.getSheetByName(SH_ALERTAS), ts = now_();
  var ind = String(x.criterio).split('-')[0];
  al.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM'), 'D1', ind, x.tipo || 'Alerta', x.prioridad || 'Media',
    x.titulo, x.impacto || '', x.responsable || 'Zelva', ts, x.fecha_limite, 'Pendiente']);
  var row = al.getLastRow();
  var ids = al.getRange(2, COL_ID, row - 1, 1).getValues();
  var max = ids.reduce(function (m, v) { return Math.max(m, parseInt(String(v[0]).slice(1), 10) || 0); }, 0);
  var id = 'S' + ('0' + (max + 1)).slice(-2);
  al.getRange(row, COL_ID).setValue(id);
  var r = {
    id: id, criterio: x.criterio, horizonte: x.horizonte || horizonte_(x.tipo, x.fecha_limite),
    delta: Math.max(0, Math.min(5, Number(x.delta) || 0)), fecha_alta: ts, estado: 'Pendiente', comentario: '', fecha_estado: '',
    fecha_realizado: '', validacion: 'Sin enviar', validado_por: '', fecha_validacion: '', comentario_validacion: '',
    horas_resolucion: '', horas_validacion: ''
  };
  ss.getSheetByName(SH_SEG).appendRow(SEG_COLS.map(function (k) { return r[k]; }));
  log_(who, 'Alta de hallazgo', r, '', 'Pendiente', x.titulo);
  slack_('*D1 · Rebold Audit* — nuevo hallazgo *' + id + '* (' + (x.tipo || 'Alerta') + ', límite ' + x.fecha_limite + ')\n' + corta_(x.titulo) + link_(id));
  return { rec: r };
}
/** Mantiene la columna Estado de Alertas_QuickWins_Acciones alineada con el seguimiento. */
function syncEstadoAlerta_(r) {
  var k = r.validacion === 'Aprobado' ? 'Completado'
    : r.validacion === 'Cierre ratificado' ? 'Descartado'
      : r.estado === 'Pendiente' ? 'Pendiente' : 'En curso';
  var al = ss_().getSheetByName(SH_ALERTAS), ids = al.getRange(2, COL_ID, al.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === r.id) { al.getRange(i + 2, 11).setValue(k); return; }
}

/* ---------------- Lectura ---------------- */
function readAll_() {
  var ss = ss_();
  var ind = values_(ss.getSheetByName('Indicadores')).filter(function (r) { return CORTOS[String(r[0]).trim()]; }).map(function (r) {
    var id = String(r[0]).trim();
    return { id: id, nombre: String(r[1]).trim(), corto: CORTOS[id], mide: String(r[2]).trim(), hub: String(r[3]).trim() };
  });
  var crit = values_(ss.getSheetByName('Criterios')).slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]).trim(), ind: String(r[1]).trim(), nombre: String(r[2]).trim(), evalua: String(r[3]).trim(), peso: Number(r[4]) };
  });
  var rub = {};
  values_(ss.getSheetByName('Rubrica_Scoring')).forEach(function (r) {
    if (/^(AES|CES|UXCS|AIS)-\d/.test(String(r[0]))) rub[String(r[0]).trim()] = r.slice(3, 8).map(function (x) { return String(x || '').trim(); });
  });
  // Línea base: último mes de Mediciones_Mensuales; por criterio, la fila con la fecha de carga más reciente.
  var med = values_(ss.getSheetByName('Mediciones_Mensuales')).slice(1).filter(function (r) { return r[0] && r[3] && r[5] !== ''; });
  var mes = med.reduce(function (m, r) { var k = ym_(r[0]); return k > m ? k : m; }, '');
  var base = {}, evid = {}, fechaBase = '';
  med.filter(function (r) { return ym_(r[0]) === mes; })
    .sort(function (a, b) { return iso_(a[9]) < iso_(b[9]) ? -1 : 1; })
    .forEach(function (r) {
      var id = String(r[3]).trim();
      base[id] = Number(String(r[5]).replace(',', '.'));
      evid[id] = { evidencia: String(r[6] || ''), fuente: String(r[7] || ''), responsable: String(r[8] || '') };
      var fc = iso_(r[9]); if (fc > fechaBase) fechaBase = fc;
    });
  // Hallazgos = Alertas (descripción) + Seguimiento (estado)
  var seg = {};
  rows_(ss.getSheetByName(SH_SEG), SEG_COLS).forEach(function (r) { seg[r.id] = r; });
  var recs = [];
  var al = ss.getSheetByName(SH_ALERTAS);
  if (al.getLastRow() > 1) al.getRange(2, 1, al.getLastRow() - 1, COL_ID).getValues().forEach(function (r) {
    var id = String(r[COL_ID - 1]); if (!r[0] || !seg[id]) return;
    recs.push(Object.assign({}, seg[id], {
      mes: ym_(r[0]), indicador: String(r[2]).trim(), tipo: String(r[3]), prioridad: String(r[4]), titulo: String(r[5]),
      impacto: String(r[6]), responsable: String(r[7]), fecha_limite: dateOnly_(r[9]), delta: Number(seg[id].delta) || 0
    }));
  });
  var log = rows_(ss.getSheetByName(SH_LOG), LOG_COLS).map(function (l) { delete l.snapshot; return l; });
  return {
    cliente: 'D1', agencia: 'Zelva', inicio_plan: INICIO_PLAN, corte: now_(), mes_base: mes,
    fecha_base: fechaBase || (mes ? mes + '-28' : INICIO_PLAN),
    indicadores: ind, criterios: crit, rubrica: rub, base: base, evidencia: evid, recomendaciones: recs, log: log
  };
}
function alerta_(id) {
  var al = ss_().getSheetByName(SH_ALERTAS), v = al.getRange(2, 1, al.getLastRow() - 1, COL_ID).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][COL_ID - 1]) === id) return { indicador: v[i][2], tipo: v[i][3], descripcion: String(v[i][5]) };
  return { indicador: '', tipo: '', descripcion: '' };
}
function values_(sh) { return sh ? sh.getDataRange().getValues() : []; }
function rows_(sh, cols) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues().filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {}; cols.forEach(function (k, i) { o[k] = r[i] instanceof Date ? iso_(r[i]) : r[i]; }); return o;
  });
}
function findSeg_(id) {
  var sh = ss_().getSheetByName(SH_SEG);
  var vals = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), SEG_COLS.length).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(id)) {
    var o = {}; SEG_COLS.forEach(function (k, j) { o[k] = vals[i][j] instanceof Date ? iso_(vals[i][j]) : vals[i][j]; });
    return { row: i + 2, rec: o };
  }
  throw new Error('No existe el hallazgo ' + id);
}
function writeSeg_(row, r) {
  ss_().getSheetByName(SH_SEG).getRange(row, 1, 1, SEG_COLS.length).setValues([SEG_COLS.map(function (k) { return r[k]; })]);
}

/* ---------------- Log + respaldo ---------------- */
function log_(who, accion, rec, antes, despues, comentario) {
  var row = [now_(), who.usuario || who.role, { zelva: 'Zelva', rebold: 'Rebold', lectura: 'Lectura' }[who.role] || who.role,
    accion, rec.id, antes, despues, comentario || '', JSON.stringify(rec)];
  ss_().getSheetByName(SH_LOG).appendRow(row);
  try {
    var id = PropertiesService.getScriptProperties().getProperty('LOG_BACKUP_ID');
    if (id) SpreadsheetApp.openById(id).getSheetByName(SH_LOG).appendRow(row);
  } catch (e) { console.error('Respaldo del log falló: ' + e); }
}

/* ---------------- Slack ---------------- */
function slack_(text) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('SLACK_BOT_TOKEN'), hook = p.getProperty('SLACK_WEBHOOK_URL'), to = p.getProperty('SLACK_REBOLD_ID');
  try {
    if (token && to) {
      var res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
        method: 'post', contentType: 'application/json; charset=utf-8', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify({ channel: to, text: text, unfurl_links: false })
      });
      return JSON.parse(res.getContentText()).ok === true;
    }
    if (hook) { UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true }); return true; }
  } catch (e) { console.error('Slack falló: ' + e); }
  return false;
}
function link_(id) {
  var u = PropertiesService.getScriptProperties().getProperty('DASHBOARD_URL');
  return u ? '\n<' + u + '?rec=' + id + '|Abrir en el cuadro de mando>' : '';
}
/** Prueba manual: envía un mensaje de prueba a Slack. */
function probarSlack() { Logger.log(slack_('Prueba del cuadro de mando D1 · Rebold Audit') ? 'Slack OK' : 'Slack NO configurado o falló'); }

/* ---------------- Utilidades ---------------- */
function corta_(t) { t = String(t || ''); return t.length > 220 ? t.slice(0, 217) + '…' : t; }
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function iso_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  return String(v);
}
function dateOnly_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}
function ym_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM') : String(v).slice(0, 7); }
function hrs_(a, b) {
  var da = new Date(String(a).replace(' ', 'T')), db = new Date(String(b).replace(' ', 'T'));
  return Math.round((db - da) / 36e5 * 10) / 10;
}
