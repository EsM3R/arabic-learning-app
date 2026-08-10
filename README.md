# Arapça Hoca — أستاذ العربية

Kişisel yapay zekâ destekli Arapça öğrenme uygulaması (Expo / React Native).

- 🗣️ **Konuşma parkuru:** Şami (Suriye) ammicesi — Suriyeli arkadaşlarınla akıcı sohbet
- 📖 **Okuma parkuru:** Fusha (Modern Standart Arapça) — profesyonel okuma
- 🧑‍🏫 **Üstaz:** Claude destekli, Türkçe açıklama yapan kişisel öğretmen
- 📊 Sohbet tabanlı seviye tespiti (CEFR: A0–C2, konuşma ve okuma ayrı)
- 🗺️ Seviyene ve zayıf yönlerine göre üretilen kişisel müfredat
- 💬 Serbest sohbet modu (ammice pratik, anında hata düzeltme)
- 🤖 **Agentic öğretmen:** Üstaz'ın 17 aracı var ve hepsini kendi kararıyla, izin sormadan kullanır.

  **Önce bakar (okuma araçları):**
  - 📊 `tekrar_durumu` — hangi kelimeleri unuttuğunu, kaç tekrarın biriktiğini görür
  - 🔍 `kelime_ara` — bir kelimeyi daha önce öğretip öğretmediğini kontrol eder
  - 📚 `hafiza_oku` — hata defterini ve geçmiş notlarını konuya göre arar
  - 🗺️ `mufredat_oku` — modülleri ve tamamlanma durumunu okur

  **Sonra yazar / düzeltir:**
  - 📇 `kelime_kaydet` (zorluk derecesiyle), `kelime_duzelt`, `kelime_sil`
  - 📒 `hata_kaydet`, `hata_cozuldu` (öğrendiğin konuyu defterden düşürür)
  - 🗒️ `not_yaz`, `not_sil` — kalıcı hafızası
  - 📈 `seviye_guncelle` — seviyeni **ve** zayıf yönlerini birlikte günceller
  - 🏗️ `modul_ekle`, `modul_tamamla`

  **İnisiyatif alır:**
  - ➡️ `ekrana_git` — sıradaki adımı önerir (tıklanabilir öneri şeridi)
  - ⏰ `hatirlatici_kur` — telefonuna ders hatırlatıcısı kurar

  Seviye tespitini de Üstaz yönetir: ne zaman yeterli kanıt topladığına kendisi karar verip
  `degerlendirmeyi_bitir` ile kapatır.

## Kurulum

1. Bilgisayarına [Node.js](https://nodejs.org) kur.
2. Telefonuna **Expo Go** uygulamasını indir (App Store / Google Play).
3. Bu repoyu klonla ve bağımlılıkları kur:

   ```bash
   git clone https://github.com/EsM3R/arabic-learning-app.git
   cd arabic-learning-app
   npm install
   ```

4. Uygulamayı başlat:

   ```bash
   npx expo start
   ```

5. Terminalde çıkan QR kodu telefonundan Expo Go ile okut. Uygulama telefonunda açılır.

> **Sürüm notu:** Proje **Expo SDK 54** kullanır. Telefondaki Expo Go'nun da SDK 54
> sürümü olmalı (Expo Go → Settings → sürüm numarası). "Project is incompatible with
> this version of Expo Go" hatası alırsan sürümler uyuşmuyordur.

## API Anahtarı

Uygulama, öğretmen olarak Claude'u kullanır. Bunun için bir Anthropic API anahtarı gerekir:

1. [console.anthropic.com](https://console.anthropic.com) adresinden hesap aç.
2. Hesabına küçük bir bakiye yükle (kişisel kullanımda aylık maliyet genelde birkaç dolardır).
3. **API Keys → Create Key** ile anahtar oluştur (`sk-ant-...` ile başlar).
4. Uygulamanın ilk açılış ekranına yapıştır.

Anahtar yalnızca kendi cihazında saklanır; istekler doğrudan cihazından Anthropic'e gider.

## Nasıl çalışır?

1. **Kurulum ekranı:** Adını ve API anahtarını girersin.
2. **Seviye tespiti:** Üstaz seninle kısa bir tanışma sohbeti yapar; konuşma (ammice) ve okuma (fusha) seviyeni ayrı ayrı ölçer.
3. **Müfredat:** Seviyene ve zayıf yönlerine göre iki parkurlu kişisel ders planı üretilir.
4. **Dersler:** Her modül sohbet biçiminde, etkileşimli işlenir — anlatım, örnek, alıştırma, düzeltme.
5. **Serbest sohbet:** İstediğin zaman Üstaz ile ammice pratik yaparsın.

## Yol haritası (sonraki sürümler)

- [x] Kelime kartları (SRS / aralıklı tekrar) — Üstaz sohbetlerde geçen kelimeleri otomatik kart yapar
- [x] Hata defteri — hatalar kalıcı hafızaya alınıp sonraki derslere beslenir
- [x] Öğretmen hafızası ve otomatik seviye/müfredat güncelleme
- [x] Dinleme/telaffuz pratiği — 🎙️ Telaffuz Stüdyosu: dinle, kaydet, karşılaştır; sohbette ve kelime kartlarında sesli okuma
- [x] Okuma araçları + SRS görünürlüğü — Üstaz artık yazdığı veriyi görebiliyor
- [x] Agentic seviye tespiti, düzeltme fiilleri, hatırlatıcılar ve yönlendirme önerileri
- [ ] Günlük hedefler ve seri (streak) takibi
- [ ] Öğrencinin ses kaydını Üstaz'ın dinleyip telaffuz puanlaması
