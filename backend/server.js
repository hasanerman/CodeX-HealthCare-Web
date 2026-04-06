const express = require('express');
const mysql = require('mysql2/promise');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { getMailConfig } = require('./lib/notify/mail');
const { runReminderTick } = require('./lib/notify/reminderWorker');
dotenv.config();
const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use((req, res, next) => {
    const p = req.originalUrl || req.url || '';
    if (p.startsWith('/api')) console.log('[api]', req.method, p);
    next();
});
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'codex_secret_key_123';

const dbConfig = {
    host: (process.env.DB_HOST || 'localhost').trim(),
    user: (process.env.DB_USER || 'root').trim(),
    password: String(process.env.DB_PASSWORD || process.env.DB_PASS || '').trim(),
    database: (process.env.DB_NAME || 'codex_healthcare').trim(),
};

let pool;

function numId(v) {
    if (v == null) return v;
    if (typeof v === 'bigint') return Number(v);
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
}

function parseGeminiJson(raw) {
    if (raw == null || typeof raw !== 'string') throw new SyntaxError('Boş AI yanıtı');
    let t = raw.trim();
    if (t.includes('```')) {
        const parts = t.split('```');
        for (const seg of parts) {
            const s = seg.trim().replace(/^json\s*/i, '').trim();
            if (s.startsWith('{')) {
                t = s;
                break;
            }
        }
    }
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start === -1 || end < start) throw new SyntaxError('Yanıtta JSON nesnesi yok');
    return JSON.parse(t.slice(start, end + 1));
}

function userForClient(row) {
    if (!row) return null;
    const txt = (v) => {
        if (v == null) return v;
        if (Buffer.isBuffer(v)) return v.toString('utf8');
        return typeof v === 'string' ? v : String(v);
    };
    return {
        id: numId(row.id),
        name: txt(row.name),
        height: row.height,
        weight: row.weight,
        age: row.age,
        gender: txt(row.gender),
        bmi_interpretation: row.bmi_interpretation != null ? txt(row.bmi_interpretation) : null,
    };
}

async function connectDB() {
    try {
        pool = await mysql.createPool({
            ...dbConfig,
            supportBigNumbers: true,
            bigNumberStrings: true,
        });
        pool.on('connection', (connection) => {
            connection.query("SET time_zone = '+03:00'", (err) => {
                if (err) console.error('MySQL SET time_zone:', err.message);
            });
        });
        console.log('✅ CodeX Memory Linked (MySQL)');
        return true;
    } catch (err) {
        console.error('❌ MySQL bağlantısı başarısız:', err.message);
        pool = null;
        return false;
    }
}

if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY tanımlı değil — tüm AI analiz uçları (rapor, ilaç, profil) 500 dönebilir.');
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function listModels() {
    try {
        console.log('🔍 Mevcut Gemini Modelleri taranıyor...');
    } catch (err) {}
}
listModels();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

async function logInteraction(userId, module, query, response) {
    if (!userId) return;
    try {
        await pool.query(
            'INSERT INTO user_interactions (user_id, module, query, response) VALUES (?, ?, ?, ?)',
            [userId, module, query, JSON.stringify(response)]
        );
    } catch (err) {
        console.error('Log Error:', err.message);
    }
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
    const raw = req.socket.remoteAddress || '';
    return raw.replace(/^::ffff:/i, '');
}

function isNonRoutableIp(ip) {
    if (!ip || ip === '::1') return true;
    if (ip === '127.0.0.1') return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('169.254.')) return true;
    if (ip.startsWith('172.')) {
        const n = parseInt(ip.split('.')[1], 10);
        if (!Number.isNaN(n) && n >= 16 && n <= 31) return true;
    }
    return false;
}

