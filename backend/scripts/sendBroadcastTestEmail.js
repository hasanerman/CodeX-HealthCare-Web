const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const { getMailConfig, sendHtmlMail, getTransporter, invalidateTransporterCache } = require('../lib/notify/mail');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'codex_healthcare',
};

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function main() {
    invalidateTransporterCache();
    const cfg = getMailConfig();
    if (!cfg.enabled) {
        console.error('MAIL_USER ve MAIL_PASS .env içinde tanımlı değil.');
        process.exit(1);
    }

    console.log('--- CodeX e-posta teşhis ---');
    console.log('Gönderen (MAIL_USER):', cfg.user);
    console.log('Uygulama şifresi uzunluğu (boşluksuz):', cfg.pass.length, 'karakter (16 olmalı)');
    console.log(
        'Not: Gelen kutusu kontrolü — Spam / İstenmeyen. "Gönderilmiş" yalnızca gönderen Gmail hesabında görünür.'
    );
    console.log('SMTP doğrulanıyor (verify)...');

    const t = getTransporter();
    try {
        await t.verify();
        console.log('SMTP verify: OK');
    } catch (e) {
        console.error('SMTP verify BAŞARISIZ:', e.message);
        console.error('Deneyin: .env içinde MAIL_PORT=587 ve MAIL_USE_TLS587=1 (kurumsal ağlarda 465 bazen bloklanır).');
        process.exit(1);
    }

    const pool = await mysql.createPool({ ...dbConfig, supportBigNumbers: true, bigNumberStrings: true });
    const [rows] = await pool.query(
        'SELECT id, email, name FROM users WHERE email IS NOT NULL AND TRIM(email) != ?',
        ['']
    );
    await pool.end();

    if (rows.length === 0) {
        console.log('Gönderilecek kullanıcı yok.');
        process.exit(0);
    }

    const subject = 'CodeX — Test e-postası (SMTP çalışıyor)';
    let ok = 0;
    let fail = 0;

    for (const u of rows) {
        const email = String(u.email).trim();
        const name = u.name ? String(u.name) : 'Kullanıcı';
        const html = `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#222;">
<p>Merhaba ${escapeHtml(name)},</p>
<p>Bu mesaj <strong>manuel test</strong> amacıyla gönderilmiştir. SMTP ve Gmail ayarlarınız doğru çalışıyorsa bu e-postayı alıyorsunuz.</p>
<p style="margin-top:16px;font-size:13px;color:#666;">CodeX HealthCare</p>
</body></html>`;

        try {
            const info = await sendHtmlMail({ to: email, subject, html });
            console.log('[ok]', u.id, email, '| messageId=', info.messageId, '| accepted=', info.accepted.join(','));
            ok += 1;
        } catch (e) {
            console.error('[hata]', u.id, email, e.message);
            fail += 1;
        }
        await sleep(400);
    }

    console.log(`Bitti. Başarılı: ${ok}, Hatalı: ${fail}, Toplam: ${rows.length}`);
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
