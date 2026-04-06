const { GoogleGenerativeAI } = require('@google/generative-ai');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '../.env' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'codex_healthcare'
};

async function harvestCategory(categoryDescription) {
    let pool;
    try {
        pool = await mysql.createPool(dbConfig);
        console.log(`\n🚀 CodeX Hasat Makinesi Başlatıldı!`);
        console.log(`📂 Kategori: ${categoryDescription}`);
        console.log(`-------------------------------------------`);

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        console.log(`📡 Gemini'ye tıbbi veriler soruluyor (Bu işlem 30-40 sn sürebilir)...`);
        
        const prompt = `Türkiye'deki en yaygın kullanılan ${categoryDescription} ilaçlarından 10 tanesini çok detaylıca analiz et. 
        Her ilaç için şunları sağla: isim, etken madde, açıklama, kullanım, yan etkiler, uyarılar, dozaj ve doğal alternatifler.
        TÜM CEVAPLARI TÜRKÇE VER.
        JSON formatında bir liste olarak döndür: [{ "name": "", "active_ingredient": "", "description": "", "usage_info": "", "side_effects": "", "warnings": "", "dosage": "", "alternatives": [{ "name": "", "description": "" }] }]`;

        const startTime = Date.now();
        const result = await model.generateContent(prompt);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        let text = result.response.text();
        console.log(`✅ Gemini'den cevap alındı! (Süre: ${duration}s)`);
        
        const startIdx = text.indexOf('[');
        const endIdx = text.lastIndexOf(']');
        
        if (startIdx === -1 || endIdx === -1) {
            throw new Error("Geçerli bir JSON listesi bulunamadı.");
        }
        
        const jsonStr = text.substring(startIdx, endIdx + 1);
        const drugs = JSON.parse(jsonStr);

        console.log(`📦 ${drugs.length} adet yeni ilaç tespit edildi. SQL'e aktarım başlıyor...\n`);

        for (let i = 0; i < drugs.length; i++) {
            const drug = drugs[i];
            const [existing] = await pool.query('SELECT id FROM drugs_library WHERE name = ?', [drug.name]);
            if (existing.length > 0) {
                console.log(`[${i+1}/${drugs.length}] ⚠️  ${drug.name} zaten hafızada mevcut, atlanıyor.`);
                continue;
            }

            const [res] = await pool.query(
                'INSERT INTO drugs_library (name, active_ingredient, description, usage_info, side_effects, warnings, dosage) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [drug.name, drug.active_ingredient, drug.description, drug.usage_info, drug.side_effects, drug.warnings, drug.dosage]
            );
            
            const drugId = res.insertId;

            if (drug.alternatives) {
                for (const alt of drug.alternatives) {
                    await pool.query(
                        'INSERT INTO natural_alternatives (drug_id, alternative_name, description) VALUES (?, ?, ?)',
                        [drugId, alt.name, alt.description]
                    );
                }
            }
            console.log(`[${i+1}/${drugs.length}] ✅ ${drug.name} CodeX hafızasına kaydedildi.`);
        }

        console.log(`\n-------------------------------------------`);
        console.log('🏁 Başarıyla tamamlandı! Kütüphanen zenginleşti kanka.');
    } catch (err) {
        console.error('\n❌ Hata Oluştu:', err.message);
    } finally {
        if (pool) await pool.end();
    }
}

const target = process.argv[2] || "Ağrı Kesici ve Ateş Düşürücü";
harvestCategory(target);
