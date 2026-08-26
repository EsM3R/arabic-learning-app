/**
 * Derleme kimliği. Bu dosyanın içeriğini CI her derlemede yeniden yazar
 * (bkz. .github/workflows/apk.yml). Yerelde çalışırken "gelistirme" kalır.
 *
 * Hata ekranında gösterilir: elimizdeki APK'nın hangi koddan derlendiğini
 * bilmeden hata ayıklamak mümkün değil.
 */
export const BUILD_INFO = {
  commit: "gelistirme",
  build: "yerel",
  date: "",
};

export function buildLabel(): string {
  const parts = [`derleme ${BUILD_INFO.build}`, BUILD_INFO.commit];
  if (BUILD_INFO.date) parts.push(BUILD_INFO.date);
  return parts.join(" · ");
}
