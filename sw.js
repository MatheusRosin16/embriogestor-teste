/* ============================================================
   EmbrioGestor - Service Worker Offline v2
   Funciona no subdiretório do GitHub Pages.
   ============================================================ */
const CACHE = "embriogestor-offline-v2";
const BASE = self.registration.scope;

function u(path){
  return new URL(path, BASE).href;
}

/* Arquivos essenciais. Se algum opcional não existir, a instalação continua. */
const ESSENCIAIS = [
  "./",
  "./index.html",
  "./style.css",
  "./login.css",
  "./mobile-fix-menu.css",
  "./config.js",
  "./catalogos.js",
  "./app.js",
  "./cloud.js",
  "./mobile.js",
  "./login.js",
  "./importador.js",
  "./offline-mode.js",
  "./offline-register.js",
  "./manifest.webmanifest",
  "./logo-seminna.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./relatorios-observacao-v3.js",
  "./relatorio-mapa.js",
  "./admin-acesso-config.js",
  "./admin-acesso.js"
];

self.addEventListener("install", event=>{
  event.waitUntil((async ()=>{
    const cache = await caches.open(CACHE);

    for(const rel of ESSENCIAIS){
      try{
        const req = new Request(u(rel), { cache: "reload" });
        const resp = await fetch(req);
        if(resp && resp.ok) await cache.put(req, resp.clone());
      }catch(e){
        console.warn("Arquivo não cacheado:", rel);
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event=>{
  if(event.request.method !== "GET") return;

  const req = event.request;
  const url = new URL(req.url);

  /* Google precisa de internet; não interceptar OAuth/Drive. */
  if(
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("accounts.google.com") ||
    url.hostname.includes("google.com") ||
    url.hostname.includes("gstatic.com")
  ){
    return;
  }

  /* Navegação do app:
     - online: usa rede e atualiza index
     - offline: abre index.html cacheado */
  if(req.mode === "navigate"){
    event.respondWith((async ()=>{
      try{
        const resp = await fetch(req);
        if(resp && resp.ok){
          const cache = await caches.open(CACHE);
          await cache.put(new Request(u("./index.html")), resp.clone());
        }
        return resp;
      }catch(e){
        const cache = await caches.open(CACHE);

        // Primeiro tenta a navegação exata, depois o index principal.
        const exact = await cache.match(req, { ignoreSearch: true });
        if(exact) return exact;

        const index = await cache.match(new Request(u("./index.html")), { ignoreSearch: true });
        if(index) return index;

        const root = await cache.match(new Request(u("./")), { ignoreSearch: true });
        if(root) return root;

        return new Response(
          "<h1>EmbrioGestor</h1><p>O modo offline ainda não foi instalado neste aparelho. Conecte-se à internet uma vez, abra o sistema e aguarde o carregamento completo.</p>",
          {headers:{"Content-Type":"text/html; charset=utf-8"}}
        );
      }
    })());
    return;
  }

  /* Arquivos do próprio EmbrioGestor: cache-first.
     ignoreSearch permite usar app.js?v=40 a partir do app.js cacheado. */
  if(url.origin === new URL(BASE).origin && url.href.startsWith(BASE)){
    event.respondWith((async ()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });

      if(cached){
        // Atualiza em segundo plano quando houver internet.
        event.waitUntil(
          fetch(req).then(async resp=>{
            if(resp && resp.ok) await cache.put(req, resp.clone());
          }).catch(()=>{})
        );
        return cached;
      }

      try{
        const resp = await fetch(req);
        if(resp && resp.ok) await cache.put(req, resp.clone());
        return resp;
      }catch(e){
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })());
  }
});