function fetchIpApiJson(ip) {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,lat,lon`;
    return new Promise((resolve, reject) => {
        http.get(url, { timeout: 8000 }, (r) => {
            let body = '';
            r.on('data', (c) => { body += c; });
            r.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject).on('timeout', function () {
            this.destroy();
            reject(new Error('timeout'));
        });
    });
}


app.get('/api/health', (req, res) => {
    const clockIstanbul = new Date().toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        hour12: false,
    });
    res.json({
        ok: true,
        db: !!pool,
        clock_utc: new Date().toISOString(),
        clock_istanbul: clockIstanbul,
    });
});

app.get('/', (req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>CodeX API</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem;line-height:1.5;color:#1e293b}a{color:#059669}</style></head><body>
<h1>CodeX Backend</h1>
<p><strong>Adres:</strong> <code>http://127.0.0.1:5000</code> — tarayıcıda <strong>http</strong> kullanın (<strong>https değil</strong>). HTTPS bu portta yalnızca Apache/nginx TLS ile olur.</p>
<p>Örnek uçlar:</p>
<ul>
<li><a href="/api/health">GET /api/health</a></li>
</ul>
</body></html>`);
});

app.post('/api/auth/register', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı bağlantısı yok (MySQL / .env kontrol et).' });
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );
        res.status(201).json({ message: 'Kayıt başarılı', userId: numId(result.insertId) });
    } catch (err) {
        console.error('register:', err.message);
        res.status(500).json({ error: 'Kayıt hatası' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı bağlantısı yok (MySQL / .env kontrol et).' });
    const { email, password } = req.body || {};
    console.log('[login] istek alındı', email || '(email yok)');
    if (!email || !password) {
        console.log('[login] eksik alan, content-type=', req.headers['content-type'], 'body keys=', req.body && Object.keys(req.body));
        return res.status(400).json({ error: 'E-posta ve şifre gerekli' });
    }
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'Geçersiz email veya şifre' });

        const user = users[0];
        if (!user.password) {
            console.error('login: kullanıcı şifre alanı boş, id=', user.id);
            return res.status(500).json({ error: 'Hesap verisi hatalı' });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Geçersiz email veya şifre' });

        const payload = userForClient(user);
        const token = jwt.sign({ id: payload.id, name: payload.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: payload });
    } catch (err) {
        console.error('login HATA:', err && err.message, err && err.stack);
        const out = { error: 'Giriş hatası' };
        if (process.env.DEBUG_API === '1') out.detail = err && err.message;
        res.status(500).json(out);
    }
});


app.post('/api/user/profile', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı bağlantısı yok (MySQL / .env kontrol et).' });

    const { height, weight, age, gender } = req.body || {};
    const userId = req.user.id;

    const h = height === '' || height == null ? null : Number(height);
    const w = weight === '' || weight == null ? null : Number(weight);
    const aRaw = age === '' || age == null ? null : parseInt(String(age), 10);
    const a = aRaw != null && !Number.isNaN(aRaw) ? aRaw : null;
    const gen = ['erkek', 'kadin', 'diger'].includes(gender) ? gender : 'erkek';

    console.log('Profil Güncelleme İsteği:', { userId, height: h, weight: w, age: a, gender: gen });

    let interpretation = '';
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const prompt = `Kullanıcı Verileri: Boy: ${h ?? '-'}cm, Kilo: ${w ?? '-'}kg, Yaş: ${a ?? '-'}, Cinsiyet: ${gen}. 
        Lütfen bu verilere dayanarak kısa bir klinik sağlık analizi yap (2-3 cümle). 
        Vücut kitle indeksine (VKI) değin, genel sağlık durumu hakkında ipuçları ver ve 1 adet aksiyonel kısa tıbbi tavsiye ekle. 
        TÜRKÇE OLSUN. KESİNLİKLE EMOJİ KULLANMA. Yanıtın sonuna "CodeX doktor değildir, bu bir AI simülasyonudur." uyarısı ekle.`;
            const result = await model.generateContent(prompt);
            interpretation = result.response.text();
        } catch (err) {
            console.error('PROFIL GEMINI HATASI:', err && err.message);
            interpretation =
                'Klinik özet şu an üretilemedi (yapay zekâ servisi yanıt vermedi veya erişilemiyor). Boy, kilo ve yaş bilgileriniz kaydedildi. CodeX doktor değildir, bu bir bilgilendirme uygulamasıdır.';
        }
    } else {
        interpretation =
            'Yapay zekâ özeti için sunucuda GEMINI_API_KEY tanımlı değil. Profil sayısal verileriniz kaydedildi. CodeX doktor değildir, bu bir bilgilendirme uygulamasıdır.';
    }

    try {
        await pool.query(
            'UPDATE users SET height = ?, weight = ?, age = ?, gender = ?, bmi_interpretation = ? WHERE id = ?',
            [Number.isFinite(h) ? h : null, Number.isFinite(w) ? w : null, a, gen, interpretation, userId]
        );
        res.json({ message: 'Profil ve Analiz Güncellendi', interpretation });
    } catch (err) {
        console.error('PROFIL DB HATASI:', err);
        res.status(500).json({ error: 'Profil kaydedilemedi', details: err.message });
    }
});

