// zones.js
// 우선순위:
//   1. window.ZONES_PROXY_URL 이 설정되어 있으면 Cloudflare Worker에서 실데이터 fetch
//   2. 실패 시 아래 SAMPLE_ZONES fallback
//
// index.html에서 <script>window.ZONES_PROXY_URL="https://..."</script> 로 주입.

const SAMPLE_ZONES = {
  type: "FeatureCollection",
  features: [
    { type:"Feature", properties:{name:"용산 대통령실 주변 (P-73 인근)", kind:"prohibited", desc:"샘플 근사치"}, geometry: circlePolygon(37.5326,126.9736,8.3) },
    { type:"Feature", properties:{name:"청와대 구역", kind:"prohibited", desc:"P-73A 근사"}, geometry: circlePolygon(37.5866,126.9749,4.6) },
    { type:"Feature", properties:{name:"인천국제공항 관제권", kind:"restricted", desc:"근사"}, geometry: circlePolygon(37.4602,126.4407,9.3) },
    { type:"Feature", properties:{name:"김포국제공항 관제권", kind:"restricted", desc:"근사"}, geometry: circlePolygon(37.5583,126.7906,9.3) },
    { type:"Feature", properties:{name:"김해국제공항 관제권", kind:"restricted", desc:"근사"}, geometry: circlePolygon(35.1795,128.9382,9.3) },
    { type:"Feature", properties:{name:"제주국제공항 관제권", kind:"restricted", desc:"근사"}, geometry: circlePolygon(33.5113,126.4930,9.3) },
    { type:"Feature", properties:{name:"대전 원자력연구원 (P-65)", kind:"prohibited", desc:"P-65 근사"}, geometry: circlePolygon(36.3958,127.3629,3.7) },
  ],
  meta: { source: "sample-fallback" },
};

window.ZONES = SAMPLE_ZONES;

// Worker URL 주입돼 있으면 실데이터로 교체 시도
(async function loadRealZones() {
  const url = window.ZONES_PROXY_URL;
  if (!url) return;
  try {
    const cached = readCache();
    if (cached) {
      window.ZONES = cached.data;
      window.dispatchEvent(new CustomEvent('zones:loaded', { detail: { source: 'cache', meta: cached.data.meta }}));
    }
    const res = await fetch(`${url.replace(/\/$/, '')}/zones`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.features?.length) throw new Error('empty features');
    window.ZONES = data;
    writeCache(data);
    window.dispatchEvent(new CustomEvent('zones:loaded', { detail: { source: 'network', meta: data.meta }}));
  } catch (e) {
    console.warn('[zones] fallback to sample:', e.message);
    window.dispatchEvent(new CustomEvent('zones:loaded', { detail: { source: 'fallback', error: e.message, meta: SAMPLE_ZONES.meta }}));
  }
})();

// --- 로컬 캐시 (24h) ---
const CACHE_KEY = 'zones_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed;
  } catch { return null; }
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// --- 원형 폴리곤 생성 ---
function circlePolygon(lat, lng, radiusKm, points = 64) {
  const coords = [];
  const earthR = 6371;
  const d = radiusKm / earthR;
  const latR = lat * Math.PI / 180;
  const lngR = lng * Math.PI / 180;
  for (let i = 0; i <= points; i++) {
    const brng = (i / points) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brng));
    const lng2 = lngR + Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(latR), Math.cos(d) - Math.sin(latR)*Math.sin(lat2));
    coords.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI]);
  }
  return { type: "Polygon", coordinates: [coords] };
}
