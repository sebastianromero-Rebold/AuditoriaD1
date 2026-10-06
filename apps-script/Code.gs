/**
 * D1 · Rebold Audit — backend del cuadro de mando (Google Apps Script).
 *
 * Vive DENTRO del Google Sheet "D1_Rebold_Audit_Seguimiento" (Extensiones → Apps Script).
 * - Lee Criterios, Rubrica_Scoring y Mediciones_Mensuales (línea base del ORI).
 * - Guarda las recomendaciones en la hoja "Recomendaciones" y cada cambio en "Log_Cambios".
 * - Copia cada registro del log a un Google Sheet de RESPALDO independiente.
 * - Notifica a Jennifer por Slack en cada cambio de estado.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   ZELVA_CODE          código de acceso de Zelva (rol zelva: reporta estados)
 *   REBOLD_CODE         código del equipo Rebold (rol rebold: sube recomendaciones)
 *   VALIDADOR_CODE      código de Jennifer (rol validador: aprueba; también sube recomendaciones)
 *   LECTURA_CODE        opcional, solo lectura (ej. D1)
 *   SLACK_BOT_TOKEN     xoxb-… del bot (scope chat:write). Alternativa: SLACK_WEBHOOK_URL
 *   SLACK_JENNIFER_ID   por defecto U0BL3EA7KNF (Jennifer Carvajal)
 *   SLACK_CHANNEL_ID    opcional, canal C… para copiar las aprobaciones
 *   DASHBOARD_URL       URL de GitHub Pages, para el enlace del mensaje de Slack
 *   LOG_BACKUP_ID       lo crea setup() automáticamente
 */
var VERSION = '1.0.0';
var SH_REC = 'Recomendaciones';
var SH_LOG = 'Log_Cambios';
var REC_COLS = ['id', 'hallazgo', 'causa', 'indicador', 'criterio', 'titulo', 'cambio', 'impacto', 'horizonte', 'semana',
  'fecha_limite', 'responsable', 'delta', 'fecha_alta', 'estado', 'comentario', 'fecha_estado', 'fecha_realizado',
  'validacion', 'validado_por', 'fecha_validacion', 'comentario_validacion', 'horas_resolucion', 'horas_validacion'];
var LOG_COLS = ['ts', 'usuario', 'rol', 'accion', 'id', 'antes', 'despues', 'comentario', 'snapshot'];
var INICIO_PLAN = '2026-10-05';
var RUTA_ESTIMADA = [47, 48, 50, 53, 57, 60, 63];
var INDICADORES = [
  { id: 'AES', nombre: 'Activation Efficiency Score', corto: 'Activación', hub: 'Activation Hub', mide: 'Tracking, estructura de campañas, eficiencia de inversión, cadencia de optimización, atribución y gobernanza.' },
  { id: 'CES', nombre: 'Creative Effectiveness Score', corto: 'Creatividad', hub: 'Creative Lab', mide: 'Insight, match mensaje-audiencia, performance creativo, fatiga y velocidad de producción.' },
  { id: 'UXCS', nombre: 'User Experience Conversion Score', corto: 'Experiencia', hub: 'Diseño web y app / UX', mide: 'Velocidad, propuesta de valor, funnel, fricciones y experiencia mobile.' },
  { id: 'AIS', nombre: 'Audience Intelligence Score', corto: 'Audiencias', hub: 'Insight Factory / Audience Nexus', mide: 'Segmentación real, uso de 1P/CRM, escalabilidad, frescura de bases y aprendizaje continuo.' }
];
var ESTADOS_ZELVA = ['En curso', 'Realizado', 'Necesita apoyo', 'No se pudo realizar'];
var TZ = 'America/Bogota';