app.get('/api/user/last-report', authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM user_interactions WHERE user_id = ? AND module = "report" ORDER BY created_at DESC LIMIT 1', [req.user.id]);
        res.json(rows[0] || null);
    } catch (err) { res.status(500).json({ error: 'Rapor alınamadı' }); }
});


app.post('/api/drug/search', async (req, res) => {
    const { drugName, userId } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM drugs_library WHERE name LIKE ?', [`%${drugName}%`]);
        let responseData;
        if (rows.length > 0) {
            const [alts] = await pool.query('SELECT * FROM natural_alternatives WHERE drug_id = ?', [rows[0].id]);
            responseData = { source: 'CodeX Lokal Hafıza', ...rows[0], alternatives: alts };
        } else {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `"${drugName}" ilacını analiz et (Türkçe). JSON: { "name": "", "active_ingredient": "", "description": "", "usage_info": "", "side_effects": "", "warnings": "", "dosage": "", "alternatives": [{ "name": "", "description": "" }] }`;
            const result = await model.generateContent(prompt);
            responseData = parseGeminiJson(result.response.text());
            const [ins] = await pool.query('INSERT IGNORE INTO drugs_library (name, active_ingredient, description, usage_info, side_effects, warnings, dosage) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [responseData.name, responseData.active_ingredient, responseData.description, responseData.usage_info, responseData.side_effects, responseData.warnings, responseData.dosage]);
            responseData.source = 'Sistem Analizi (AI)';
        }
        if (userId) await logInteraction(userId, 'drug', drugName, responseData);
        res.json(responseData);
    } catch (err) {
        console.error('drug/search:', err && err.message, err && err.stack);
        const out = { error: 'Arama hatası' };
        if (process.env.DEBUG_API === '1') out.detail = err && err.message;
        res.status(500).json(out);
    }
});

app.post('/api/drug/analyze-image', upload.single('image'), async (req, res) => {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const imageData = fs.readFileSync(req.file.path);
        const nameResult = await model.generateContent(["Bu ilacın ismini sadece tek kelime oku.", { inlineData: { data: imageData.toString("base64"), mimeType: req.file.mimetype } }]);
        const detectedName = nameResult.response.text().trim();
        
        const [rows] = await pool.query('SELECT * FROM drugs_library WHERE name LIKE ?', [`%${detectedName}%`]);
        let responseData;
        if (rows.length > 0) {
            const [alts] = await pool.query('SELECT * FROM natural_alternatives WHERE drug_id = ?', [rows[0].id]);
            responseData = { source: 'CodeX Lokal Hafıza', ...rows[0], alternatives: alts };
        } else {
            const fullPrompt = `"${detectedName}" ilacı analizi (Türkçe). JSON: { "name": "", "active_ingredient": "", "description": "", "usage_info": "", "side_effects": "", "warnings": "", "dosage": "", "alternatives": [{ "name": "", "description": "" }] }`;
            const fullResult = await model.generateContent(fullPrompt);
            responseData = parseGeminiJson(fullResult.response.text());
            responseData.source = 'Sistem Analizi (AI)';
        }
        if (userId) await logInteraction(userId, 'drug', detectedName, responseData);
        res.json(responseData);
    } catch (err) {
        console.error('drug/analyze-image:', err && err.message, err && err.stack);
        const out = { error: 'Görsel analiz hatası' };
        if (process.env.DEBUG_API === '1') out.detail = err && err.message;
        res.status(500).json(out);
    }
});

