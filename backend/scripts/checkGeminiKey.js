'use strict';

const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const key = (process.env.GEMINI_API_KEY || '').trim();

function hintForMessage(msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('404') || m.includes('not found')) {
        return 'Model adı bu projede / hesapta yok olabilir. .env içinde GEMINI_MODEL=gemini-2.0-flash deneyin veya https://aistudio.google.com/apikey üzerinden kullanılabilir modellere bakın.';
    }
    if (m.includes('403') || m.includes('permission') || m.includes('api key')) {
        return 'Anahtar hatalı, iptal edilmiş veya Generative Language API için kısıtlı olabilir. Google AI Studio’da yeni anahtar oluşturup .env’e yapıştırın.';
    }
    if (m.includes('429') || m.includes('quota') || m.includes('resource exhausted')) {
        return 'Kota dolmuş veya çok istek atıldı. Google Cloud / AI Studio kotasını ve faturalandırmayı kontrol edin; bir süre bekleyip tekrar deneyin.';
    }
    if (m.includes('400')) {
        return 'İstek reddedildi (400). Anahtar formatı, bölge kısıtı veya içerik politikası olabilir; tam hata metnini okuyun.';
    }
    return 'Ağ / güvenlik duvarı / proxy engeli de olabilir; sunucunun generativelanguage.googleapis.com adresine çıkabildiğini doğrulayın.';
}

async function main() {
    if (!key) {
        console.error('❌ GEMINI_API_KEY tanımlı değil veya boş.');
        console.error('   backend/.env içinde satır: GEMINI_API_KEY=AIza... (tırnak kullanmayın, satır sonunda boşluk bırakmayın)');
        process.exit(1);
    }

    console.log('Model:', MODEL);
    console.log('Anahtar uzunluğu:', key.length, '(güvenlik için tam değer yazdırılmıyor)');

    const genAI = new GoogleGenerativeAI(key);
    try {
        const model = genAI.getGenerativeModel({ model: MODEL });
        const result = await model.generateContent('Yanıt olarak tek kelime yaz: OK');
        const text = (result.response && result.response.text && result.response.text()) || '';
        const preview = String(text).trim().slice(0, 120);
        console.log('✅ Başarılı. Örnek yanıt:', preview || '(boş)');
        console.log('Anahtar ve model bu makineden çalışıyor; sorun başka yerdeyse (deploy .env, yanlış process) orayı kontrol edin.');
        process.exit(0);
    } catch (err) {
        const msg = err && (err.message || String(err));
        console.error('❌ Gemini çağrısı başarısız.');
        console.error('   Hata:', msg);
        const hint = hintForMessage(msg);
        if (hint) console.error('   →', hint);
        process.exit(1);
    }
}

main();
