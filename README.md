## Ostim Tech - Google Developer Groups Hackathon '26   04-05.04.2026 


# CodeX HealthCare

CodeX HealthCare, kullanicinin saglik verilerini tek bir panelde toplayan ve yorumlayan bir dijital saglik platformudur. Sistem; kullanici profili, ilac arama, laboratuvar raporu analizi, suphe taramasi, takvim-planlama ve bildirim yonetimini ayni API uzerinden sunar.

> Uyari: Bu sistem klinik bilgilendirme amaclidir. Tibbi teshis veya tedavi yerine gecmez.

## Sistem Kapsami

- Kimlik yonetimi: kayit, giris, JWT tabanli oturum dogrulama
- Profil analizi: boy-kilo-yas-cinsiyet verilerinden AI destekli yorum
- Ilac modulu: metin ve gorsel tabanli ilac sorgulama
- Laboratuvar modulu: PDF/gorsel rapordan ozet ve kritik deger analizi
- Suphe tarama: soru-cevap bazli risk puani ve aciklayici degerlendirme
- Takvim: kullaniciya ait etkinlik, ilac ve hatirlatma kayitlari
- Bildirimler: SMTP e-posta ve Expo push token tabanli mobil bildirim
- Harita entegrasyonu: yakin hastane/eczane bilgisi ve konum temelli yardimci servisler
- Oyun modulu: bilissel oyunlarda skor kaydi ve gecmis goruntuleme

## Mimari Ozet

Sistem iki ana katmandan olusur:

1. `frontend`: React + Vite tabanli istemci arayuzu  
2. `backend`: Express tabanli REST API ve is kurallari

Veri katmani MySQL uzerindedir. Dosya yukleme, JWT dogrulama, cron tabanli hatirlatma isleri ve AI cagrilari backend tarafinda merkezi olarak yonetilir.

## Temel Teknolojiler

- Frontend: React, Vite, Tailwind CSS, Axios
- Backend: Node.js, Express, mysql2, jsonwebtoken, bcryptjs, multer
- Zamanlama/Bildirim: node-cron, nodemailer, Expo Push API
- AI/Analiz: Google Gemini
- Harita/Konum: OpenStreetMap, Overpass API, istemci tarafi konum servisleri

## Moduller ve Islevler

### Kullanici ve Oturum

- Kullanici kaydi ve girisi
- JWT ile korumali endpoint erisimi
- Profil bilgisinin tutulmasi ve guncellenmesi

### Klinik Destek Katmani

- Ilac arama ve ilac gorselinden tanimlama
- Laboratuvar raporu analizi ve yapilandirilmis cikti
- Suphe tarama senaryolari ve risk skorlama

### Takvim ve Bildirim

- Takvim etkinlik olusturma, guncelleme, silme
- Zamanlanmis e-posta hatirlatmalari
- Cihaza push bildirimi gonderimi (kayitli Expo tokenlar)

### Etkilesim ve Oyunlar

- Oyun skorlarini kullanici bazli saklama
- Sonuclarin gecmise donuk listelenmesi

## Veri Modeli Ozeti

`database` klasorunde sistemin cekirdek SQL dosyalari bulunur. Yapida temelde su alanlar yer alir:

- Kullanici ve profil bilgileri
- Kullanici etkilesim kayitlari (analiz, tarama vb.)
- Takvim etkinlikleri
- Oyun skor gecmisi
- Bildirim token ve dedupe log kayitlari
- Suphe tarama kosul/soru/opsiyon veri setleri

## Dokumantasyon Dosyalari

- `apis.md`: endpoint sozlesmeleri, JWT, multipart alanlari
- `mail_notify.md`: e-posta ve push hatirlatma akislari
- `calendar_questions.md`: takvim ve suphe tarama entegrasyon notlari
- `MOBIL_ENTEGRASYON_PROMPT.md`: mobil istemci gelistirme icin entegrasyon talimatlari

## Guvenlik ve Uyari Notlari

- JWT, SMTP ve API anahtarlari sadece sunucu tarafinda korunmalidir.
- Saglik verileri nedeniyle iletimde guvenli kanal kullanimi esastir.
- AI ciktilari destekleyici niteliktedir; klinik karar mekanizmasi yerine kullanilmamalidir.

## Developer Team
 - Yusuf Türker ALBAYRAK [https://github.com/TurkerAlbayrak]
 - Hasan Erman DAĞ [https://github.com/hasanerman]
 - Mir Mehmet PEKER [https://github.com/mirmehmet]