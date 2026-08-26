import React from "react";
import App from "./App";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { installGlobalErrorHandler } from "./src/errorLog";

// Hata yakalayıcı App'in DIŞINDA durmalı: App'in kendi render'ında oluşan bir
// hata da yakalanabilsin. Release APK'da kırmızı hata ekranı olmadığı için
// bu olmadan uygulama sessizce kapanır ve elde hiçbir bilgi kalmaz.
installGlobalErrorHandler();

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
