# Lisan Hocası — أستاذ اللسان

Kişisel yapay zekâ destekli dil öğrenme uygulaması (Expo / React Native).
Aynı motor üç dili destekler — her dilin kendi hocası, müfredatı, kelime defteri ve hafızası ayrıdır:

| Dil | Hoca | Konuşma parkuru | Okuma parkuru |
|---|---|---|---|
| 🇸🇾 Arapça | Üstaz | Şami (Suriye) ammicesi | Fusha (Modern Standart Arapça) |
| 🇬🇧 İngilizce | Mr. Oliver | Doğal günlük/iş İngilizcesi | Haber, makale, iş metinleri |
| 🇪🇸 İspanyolca | Profesora Lucía | Doğal günlük İspanyolca | Haber ve günlük metinler |

Dili ilk kurulumda seçersin; sonra panelin sağ üstündeki bayrak düğmesinden istediğin an
değiştirirsin. Yeni bir dile geçtiğinde o dilin seviye tespiti yapılır ve ayrı müfredat kurulur;
geri döndüğünde eski ilerlemen aynen yerindedir.

- 🧑‍🏫 **Hoca:** Claude destekli, Türkçe açıklama yapan kişisel öğretmen
- 📊 Sohbet tabanlı seviye tespiti (CEFR: A0–C2, konuşma ve okuma ayrı)
- 🗺️ Seviyene ve zayıf yönlerine göre üretilen kişisel müfredat
- 💬 Serbest sohbet modu (hedef dilde pratik, anında hata düzeltme)
- 🤖 **Agentic öğretmen:** hocanın 17 aracı var ve hepsini kendi kararıyla, izin sormadan kullanır.

  **Önce bakar (okuma araçları):**
  - 📊 `tekrar_durumu` — hangi kelimeleri unuttuğunu, kaç tekrarın biriktiğini görür
  - 🔍 `kelime_ara` — bir kelimeyi daha önce öğretip öğretmediğini kontrol eder
  - 📚 `hafiza_oku` — hata defterini ve geçmiş notlarını konuya göre arar
  - 🗺️ `mufredat_oku` — modülleri ve tamamlanma durumunu okur

  Aşağıda "Üstaz" diye anılan her şey seçili dilin hocası için geçerlidir.

  **Sonra yazar / düzeltir:**
  - 📇 `kelime_kaydet` (zorluk derecesiyle), `kelime_duzelt`, `kelime_sil`
  - 📒 `hata_kaydet`, `hata_cozuldu` (öğrendiğin konuyu defterden düşürür)
  - 🗒️ `not_yaz`, `not_sil` — kalıcı hafızası
  - 📈 `seviye_guncelle` — seviyeni **ve** zayıf yönlerini birlikte günceller
  - 🏗️ `modul_ekle`, `modul_tamamla`

  **İnisiyatif alır:**
  - ➡️ `ekrana_git` — sıradaki adımı önerir (tıklanabilir öneri şeridi)
  - ⏰ `hatirlatici_kur` — telefonuna ders hatırlatıcısı kurar
  - 🧠 `kelime_puanla` — "Üstaz'la Tekrar" sözlü sınavında cevabını puanlar,
    tekrar takvimini kendisi kurar
  - 👋 Uygulamayı açtığında duruma bakıp panele kişisel karşılama notu bırakır;
    derste 4 dk sessiz kalırsan kendiliğinden yoklar

  Seviye tespitini de Üstaz yönetir: ne zaman yeterli kanıt topladığına kendisi karar verip
  `degerlendirmeyi_bitir` ile kapatır.

## Kurulum

### Seçenek A — Hazır APK (bilgisayar gerekmez)

Telefonuna doğrudan kurulabilen bağımsız bir Android uygulaması:

**[⬇️ lisan-hocasi.apk indir](https://github.com/EsM3R/arabic-learning-app/releases/latest/download/lisan-hocasi.apk)**

1. Linki telefonunun tarayıcısında aç, dosyayı indir ve dokun.
2. Android "bilinmeyen kaynaktan kurulum" uyarısı verirse tarayıcına izin ver.
3. Uygulama açılınca adını, dilini ve API anahtarını gir.

Bu sürümde Expo Go'ya, bilgisayara veya QR koda gerek yok — uygulama telefonda
kendi başına çalışır, kendi ikonu ve bildirimleri olur.

APK'yı [GitHub Actions](https://github.com/EsM3R/arabic-learning-app/actions/workflows/apk.yml)
derler (`.github/workflows/apk.yml`). Dala her push'ta yeniden derlenir; Actions
sekmesinden elle de tetikleyebilirsin. Her derleme aynı anahtarla imzalandığı için
yeni APK'yı eskisinin üstüne kurabilirsin — öğrenme verilerin (kelime defteri,
müfredat, hoca hafızası) korunur.

> Uygulamayı **silersen** tüm ilerleme gider; veriler yalnızca telefonda saklanır.

### Seçenek B — Geliştirme (Expo Go ile)

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

1. **Kurulum ekranı:** Dilini, adını ve API anahtarını girersin.
2. **Seviye tespiti:** Hocan seninle kısa bir tanışma sohbeti yapar; konuşma ve okuma seviyeni ayrı ayrı ölçer.
3. **Müfredat:** Seviyene ve zayıf yönlerine göre iki parkurlu kişisel ders planı üretilir.
4. **Dersler:** Her modül sohbet biçiminde, etkileşimli işlenir — anlatım, örnek, alıştırma, düzeltme.
5. **Serbest sohbet:** İstediğin zaman hocanla hedef dilde pratik yaparsın.
6. **Dil değiştirme:** Panelden bayrak düğmesiyle dili değiştirirsin; her dilin ilerlemesi ayrı saklanır.

## Yol haritası (sonraki sürümler)

- [x] Kelime kartları (SRS / aralıklı tekrar) — Üstaz sohbetlerde geçen kelimeleri otomatik kart yapar
- [x] Hata defteri — hatalar kalıcı hafızaya alınıp sonraki derslere beslenir
- [x] Öğretmen hafızası ve otomatik seviye/müfredat güncelleme
- [x] Dinleme/telaffuz pratiği — 🎙️ Telaffuz Stüdyosu: dinle, kaydet, karşılaştır; sohbette ve kelime kartlarında sesli okuma
- [x] Okuma araçları + SRS görünürlüğü — Üstaz artık yazdığı veriyi görebiliyor
- [x] Agentic seviye tespiti, düzeltme fiilleri, hatırlatıcılar ve yönlendirme önerileri
- [x] Çoklu dil desteği — dil paketi mimarisi; İngilizce (Mr. Oliver) ve İspanyolca (Profesora Lucía)
- [ ] Günlük hedefler ve seri (streak) takibi
- [ ] Öğrencinin ses kaydını Üstaz'ın dinleyip telaffuz puanlaması
