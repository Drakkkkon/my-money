// My Money — сервер журнала действий (Google Apps Script + Google Таблица администратора). Установка — ADMIN_SETUP_RU.txt.
// Принимает пачки событий только с настоящим токеном Google ВАШЕГО приложения (почта берётся из токена — подделать нельзя),
// отдаёт список пользователей и их действия ТОЛЬКО администратору, стирает данные пользователя по его просьбе.

var ADMIN_EMAIL = 'lego2009as@gmail.com';
var CLIENT_ID = 'ВСТАВЬТЕ_СЮДА_CLIENT_ID.apps.googleusercontent.com'; // тот же, что googleClientId в js/config.js
var USERS_SHEET = 'Users', EVENTS_SHEET = 'Events';
var MAX_EVENT_ROWS = 20000, TRIM_ROWS = 2000, MAX_BATCH = 60;
var ALLOWED_TYPES = ['open', 'login', 'tab', 'search', 'scan', 'scan_fail', 'voice', 'voice_fail', 'entry'];

function doGet() { return ContentService.createTextOutput('My Money log: ok'); }

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var who = verifyToken_(body.token);
    if (body.action === 'log') return out_(logEvents_(who, body));
    if (body.action === 'forget_me') return out_(forgetUser_(who.email));
    if (who.email !== ADMIN_EMAIL.toLowerCase()) return out_({ ok: false, error: 'Нет доступа: журнал открыт только администратору' });
    if (body.action === 'users') return out_(listUsers_());
    if (body.action === 'events') return out_(listEvents_(body));
    return out_({ ok: false, error: 'Неизвестное действие' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// Чей токен (почта) и выдан ли именно этому приложению
function verifyToken_(token) {
  if (!token || typeof token !== 'string') throw new Error('Нет токена');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Токен Google не принят (войдите заново)');
  var info = JSON.parse(res.getContentText());
  if (String(info.aud || info.azp) !== CLIENT_ID) throw new Error('Токен выдан другому приложению');
  if (!info.email || String(info.email_verified) !== 'true') throw new Error('В токене нет подтверждённой почты');
  var who = { email: String(info.email).toLowerCase() };
  cache.put(key, JSON.stringify(who), 300);
  return who;
}

function sheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function usersSheet_() { return sheet_(USERS_SHEET, ['Почта', 'Имя', 'Первый вход', 'Последний раз', 'Входов', 'Событий']); }
function eventsSheet_() { return sheet_(EVENTS_SHEET, ['Время', 'Почта', 'Тип', 'Данные']); }

function logEvents_(who, body) {
  var events = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : [];
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = Date.now(), rows = [], logins = 0;
    events.forEach(function (ev) {
      if (!ev || ALLOWED_TYPES.indexOf(ev.type) < 0) return;
      var t = Number(ev.t);
      if (!isFinite(t) || Math.abs(now - t) > 86400000) t = now;
      if (ev.type === 'login') logins++;
      rows.push([new Date(t), who.email, ev.type, JSON.stringify(ev.data && typeof ev.data === 'object' ? ev.data : {}).slice(0, 500)]);
    });
    var us = usersSheet_(), name = String(body.name || '').slice(0, 80), idx = -1;
    var emails = us.getLastRow() > 1 ? us.getRange(2, 1, us.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < emails.length; i++) { if (String(emails[i][0]).toLowerCase() === who.email) { idx = i + 2; break; } }
    if (idx < 0) {
      us.appendRow([who.email, name, new Date(now), new Date(now), logins, rows.length]);
    } else {
      var cur = us.getRange(idx, 1, 1, 6).getValues()[0];
      us.getRange(idx, 1, 1, 6).setValues([[who.email, name || cur[1], cur[2], new Date(now), Number(cur[4]) + logins, Number(cur[5]) + rows.length]]);
    }
    if (rows.length) {
      var es = eventsSheet_();
      es.getRange(es.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
      if (es.getLastRow() > MAX_EVENT_ROWS + 1) es.deleteRows(2, TRIM_ROWS);
    }
    return { ok: true, saved: rows.length };
  } finally { lock.releaseLock(); }
}

function listUsers_() {
  var us = usersSheet_();
  if (us.getLastRow() < 2) return { ok: true, users: [] };
  var users = us.getRange(2, 1, us.getLastRow() - 1, 6).getValues().map(function (r) {
    return { email: String(r[0]), name: String(r[1]), first: new Date(r[2]).getTime(), last: new Date(r[3]).getTime(), logins: Number(r[4]), events: Number(r[5]) };
  }).sort(function (a, b) { return b.last - a.last; });
  return { ok: true, users: users };
}

function listEvents_(body) {
  var es = eventsSheet_(), last = es.getLastRow();
  if (last < 2) return { ok: true, events: [] };
  var limit = Math.max(1, Math.min(500, Number(body.limit) || 300)), email = String(body.email || '').toLowerCase();
  var span = Math.min(last - 1, 5000), vals = es.getRange(last - span + 1, 1, span, 4).getValues(), list = [];
  for (var i = vals.length - 1; i >= 0 && list.length < limit; i--) {
    var r = vals[i];
    if (email && String(r[1]).toLowerCase() !== email) continue;
    var data = {};
    try { data = JSON.parse(r[3] || '{}'); } catch (e) {}
    list.push({ t: new Date(r[0]).getTime(), email: String(r[1]), type: String(r[2]), data: data });
  }
  return { ok: true, events: list };
}

function forgetUser_(email) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var us = usersSheet_();
    for (var r = us.getLastRow(); r >= 2; r--) { if (String(us.getRange(r, 1).getValue()).toLowerCase() === email) us.deleteRow(r); }
    var es = eventsSheet_(), last = es.getLastRow();
    if (last >= 2) {
      var emails = es.getRange(2, 2, last - 1, 1).getValues();
      for (var i = emails.length - 1; i >= 0; i--) { if (String(emails[i][0]).toLowerCase() === email) es.deleteRow(i + 2); }
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}
