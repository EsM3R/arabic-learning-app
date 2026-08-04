# Arapça Hoca — أستاذ العربية

Kişisel yapay zekâ destekli Arapça öğrenme uygulaması (Expo / React Native).

- 🗣️ **Konuşma parkuru:** Şami (Suriye) ammicesi — Suriyeli arkadaşlarınla akıcı sohbet
- 📖 **Okuma parkuru:** Fusha (Modern Standart Arapça) — profesyonel okuma
- 🧑‍🏫 **Üstaz:** Claude destekli, Türkçe açıklama yapan kişisel öğretmen
- 📊 Sohbet tabanlı seviye tespiti (CEFR: A0–C2, konuşma ve okuma ayrı)
- 🗺️ Seviyene ve zayıf yönlerine göre üretilen kişisel müfredat
- 💬 Serbest sohbet modu (ammice pratik, anında hata düzeltme)
- 🤖 **Uçtan uca agentic:** Üstaz derste kendi kararıyla araç kullanır —
  - 📇 bilmediğin kelimeleri **kelime defterine** ekler (SRS / aralıklı tekrar)
  - 📒 anlamlı hatalarını **hata defterine** işler ve sonraki derslerde tekrar ettirir
  - 🗒️ ders sonunda **kendine not alır** (kalıcı hafıza — sonraki derslere beslenir)
  - 📈 ilerleyince **seviyeni kendisi günceller**
  - 🗺️ ihtiyaç görürse **müfredata modül ekler**
  - ✅ hedeflere ulaşınca **modülü kendisi tamamlar**

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
- [ ] Dinleme/telaffuz pratiği (ses)
- [ ] Günlük hedefler ve seri (streak) takibi
