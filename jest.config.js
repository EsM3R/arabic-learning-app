/**
 * Ekran testleri. Saf mantık testleri node --test ile ayrı koşuyor
 * (tests/*.test.ts); bu yapılandırma yalnız uitests/ altını alır.
 *
 * İkisi ayrı tutuldu çünkü saf testler derlemesiz ve saniyeler içinde koşuyor;
 * ekran testleri jest+babel gerektiriyor ve yavaş. Hızlı geri bildirim
 * döngüsünü yavaş olanın arkasına koymak, testlerin koşulmamasına yol açar.
 */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/uitests/**/*.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
};
