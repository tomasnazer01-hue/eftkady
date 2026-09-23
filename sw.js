// Service Worker لمرسل الافتقاد Pro
// بيخزن نسخة من التطبيق نفسه والمكتبات اللي بيحتاجها، عشان يفتح حتى من غير نت خالص.
// ملاحظة: البيانات الفعلية (المخدومين، الحضور، ...) دي مسؤولية Firestore وليها آلية
// أوفلاين منفصلة ومفعّلة بالفعل جوه التطبيق (enableIndexedDbPersistence) — الملف ده
// بس مسؤول عن تحميل التطبيق نفسه (الشكل والكود) من غير إنترنت.

const CACHE_VERSION = "eftekad-shell-v1";
const APP_SHELL_URLS = [
  "./",
  "./index.html",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&family=Tajawal:wght@400;500;700&display=swap",
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/lucide@latest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // كل رابط بيتحمّل لوحده، عشان لو واحد فشل (مثلاً مكتبة اتغيّر رابطها) الباقي يفضل يتخزن
      return Promise.allSettled(
        APP_SHELL_URLS.map((url) =>
          fetch(url, { mode: "cors" }).then((res) => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {})
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// استراتيجية: جرب الشبكة الأول (عشان تاخد آخر نسخة لو النت شغال)،
// ولو فشلت (مفيش نت) ارجع للنسخة المخزنة.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // لو الصفحة الرئيسية نفسها مش متخزنة، جرب أي نسخة مخزنة من نفس المسار
          if (event.request.mode === "navigate") {
            return caches.match("./") || caches.match("./index.html");
          }
        })
      )
  );
});