app.post('/api/analyze-report', upload.single('report'), async (req, res) => {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Rapor yok' });
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const fileData = fs.readFileSync(req.file.path);
        const prompt = `Kan tahlili raporunu analiz et (Türkçe). Yalnızca geçerli JSON döndür.

Şema (critical_values içindeki HER satır için zorunlu alanlar):
{
  "summary": "kısa özet",
  "critical_values": [
    {
      "name": "Rapordaki tam parametre adı (örn. Hemoglobin, Ferritin, TSH, LDL-Kolesterol, Vitamin D, vb.) — asla boş bırakma",
      "value": "ölçülen sayı veya rapordaki değer metni",
      "unit": "birim (örn. mg/dL, g/dL, µIU/mL, ng/mL); raporda ne yazıyorsa o",
      "reference_range": "Raporda yazan referans / olması gereken aralık (örn. 12-16 g/dL veya 4,5-11); yoksa bu test için yaygın yetişkin referans aralığını kısaca yaz",
      "status": "Düşük | Normal | Yüksek veya rapora uygun kısa durum",
      "meaning": "Bu parametre için 1-3 cümle klinik yorum; cümle mutlaka parametre adıyla başlasın ve düşük/yüksek ise bunu açıkça belirtsin"
    }
  ],
  "recommendations": { "drinks": [], "foods": [], "medications": [] },
  "medication_suggestions": "genel klinik yorum",
  "disclaimer": "CodeX Doktor Değildir..."
}

TÜRKÇE olsun, emoji kullanma. Her anormal veya kritik satır için ayrı critical_values öğesi üret.`;
        const result = await model.generateContent([prompt, { inlineData: { data: fileData.toString("base64"), mimeType: req.file.mimetype } }]);
        const aiData = parseGeminiJson(result.response.text());

        if (userId) await logInteraction(userId, 'report', 'Kan Tahlili Analizi', aiData);
        res.json(aiData);
    } catch (err) {
        console.error('analyze-report:', err && err.message, err && err.stack);
        const out = { error: 'Rapor hatası' };
        if (process.env.DEBUG_API === '1') out.detail = err && err.message;
        res.status(500).json(out);
    }
});


function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(lat2 - lat1);
    const dLon = toR(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function fetchNearestHospital(lat, lon) {
    return new Promise((resolve) => {
        if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
            resolve(null);
            return;
        }
        const la = Number(lat);
        const lo = Number(lon);
        const query = `[out:json];
(
  nwr["amenity"="hospital"](around:25000,${la},${lo});
);
out center;`;
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const req = https.get(url, { timeout: 18000 }, (r) => {
            let body = '';
            r.on('data', (c) => {
                body += c;
            });
            r.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    let best = null;
                    let bestKm = Infinity;
                    for (const el of data.elements || []) {
                        const plat = el.lat ?? el.center?.lat;
                        const plon = el.lon ?? el.center?.lon;
                        if (plat == null || plon == null) continue;
                        const km = haversineKm(la, lo, plat, plon);
                        if (km < bestKm) {
                            bestKm = km;
                            best = {
                                name: el.tags?.name || 'Hastane',
                                lat: plat,
                                lon: plon,
                                distanceKm: Math.round(km * 10) / 10,
                            };
                        }
                    }
                    resolve(best);
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', function () {
            this.destroy();
            resolve(null);
        });
    });
}