/* ---------------- Instalación ---------------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SH_REC, REC_COLS);
  ensureSheet_(ss, SH_LOG, LOG_COLS);
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('LOG_BACKUP_ID')) {
    var bk = SpreadsheetApp.create('D1_Rebold_Audit_Log_Respaldo');
    ensureSheet_(bk, SH_LOG, LOG_COLS);
    var def = bk.getSheetByName('Hoja 1') || bk.getSheetByName('Sheet1');
    if (def) bk.deleteSheet(def);
    p.setProperty('LOG_BACKUP_ID', bk.getId());
    Logger.log('Respaldo creado: ' + bk.getUrl());
  }
  Logger.log('Listo. Backend v' + VERSION);
}
/** Carga las recomendaciones del plan de 6 semanas (Seed.gs). Solo si la hoja está vacía. */
function seedRecomendaciones() {
  var sh = ensureSheet_(SpreadsheetApp.getActiveSpreadsheet(), SH_REC, REC_COLS);
  if (sh.getLastRow() > 1) throw new Error('La hoja Recomendaciones ya tiene datos.');
  var ts = now_();
  SEED_RECOMENDACIONES.forEach(function (r) {
    var rec = {};
    REC_COLS.forEach(function (k) { rec[k] = r[k] !== undefined ? r[k] : ''; });
    rec.fecha_alta = ts; rec.estado = 'Pendiente'; rec.validacion = 'Sin enviar';
    sh.appendRow(REC_COLS.map(function (k) { return rec[k]; }));
    log_({ usuario: 'Rebold', rol: 'Rebold' }, 'Alta de recomendación', rec, '', 'Pendiente', 'Carga inicial del plan de 6 semanas');
  });
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

/* ---------------- HTTP ---------------- */
function doGet(e) {
  try {
    var who = auth_(e.parameter.code);
    if ((e.parameter.action || 'data') === 'ping') return json_({ ok: true, version: VERSION, role: who.role });
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
  var map = { zelva: 'ZELVA_CODE', rebold: 'REBOLD_CODE', validador: 'VALIDADOR_CODE', lectura: 'LECTURA_CODE' };
  for (var role in map) { var c = p.getProperty(map[role]); if (c && code === c) return { role: role }; }
  throw new Error('Código de acceso inválido');
}

/* ---------------- Acciones ---------------- */
function cambiarEstado_(who, b) {
  if (who.role !== 'zelva') throw new Error('Solo Zelva reporta el estado de un ajuste.');
  if (ESTADOS_ZELVA.indexOf(b.estado) < 0) throw new Error('Estado inválido');
  var com = String(b.comentario || '').trim();
  if (b.estado !== 'En curso' && !com) throw new Error('El comentario es obligatorio para este estado.');
  var f = findRec_(b.id), r = f.rec;
  if (r.validacion === 'Aprobado' || r.validacion === 'Cierre ratificado') throw new Error('Este ajuste ya fue validado por Jennifer.');
  var antes = r.estado, ts = now_();
  r.estado = b.estado; r.comentario = com; r.fecha_estado = ts;
  if (b.estado === 'Realizado') { r.fecha_realizado = ts; r.horas_resolucion = hrs_(r.fecha_alta, ts); }
  r.validacion = b.estado === 'En curso' ? 'Sin enviar' : 'Pendiente validación';
  r.validado_por = ''; r.fecha_validacion = ''; r.comentario_validacion = ''; r.horas_validacion = '';
  writeRec_(f.row, r);
  log_(who, 'Cambio de estado', r, antes, b.estado, com);
  var txt = '*D1 · Rebold Audit* — ' + who.usuario + ' (Zelva) reportó un cambio\n' +
    '*' + r.id + ' · ' + r.titulo + '*\n' + r.indicador + ' · ' + r.criterio + ' · ' + r.horizonte + '\n' +
    'Estado: ' + antes + ' → *' + b.estado + '*' + (com ? '\n> ' + com : '') +
    (r.validacion === 'Pendiente validación' ? '\n:hourglass: Requiere tu validación para mover el ORI.' : '') + link_(r.id);
  var sent = slack_(txt, false);
  return { rec: r, slack: { simulated: false, sent: sent, text: r.id + ': ' + antes + ' → ' + b.estado } };
}
function validar_(who, b) {
  if (who.role !== 'validador') throw new Error('Solo Jennifer valida los ajustes.');
  var map = { aprobar: 'Aprobado', devolver: 'Devuelto', ratificar: 'Cierre ratificado', apoyo: 'Apoyo en gestión' };
  var nueva = map[b.decision]; if (!nueva) throw new Error('Decisión inválida');
  var com = String(b.comentario || '').trim();
  if (b.decision !== 'aprobar' && !com) throw new Error('El comentario es obligatorio.');
  var f = findRec_(b.id), r = f.rec;
  if (r.validacion !== 'Pendiente validación') throw new Error('Este ajuste no está pendiente de validación.');
  if (b.decision === 'aprobar' && r.estado !== 'Realizado') throw new Error('Solo se aprueba lo que Zelva marcó como Realizado.');
  if (b.decision === 'ratificar' && r.estado !== 'No se pudo realizar') throw new Error('Solo se ratifica un cierre no realizable.');
  var antes = r.validacion, ts = now_();
  r.validacion = nueva; r.validado_por = who.usuario; r.fecha_validacion = ts; r.comentario_validacion = com;
  if (b.decision === 'aprobar') r.horas_validacion = hrs_(r.fecha_realizado, ts);
  if (b.decision === 'devolver') { r.estado = 'En curso'; r.fecha_estado = ts; }
  writeRec_(f.row, r);
  log_(who, nueva, r, antes, nueva, com);
  if (b.decision === 'aprobar') slack_(':white_check_mark: *' + r.id + ' aprobado* por ' + who.usuario + ' — ' + r.titulo + '. El ORI se recalcula.' + link_(r.id), true);
  return { rec: r };
}
function alta_(who, x) {
  if (who.role !== 'rebold' && who.role !== 'validador') throw new Error('Solo Rebold sube recomendaciones.');
  if (!x.titulo || !x.criterio || !x.fecha_limite) throw new Error('Faltan título, criterio o fecha límite.');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_REC);
  var ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  var n = ids.reduce(function (m, v) { return Math.max(m, parseInt(String(v[0]).slice(1), 10) || 0); }, 0) + 1;
  var r = {};
  REC_COLS.forEach(function (k) { r[k] = x[k] !== undefined ? x[k] : ''; });
  r.id = 'R' + ('0' + n).slice(-2); r.indicador = String(x.criterio).split('-')[0];
  r.delta = Math.max(0, Math.min(5, Number(x.delta) || 0));
  r.fecha_alta = now_(); r.estado = 'Pendiente'; r.validacion = 'Sin enviar';
  sh.appendRow(REC_COLS.map(function (k) { return r[k]; }));
  log_(who, 'Alta de recomendación', r, '', 'Pendiente', r.titulo);
  slack_('*D1 · Rebold Audit* — nueva recomendación *' + r.id + ' · ' + r.titulo + '* (' + r.horizonte + ', límite ' + r.fecha_limite + ')' + link_(r.id), false);
  return { rec: r };
}

/* ---------------- Lectura ---------------- */
function readAll_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var crit = values_(ss.getSheetByName('Criterios')).slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]).trim(), ind: String(r[1]).trim(), nombre: String(r[2]).trim(), evalua: String(r[3]).trim(), peso: Number(r[4]) };
  });
  var rub = {};
  values_(ss.getSheetByName('Rubrica_Scoring')).forEach(function (r) {
    if (/^(AES|CES|UXCS|AIS)-\d/.test(String(r[0]))) rub[String(r[0]).trim()] = r.slice(3, 8).map(function (x) { return String(x || '').trim(); });
  });
  // Línea base: último mes cargado en Mediciones_Mensuales, un score por criterio.
  var med = values_(ss.getSheetByName('Mediciones_Mensuales')).slice(1).filter(function (r) { return r[0] && r[3] && r[5] !== ''; });
  var mes = med.reduce(function (m, r) { var k = ym_(r[0]); return k > m ? k : m; }, '');
  var base = {}, fechaBase = '';
  med.filter(function (r) { return ym_(r[0]) === mes; }).forEach(function (r) {
    base[String(r[3]).trim()] = Number(String(r[5]).replace(',', '.'));
    var fc = iso_(r[9]); if (fc > fechaBase) fechaBase = fc;
  });
  var recs = rows_(ss.getSheetByName(SH_REC), REC_COLS);
  var log = rows_(ss.getSheetByName(SH_LOG), LOG_COLS).map(function (l) { delete l.snapshot; return l; });
  return {
    cliente: 'D1', agencia: 'Zelva', inicio_plan: INICIO_PLAN, ruta_estimada: RUTA_ESTIMADA,
    fecha_base: fechaBase || (mes ? mes + '-28' : INICIO_PLAN), mes_base: mes,
    indicadores: INDICADORES,
    criterios: crit, rubrica: rub, base: base, recomendaciones: recs, log: log
  };
}
function values_(sh) { return sh ? sh.getDataRange().getValues() : []; }
function rows_(sh, cols) {
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues().filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {}; cols.forEach(function (k, i) { o[k] = r[i] instanceof Date ? (k === 'fecha_limite' ? Utilities.formatDate(r[i], TZ, 'yyyy-MM-dd') : iso_(r[i])) : r[i]; }); return o;
  });
}
function findRec_(id) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_REC);
  var vals = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), REC_COLS.length).getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(id)) {
    var o = {}; REC_COLS.forEach(function (k, j) { o[k] = vals[i][j] instanceof Date ? (k === 'fecha_limite' ? Utilities.formatDate(vals[i][j], TZ, 'yyyy-MM-dd') : iso_(vals[i][j])) : vals[i][j]; });
    return { row: i + 2, rec: o };
  }
  throw new Error('No existe la recomendación ' + id);
}
function writeRec_(row, r) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_REC).getRange(row, 1, 1, REC_COLS.length).setValues([REC_COLS.map(function (k) { return r[k]; })]);
}

