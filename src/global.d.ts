/**
 * Metro'nun require'ı. Sağlayıcı SDK'larını tembel yüklemek için kullanılıyor:
 * tip tarafında `import type` ile alıp, gerçek modülü ilk kullanımda
 * require ediyoruz. Böylece Anthropic ile ders yaparken OpenAI ve Gemini
 * SDK'ları hiç çalıştırılmıyor — açılışta bir tanesinin patlaması tüm
 * uygulamayı kilitleyemiyor.
 */
declare function require(path: string): any;