app.get('/api/screening/conditions', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    try {
        const [rows] = await pool.query(
            'SELECT id, slug, title, description, sort_order FROM screening_conditions ORDER BY sort_order ASC, id ASC'
        );
        res.json(rows.map((r) => ({ ...r, id: numId(r.id) })));
    } catch (err) {
        console.error('screening/conditions:', err.message);
        res.status(500).json({ error: 'Liste alınamadı' });
    }
});

app.get('/api/screening/conditions/:slug/questions', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'Geçersiz slug' });
    try {
        const [conds] = await pool.query('SELECT * FROM screening_conditions WHERE slug = ? LIMIT 1', [slug]);
        if (conds.length === 0) return res.status(404).json({ error: 'Şüphe türü bulunamadı' });
        const cond = conds[0];
        const [qrows] = await pool.query(
            'SELECT id, prompt, sort_order FROM screening_questions WHERE condition_id = ? ORDER BY sort_order ASC, id ASC',
            [cond.id]
        );
        const qids = qrows.map((q) => q.id);
        if (qids.length === 0) return res.json({ condition: { id: numId(cond.id), slug: cond.slug, title: cond.title, description: cond.description }, questions: [] });

        const [opts] = await pool.query(
            `SELECT id, question_id, label, sort_order FROM screening_options WHERE question_id IN (${qids.map(() => '?').join(',')}) ORDER BY question_id ASC, sort_order ASC, id ASC`,
            qids
        );
        const byQ = new Map();
        for (const o of opts) {
            if (!byQ.has(o.question_id)) byQ.set(o.question_id, []);
            byQ.get(o.question_id).push({
                id: numId(o.id),
                label: o.label,
                sort_order: o.sort_order,
            });
        }
        const questions = qrows.map((q) => ({
            id: numId(q.id),
            prompt: q.prompt,
            sort_order: q.sort_order,
            options: byQ.get(q.id) || [],
        }));
        res.json({
            condition: {
                id: numId(cond.id),
                slug: cond.slug,
                title: cond.title,
                description: cond.description,
            },
            questions,
        });
    } catch (err) {
        console.error('screening/questions:', err.message);
        res.status(500).json({ error: 'Sorular yüklenemedi' });
    }
});

