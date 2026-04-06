const https = require('https');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function postJson(url, body) {
    const data = JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
            {
                hostname: u.hostname,
                path: u.pathname + u.search,
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            },
            (res) => {
                let raw = '';
                res.on('data', (c) => {
                    raw += c;
                });
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') });
                    } catch {
                        resolve({ status: res.statusCode, body: raw });
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function sendExpoPush(expoPushTokens, payload) {
    const tokens = [...new Set((expoPushTokens || []).filter(Boolean))];
    if (tokens.length === 0) return { ok: true, skipped: true };

    const messages = tokens.map((to) => ({
        to,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
    }));

    const chunkSize = 100;
    for (let i = 0; i < messages.length; i += chunkSize) {
        const chunk = messages.slice(i, i + chunkSize);
        const res = await postJson(EXPO_PUSH_URL, chunk);
        if (res.status && res.status >= 400) {
            console.error('[expo-push] HTTP', res.status, JSON.stringify(res.body).slice(0, 500));
            return { ok: false, status: res.status, body: res.body };
        }
    }
    return { ok: true };
}

module.exports = { sendExpoPush };
