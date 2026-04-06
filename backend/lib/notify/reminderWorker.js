const { DateTime } = require('luxon');
const { getMailConfig, sendHtmlMail } = require('./mail');
const { sendExpoPush } = require('./expo');

const TZ = 'Europe/Istanbul';

function firstWaterHour() {
    const n = Number(process.env.WATER_REMINDER_FIRST_HOUR);
    return Number.isFinite(n) ? n : 8;
}

function lastWaterHour() {
    const n = Number(process.env.WATER_REMINDER_LAST_HOUR);
    return Number.isFinite(n) ? n : 21;
}

function kindLabelTr(kind) {
    const map = {
        event: 'Etkinlik',
        medication: 'İlaç',
        reminder: 'Hatırlatıcı',
    };
    return map[kind] || 'Kayıt';
}

function offsetLabelTr(key) {
    const map = { '24h': '24 saat', '6h': '6 saat', '1h': '1 saat', '15m': '15 dakika' };
    return map[key] || key;
}

function eventDateTime(row) {
    const d = row.event_date_fmt || normalizeMysqlDateString(row.event_date);
    const tim = row.event_time_fmt != null && row.event_time_fmt !== '' ? String(row.event_time_fmt) : '';
    if (!d || !tim) return null;
    const hm = tim.length >= 5 ? tim.slice(0, 5) : tim;
    if (!/^\d{2}:\d{2}$/.test(hm)) return null;
    const dt = DateTime.fromISO(`${d}T${hm}`, { zone: TZ });
    return dt.isValid ? dt : null;
}

