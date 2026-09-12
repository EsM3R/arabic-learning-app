/**
 * Çökme ağı testi.
 *
 * Bu bileşen uygulamanın SON savunma hattı: bağımsız APK'da kırmızı hata
 * ekranı yok, yani o yakalamazsa uygulama sessizce kapanır ve kullanıcının
 * elinde hiçbir şey kalmaz. Tek kişilik bir uygulamada bunun anlamı, hatanın
 * hiç düzeltilememesi — kullanıcı "kapandı" der, sebebini kimse bilemez.
 *
 * Ağın kendisi test edilmediği sürece "var" olması bir şey ifade etmiyor:
 * kırık bir çökme ağı ile hiç ağ olmaması arasında kullanıcı açısından fark
 * yok. Burada ölçülen üç şey: hata gerçekten yakalanıyor mu, hata METNİ
 * ekrana çıkıyor mu (kopyalanabilsin diye), ve ağ dışındaki (async) ölümcül
 * hatalar da tutuluyor mu.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import ErrorBoundary from "../src/components/ErrorBoundary";
import { reportError } from "../src/errorLog";

/** İstenince patlayan çocuk bileşen. */
function Boom({ blow }: { blow: boolean }) {
  if (blow) throw new Error("i'râb tablosu bozuk");
  return <Text>ders ekranı</Text>;
}

let quiet: jest.SpyInstance;
beforeEach(() => {
  // React yakalanan hatayı ayrıca konsola basar; test çıktısını kirletmesin.
  quiet = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => quiet.mockRestore());

test("çizim hatası uygulamayı kapatmaz, ANLAŞILIR bir ekrana düşer", () => {
  render(
    <ErrorBoundary>
      <Boom blow />
    </ErrorBoundary>
  );
  expect(screen.getByText(/bir hataya takıldı/)).toBeTruthy();
  expect(screen.getByText(/Verilerin duruyor/)).toBeTruthy();
});

test("hata METNİ ekrana yazılır — kopyalanıp gönderilebilsin", () => {
  // Bu metin olmadan ekran "bir şey oldu" demekten ibaret kalır ve hata
  // hiçbir zaman düzeltilemez.
  render(
    <ErrorBoundary>
      <Boom blow />
    </ErrorBoundary>
  );
  const detail = screen.getByText(/Mesaj:/);
  const text = ([] as unknown[]).concat(detail.props.children).join("");
  expect(text).toMatch(/i'râb tablosu bozuk/);
  expect(text).toMatch(/Nerede: ekran çizilirken/);
  expect(text).toMatch(/Derleme:/); // hangi sürümde olduğu
  expect(text).toMatch(/İz:/); // yığın izi
  expect(detail.props.selectable).toBe(true); // uzun basıp seçilebilir
});

test("sağlam ağaç dokunulmadan geçer", () => {
  render(
    <ErrorBoundary>
      <Boom blow={false} />
    </ErrorBoundary>
  );
  expect(screen.getByText("ders ekranı")).toBeTruthy();
  expect(screen.queryByText(/bir hataya takıldı/)).toBeNull();
});

test("TEKRAR DENE geçici hatadan sonra ekranı geri getirir", () => {
  // Kalıcı bir çökme ekranı, geçici bir aksaklıkta uygulamayı boş yere
  // kullanılamaz hâle getirirdi.
  let broken = true;
  function Flaky() {
    if (broken) throw new Error("geçici");
    return <Text>ders ekranı</Text>;
  }
  render(
    <ErrorBoundary>
      <Flaky />
    </ErrorBoundary>
  );
  expect(screen.getByText(/bir hataya takıldı/)).toBeTruthy();

  broken = false;
  fireEvent.press(screen.getByText("Tekrar dene"));
  expect(screen.getByText("ders ekranı")).toBeTruthy();
});

test("AĞAÇ DIŞINDAKİ ölümcül hata da ekrana düşer", () => {
  // Zamanlayıcı/async hataları componentDidCatch'e uğramaz; yakalanmazsa
  // uygulama kapanır.
  render(
    <ErrorBoundary>
      <Boom blow={false} />
    </ErrorBoundary>
  );
  act(() => {
    reportError(new Error("ağ çağrısı patladı"), "arka plan", true);
  });
  expect(screen.getByText(/bir hataya takıldı/)).toBeTruthy();
  const text = ([] as unknown[])
    .concat(screen.getByText(/Mesaj:/).props.children)
    .join("");
  expect(text).toMatch(/ağ çağrısı patladı/);
  expect(text).toMatch(/Nerede: arka plan/);
});

test("ölümcül OLMAYAN hata çalışmayı KESMEZ", () => {
  // Her küçük aksaklıkta öğrenciyi çökme ekranına atmak, çalışan uygulamayı
  // kullanılamaz hâle getirirdi.
  render(
    <ErrorBoundary>
      <Boom blow={false} />
    </ErrorBoundary>
  );
  act(() => {
    reportError(new Error("önemsiz"), "istatistik", false);
  });
  expect(screen.getByText("ders ekranı")).toBeTruthy();
});

test("İLK hata ekranda kalır — arkadan gelenler onu ezmez", () => {
  // Çökme çoğu zaman art arda birkaç hata üretir; sonuncusu genelde
  // birincisinin sonucudur. Ekranda kök sebep durmalı.
  render(
    <ErrorBoundary>
      <Boom blow={false} />
    </ErrorBoundary>
  );
  act(() => {
    reportError(new Error("kök sebep"), "arka plan", true);
    reportError(new Error("artçı"), "arka plan", true);
  });
  const text = ([] as unknown[])
    .concat(screen.getByText(/Mesaj:/).props.children)
    .join("");
  expect(text).toMatch(/kök sebep/);
  expect(text).not.toMatch(/artçı/);
});

test("ekran kapanınca dinleyici BIRAKILIR — sızıntı olmaz", () => {
  const { unmount } = render(
    <ErrorBoundary>
      <Boom blow={false} />
    </ErrorBoundary>
  );
  unmount();
  // Sökülmüş bileşene setState çağrılsaydı React uyarırdı; uyarı yoksa temiz.
  act(() => {
    reportError(new Error("sonrasında"), "arka plan", true);
  });
  const warned = quiet.mock.calls.some((c) => String(c[0]).includes("unmounted"));
  expect(warned).toBe(false);
});
