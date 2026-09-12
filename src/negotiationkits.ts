/**
 * Dil başına anlam müzakeresi araç çantaları.
 *
 * languages.ts'ten AYRI duruyor çünkü o dosya zaten uzun ve bu içerik dil
 * başına ~15 kalıp. Mantık src/negotiation.ts'te; burası saf veri.
 *
 * İçerik üretilirken iki şey gözetildi:
 * 1. GERÇEKTEN kullanılan biçimler — ders kitabında geçip sokakta duyulmayan
 *    kalıp işe yaramaz, öğrenci onu kullanınca yapay görünür.
 * 2. Nezaket düzeyi (register) açıkça işaretli — Türk öğrenci Türkçenin
 *    nezaket sezgisini taşır ve yanlış registerda kaba ya da aşırı resmî
 *    görünür. Almancada du/Sie, Rusçada ты/вы ayrımı notlarda.
 *
 * Okunuşlar TÜRKÇE ses değerleriyle yazılır ("ş", "ç", "h"); İngiliz tarzı
 * digraf (sh/ch/kh) kullanılmaz — öğrenci onu yanlış okur.
 */
import type { NegotiationKit } from "./negotiation.ts";
import type { LanguageId } from "./languages.ts";

export const NEGOTIATION_KITS: Record<LanguageId, NegotiationKit> = {
  // --- Arapça (fusha) ---
  ar: {
    phrases: [
      { category: "anlamadim", target: "لَمْ أَفْهَمْ", translit: "lem efhem", tr: "Anlamadım.", register: "notr", note: "Panikte ammice refleksi 'مَا فْهِمِتْ / mâ fhimit' gelir; fushada olumsuzluk لَمْ + cezm: 'lem efhem'." },
      { category: "anlamadim", target: "عَفْوًا، لَمْ أَفْهَمْ جَيِّدًا", translit: "'afven, lem efhem ceyyiden", tr: "Affedersiniz, tam anlayamadım.", register: "resmi", note: "Başa 'عَفْوًا' koy, 'أَنَا آسِف' koyma: Türkçedeki 'özür dilerim' refleksi Arapçada suçu üstlenmek gibi durur." },
      { category: "tekrar", target: "مَرَّةً أُخْرَى، مِنْ فَضْلِكَ", translit: "merraten uhrâ, min fadlike", tr: "Bir kez daha, lütfen.", register: "notr", note: "Kadına söylüyorsan 'min fadliki'. Ammicedeki 'عِيد / 'îd' burada kullanılmaz." },
      { category: "tekrar", target: "هَلْ يُمْكِنُكَ أَنْ تُعِيدَ مَا قُلْتَ؟", translit: "hel yumkinuke en tu'îde mâ kulte?", tr: "Söylediğinizi tekrarlayabilir misiniz?", register: "resmi", note: "Hoca, sunum, resmî ortam için; arkadaş sohbetinde fazla ağır kaçar. Kadına: 'hel yumkinuki en tu'îdî mâ kulti?'. 'هَلْ يُمْكِنُكَ الْإِعَادَةُ' kalıbı ders kitabı kokar, konuşmada 'أَنْ تُعِيدَ' kullanılır." },
      { category: "yavas", target: "عَلَى مَهْلِكَ", translit: "'alâ mehlike", tr: "Yavaş yavaş / acele etme.", register: "samimi", note: "Kısa ve doğal; 'شْوَيْ شْوَيْ' yerine fushada bunu kullan. Kadına 'alâ mehliki." },
      { category: "yavas", target: "تَكَلَّمْ بِبُطْءٍ، مِنْ فَضْلِكَ", translit: "tekellem bi-but'in, min fadlike", tr: "Lütfen yavaş konuşun.", register: "notr", note: "Emir kipi tek başına sert durur; 'min fadlike' olmadan söyleme. Kadına 'tekellemî ... min fadliki'." },
      { category: "teyit", target: "يَعْنِي هٰكَذَا؟", translit: "ya'nî hâkezâ?", tr: "Yani böyle mi?", register: "samimi", note: "Türkçedeki 'yani şöyle mi' ile birebir aynı işlev; en çok işe yarayan teyit kalıbı." },
      { category: "teyit", target: "هَلْ تَقْصِدُ...؟", translit: "hel taksidu...?", tr: "...demek mi istiyorsunuz?", register: "notr", note: "Sonuna karşının sözünü kendi cümlenle koy; boş bırakma. Kadına 'hel taksidîne...?'." },
      { category: "kelime_sor", target: "مَا اسْمُ هٰذَا؟", translit: "mâ-smu hâzâ?", tr: "Bunun adı ne?", register: "notr", note: "Nesneyi göstererek söyle. Müennes nesne için 'مَا اسْمُ هٰذِهِ / mâ-smu hâzihi'." },
      { category: "kelime_sor", target: "كَيْفَ أَقُولُ...؟", translit: "keyfe ekûlu...?", tr: "...nasıl derim?", register: "notr", note: "Bilmediğin şeyi Türkçe değil, tarif ederek ya da işaret ederek tamamla." },
      { category: "yazilis_sor", target: "كَيْفَ تُكْتَبُ؟", translit: "keyfe tuktebu?", tr: "Nasıl yazılır?", register: "notr", note: "Yazdırmak istersen: 'اُكْتُبْهَا مِنْ فَضْلِكَ / uktubhâ min fadlike'." },
      { category: "soz_al", target: "عَفْوًا، لَدَيَّ سُؤَالٌ", translit: "'afven, ledeyye suâl", tr: "Affedersiniz, bir sorum var.", register: "notr", note: "Araya girerken 'لَحْظَةً / lahzaten' tek başına biraz sert; 'afven ile başla." },
      { category: "onay_iste", target: "هَلْ هٰذَا صَحِيحٌ؟", translit: "hel hâzâ sahîh?", tr: "Bu doğru mu?", register: "notr", note: "Kendi cümleni söyledikten hemen sonra ekle; düzeltme almanın en hızlı yolu." },
    ],
    fillers: [
      { target: "يَعْنِي", translit: "ya'nî", tr: "yani" },
      { target: "أَعْنِي", translit: "a'nî", tr: "demek istiyorum ki" },
      { target: "لَحْظَةً", translit: "lahzaten", tr: "bir saniye" },
      { target: "فِي الْوَاقِعِ", translit: "fi-l-vâki'", tr: "aslında" },
      { target: "حَسَنًا", translit: "hasenen", tr: "peki / tamam" },
    ],
    circumlocution: [
      { target: "شَيْءٌ مِثْلُ...", translit: "şey'un mislu...", tr: "... gibi bir şey" },
      { target: "شَيْءٌ نَسْتَعْمِلُهُ لِـ...", translit: "şey'un nesta'miluhu li-...", tr: "...için kullandığımız bir şey" },
      { target: "هُوَ عَكْسُ...", translit: "huve 'aksu...", tr: "...nın tersi" },
      { target: "لَا أَعْرِفُ الْكَلِمَةَ، وَلٰكِنَّهُ...", translit: "lâ a'rifu-l-kelimete, ve lâkinnehu...", tr: "Kelimeyi bilmiyorum ama o şey..." },
    ],
    teacherCue: "عَفْوًا؟ لَمْ أَفْهَمْ مَا تَقْصِدُ. هَلْ يُمْكِنُكَ أَنْ تُوَضِّحَ؟ — \"'afven? lem efhem mâ taksidu. hel yumkinuke en tuvaddiha?\" (Efendim? Ne demek istediğinizi anlamadım. Açıklayabilir misiniz?)",
    turkishTrap: "En büyük tuzak, onarım anının refleks alanı olması: öğrenci fusha cümleyi kurar ama tıkandığı saniyede Şam ammicesine düşer — 'شُو؟ / şû?', 'مَا فْهِمِتْ / mâ fhimit', 'عِيد / 'îd', 'شْوَيْ شْوَيْ / şvay şvay'. Bunlar Şam'da mükemmel çalışır, fusha ortamında (ders, sunum, Körfez/Mağrip karışık masa, medya Arapçası) anında register kırılması yaratır; bu yüzden onarım kalıpları ayrı ezberlenip refleks hâline getirilmelidir. İkinci tuzak nezaket aktarımı: Türkçedeki 'pardon/özür dilerim' alışkanlığıyla her anlamama anında 'أَنَا آسِف' denir — Arapçada bu kusuru üstlenmek gibi durur, doğrusu nötr 'عَفْوًا'dır; aynı şekilde Türkçedeki 'rica etsem, mümkünse' katmanlaması 'لَوْ سَمَحْتَ' ile 'مِنْ فَضْلِكَ'yi üst üste yığmaya yol açar ve yapmacık durur — biri yeter. Üçüncüsü Türkçede gramatik cinsiyet olmadığı için muhatap eki: kadına 'min fadlike / taksidu / 'alâ mehlike' demek, Türkçede birine yanlış hitap etmekten daha göze batar; -ke/-te erkeğe, -ki/-tî(ne) kadınadır. Son olarak Türk öğrenci susup toparlanmayı nazik sanır; Arapça konuşmada sessizlik değil, 'يَعْنِي... أَعْنِي...' ile sesli düşünmek konuşma sırasını korur.",
  },
  // --- İngilizce ---
  en: {
    phrases: [
      { category: "anlamadim", target: "Sorry?", translit: "", tr: "Pardon? / Anlamadım?", register: "notr", note: "Tek kelimelik, en yaygın onarım. Sonu yükselen tonla söylenir. 'Sorry' burada özür değil, 'anlamadım' demek." },
      { category: "anlamadim", target: "I didn't catch that.", translit: "", tr: "Yakalayamadım / duyamadım.", register: "notr", note: "'I didn't understand' yerine bunu kullan; daha doğal ve kusuru karşı tarafa yüklemez, kendi üstüne alır." },
      { category: "tekrar", target: "Say that again?", translit: "", tr: "Bir daha söyler misin?", register: "samimi", note: "Arkadaş arasında normal. Yabancıya/amire karşı başına 'Sorry,' ekle." },
      { category: "tekrar", target: "Sorry, could you repeat that?", translit: "", tr: "Pardon, tekrar eder misiniz?", register: "resmi", note: "'Repeat please!' deme, emir gibi durur. 'Could you' kalıbını koru." },
      { category: "yavas", target: "Could you slow down a bit?", translit: "", tr: "Biraz yavaşlayabilir misiniz?", register: "notr", note: "'Speak slowly!' emir kipidir, kaba durur. Doğal kalıp 'slow down'; 'a bit' iyice yumuşatır." },
      { category: "yavas", target: "Sorry, you've lost me.", translit: "", tr: "Pardon, koptum / takip edemedim.", register: "samimi", note: "Hızlı ya da karışık anlatımda çok kullanılır; kabalık değil, sempatik durur." },
      { category: "teyit", target: "So you mean...?", translit: "", tr: "Yani şöyle mi demek istiyorsun?", register: "notr", note: "Sonunu yükselterek bırak, sonra kendi cümlenle tamamla. Anlam müzakeresinin en güçlü aracı." },
      { category: "teyit", target: "Is that right?", translit: "", tr: "Doğru mu / öyle mi?", register: "notr", note: "Duyduğunu kendi cümlenle tekrarladıktan sonra ekle: 'Half past six — is that right?'" },
      { category: "kelime_sor", target: "What's this called?", translit: "", tr: "Bunun adı ne?", register: "notr", note: "Eşyayı göstererek söyle. 'What is the name of this?' ders kitabı İngilizcesidir, kimse demez." },
      { category: "kelime_sor", target: "What's the word for...?", translit: "", tr: "...için hangi kelimeyi kullanıyorsunuz?", register: "notr", note: "Boşluğa Türkçe kelimeyi ya da tarifi koy: 'What's the word for... when the bus is full?'" },
      { category: "yazilis_sor", target: "How do you spell that?", translit: "", tr: "Nasıl yazılıyor?", register: "notr", note: "İngilizcede isim/adres alırken standart soru. 'How is it written?' denmez." },
      { category: "soz_al", target: "Sorry, can I just say...", translit: "", tr: "Pardon, bir şey söyleyebilir miyim...", register: "notr", note: "Söze girmenin nazik yolu. Araya girerken 'Sorry' şart; onsuz kaba durur." },
      { category: "soz_al", target: "Hang on a sec.", translit: "", tr: "Bir saniye / dur bir.", register: "samimi", note: "Sadece arkadaş ve tanıdık arasında. İş toplantısında 'Sorry, just a moment' de." },
      { category: "onay_iste", target: "Does that make sense?", translit: "", tr: "Anlaşıldı mı / mantıklı mı?", register: "notr", note: "KENDİ söylediğini kontrol ederken kullan. Karşı tarafa 'Do you understand?' deme, aptal yerine koymuş olursun." },
      { category: "onay_iste", target: "Am I making sense?", translit: "", tr: "Anlatabiliyor muyum?", register: "samimi", note: "Uzun bir açıklamadan sonra samimi kontrol. Yine sorumluluğu kendine alır, muhatabı test etmez." },
    ],
    fillers: [
      { target: "Well...", translit: "", tr: "Şey... / yani..." },
      { target: "I mean...", translit: "", tr: "Yani... (düzeltirken)" },
      { target: "Sort of...", translit: "", tr: "Bir nevi... / sayılır..." },
      { target: "Hang on...", translit: "", tr: "Dur bir... (düşünürken)" },
      { target: "You know...", translit: "", tr: "Hani... / biliyorsun ya..." },
    ],
    circumlocution: [
      { target: "It's a thing you use for...", translit: "", tr: "Şey için kullandığın bir şey..." },
      { target: "It's like a..., but...", translit: "", tr: "... gibi bir şey ama..." },
      { target: "It's when you...", translit: "", tr: "Hani şu ... yaptığın durum var ya..." },
      { target: "I don't know the word, but...", translit: "", tr: "Kelimesini bilmiyorum ama..." },
    ],
    teacherCue: "Sorry, I'm not with you. What do you mean exactly? (Pardon, takip edemedim. Tam olarak ne demek istiyorsun?)",
    turkishTrap: "Türk öğrenci panikleyince ya susup gülümsüyor ya da Türkçeden birebir çevirip 'What?', 'Again?', 'Repeat please!', 'Speak slowly!' gibi tek kelimelik emirler kuruyor; bunlar İngiliz kulağında ters ve kaba duruyor, çünkü İngilizcede onarımın nezaketi 'sorry' ve 'could you' ile taşınır, Türkçedeki gibi sadece ses tonuyla değil. İkinci tuzak, 'Sorry'yi özür sanıp kullanmaktan kaçınmak; oysa İngiliz kullanımında 'Sorry?' tek başına 'anlamadım'ın en doğal karşılığıdır ve 'Pardon?' aşırı resmî/eski kalır. Üçüncüsü, karşı tarafı kontrol ederken 'Do you understand me?' demek; bu, muhatabı sorumlu tutar ve küçümseyici duyulur, doğrusu sorumluluğu kendine alan 'Does that make sense?' ya da 'I didn't catch that' kalıbıdır. Son olarak Türkçede kibarlık sayılan susma ve baş sallama İngilizcede 'anladım' sinyali okunur, konuşan hızlanır ve öğrenci daha da kaybolur.",
  },
  // --- İspanyolca ---
  es: {
    phrases: [
      { category: "anlamadim", target: "¿Cómo?", translit: "", tr: "Efendim? / Anlamadım", register: "notr", note: "İspanya'da en doğal 'anlamadım' tepkisi budur. '¿Qué?' tek başına biraz kaba durur, '¿Cómo?' her yerde geçer." },
      { category: "anlamadim", target: "No te sigo.", translit: "", tr: "Seni takip edemedim / anlamadım", register: "samimi", note: "Resmî ortamda 'No le sigo' de. Kitaptaki 'No comprendo' yerine bunu kullan, çok daha canlı." },
      { category: "tekrar", target: "¿Me lo repites?", translit: "", tr: "Tekrar eder misin?", register: "samimi", note: "Tuteo. Resmîde: '¿Me lo repite?' Soru tonuyla söylenince 'por favor' şart değil." },
      { category: "tekrar", target: "Otra vez, porfa.", translit: "", tr: "Bir daha, lütfen", register: "samimi", note: "'Porfa', 'por favor'un İspanya'da çok yaygın samimi kısaltması. Patronla ya da memurla kullanma." },
      { category: "yavas", target: "Más despacio, porfa.", translit: "", tr: "Daha yavaş lütfen", register: "samimi", note: "'Despacio' tek başına da yeter. 'Lentamente' deme, kimse öyle konuşmuyor." },
      { category: "yavas", target: "Habla más despacio.", translit: "", tr: "Daha yavaş konuş", register: "samimi", note: "İspanya'da konuşma hızı için standart kelime 'despacio'dur; 'más lento' duyulur ama daha az doğal. Emir kipi burada sert değil, gülümseyerek söylenince gayet normal. Resmîde 'Hable más despacio'." },
      { category: "teyit", target: "O sea, ¿que...?", translit: "", tr: "Yani... öyle mi?", register: "notr", note: "'O sea' İspanya'nın bir numaralı 'yani'sidir. Cümleyi kendi kelimelerinle tamamla: 'O sea, ¿que mañana no vienes?'" },
      { category: "teyit", target: "¿Entonces es hoy?", translit: "", tr: "Yani bugün mü?", register: "notr", note: "Anladığını sandığın şeyi kısa bir soruyla geri ver; en etkili onarım tekniği budur." },
      { category: "kelime_sor", target: "¿Cómo se dice...?", translit: "", tr: "... nasıl denir?", register: "notr", note: "Bilmediğin kelimeyi Türkçe/İngilizce söyleyip ekle: '¿Cómo se dice \"çekmece\"?'" },
      { category: "kelime_sor", target: "¿Esto cómo se llama?", translit: "", tr: "Bunun adı ne?", register: "notr", note: "Nesneyi göstererek söyle. Eşya için 'se llama', eylem/ifade için 'se dice'." },
      { category: "yazilis_sor", target: "¿Me lo deletreas?", translit: "", tr: "Harf harf söyler misin?", register: "samimi", note: "Resmîde '¿Me lo deletrea?'. İsim ve adres alırken standart ifadedir." },
      { category: "yazilis_sor", target: "¿Cómo se escribe?", translit: "", tr: "Nasıl yazılıyor?", register: "notr", note: "Kelimenin yazılışını sormanın en kısa yolu; her registerde geçer. Harf harf istiyorsan 'deletrear' fiiline geç." },
      { category: "soz_al", target: "Perdona, una cosa.", translit: "", tr: "Pardon, bir şey (soracağım)", register: "samimi", note: "İspanya'da söze girmenin en doğal yolu. Resmîde 'Perdone, una cosa'. 'Disculpe' de anlaşılır ama İspanya'da daha az duyulur, Latin Amerika tınısı verir." },
      { category: "soz_al", target: "A ver, espera.", translit: "", tr: "Dur bakalım, bekle", register: "samimi", note: "Arkadaş sohbetinde akışı durdurmak için. İş toplantısında kullanma." },
      { category: "onay_iste", target: "¿Se dice así?", translit: "", tr: "Böyle mi deniyor?", register: "notr", note: "Kurduğun cümlenin ardından ekle; karşındaki seni düzeltsin diye açık davet." },
      { category: "onay_iste", target: "¿Está bien así?", translit: "", tr: "Böyle doğru mu?", register: "notr", note: "Hem söylediğin hem yazdığın şey için kullanılır; sınıfta da günlük hayatta da doğal." },
    ],
    fillers: [
      { target: "pues...", translit: "", tr: "şey... / yani..." },
      { target: "o sea...", translit: "", tr: "yani..." },
      { target: "a ver...", translit: "", tr: "bakalım... / dur bir..." },
      { target: "es que...", translit: "", tr: "şöyle ki... / olay şu ki..." },
      { target: "bueno...", translit: "", tr: "peki... / eh..." },
    ],
    circumlocution: [
      { target: "Es una cosa para...", translit: "", tr: "... için bir şey" },
      { target: "Es como un/una...", translit: "", tr: "Şey gibi bir şey..." },
      { target: "No sé la palabra, pero...", translit: "", tr: "Kelimesini bilmiyorum ama..." },
      { target: "Es lo que se usa para...", translit: "", tr: "... yapmak için kullanılan şey" },
    ],
    teacherCue: "¿Cómo? No te he entendido. A ver, repítemelo otra vez, más despacio.",
    turkishTrap: "Türk öğrenci onarımı fazla resmî ve fazla uzun yapıyor: panikleyince kitaptan ezberlediği 'Perdóneme, no he comprendido lo que usted ha dicho, ¿podría repetirlo por favor?' gibi bir cümleye giriyor ve zaten kilitli olan akışı iyice kilitliyor; oysa İspanya'da tek kelimelik '¿Cómo?' ya da '¿Otra vez?' tamamen yeterli ve kaba değil. İkinci tuzak usted'e kaçmak: Türkçedeki 'siz' refleksiyle yaşıtıyla, garsonla, sınıf arkadaşıyla usted kullanıyor, bu da İspanya'da mesafeli hatta soğuk duruyor (tuteo esastır; usted'i yalnız yaşlı biriyle, resmî kurumda, doktor/avukat karşısında sakla). Üçüncüsü sessiz kalma refleksi: anlamadığında utanıp kafa sallıyor, İspanyol muhatap da anlaşıldığını sanıp daha da hızlanıyor. Son olarak 'lütfen' takıntısı: her onarım ifadesinin sonuna 'por favor' eklemek gerekmez, İspanyolcada nezaketi soru tonu ve 'porfa/perdona' taşır.",
  },
  // --- Fransızca ---
  fr: {
    phrases: [
      { category: "anlamadim", target: "J'ai pas compris.", translit: "", tr: "Anlamadım.", register: "notr", note: "Konuşmada \"ne\" düşer; herkesle kullanılır. Resmî ortamda/yazıda: \"Je n'ai pas compris.\"" },
      { category: "anlamadim", target: "Comment ?", translit: "", tr: "Efendim? / Nasıl?", register: "notr", note: "Tek kelimelik kurtarıcı. Sakın \"Quoi ?\" deme, kaba durur." },
      { category: "tekrar", target: "Tu peux répéter ?", translit: "", tr: "Tekrar eder misin?", register: "samimi", note: "Resmîsi: \"Vous pouvez répéter ?\" Emir kipi \"Répétez !\" deme, sert olur." },
      { category: "tekrar", target: "Pardon ?", translit: "", tr: "Pardon? / Anlayamadım?", register: "notr", note: "Sonu yukarı tonlanır. Her yerde geçerli, en güvenli seçenek." },
      { category: "yavas", target: "Tu peux parler moins vite ?", translit: "", tr: "Biraz daha yavaş konuşabilir misin?", register: "samimi", note: "Tek başına \"Moins vite !\" emir gibi durur; \"tu peux\" ile yumuşat. \"Plus lentement\" da doğru ama \"moins vite\" daha günlüktür." },
      { category: "teyit", target: "C'est-à-dire ?", translit: "", tr: "Yani? / Nasıl yani?", register: "notr", note: "Karşı tarafı açıklamaya zorlar, çok işlevsel." },
      { category: "teyit", target: "Tu veux dire... ?", translit: "", tr: "Yani şöyle mi demek istiyorsun...?", register: "samimi", note: "Arkasından kendi cümleni kur. Resmîsi: \"Vous voulez dire... ?\" Fransızcada soru işaretinden önce boşluk bırakılır." },
      { category: "kelime_sor", target: "Ça se dit comment ?", translit: "", tr: "Bu nasıl deniyor?", register: "notr", note: "Nesneyi gösterip söyle. Eşyanın adını soruyorsan: \"Comment ça s'appelle ?\"" },
      { category: "kelime_sor", target: "C'est quoi, ça ?", translit: "", tr: "Bu ne?", register: "samimi", note: "Günlük dilde bu kalıp kullanılır; \"Qu'est-ce que c'est ?\" daha kitabidir." },
      { category: "yazilis_sor", target: "Ça s'écrit comment ?", translit: "", tr: "Nasıl yazılıyor?", register: "notr", note: "Harf harf istemek için: \"Tu peux l'épeler ?\" (épeler tek başına kalmaz, nesne alır)." },
      { category: "yazilis_sor", target: "Tu peux me l'écrire ?", translit: "", tr: "Bana yazabilir misin?", register: "samimi", note: "Resmîsi: \"Vous pouvez me l'écrire ?\" Adres, isim, saat gibi şeylerde en pratik çözüm." },
      { category: "soz_al", target: "Pardon, j'ai une question.", translit: "", tr: "Pardon, bir sorum var.", register: "notr", note: "Araya girerken önce \"pardon\", sonra doğrudan soru. \"Excusez-moi, j'ai une question.\" de aynı işi görür." },
      { category: "soz_al", target: "Attends deux secondes.", translit: "", tr: "Bir saniye dur.", register: "samimi", note: "Sadece tanıdıklarla. Resmîsi: \"Attendez deux secondes, s'il vous plaît.\"" },
      { category: "onay_iste", target: "C'est ça ?", translit: "", tr: "Böyle mi? / Doğru mu?", register: "notr", note: "Kendi cümleni kurduktan sonra ekle; onay almanın en kısa yolu." },
    ],
    fillers: [
      { target: "euh...", translit: "", tr: "eee..." },
      { target: "bah...", translit: "", tr: "yaa... / şey..." },
      { target: "enfin...", translit: "", tr: "yani... / şey..." },
      { target: "du coup...", translit: "", tr: "e o zaman... / yani..." },
      { target: "genre...", translit: "", tr: "nasıl desem... / hani..." },
    ],
    circumlocution: [
      { target: "C'est un truc pour...", translit: "", tr: "Bu, ... için bir şey." },
      { target: "Ça sert à...", translit: "", tr: "... işe yarıyor." },
      { target: "C'est comme un...", translit: "", tr: "Bir tür ... gibi." },
      { target: "Je connais pas le mot, mais...", translit: "", tr: "Kelimeyi bilmiyorum ama..." },
    ],
    teacherCue: "Hein ? J'ai pas compris. Tu peux le dire autrement ? (\"En? Je pa kompri. Tü pö lö dir otröman?\")",
    turkishTrap: "Türk öğrenci onarımı ya hiç yapmaz ya da fazla resmî yapar. Birincisi: Türkçede anlamayınca susup kafa sallamak nazik sayılır, Fransızcada bu \"anladı\" demektir ve karşıdaki hızlanarak devam eder; sessizlik onarım değildir, \"Comment ?\" demek zorundasın. İkincisi: ders kitabından gelen tam ve uzun cümleleri (\"Je ne comprends pas, pourriez-vous répéter s'il vous plaît ?\") kullanır; hem panikte kurulamaz hem de arkadaş sohbetinde aşırı resmî kaçar - gerçek hayatta \"ne\" düşer, \"J'ai pas compris\" denir. Üçüncüsü: Türkçedeki \"-ir misiniz?\" inceliği fiilin içinde olduğu için öğrenci bunu doğrudan emir kipine çevirir (\"Répétez !\", \"Parlez lentement !\") ve emir verir gibi olur; Fransızcada inceliği taşıyan şey \"tu peux / vous pouvez\" + yükselen tonlamadır. Son olarak \"Efendim?\" refleksini \"Quoi ?\" diye çevirmek kaba durur; karşılığı \"Comment ?\" ya da \"Pardon ?\"dur.",
  },
  // --- Almanca ---
  de: {
    phrases: [
      { category: "anlamadim", target: "Wie bitte?", translit: "", tr: "Efendim? / Anlamadım?", register: "notr", note: "En güvenli ve en sık duyulan onarım ifadesi. Hem du hem Sie ortamında kullanılır, kişi eki yok. 'Was?' deme, kaba duyulur." },
      { category: "anlamadim", target: "Das hab ich nicht verstanden.", translit: "", tr: "Onu anlamadım.", register: "notr", note: "Kişi eki yok, her ortamda geçer. 'hab' konuşmada 'habe'nin normal hali, kitap dili gibi 'habe' demene gerek yok." },
      { category: "tekrar", target: "Können Sie das wiederholen?", translit: "", tr: "Tekrar eder misiniz?", register: "resmi", note: "Sie biçimi. Samimi karşılığı: 'Kannst du das wiederholen?' Tanımadığın yetişkine, memura, satıcıya Sie." },
      { category: "tekrar", target: "Noch mal, bitte.", translit: "", tr: "Bir daha, lütfen.", register: "notr", note: "Kişi eki olmadığı için du/Sie derdi yok; panikte en kullanışlısı. 'bitte' olmadan emir gibi duyulur." },
      { category: "yavas", target: "Etwas langsamer, bitte.", translit: "", tr: "Biraz daha yavaş, lütfen.", register: "notr", note: "Fiilsiz olduğu için du/Sie sorunu yok. Her ortamda güvenli." },
      { category: "yavas", target: "Können Sie langsamer sprechen?", translit: "", tr: "Daha yavaş konuşabilir misiniz?", register: "resmi", note: "Sie biçimi. Samimi: 'Kannst du langsamer sprechen?'" },
      { category: "teyit", target: "Also meinst du ...?", translit: "", tr: "Yani ... demek istiyorsun?", register: "samimi", note: "du biçimi; resmî hali 'Also meinen Sie ...?'. Sonuna duyduğun şeyi kendi kelimelerinle ekle." },
      { category: "teyit", target: "Ach so, okay.", translit: "", tr: "Haa, tamam / anladım.", register: "samimi", note: "'Ach so' anladığını gösteren en Alman refleksi. Resmî ortamda da geçer ama 'Alles klar' daha nötr durur." },
      { category: "kelime_sor", target: "Wie heißt das auf Deutsch?", translit: "", tr: "Bunun Almancası ne?", register: "notr", note: "Kişi eki yok, her ortamda aynı. Bir nesneyi gösterirken söyle." },
      { category: "kelime_sor", target: "Was bedeutet das?", translit: "", tr: "Bu ne demek?", register: "notr", note: "Bilmediğin kelimeyi duyunca. 'Was heißt das?' de aynı şekilde çok yaygın." },
      { category: "yazilis_sor", target: "Wie schreibt man das?", translit: "", tr: "Bu nasıl yazılıyor?", register: "notr", note: "'man' sayesinde du/Sie sorunu yok, her yerde kullan." },
      { category: "soz_al", target: "Kurze Frage:", translit: "", tr: "Kısa bir soru:", register: "notr", note: "Söze girmenin en kibar ve doğal yolu. Toplantıda, derste, dükkânda çalışır; arkasına doğrudan sorunu ekle." },
      { category: "soz_al", target: "Entschuldigung, ...", translit: "", tr: "Affedersiniz, ... / Pardon, ...", register: "notr", note: "Hem söz almak hem dikkat çekmek için. 'Entschuldigen Sie' daha resmî, arkadaşlar arasında 'Sorry' de çok yaygın." },
      { category: "onay_iste", target: "Stimmt das so?", translit: "", tr: "Böyle doğru mu?", register: "notr", note: "Kurduğun cümleden emin değilken. Kişi eki yok, her ortamda güvenli. 'Sagt man das so?' (Böyle mi deniyor?) de çok kullanılır." },
    ],
    fillers: [
      { target: "also ...", translit: "", tr: "yani ... / şey ..." },
      { target: "ähm ...", translit: "", tr: "ıııı ... (Almanca duraklama sesi)" },
      { target: "na ja ...", translit: "", tr: "şey işte ... / valla ..." },
      { target: "Moment ...", translit: "", tr: "bir saniye ..." },
      { target: "wie sagt man ...", translit: "", tr: "nasıl deniyordu ..." },
    ],
    circumlocution: [
      { target: "So ein Ding, mit dem man ...", translit: "", tr: "Şey işte, onunla ... yapılan bir şey" },
      { target: "Das ist so was wie ...", translit: "", tr: "Şeye benzer bir şey ..." },
      { target: "Ich weiß das Wort nicht, aber ...", translit: "", tr: "Kelimeyi bilmiyorum ama ..." },
      { target: "Das braucht man, wenn ...", translit: "", tr: "Bu, ... olduğunda lazım olan şey" },
    ],
    teacherCue: "Hoca kasıtlı anlamamış gibi yaparken: \"Hä? Wie meinst du das?\" (Hä, vi maynst du das?) — \"Häh? Nasıl yani?\" Ya da: \"Das versteh ich jetzt nicht.\" (Das ferşte iş yetst niht) — \"Şimdi bunu anlamadım.\"",
    turkishTrap: "Türk öğrencinin en büyük tuzağı nezaketi Türkçedeki gibi uzatmakla sağlamaya çalışmak: panik anında \"Entschuldigen Sie bitte vielmals, könnten Sie eventuell so freundlich sein und das noch einmal wiederholen?\" gibi kitaptan ezberlenmiş devasa bir cümleye girip yarısında kilitlenmek. Almancada kibarlık cümle uzunluğuyla değil, doğru biçim (Sie) ve tek bir \"bitte\" ile sağlanır; \"Noch mal, bitte.\" tamamen kibardır. İkinci tuzak, Türkçede \"Ne?\" demenin görece normal olmasından dolayı Almancada \"Was?\" deyip sert/kaba duyulmak — doğrusu \"Wie bitte?\". Üçüncüsü, Türkçede kişi ayrımını ses tonu ve \"-sınız\" ile kolayca çevirdiğimiz için Almancada du/Sie'yi karıştırmak: satıcıya, garsona, memura, yaşlıya \"Kannst du...\" demek Türkçede birine durduk yere \"sen\" demek gibi rahatsız edicidir. Emin değilken fiil çekimi içermeyen onarım ifadelerine sığın: \"Wie bitte?\", \"Noch mal, bitte.\", \"Etwas langsamer, bitte.\", \"Wie schreibt man das?\" — hepsi du/Sie sorunundan bağımsızdır. Son olarak, anlamadığını gizlemek için Türk öğrenci sık sık gülümseyip \"ja, ja\" diyor; Almanca konuşan biri bunu gerçek onay sayar ve konuşma tamamen yanlış yöne gider.",
  },
  // --- İtalyanca ---
  it: {
    phrases: [
      { category: "anlamadim", target: "Non ho capito.", translit: "", tr: "Anlamadım.", register: "notr", note: "En güvenli, her yerde geçer. \"Non capisco\" da olur ama geçmiş zamanlı hâli daha doğal." },
      { category: "anlamadim", target: "Come scusa?", translit: "", tr: "Efendim? / Pardon, nasıl?", register: "samimi", note: "Sen diliyle. Resmîde \"Come scusi?\" de. \"Cosa?\" tek başına kaba durur." },
      { category: "tekrar", target: "Puoi ripetere?", translit: "", tr: "Tekrar eder misin?", register: "samimi", note: "Resmîde \"Può ripetere?\". Başına \"Scusa,\" eklemek yeterli nezaket." },
      { category: "tekrar", target: "Un'altra volta, per favore.", translit: "", tr: "Bir kere daha, lütfen.", register: "notr" },
      { category: "yavas", target: "Più lentamente, per favore.", translit: "", tr: "Biraz daha yavaş, lütfen.", register: "notr", note: "Konuşma dilinde çoğu kişi \"più piano\" der; o da aynı işi görür." },
      { category: "yavas", target: "Puoi parlare più piano?", translit: "", tr: "Daha yavaş konuşabilir misin?", register: "samimi", note: "\"Piano\" burada \"sessiz\" değil \"yavaş\" demek." },
      { category: "teyit", target: "Cioè... vuoi dire che...?", translit: "", tr: "Yani... şunu mu demek istiyorsun?", register: "notr", note: "\"Cioè\" İtalyanların en çok kullandığı müzakere kelimesi; tek başına da \"yani?\" diye sorabilirsin." },
      { category: "teyit", target: "Ho capito bene?", translit: "", tr: "Doğru mu anladım?", register: "notr" },
      { category: "kelime_sor", target: "Come si dice...?", translit: "", tr: "... nasıl denir?", register: "notr", note: "Nesneyi gösterip \"Come si dice questo?\" demek yeterli." },
      { category: "kelime_sor", target: "Come si chiama questo?", translit: "", tr: "Bunun adı ne?", register: "notr", note: "Eşya için \"si chiama\"; kişi için değil." },
      { category: "yazilis_sor", target: "Come si scrive?", translit: "", tr: "Nasıl yazılıyor?", register: "notr", note: "Harf harf isteyeceksen \"Me lo fai lo spelling?\" de; İtalyanlar harfleri şehir adıyla söyler (A come Ancona)." },
      { category: "soz_al", target: "Scusa, posso dire una cosa?", translit: "", tr: "Pardon, bir şey söyleyebilir miyim?", register: "samimi", note: "Resmîde \"Scusi, posso...\". Sadece \"Scusa\" ile de araya girilir, kaba değil." },
      { category: "soz_al", target: "Aspetta, un attimo.", translit: "", tr: "Dur, bir saniye.", register: "samimi", note: "Çok yaygın ama sadece arkadaş/akran arasında; müdüre \"Aspetti un attimo\" de." },
      { category: "onay_iste", target: "Si dice così?", translit: "", tr: "Böyle mi deniyor?", register: "notr", note: "Kendi cümleni kurduktan sonra ekle; hoca hemen düzeltir." },
    ],
    fillers: [
      { target: "allora", translit: "", tr: "şey / eee (düşünmeye başlarken)" },
      { target: "cioè", translit: "", tr: "yani" },
      { target: "boh", translit: "", tr: "bilmem ki (omuz silkme)" },
      { target: "insomma", translit: "", tr: "işte, şöyle böyle" },
      { target: "aspetta...", translit: "", tr: "dur bir... (düşünüyorum)" },
    ],
    circumlocution: [
      { target: "È una cosa che serve per...", translit: "", tr: "Şey için kullanılan bir şey..." },
      { target: "È come un/una..., ma...", translit: "", tr: "Şeye benziyor ama..." },
      { target: "Non so la parola, ma è quando...", translit: "", tr: "Kelimeyi bilmiyorum ama şu durum var ki..." },
      { target: "Quella cosa lì, per...", translit: "", tr: "Şu şey işte, ... için olan." },
    ],
    teacherCue: "Scusa, non ho capito. Cosa vuoi dire? / In che senso?",
    turkishTrap: "Türk öğrenci Türkçedeki nezaket refleksini birebir taşıyıp her cümlenin başına \"per favore\" ve \"scusi\" yığar; İtalyanca'da bu aşırı resmî ve mesafeli durur, arkadaş sohbetinde \"Come scusi?\" demek karşıdakini garipsetir. Tersi de olur: \"Cosa?\" veya \"Eh?\" tek başına söylenince Türkçedeki \"Ne?\" kadar masum değil, ters ve sinirli algılanır; doğru orta yol \"Come scusa?\" veya \"Come?\"dir. Ayrıca Türkçede sık kullanılan doğrudan emir mantığıyla \"Ripeti!\" denmesi kabalık sayılır, soru biçimi (\"Puoi ripetere?\") şarttır. Son olarak Türk öğrenci anlamadığında susup gülümseme eğilimindedir; İtalyan muhatap bunu \"anladı\" sanır ve hızlanır, bu yüzden \"Aspetta\" veya \"Cioè?\" ile konuşmayı kesmek öğrenilmesi gereken en kritik alışkanlıktır.",
  },
  // --- Rusça ---
  ru: {
    phrases: [
      { category: "anlamadim", target: "Не по́нял / Не поняла́", translit: "ni ponyal / ni panyalá", tr: "Anlamadım", register: "notr", note: "Erkekseniz 'не понял', kadınsanız 'не поняла'. Cinsiyete göre değişir, karıştırmayın." },
      { category: "anlamadim", target: "Извини́те, я не по́нял", translit: "izvinítye, ya ni ponyal", tr: "Pardon, anlamadım", register: "resmi", note: "вы formu. Tanımadığınız kişiye, memura, satıcıya bu." },
      { category: "tekrar", target: "Что́?", translit: "şto", tr: "Ne?", register: "samimi", note: "Tek başına kaba durur. Yabancıya 'Что-что?' (şto-şto) veya 'Прости́те?' deyin." },
      { category: "tekrar", target: "Повтори́те, пожа́луйста", translit: "paftaríti, pajálusta", tr: "Tekrar eder misiniz lütfen", register: "resmi", note: "Samimide 'Повтори́, пожа́луйста' (paftarí)." },
      { category: "yavas", target: "Помедленнее, пожа́луйста", translit: "pamédlinniye, pajálusta", tr: "Biraz daha yavaş lütfen", register: "notr", note: "En doğal hali. 'Говори́те ме́дленно' kitabî kalır." },
      { category: "yavas", target: "Ты сли́шком бы́стро", translit: "tı slişkam bıstra", tr: "Çok hızlısın", register: "samimi", note: "Sadece ты dediğiniz kişiye; вы ise 'Вы сли́шком бы́стро'." },
      { category: "teyit", target: "То́ есть...?", translit: "to yest'", tr: "Yani...?", register: "notr", note: "Söyleneni kendi cümlenizle özetlemeden önce en çok kullanılan açılış." },
      { category: "teyit", target: "Пра́вильно?", translit: "právil'na", tr: "Doğru mu?", register: "notr", note: "Cümlenin sonuna eklenir. 'Да?' de aynı işi görür ve daha samimidir." },
      { category: "kelime_sor", target: "Как э́то называ́ется?", translit: "kak eta nazıváyitsa", tr: "Bunun adı ne?", register: "notr", note: "Nesneyi gösterip söyleyin. En sık duyulan kalıp budur." },
      { category: "kelime_sor", target: "Что зна́чит...?", translit: "şto znáçit", tr: "... ne demek?", register: "notr", note: "Sonuna kelimeyi olduğu gibi ekleyin: 'Что зна́чит «сро́чно»?'" },
      { category: "yazilis_sor", target: "Как э́то пи́шется?", translit: "kak eta píşitsa", tr: "Nasıl yazılıyor?", register: "notr", note: "Harf harf istemek için 'По бу́квам, пожа́луйста' (pa búkvam)." },
      { category: "soz_al", target: "Мо́жно вопро́с?", translit: "mójna vaprós", tr: "Bir şey sorabilir miyim?", register: "notr", note: "Araya girmenin en zararsız yolu. 'Извини́те' ile başlatmak daha da yumuşatır." },
      { category: "soz_al", target: "Секу́ндочку", translit: "sikúndaçku", tr: "Bir saniye", register: "samimi", note: "Küçültme eki onu nazik yapar; 'Секу́нда' demeyin, sert durur." },
      { category: "onay_iste", target: "Так мо́жно сказа́ть?", translit: "tak mójna skazát'", tr: "Böyle denir mi?", register: "notr", note: "Kendi cümlenizi söyleyip hemen ardından sorun; doğallık onayı ister." },
    ],
    fillers: [
      { target: "ну...", translit: "nu", tr: "şey... eee..." },
      { target: "как сказа́ть...", translit: "kak skazát'", tr: "nasıl desem..." },
      { target: "э́то са́мое...", translit: "eta sámaye", tr: "şey işte... şu..." },
      { target: "в о́бщем", translit: "v óbşim", tr: "genel olarak, işte" },
      { target: "коро́че", translit: "karoçi", tr: "kısacası" },
    ],
    circumlocution: [
      { target: "Э́то тако́е..., кото́рое...", translit: "eta takóye..., katóraye...", tr: "Şey işte, şöyle bir şey ki..." },
      { target: "Э́то как...", translit: "eta kak", tr: "Şey gibi bir şey..." },
      { target: "Я не зна́ю сло́во, но э́то для...", translit: "ya ni znáyu slóva, no eta dlya", tr: "Kelimeyi bilmiyorum ama şunun için kullanılıyor..." },
      { target: "Ну, э́то когда́...", translit: "nu, eta kagdá", tr: "Yani, şu durumda olan şey..." },
    ],
    teacherCue: "Что-что? Я не по́нял, повтори́те, пожа́луйста. (şto-şto? ya ni ponyal, paftaríti, pajálusta)",
    turkishTrap: "Türk öğrenci Rusçada nezaketi 'пожалуйста' eklemekle çözdüğünü sanır ama asıl sorun ты/вы seçimidir: Türkçede 'siz' kullanımı esnek olduğu için öğrenci tanımadığı kişiye rahatça 'Повтори́!' veya kuru bir 'Что?' der; Ruslar bunu emir ve kabalık olarak duyar, özellikle 'Что?' tek başına neredeyse sitem gibidir. İkinci tuzak, Türkçede kendi cinsiyetini fiilde belirtme alışkanlığı olmadığı için kadın öğrencinin panikte 'Не по́нял' demesi; küçük görünse de kulağı tırmalar. Üçüncüsü, Türkçedeki 'Anlamadım'ın yumuşaklığını Rusçaya taşımaya çalışıp 'Я вас совсе́м не понима́ю' gibi uzun ve dramatik cümleler kurmak: onarım ifadesi uzadıkça panik büyür, iki kelime yeter. Son olarak Türkçedeki 'efendim?' refleksiyle Rusçada karşılık aranır ama birebir karşılığı yoktur; onun yerine 'Прости́те?' (prastíti) ya da 'Что-что?' kullanılmalıdır.",
  },
  // --- Farsça ---
  fa: {
    phrases: [
      { category: "anlamadim", target: "متوجه نشدم", translit: "motevejjeh naşodam", tr: "Anlamadım.", register: "notr", note: "En güvenli, her yerde geçer. Konuşmada \"motevejje naşodam\" diye kaynaşır." },
      { category: "anlamadim", target: "نفهمیدم", translit: "nafahmidam", tr: "Anlamadım.", register: "samimi", note: "Arkadaş arasında doğal; resmî ortamda biraz kaba durur, orada متوجه نشدم kullan." },
      { category: "tekrar", target: "ببخشید؟", translit: "bebahşid?", tr: "Efendim? / Pardon?", register: "notr", note: "Tek kelimelik en pratik \"tekrar eder misin\". Sonu yukarı tonlanmalı." },
      { category: "tekrar", target: "یه بار دیگه بگید", translit: "ye bâr dige begid", tr: "Bir daha söyler misiniz.", register: "notr", note: "Yazılı hâli: یک بار دیگر بگویید. Samimi versiyonu: ye bâr dige begu." },
      { category: "yavas", target: "یواش‌تر لطفاً", translit: "yavâştar lotfan", tr: "Daha yavaş lütfen.", register: "notr", note: "ZWNJ: یواش‌تر. \"Âheste\" kitabi kalır, sokakta \"yavâş\" denir." },
      { category: "yavas", target: "آروم‌تر بگید", translit: "ârumtar begid", tr: "Yavaş söyleyin.", register: "samimi", note: "Yazılı: آرام‌تر. Tahran konuşmasında \"ârâm\" > \"ârum\"." },
      { category: "teyit", target: "یعنی چی؟", translit: "ya'ni çi?", tr: "Yani ne demek?", register: "samimi", note: "Çok sık. Resmîde یعنی چه؟ (ya'ni çe?) de." },
      { category: "teyit", target: "یعنی ... درسته؟", translit: "ya'ni ... doroste?", tr: "Yani ... öyle mi?", register: "notr", note: "Anladığını kendi kelimenle söyleyip sonuna ekle; müzakerenin bel kemiği." },
      { category: "kelime_sor", target: "این چی می‌شه فارسی؟", translit: "in çi mişe fârsi?", tr: "Bunun Farsçası ne?", register: "samimi", note: "Nesneyi gösterirken kullan. Resmî: این به فارسی چه می‌شود؟" },
      { category: "kelime_sor", target: "اسمش چیه؟", translit: "esmeş çiye?", tr: "Bunun adı ne?", register: "samimi", note: "Yazılı: اسمش چیست؟ Konuşmada چیست asla denmez, hep چیه." },
      { category: "yazilis_sor", target: "چطور می‌نویسن؟", translit: "çetor minevisan?", tr: "Nasıl yazılıyor?", register: "notr", note: "ZWNJ: می‌نویسن. Yazılı hâli می‌نویسند." },
      { category: "soz_al", target: "ببخشید، یه سؤال", translit: "bebahşid, ye so'âl", tr: "Pardon, bir soru.", register: "notr", note: "Araya girmenin en nazik kısa yolu. \"ye\" = یک'in konuşma hâli." },
      { category: "soz_al", target: "یه لحظه", translit: "ye lahze", tr: "Bir saniye.", register: "samimi", note: "Karşıdakini durdurup düşünmek için. Tonu yumuşak tut, emir gibi çıkmasın." },
      { category: "onay_iste", target: "درست گفتم؟", translit: "dorost goftam?", tr: "Doğru mu söyledim?", register: "notr", note: "Telaffuz/dilbilgisi onayı için. \"doroste?\" ise anlam onayı içindir." },
    ],
    fillers: [
      { target: "خب...", translit: "hob...", tr: "Şey... / Peki..." },
      { target: "چیز...", translit: "çiz...", tr: "Şey... (kelime ararken)" },
      { target: "یعنی...", translit: "ya'ni...", tr: "Yani..." },
      { target: "چطور بگم...", translit: "çetor begam...", tr: "Nasıl desem..." },
      { target: "راستش...", translit: "râsteş...", tr: "Aslında / doğrusu..." },
    ],
    circumlocution: [
      { target: "یه چیزیه که...", translit: "ye çiziye ke...", tr: "Bir şey ki..." },
      { target: "شبیه ... است", translit: "şabih-e ... e", tr: "... gibi bir şey." },
      { target: "برای اینه که...", translit: "barâye ine ke...", tr: "Şunun için kullanılır..." },
      { target: "اسمش یادم رفته", translit: "esmeş yâdam rafte", tr: "Adı aklımdan çıktı." },
    ],
    teacherCue: "ببخشید، متوجه نشدم. می‌شه یه بار دیگه بگید؟ (bebahşid, motevejjeh nashodam. mişe ye bâr dige begid?)",
    turkishTrap: "Türk öğrenci Farsçadaki hazır kalıpları Türkçeden birebir çevirmeye kalkıyor: \"anlamadım\" için \"نفهمیدم\" (nafahmidam) fiilini seçiyor ama bu Farsçada sert, hatta suçlayıcı tınlayabiliyor; nötr ortamda \"متوجه نشدم\" (motevejjeh nashodam) gerekiyor. İkinci büyük tuzak, Türkçedeki \"-misiniz\" nezaketini Farsçaya taşırken ders kitabı dilini kullanmak: \"چیست\", \"یک بار دیگر\", \"آرام\" gibi yazılı biçimler Tahran'da yapmacık duyuluyor; sokakta \"چیه\", \"یه بار دیگه\", \"آروم\" var. Üçüncüsü, Farsçanın ta'ârof kültüründe soru sormanın \"ببخشید\" ile açılması beklenir; Türk öğrenci doğrudan soruya girip kaba görünür. Son olarak iki farklı \"yani\" karışır: \"یعنی چی؟\" anlamı sorar, \"یعنی ... درسته؟\" ise kendi anladığını teyit ettirir; öğrenci ikincisini hiç kullanmadığı için karşısındaki anlaşıldığını sanır ve konuşma yanlış yerden devam eder.",
  },
};