/* ---------------- Log + respaldo ---------------- */
function log_(who, accion, rec, antes, despues, comentario) {
  var row = [now_(), who.usuario || who.role, { zelva: 'Zelva', rebold: 'Rebold', validador: 'Validador' }[who.role] || who.rol || who.role,
    accion, rec.id, antes, despues, comentario || '', JSON.stringify(rec)];
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH_LOG).appendRow(row);
  try {
    var id = PropertiesService.getScriptProperties().getProperty('LOG_BACKUP_ID');
    if (id) SpreadsheetApp.openById(id).getSheetByName(SH_LOG).appendRow(row);
  } catch (e) { console.error('Respaldo del log falló: ' + e); }
}

/* ---------------- Slack ---------------- */
function slack_(text, alsoChannel) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('SLACK_BOT_TOKEN'), hook = p.getProperty('SLACK_WEBHOOK_URL');
  var targets = [p.getProperty('SLACK_JENNIFER_ID') || 'U0BL3EA7KNF'];
  if (alsoChannel && p.getProperty('SLACK_CHANNEL_ID')) targets.push(p.getProperty('SLACK_CHANNEL_ID'));
  try {
    if (token) {
      targets.forEach(function (ch) {
        UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
          method: 'post', contentType: 'application/json; charset=utf-8', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify({ channel: ch, text: text, unfurl_links: false })
        });
      });
      return true;
    }
    if (hook) { UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true }); return true; }
  } catch (e) { console.error('Slack falló: ' + e); }
  return false;
}
function link_(id) {
  var u = PropertiesService.getScriptProperties().getProperty('DASHBOARD_URL');
  return u ? '\n<' + u + '?rec=' + id + '|Abrir en el cuadro de mando>' : '';
}

/* ---------------- Utilidades ---------------- */
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function iso_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  return String(v);
}
function ym_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM') : String(v).slice(0, 7); }
function hrs_(a, b) {
  var da = new Date(String(a).replace(' ', 'T')), db = new Date(String(b).replace(' ', 'T'));
  return Math.round((db - da) / 36e5 * 10) / 10;
}
