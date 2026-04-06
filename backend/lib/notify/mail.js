const nodemailer = require('nodemailer');

function getMailConfig() {
    const user = (process.env.MAIL_USER || '').trim();
    const rawPass = process.env.MAIL_PASS || process.env.MAIL_PASSWORD || '';
    const pass = String(rawPass).replace(/\s+/g, '');
    const fromName = process.env.MAIL_FROM_NAME || 'CodeX HealthCare';
    return { user, pass, fromName, enabled: Boolean(user && pass) };
}

function createTransporter() {
    const { user, pass, enabled } = getMailConfig();
    if (!enabled) return null;
    const host = process.env.MAIL_HOST || 'smtp.gmail.com';
    const port = Number(process.env.MAIL_PORT) || 465;
    const useTls587 =
        String(process.env.MAIL_USE_TLS587 || '').trim() === '1' || port === 587;
    if (useTls587) {
        return nodemailer.createTransport({
            host,
            port: 587,
            secure: false,
            requireTLS: true,
            auth: { user, pass },
        });
    }
    return nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.MAIL_SECURE || 'true') !== 'false',
        auth: { user, pass },
    });
}

let cached;
function getTransporter() {
    if (cached === undefined) {
        cached = createTransporter();
    }
    return cached;
}

function invalidateTransporterCache() {
    cached = undefined;
}

async function sendHtmlMail(opts) {
    const t = getTransporter();
    const { user, fromName } = getMailConfig();
    const toAddr = opts.to != null ? String(opts.to).trim() : '';
    if (!t) throw new Error('SMTP yapılandırılmadı (MAIL_USER / MAIL_PASS)');
    if (!toAddr) throw new Error('Alıcı e-postası boş');
    const from = `"${fromName.replace(/"/g, '')}" <${user}>`;
    const text = stripHtmlToText(opts.html || '');
    const mailOpts = {
        from,
        to: toAddr,
        subject: opts.subject,
        text,
        html: opts.html,
    };
    if (String(process.env.MAIL_DEBUG_BCC_SELF || '').trim() === '1') {
        mailOpts.bcc = user;
    }
    const info = await t.sendMail(mailOpts);
    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    if (rejected.length > 0 && accepted.length === 0) {
        throw new Error(`SMTP alıcıyı kabul etmedi: ${rejected.join(', ')}`);
    }
    if (accepted.length === 0) {
        throw new Error('SMTP yanıtında accepted adres yok');
    }
    if (process.env.DEBUG_MAIL === '1') {
        console.log('[mail]', toAddr, 'messageId=', info.messageId, 'response=', info.response);
    }
    return {
        messageId: info.messageId,
        accepted,
        rejected,
        response: info.response,
    };
}

function stripHtmlToText(html) {
    return String(html)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000);
}

module.exports = { getMailConfig, sendHtmlMail, getTransporter, invalidateTransporterCache, createTransporter };