app.post('/api/screening/submit', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const { slug, answers, lat, lon, userId } = req.body || {};
    if (!slug || !Array.isArray(answers) || answers.length === 0) {
        return res.status(400).json({ error: 'slug ve answers gerekli' });
    }
    try {
        const [conds] = await pool.query('SELECT * FROM screening_conditions WHERE slug = ? LIMIT 1', [String(slug).trim()]);
        if (conds.length === 0) return res.status(404).json({ error: 'Şüphe türü bulunamadı' });
        const cond = conds[0];

        const [qrows] = await pool.query(
            'SELECT id, prompt FROM screening_questions WHERE condition_id = ? ORDER BY sort_order ASC, id ASC',
            [cond.id]
        );
        const expectedQids = new Set(qrows.map((q) => numId(q.id)));
        if (expectedQids.size === 0) return res.status(400).json({ error: 'Bu tür için soru yok' });

        const [allOpts] = await pool.query(
            `SELECT o.id, o.question_id, o.label, o.risk_points FROM screening_options o
             JOIN screening_questions q ON q.id = o.question_id AND q.condition_id = ?`,
            [cond.id]
        );
        const optById = new Map(allOpts.map((o) => [numId(o.id), o]));
        const maxByQuestion = new Map();
        for (const o of allOpts) {
            const qid = numId(o.question_id);
            const pts = Number(o.risk_points) || 0;
            const prev = maxByQuestion.get(qid) || 0;
            if (pts > prev) maxByQuestion.set(qid, pts);
        }
        let maxScore = 0;
        for (const qid of expectedQids) maxScore += maxByQuestion.get(qid) || 0;

        const pickedByQ = new Map();
        for (const a of answers) {
            const qid = numId(a.questionId);
            const oid = numId(a.optionId);
            if (qid == null || oid == null) continue;
            if (!expectedQids.has(qid)) continue;
            const opt = optById.get(oid);
            if (!opt || numId(opt.question_id) !== qid) continue;
            pickedByQ.set(qid, { optionId: oid, label: opt.label, risk_points: opt.risk_points });
        }
        if (pickedByQ.size !== expectedQids.size) {
            return res.status(400).json({ error: 'Her soru için geçerli bir şık seçilmeli' });
        }

        let score = 0;
        const qaLines = [];
        for (const q of qrows) {
            const qid = numId(q.id);
            const pick = pickedByQ.get(qid);
            score += Number(pick.risk_points) || 0;
            const promptText = q.prompt || '';
            qaLines.push(`S: ${promptText}\nC: ${pick.label} (iç skor: ${pick.risk_points})`);
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const geminiPrompt = `Sen bir klinik bilgilendirme asistanısın (teşhis koymazsın). Kullanıcı "${cond.title}" şüphesi için çoktan seçmeli bir tarama yaptı.
Toplam risk puanı: ${score} / ${maxScore} (bu sadece cevaplara dayalı kabaca bir ağırlıklandırma; tıbbi kesinlik değildir).

Soru ve yanıtlar:
${qaLines.join('\n\n')}

Yalnızca geçerli JSON döndür (Türkçe, emoji yok):
{
  "interpretation": "Durumu 2-4 kısa paragrafta açıkla; tıbbi teşhis iddiasında bulunma.",
  "suspicion_level_label": "Düşük endişe | Orta endişe | Yüksek endişe" değerlerinden biri,
  "natural_methods": ["Evde/yaşam tarzı ile desteklenebilecek 4-8 maddelik genel öneri; ilaç önerme, doz yazma"],
  "doctor_importance": "Neden acil veya planlı hekim muayenesinin önemli olduğunu vurgulayan 2-4 cümle",
  "emergency_note": "112 veya acil servis önerisi gerekiyorsa kısa net metin; değilse null",
  "disclaimer": "CodeX doktor değildir; bu çıktı bilgilendirme amaçlıdır."
}

Yüksek risk semptomlarında emergency_note dolu olsun. Her zaman doktor önceliğini vurgula.`;

        const gResult = await model.generateContent(geminiPrompt);
        const ai = parseGeminiJson(gResult.response.text());

        let nearestHospital = null;
        if (lat != null && lon != null) {
            nearestHospital = await fetchNearestHospital(lat, lon);
        }

        const payload = {
            condition: { id: numId(cond.id), slug: cond.slug, title: cond.title },
            score,
            maxScore,
            ai,
            nearestHospital,
        };

        if (userId) await logInteraction(userId, 'screening', cond.title, payload);

        res.json(payload);
    } catch (err) {
        console.error('screening/submit:', err && err.message, err && err.stack);
        const out = { error: 'Tarama sonucu oluşturulamadı' };
        if (process.env.DEBUG_API === '1') out.detail = err && err.message;
        res.status(500).json(out);
    }
});


function calendarEventFromRow(row) {
    let d = row.event_date;
    if (d instanceof Date) d = d.toISOString().slice(0, 10);
    else if (d != null) d = String(d).slice(0, 10);
    let t = row.event_time;
    if (t != null && t !== '') {
        const ts = String(t);
        t = ts.length >= 5 ? ts.slice(0, 5) : ts;
    } else t = null;
    return {
        id: numId(row.id),
        title: row.title,
        notes: row.notes,
        kind: row.kind,
        event_date: d,
        event_time: t,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

const CALENDAR_KINDS = new Set(['event', 'medication', 'reminder']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get('/api/calendar/events', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const year = parseInt(req.query.year, 10);
    const month = parseInt(req.query.month, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'year ve month (1-12) gerekli' });
    }
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
    try {
        const [rows] = await pool.query(
            `SELECT * FROM user_calendar_events WHERE user_id = ? AND event_date >= ? AND event_date < ? ORDER BY event_date ASC, event_time ASC, id ASC`,
            [req.user.id, start, end]
        );
        res.json(rows.map(calendarEventFromRow));
    } catch (err) {
        console.error('calendar list:', err.message);
        res.status(500).json({ error: 'Takvim verisi alınamadı' });
    }
});

