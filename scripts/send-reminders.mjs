// Corre diario en GitHub Actions: avisa por correo (Gmail) y/o Telegram.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const env = k => process.env[k] ?? '';
let account;
try { account = JSON.parse(env('FIREBASE_SERVICE_ACCOUNT')); }
catch { console.error('Falta el secreto FIREBASE_SERVICE_ACCOUNT o no es un JSON válido. Créalo en GitHub > Settings > Secrets and variables > Actions (pega el contenido completo del archivo JSON).'); process.exit(1); }
initializeApp({ credential: cert(account) });
const db = getFirestore();

const DOC_LABEL = { soat:'SOAT', impuesto:'Impuesto vehicular', tecno:'Revisión técnico-mecánica', seguro:'Seguro todo riesgo', otro:'Documento' };
const THRESHOLDS = [0, 3, 7, 15, 30];
const today = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora Colombia
const daysLeft = d => (Date.parse(d) - Date.parse(today())) / 864e5;
const all = async c => (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));

const mailer = env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: env('GMAIL_USER'), pass: env('GMAIL_APP_PASSWORD') } })
  : null;
const sendEmail = (to, subject, html) =>
  mailer.sendMail({ from: `"Iskonex MotorTrack" <${env('GMAIL_USER')}>`, to, subject, html });
async function sendTelegram(chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
}
async function notify(p, subject, lines) {
  let ok = false;
  if (p.notify_email && mailer) {
    const app = env('APP_URL');
    const html = `<h2>${subject}</h2><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>${app ? `<p><a href="${app}">Abrir MotorTrack</a></p>` : ''}`;
    try { await sendEmail(p.email, subject, html); ok = true; } catch (e) { console.error(p.email, e.message); }
  }
  if (p.telegram_chat_id && env('TELEGRAM_BOT_TOKEN')) {
    try { await sendTelegram(p.telegram_chat_id, `${subject}\n\n• ${lines.join('\n• ')}`); ok = true; } catch (e) { console.error(p.email, e.message); }
  }
  return ok;
}

const [users, vehicles, docs, maintAll, sent] = await Promise.all(['mt_users', 'mt_vehicles', 'mt_documents', 'mt_maintenance', 'mt_remindersSent'].map(all));
docs.sort((a, b) => (b.expiry_date > a.expiry_date ? 1 : -1));
const maint = maintAll.filter(m => m.kind === 'aceite').sort((a, b) => (b.done_at + (b.created_at || '') > a.done_at + (a.created_at || '') ? 1 : -1));
const sentSet = new Set(sent.map(s => s.id));
const mark = [];
let messages = 0;

for (const p of users.filter(u => u.approved)) {
  const items = [];
  for (const v of vehicles.filter(x => x.user_id === p.id)) {
    const name = `${v.name} (${v.plate})`, seen = new Set();
    for (const d of docs.filter(x => x.vehicle_id === v.id)) {
      if (seen.has(d.kind)) continue; seen.add(d.kind);
      const left = daysLeft(d.expiry_date);
      const t = left < 0 ? -1 : THRESHOLDS.find(x => left <= x);
      if (t === undefined) continue;
      const text = left < 0 ? `${DOC_LABEL[d.kind]} de ${name} VENCIÓ el ${d.expiry_date}`
        : left === 0 ? `${DOC_LABEL[d.kind]} de ${name} vence HOY`
        : `${DOC_LABEL[d.kind]} de ${name} vence en ${left} días (${d.expiry_date})`;
      items.push({ ref: d.id, key: `d${t}`, text });
    }
    const oil = maint.find(m => m.vehicle_id === v.id && m.next_km != null);
    if (oil) {
      const kmLeft = oil.next_km - v.current_km;
      if (kmLeft <= 0) items.push({ ref: oil.id, key: 'k0', text: `${name}: toca cambio de aceite (pasó ${-kmLeft} km del límite)` });
      else if (kmLeft <= v.alert_km_before) items.push({ ref: oil.id, key: 'k1', text: `${name}: cambio de aceite en ${kmLeft} km` });
    }
  }
  const fresh = items.filter(i => !sentSet.has(`${p.id}_${i.ref}_${i.key}`));
  if (fresh.length && await notify(p, '🚗 Recordatorio de tus vehículos', fresh.map(i => i.text))) {
    messages++; fresh.forEach(i => mark.push(`${p.id}_${i.ref}_${i.key}`));
  }
}

// Aviso a administradores: usuarios nuevos esperando aprobación
const pending = users.filter(u => !u.approved);
for (const a of users.filter(u => u.is_admin && u.approved)) {
  const fresh = pending.filter(u => !sentSet.has(`${a.id}_${u.id}_pending`));
  if (fresh.length && await notify(a, '👤 Usuarios esperando aprobación en MotorTrack', fresh.map(u => u.email))) {
    fresh.forEach(u => mark.push(`${a.id}_${u.id}_pending`));
  }
}

await Promise.all(mark.map(id => db.collection('mt_remindersSent').doc(id).set({ sent_at: new Date().toISOString() })));
console.log(JSON.stringify({ messages, marked: mark.length }));