function normalizeMysqlDateString(v) {
    if (v == null) return '';
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return '';
        const y = v.getUTCFullYear();
        const m = String(v.getUTCMonth() + 1).padStart(2, '0');
        const day = String(v.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    const s = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function calendarMailHtml(userName, row, offsetKey, whenStr) {
    const kind = kindLabelTr(row.kind);
    const notes = row.notes ? `<p style="margin:12px 0;color:#444;">${escapeHtml(row.notes)}</p>` : '';
    return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#222;">
<p>Merhaba ${escapeHtml(userName || 'CodeX kullanıcısı')},</p>
<p><strong>${escapeHtml(row.title)}</strong> başlıklı ${kind.toLowerCase()} kaydınız için <strong>${offsetLabelTr(offsetKey)}</strong> kala hatırlatma.</p>
<p>Etkinlik zamanı (İstanbul): <strong>${escapeHtml(whenStr)}</strong></p>
${notes}
<p style="margin-top:24px;font-size:13px;color:#666;">CodeX HealthCare — Bu mesaj otomatik gönderilmiştir. Tıbbi acil durumda 112’yi arayın.</p>
</body></html>`;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function calendarSubject(row, offsetKey) {
    return `CodeX — ${offsetLabelTr(offsetKey)} kala: ${row.title}`;
}

function waterMailHtml(userName) {
    return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#222;">
<p>Merhaba ${escapeHtml(userName || 'CodeX kullanıcısı')},</p>
<p>Bu, su içme alışkanlığınızı desteklemek için saat başı gönderilen kısa bir hatırlatmadır.</p>
<p>Lütfen bir bardak su için — vücudunuzun hidrasyonu sağlığınız için önemlidir.</p>
<p style="margin-top:24px;font-size:13px;color:#666;">CodeX HealthCare — Bilgilendirme amaçlıdır; özel diyet gereksinimleriniz için hekiminize danışın.</p>
</body></html>`;
}

async function tryInsertDedupe(pool, dedupeKey, userId, kind) {
    try {
        await pool.query('INSERT INTO notification_sent_log (dedupe_key, user_id, kind) VALUES (?, ?, ?)', [
            dedupeKey,
            userId,
            kind,
        ]);
        return true;
    } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') return false;
        throw e;
    }
}

async function loadExpoTokens(pool, userId) {
    const [rows] = await pool.query(
        'SELECT expo_push_token FROM user_expo_push_tokens WHERE user_id = ?',
        [userId]
    );
    return rows.map((r) => r.expo_push_token).filter(Boolean);
}

function normalizeUserEmail(raw) {
    if (raw == null) return '';
    const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    return s.trim();
}

const OFFSETS = [
    { key: '24h', minutes: 24 * 60 },
    { key: '6h', minutes: 6 * 60 },
    { key: '1h', minutes: 60 },
    { key: '15m', minutes: 15 },
];

async function runCalendarReminders(pool) {
    if (!pool) return;
    const { enabled: mailOk } = getMailConfig();
    if (!mailOk) return;

    const now = DateTime.now().setZone(TZ);
    const startD = now.minus({ days: 1 }).toFormat('yyyy-LL-dd');
    const endD = now.plus({ days: 4 }).toFormat('yyyy-LL-dd');

    const sqlCal = `SELECT cal.*,
                TIMESTAMPDIFF(MINUTE, NOW(), cal.ev_dt) AS diff_minutes_mysql
         FROM (
             SELECT e.id, e.user_id, e.title, e.notes, e.kind,
                    DATE_FORMAT(e.event_date, '%Y-%m-%d') AS event_date_fmt,
                    TIME_FORMAT(e.event_time, '%H:%i:%s') AS event_time_fmt,
                    TIMESTAMP(CONCAT(
                        DATE_FORMAT(e.event_date, '%Y-%m-%d'), ' ',
                        TIME_FORMAT(e.event_time, '%H:%i:%s')
                    )) AS ev_dt,
                    u.email, u.name AS user_name
             FROM user_calendar_events e
             INNER JOIN users u ON u.id = e.user_id
             WHERE e.event_time IS NOT NULL
               AND e.event_date >= ?
               AND e.event_date <= ?
         ) AS cal
         WHERE cal.ev_dt > NOW()
           AND TIMESTAMPDIFF(MINUTE, NOW(), cal.ev_dt) BETWEEN 13 AND 1442`;

    let rows;
    const conn = await pool.getConnection();
    try {
        await conn.query("SET time_zone = '+03:00'");
        const [r] = await conn.query(sqlCal, [startD, endD]);
        rows = r;
    } finally {
        conn.release();
    }

    for (const row of rows) {
        const diffMin = Number(row.diff_minutes_mysql);
        if (!Number.isFinite(diffMin)) continue;

        const dt = eventDateTime(row);
        if (!dt || !dt.isValid) continue;

        const email = normalizeUserEmail(row.email);

        for (const off of OFFSETS) {
            if (diffMin < off.minutes - 2 || diffMin > off.minutes + 2) continue;

            if (!email) {
                console.warn(
                    `[notify] calendar atlandı (kullanıcı e-postası yok) event_id=${numId(row.id)} user_id=${numId(row.user_id)}`
                );
                continue;
            }

            const dedupeKey = `ce:${numId(row.id)}:${off.key}`;
            const inserted = await tryInsertDedupe(pool, dedupeKey, numId(row.user_id), `calendar_${off.key}`);
            if (!inserted) continue;

            const whenStr = dt.setLocale('tr').toFormat("d MMMM yyyy HH:mm");
            const html = calendarMailHtml(row.user_name, row, off.key, whenStr);
            const subject = calendarSubject(row, off.key);
            const pushTitle = 'Takvim hatırlatması';
            const pushBody = `${row.title} — ${offsetLabelTr(off.key)} kala (${whenStr})`;

            try {
                await sendHtmlMail({ to: email, subject, html });
            } catch (err) {
                console.error('[notify] calendar mail failed', dedupeKey, err.message);
                await pool.query('DELETE FROM notification_sent_log WHERE dedupe_key = ?', [dedupeKey]);
                continue;
            }

            const tokens = await loadExpoTokens(pool, numId(row.user_id));
            await sendExpoPush(tokens, {
                title: pushTitle,
                body: pushBody,
                data: { type: 'calendar', eventId: numId(row.id), offset: off.key },
            });
        }
    }
}

function numId(v) {
    if (v == null) return v;
    if (typeof v === 'bigint') return Number(v);
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
}

async function runWaterReminders(pool) {
    if (!pool) return;
    const { enabled: mailOk } = getMailConfig();
    if (!mailOk) return;

    const now = DateTime.now().setZone(TZ);
    const h0 = firstWaterHour();
    const h1 = lastWaterHour();
    if (now.minute !== 0) return;
    if (now.hour < h0 || now.hour > h1) return;

    const [users] = await pool.query(
        'SELECT id, email, name FROM users WHERE email IS NOT NULL AND TRIM(email) != ?',
        ['']
    );

    for (const u of users) {
        const to = normalizeUserEmail(u.email);
        if (!to) continue;
        const uid = numId(u.id);
        const dedupeKey = `water:${now.toFormat('yyyy-LL-dd')}:${String(now.hour).padStart(2, '0')}:u${uid}`;
        const inserted = await tryInsertDedupe(pool, dedupeKey, uid, 'water_hourly');
        if (!inserted) continue;

        try {
            await sendHtmlMail({
                to,
                subject: 'CodeX — Su içme hatırlatması',
                html: waterMailHtml(u.name),
            });
        } catch (err) {
            console.error('[notify] water mail failed', dedupeKey, err.message);
            await pool.query('DELETE FROM notification_sent_log WHERE dedupe_key = ?', [dedupeKey]);
            continue;
        }

        const tokens = await loadExpoTokens(pool, uid);
        await sendExpoPush(tokens, {
            title: 'Su içme hatırlatması',
            body: 'Gün içinde yeterli su tüketmeyi unutmayın.',
            data: { type: 'water', hour: now.hour },
        });
    }
}

async function runReminderTick(pool) {
    if (!pool) return;
    await runCalendarReminders(pool);
    await runWaterReminders(pool);
}

module.exports = {
    runReminderTick,
    runCalendarReminders,
    runWaterReminders,
    TZ,
    firstWaterHour,
    lastWaterHour,
};