app.post('/api/calendar/events', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const userId = req.user.id;
    const { title, notes, kind, event_date, event_time } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Başlık gerekli' });
    }
    const k = typeof kind === 'string' ? kind : 'event';
    if (!CALENDAR_KINDS.has(k)) return res.status(400).json({ error: 'Geçersiz tür' });
    if (!event_date || typeof event_date !== 'string' || !DATE_RE.test(event_date.trim())) {
        return res.status(400).json({ error: 'Geçersiz tarih (YYYY-MM-DD)' });
    }
    let timeVal = null;
    if (event_time != null && String(event_time).trim() !== '') {
        const ts = String(event_time).trim();
        timeVal = ts.length === 5 ? `${ts}:00` : ts;
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO user_calendar_events (user_id, title, notes, kind, event_date, event_time) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, title.trim(), notes && String(notes).trim() ? String(notes).trim() : null, k, event_date.trim(), timeVal]
        );
        const [rows] = await pool.query('SELECT * FROM user_calendar_events WHERE id = ? LIMIT 1', [result.insertId]);
        res.status(201).json(calendarEventFromRow(rows[0]));
    } catch (err) {
        console.error('calendar create:', err.message);
        res.status(500).json({ error: 'Kayıt oluşturulamadı' });
    }
});

app.put('/api/calendar/events/:id', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const userId = req.user.id;
    const id = numId(req.params.id);
    if (id == null) return res.status(400).json({ error: 'Geçersiz id' });
    const { title, notes, kind, event_date, event_time } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'Başlık gerekli' });
    }
    const k = typeof kind === 'string' ? kind : 'event';
    if (!CALENDAR_KINDS.has(k)) return res.status(400).json({ error: 'Geçersiz tür' });
    if (!event_date || typeof event_date !== 'string' || !DATE_RE.test(event_date.trim())) {
        return res.status(400).json({ error: 'Geçersiz tarih' });
    }
    let timeVal = null;
    if (event_time != null && String(event_time).trim() !== '') {
        const ts = String(event_time).trim();
        timeVal = ts.length === 5 ? `${ts}:00` : ts;
    }
    try {
        const [u] = await pool.query(
            'UPDATE user_calendar_events SET title = ?, notes = ?, kind = ?, event_date = ?, event_time = ? WHERE id = ? AND user_id = ?',
            [title.trim(), notes && String(notes).trim() ? String(notes).trim() : null, k, event_date.trim(), timeVal, id, userId]
        );
        if (u.affectedRows === 0) return res.status(404).json({ error: 'Kayıt bulunamadı' });
        const [rows] = await pool.query('SELECT * FROM user_calendar_events WHERE id = ? LIMIT 1', [id]);
        res.json(calendarEventFromRow(rows[0]));
    } catch (err) {
        console.error('calendar update:', err.message);
        res.status(500).json({ error: 'Güncellenemedi' });
    }
});

app.delete('/api/calendar/events/:id', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const userId = req.user.id;
    const id = numId(req.params.id);
    if (id == null) return res.status(400).json({ error: 'Geçersiz id' });
    try {
        const [r] = await pool.query('DELETE FROM user_calendar_events WHERE id = ? AND user_id = ?', [id, userId]);
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Kayıt bulunamadı' });
        res.json({ ok: true });
    } catch (err) {
        console.error('calendar delete:', err.message);
        res.status(500).json({ error: 'Silinemedi' });
    }
});


