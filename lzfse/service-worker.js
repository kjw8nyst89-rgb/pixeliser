// ============================================================
// PIXELISER — SERVICE WORKER
// ============================================================
// À CHAQUE MISE À JOUR DE L'APPLI : incrémente CACHE_NAME
// (par ex. "pixeliser-v2"), sinon Safari continuera à servir
// les anciens fichiers depuis le cache.
// ============================================================
const CACHE_NAME="pixeliser-v1";

const PRECACHE_URLS=[
    "./",
    "./index.html",
    "./pixeliser.js",
    "./pixeliser.css",
    "./manifest.json",
    "./lzfse/lzfse.js",
    "./lzfse/lzfse.wasm",
    "./icons/apple-touch-icon.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-512-maskable.png"
];

// ============================================================
// INSTALL : on précharge tous les fichiers de l'appli
// ============================================================
self.addEventListener("install",function(event){
    console.log("[SW] Installation :",CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache){
            return cache.addAll(PRECACHE_URLS);
        }).then(function(){
            // Active la nouvelle version immédiatement, sans attendre
            // la fermeture des anciens onglets.
            return self.skipWaiting();
        })
    );
});

// ============================================================
// ACTIVATE : on supprime les anciens caches
// ============================================================
self.addEventListener("activate",function(event){
    console.log("[SW] Activation :",CACHE_NAME);
    event.waitUntil(
        caches.keys().then(function(keys){
            return Promise.all(
                keys.filter(function(key){
                    return key!==CACHE_NAME;
                }).map(function(key){
                    console.log("[SW] Suppression ancien cache :",key);
                    return caches.delete(key);
                })
            );
        }).then(function(){
            return self.clients.claim();
        })
    );
});

// ============================================================
// FETCH : cache-first, avec repli réseau puis mise à jour du cache
// ============================================================
self.addEventListener("fetch",function(event){
    const request=event.request;
    // On ne gère que les requêtes GET same-origin (le reste part au réseau normalement).
    if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin){
        return;
    }
    event.respondWith(
        caches.match(request).then(function(cached){
            if(cached){
                // Sert le cache immédiatement, et rafraîchit en arrière-plan
                // pour la prochaine visite (stale-while-revalidate).
                fetchAndUpdateCache(request);
                return cached;
            }
            return fetchAndUpdateCache(request);
        }).catch(function(){
            return caches.match(request);
        })
    );
});

function fetchAndUpdateCache(request){
    return fetch(request).then(function(response){
        if(response&&response.ok){
            const responseClone=response.clone();
            caches.open(CACHE_NAME).then(function(cache){
                cache.put(request,responseClone);
            });
        }
        return response;
    }).catch(function(error){
        console.warn("[SW] Requête réseau échouée (probablement hors-ligne) :",request.url);
        return caches.match(request);
    });
}
