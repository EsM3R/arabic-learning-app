const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Anthropic SDK'sı Node.js'e özel modülleri (node:fs gibi) isteğe bağlı olarak
// yüklemeye çalışır. React Native'de bu modüller yoktur ve ilgili kod yolu
// (dosyadan kimlik bilgisi okuma) kullanılmaz — boş bir modüle yönlendiriyoruz.
const emptyModule = path.resolve(__dirname, "src/empty-module.js");

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("node:")) {
    return { type: "sourceFile", filePath: emptyModule };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