app.post('/api/notify/register-device', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const { expoPushToken } = req.body || {};
    if (!expoPushToken || typeof expoPushToken !== 'string' || !expoPushToken.trim()) {
        return res.status(400).json({ error: 'expoPushToken gerekli' });
    }
    const token = expoPushToken.trim();
    try {
        await pool.query(
            `INSERT INTO user_expo_push_tokens (user_id, expo_push_token) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, token]
        );
        res.json({ message: 'Cihaz bildirim kaydı güncellendi' });
    } catch (err) {
        console.error('notify/register-device:', err.message);
        res.status(500).json({ error: 'Kayıt hatası' });
    }
});

app.delete('/api/notify/register-device', authenticateToken, async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'Veritabanı yok' });
    const { expoPushToken } = req.body || {};
    try {
        if (expoPushToken && typeof expoPushToken === 'string' && expoPushToken.trim()) {
            await pool.query('DELETE FROM user_expo_push_tokens WHERE user_id = ? AND expo_push_token = ?', [
                req.user.id,
                expoPushToken.trim(),
            ]);
        } else {
            await pool.query('DELETE FROM user_expo_push_tokens WHERE user_id = ?', [req.user.id]);
        }
        res.json({ ok: true, message: 'Kayıt silindi' });
    } catch (err) {
        console.error('notify/register-device DELETE:', err.message);
        res.status(500).json({ error: 'Silinemedi' });
    }
});


app.post('/api/games/save-score', authenticateToken, async (req, res) => {
    const { gameType, difficulty, moves, timeSeconds, comment } = req.body;
    const userId = req.user.id;
    try {
        await pool.query(
            'INSERT INTO game_scores (user_id, game_type, difficulty, moves, time_seconds, comment) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, gameType, difficulty, moves || 0, timeSeconds, comment || null]
        );
        res.json({ message: 'Skor kaydedildi' });
    } catch (err) { res.status(500).json({ error: 'Skor kaydı hatası' }); }
});

app.get('/api/user/game-history', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM game_scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: 'Geçmiş alınamadı' }); }
});

app.get('/api/geo/ip-hint', async (req, res) => {
    const ip = getClientIp(req);
    if (isNonRoutableIp(ip)) {
        return res.json({
            lat: 41.0082,
            lon: 28.9784,
            source: 'default',
            message: 'Yerel/özel ağ; harita için varsayılan konum (İstanbul merkez).',
        });
    }
    try {
        const data = await fetchIpApiJson(ip);
        if (data.status === 'success' && typeof data.lat === 'number' && typeof data.lon === 'number') {
            return res.json({ lat: data.lat, lon: data.lon, source: 'ip' });
        }
    } catch (err) {
        console.error('geo ip-hint:', err.message);
    }
    return res.json({
        lat: 41.0082,
        lon: 28.9784,
        source: 'default',
        message: 'IP konumu alınamadı; varsayılan konum kullanıldı.',
    });
});

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.BIND_HOST || '0.0.0.0';
(async () => {
    await connectDB();
    app.listen(PORT, HOST, () => {
        const hint = HOST === '127.0.0.1' ? ' (yalnızca localhost; dış IP:5000 kapalı)' : ' (dışarıdan IP:5000 mümkün; güvenlik duvarında 5000 açık olmalı)';
        console.log(`🚀 CodeX Backend http://${HOST}:${PORT}${hint}`);
        if (getMailConfig().enabled) {
            console.log('✅ Bildirim e-postası (SMTP) yapılandırıldı — takvim + su hatırlatmaları aktif olabilir.');
        } else {
            console.warn('⚠️ MAIL_USER / MAIL_PASS tanımlı değil — e-posta hatırlatmaları gönderilmez.');
        }
        if (process.env.DISABLE_NOTIFY_CRON === '1') {
            console.warn('⚠️ DISABLE_NOTIFY_CRON=1 — hatırlatma zamanlayıcı kapalı.');
        } else if (pool) {
            cron.schedule(
                '* * * * *',
                () => {
                    runReminderTick(pool).catch((e) => console.error('[notify cron]', e && e.message));
                },
                { timezone: 'Europe/Istanbul' }
            );
            console.log('✅ Hatırlatma cron (İstanbul, her dakika) başlatıldı.');
        }
    });
})();
