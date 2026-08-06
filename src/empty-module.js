// Metro, Node.js'e özel modüller (node:fs, node:path ...) için bu boş modülü
// kullanır. Anthropic SDK'sı bunları yalnızca masaüstünde dosyadan kimlik
// bilgisi okumak için isteğe bağlı yükler; biz API anahtarını doğrudan
// verdiğimizden o kod yolu React Native'de hiç çalışmaz.
module.exports = {};
