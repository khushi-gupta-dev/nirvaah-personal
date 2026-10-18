/**
 * NIRVAAH Service Worker v5
 * - Inline offline HTML (no install-time caching needed)
 * - Background sync for offline complaints
 */

const CACHE_NAME = 'nirvaah-v5';

// =============================================================
// OFFLINE PAGE HTML — Inline, no cache dependency
// =============================================================
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline – NIRVAAH</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;padding:80px 16px 40px}
.navbar{position:fixed;top:0;left:0;right:0;background:#1e293b;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;z-index:100;border-bottom:1px solid #334155}
.logo{font-weight:700;font-size:1.2rem;color:#a5b4fc}
.offline-badge{background:#fbbf24;color:#1e293b;font-size:.75rem;font-weight:700;padding:4px 10px;border-radius:20px}
.banner{background:#1c1917;border:1px solid #fbbf24;border-radius:12px;padding:16px 20px;margin-bottom:24px;color:#fcd34d;font-size:.9rem;line-height:1.5}
.banner strong{display:block;margin-bottom:4px;font-size:1rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:24px;margin-bottom:16px}
.card h2{font-size:1.1rem;margin-bottom:20px;color:#a5b4fc}
label{display:block;font-size:.8rem;color:#94a3b8;margin-bottom:4px;margin-top:14px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
input,textarea,select{width:100%;background:#0f172a;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:10px 12px;font-size:.9rem;outline:none}
input:focus,textarea:focus,select:focus{border-color:#6366f1}
.chip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:4px}
.chip{background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 6px;text-align:center;cursor:pointer;font-size:.82rem;color:#94a3b8;transition:all .2s}
.chip:hover{border-color:#6366f1;color:#a5b4fc}
.chip.active{background:rgba(99,102,241,.15);border-color:#6366f1;color:#a5b4fc}
#map{height:200px;border-radius:10px;background:#1e293b;border:1px solid #334155;margin-top:4px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;border-radius:10px;font-weight:600;font-size:.9rem;cursor:pointer;border:none;transition:all .2s}
.btn-primary{background:#6366f1;color:#fff;width:100%}
.btn-primary:hover{background:#4f46e5}
.btn-outline{background:transparent;border:1px solid #334155;color:#94a3b8;margin-top:8px;width:100%}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.text-danger{color:#f87171;font-size:.8rem;margin-top:4px}
.hidden{display:none!important}
.toast-wrap{position:fixed;bottom:20px;right:20px;z-index:999;display:flex;flex-direction:column;gap:8px}
.toast{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:12px 16px;min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.toast.success{border-color:#10b981;color:#6ee7b7}
.toast.error{border-color:#ef4444;color:#fca5a5}
.toast-title{font-weight:700;margin-bottom:2px;font-size:.85rem}
.toast-msg{font-size:.8rem;color:#64748b}
@media(max-width:500px){.row{grid-template-columns:1fr}}
</style>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl.css">
</head>
<body>
<div class="toast-wrap" id="tc"></div>

<nav class="navbar">
  <div class="logo">⚡ NIRVAAH</div>
  <div class="offline-badge">⚠️ Offline Mode</div>
</nav>

<div style="max-width:680px;margin:0 auto">
  <div class="banner">
    <strong>📶 You are offline</strong>
    Fill in your report below. It will be saved on your device and automatically uploaded when internet is restored.
  </div>

  <!-- Step 1: Category -->
  <div id="s1" class="card">
    <h2>Step 1 — Select Category</h2>
    <div class="chip-grid">
      <div class="chip" data-cat="pothole" onclick="pick('pothole',this)">🕳️ Pothole</div>
      <div class="chip" data-cat="garbage" onclick="pick('garbage',this)">🗑️ Garbage</div>
      <div class="chip" data-cat="water_leakage" onclick="pick('water_leakage',this)">💧 Water</div>
      <div class="chip" data-cat="electricity" onclick="pick('electricity',this)">⚡ Electric</div>
      <div class="chip" data-cat="road_damage" onclick="pick('road_damage',this)">🛣️ Road</div>
      <div class="chip" data-cat="street_light" onclick="pick('street_light',this)">💡 Light</div>
      <div class="chip" data-cat="tree_hazard" onclick="pick('tree_hazard',this)">🌳 Tree</div>
      <div class="chip" data-cat="sewage" onclick="pick('sewage',this)">🌊 Sewage</div>
      <div class="chip" data-cat="other" onclick="pick('other',this)">📍 Other</div>
    </div>
    <div class="text-danger hidden" id="cerr">Please select a category.</div>
    <br>
    <button class="btn btn-primary" onclick="go(2)">Continue →</button>
  </div>

  <!-- Step 2: Details -->
  <div id="s2" class="card hidden">
    <h2>Step 2 — Issue Details</h2>
    <label>Title *</label>
    <input id="title" placeholder="e.g. Large pothole on Main St" type="text">
    <label>Description</label>
    <textarea id="desc" rows="3" placeholder="Any extra details..."></textarea>
    <label>Priority</label>
    <select id="pri">
      <option value="low">🟢 Low</option>
      <option value="medium" selected>🟡 Medium</option>
      <option value="high">🔴 High</option>
    </select>
    <label>Photos (optional)</label>
    <div onclick="document.getElementById('imgs').click()" style="border:2px dashed #334155;border-radius:8px;padding:20px;text-align:center;cursor:pointer;margin-top:4px;color:#64748b;font-size:.85rem">
      📸 Tap to attach photos
    </div>
    <input id="imgs" type="file" accept="image/*" multiple class="hidden" onchange="handleFiles(this.files)">
    <div id="prev" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div>
    <br>
    <button class="btn btn-primary" onclick="go(3)">Continue →</button>
    <button class="btn btn-outline" onclick="go(1)">← Back</button>
  </div>

  <!-- Step 3: Location & Submit -->
  <div id="s3" class="card hidden">
    <h2>Step 3 — Location</h2>
    <button class="btn btn-outline" style="margin-bottom:8px;width:auto;padding:8px 16px" onclick="gps()">📍 Use GPS</button>
    <div id="map"></div>
    <div class="text-danger hidden" id="lerr">Please select a location.</div>
    <div class="row" style="margin-top:12px">
      <div>
        <label>Address</label>
        <input id="addr" placeholder="Auto-fills on GPS/map click...">
      </div>
      <div>
        <label>Landmark</label>
        <input id="lmk" placeholder="Near...">
      </div>
    </div>
    <input type="hidden" id="lat">
    <input type="hidden" id="lng">
    <br>
    <button class="btn btn-primary" style="background:#10b981" onclick="save()">📶 Save Offline & Sync Later</button>
    <button class="btn btn-outline" onclick="go(2)">← Back</button>
  </div>
</div>

<script type="importmap">{"imports":{"leaflet":"https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js","maplibre-gl":"https://unpkg.com/maplibre-gl@6.3.0/dist/maplibre-gl.mjs"}}</script>
<script type="module">
import * as L from 'leaflet';
import { maplibreGL } from 'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/dist/leaflet-maplibre-gl.mjs';

let cat='', files=[], map, marker, step=1;

function toast(t,m,type='success'){
  const w=document.getElementById('tc');
  const d=document.createElement('div');
  d.className='toast '+type;
  d.innerHTML='<div class="toast-title">'+t+'</div><div class="toast-msg">'+m+'</div>';
  w.appendChild(d);
  setTimeout(()=>d.remove(),4500);
}

function pick(c,el){
  cat=c;
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cerr').classList.add('hidden');
}

function handleFiles(f){
  files=[...files,...Array.from(f)].slice(0,5);
  const p=document.getElementById('prev');
  p.innerHTML=files.map((f,i)=>'<div style="position:relative"><img src="'+URL.createObjectURL(f)+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #334155"><span onclick="files.splice('+i+',1);handleFiles(new DataTransfer().files)" style="position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;border-radius:50%;width:16px;height:16px;cursor:pointer;text-align:center;font-size:10px;line-height:16px">x</span></div>').join('');
}

function go(n){
  if(n>step){
    if(step===1&&!cat){document.getElementById('cerr').classList.remove('hidden');return;}
    if(step===2&&!document.getElementById('title').value.trim()){alert('Please enter a title.');return;}
  }
  document.getElementById('s'+step).classList.add('hidden');
  document.getElementById('s'+n).classList.remove('hidden');
  step=n;
  if(n===3&&!map) setTimeout(initMap,100);
}

function initMap(){
  map=L.map('map',{zoomControl:true}).setView([20.59,78.96],5);
  maplibreGL({ style: 'https://tiles.openfreemap.org/styles/liberty' }).addTo(map); requestAnimationFrame(() => map.invalidateSize());
  map.on('click',e=>place(e.latlng.lat,e.latlng.lng));
}

async function place(lat,lng){
  document.getElementById('lat').value=lat;
  document.getElementById('lng').value=lng;
  document.getElementById('lerr').classList.add('hidden');
  if(!marker) marker=L.marker([lat,lng]).addTo(map);
  else marker.setLatLng([lat,lng]);
  map.setView([lat,lng],16);
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng);
    if(r.ok){const d=await r.json();document.getElementById('addr').value=d.display_name||'';}
  }catch(e){}
}

function gps(){
  navigator.geolocation.getCurrentPosition(
    p=>place(p.coords.latitude,p.coords.longitude),
    ()=>alert('Could not get GPS. Tap the map instead.')
  );
}

async function save(){
  const lat=document.getElementById('lat').value;
  if(!lat){document.getElementById('lerr').classList.remove('hidden');return;}
  try{
    const db = await new Promise((res,rej)=>{
      const req=indexedDB.open('nirvaah-db',1);
      req.onupgradeneeded=e=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains('pending-complaints'))
          db.createObjectStore('pending-complaints',{keyPath:'id',autoIncrement:true});
      };
      req.onsuccess=()=>res(req.result);
      req.onerror=()=>rej(req.error);
    });
    await new Promise((res,rej)=>{
      const tx=db.transaction('pending-complaints','readwrite');
      const rec={
        title:document.getElementById('title').value,
        description:document.getElementById('desc').value,
        category:cat,
        priority:document.getElementById('pri').value,
        lat:lat,
        lng:document.getElementById('lng').value,
        address:document.getElementById('addr').value,
        images:files,
        timestamp:Date.now(),
        synced:false
      };
      const r=tx.objectStore('pending-complaints').add(rec);
      r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
    });
    if('serviceWorker' in navigator&&'SyncManager' in window){
      const sw=await navigator.serviceWorker.ready;
      await sw.sync.register('sync-pending-complaints');
    }
    toast('Saved! 📶','Report queued — will sync when online.');
    setTimeout(()=>{
      document.getElementById('title').value='';
      document.getElementById('desc').value='';
      files=[];
      document.getElementById('prev').innerHTML='';
      cat='';
      document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
      go(1);
    },2000);
  }catch(e){toast('Error',e.message,'error');}
}
Object.assign(window, { toast, pick, handleFiles, go, gps, save });
Object.defineProperty(window, 'files', { configurable: true, get: () => files, set: value => { files = value; } });
</script>
</body>
</html>`;

// =============================================================
// INSTALL — Minimal, no file caching needed
// =============================================================
self.addEventListener('install', (event) => {
  console.log('[SW v5] Installing...');
  self.skipWaiting();
});

// =============================================================
// ACTIVATE — Clean old caches
// =============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW v5] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// =============================================================
// FETCH — Serve inline offline HTML when network fails
// =============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!request.url.startsWith('http')) return;

  // API requests — return offline JSON error
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ success: false, message: 'You are offline.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // HTML Navigation — serve inline HTML if network fails (no cache needed!)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(OFFLINE_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      )
    );
    return;
  }

  // Everything else — network with graceful failure
  event.respondWith(
    fetch(request).catch(() => new Response('Offline', { status: 503 }))
  );
});

// =============================================================
// BACKGROUND SYNC
// =============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-complaints') {
    event.waitUntil(notifyClients());
  }
});

async function notifyClients() {
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLAINTS' }));
}

// =============================================================
// PUSH NOTIFICATIONS
// =============================================================
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'NIRVAAH', {
      body: data.message || 'New notification',
      icon: '/assets/icons/icon-192.png',
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
