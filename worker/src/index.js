// V-World WFS 프록시 Worker
// - API 키를 서버측에서만 사용 (환경변수 VWORLD_KEY)
// - CORS 허용 (GitHub Pages 도메인)
// - Cloudflare Cache로 응답 캐싱 (기본 1시간)

const V_WORLD_WFS = 'https://api.vworld.kr/req/wfs';

// V-World 레이어 매핑
// 참고: https://www.vworld.kr/dev/v4dv_2ddataguideindex_s001.do
const LAYERS = {
  // 비행금지구역 (P-zone)
  prohibited: 'lt_c_aisprhc',
  // 비행제한구역/관제권 (R-zone / CTR)
  restricted: 'lt_c_aisrsac',
  // 초경량비행장치 UA구역 (허용)
  ua: 'lt_c_ua',
};

// GitHub Pages / 로컬 개발용 CORS 허용 도메인 패턴
const ALLOWED_ORIGIN = /^https:\/\/[a-z0-9-]+\.github\.io$|^http:\/\/localhost(:\d+)?$/i;

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGIN.test(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

async function fetchLayer(env, layerKey, bboxParam) {
  const typeName = LAYERS[layerKey];
  if (!typeName) throw new Error(`unknown layer: ${layerKey}`);

  const bbox = bboxParam || '124.5,33.0,132.0,39.0,EPSG:4326'; // 한국 전체
  const params = new URLSearchParams({
    key: env.VWORLD_KEY,
    typename: typeName,
    bbox,
    maxFeatures: '1000',
    resultType: 'results',
    srsName: 'EPSG:4326',
    output: 'application/json',
    request: 'GetFeature',
    service: 'WFS',
    version: '2.0.0',
    domain: env.VWORLD_DOMAIN || '',
  });

  const url = `${V_WORLD_WFS}?${params.toString()}`;
  const res = await fetch(url, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`V-World ${layerKey} ${res.status}`);
  return res.json();
}

// V-World GeoJSON → 앱 통일 스키마로 정규화
function normalize(fc, kind) {
  if (!fc || !fc.features) return { type: 'FeatureCollection', features: [] };
  const features = fc.features.map(f => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      kind,
      name: f.properties?.aisprhc_nam || f.properties?.aisrsac_nam || f.properties?.ua_name || f.properties?.name || `${kind} zone`,
      desc: f.properties?.remark || '',
      raw: f.properties,
    },
  }));
  return { type: 'FeatureCollection', features };
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (!env.VWORLD_KEY) {
      return new Response(JSON.stringify({ error: 'VWORLD_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
    }

    const url = new URL(request.url);
    // 라우팅: /zones?bbox=... → 세 레이어 합쳐서 반환
    //         /health → ok
    if (url.pathname === '/health') {
      return new Response('ok', { headers: cors });
    }

    if (url.pathname === '/zones') {
      try {
        const bbox = url.searchParams.get('bbox');
        const [prohibited, restricted, ua] = await Promise.all([
          fetchLayer(env, 'prohibited', bbox).catch(() => null),
          fetchLayer(env, 'restricted', bbox).catch(() => null),
          fetchLayer(env, 'ua', bbox).catch(() => null),
        ]);

        const merged = {
          type: 'FeatureCollection',
          features: [
            ...normalize(prohibited, 'prohibited').features,
            ...normalize(restricted, 'restricted').features,
            ...normalize(ua, 'ua').features,
          ],
          meta: {
            counts: {
              prohibited: prohibited?.features?.length ?? 0,
              restricted: restricted?.features?.length ?? 0,
              ua: ua?.features?.length ?? 0,
            },
            fetchedAt: new Date().toISOString(),
          },
        };

        return new Response(JSON.stringify(merged), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            ...cors,
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...cors } });
      }
    }

    return new Response('Not Found', { status: 404, headers: cors });
  },
};
