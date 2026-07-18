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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
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

// Kakao 로컬 검색 (POI 검색). 한국의 놀이터·카페·소상공인까지 잘 잡힘.
// 참고: https://developers.kakao.com/docs/latest/ko/local/dev-guide
async function kakaoSearch(env, query, opts = {}) {
  const params = new URLSearchParams({
    query,
    size: String(opts.size || 15),
  });
  if (opts.lng && opts.lat) {
    params.set('x', String(opts.lng));
    params.set('y', String(opts.lat));
    params.set('radius', String(opts.radius || 20000));
  }
  const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_KEY}` },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Kakao ${res.status}`);
  const data = await res.json();
  // 앱 검색 UI가 쓰는 형태로 정규화 (lat/lon/display_name)
  return (data.documents || []).map(d => ({
    lat: d.y,
    lon: d.x,
    display_name: [d.place_name, d.road_address_name || d.address_name].filter(Boolean).join(', '),
    place_name: d.place_name,
    address: d.road_address_name || d.address_name || '',
    category: d.category_name || '',
    phone: d.phone || '',
    source: 'kakao',
  }));
}

// ================== 커뮤니티 스팟 ==================
// 로그인 없이 익명 토큰으로 자기 스팟만 삭제 가능
// 신고 3회 누적 시 자동 숨김

const jsonRes = (data, opts = {}) => new Response(JSON.stringify(data), {
  status: opts.status || 200,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    ...(opts.headers || {}),
  },
});

// 간단한 금칙어 (오·남용 최소 방어. 완벽하지 않음)
const BLOCKED_WORDS = ['씨발', '병신', 'fuck', 'shit', '개새'];
function containsBlocked(text) {
  const t = (text || '').toLowerCase();
  return BLOCKED_WORDS.some(w => t.includes(w));
}

async function handleSpots(url, request, env, cors) {
  const parts = url.pathname.split('/').filter(Boolean); // ["spots"] or ["spots", ID] or ["spots", ID, "report"]
  const method = request.method;

  try {
    // GET /spots  → 목록
    if (parts.length === 1 && method === 'GET') {
      const rows = await env.DB.prepare(
        `SELECT id, lat, lng, name, descr, rating, author_name, created_at, reports
         FROM spots
         WHERE hidden = 0
         ORDER BY created_at DESC
         LIMIT 500`
      ).all();
      return jsonRes({ spots: rows.results || [] }, { headers: cors });
    }

    // POST /spots  → 생성
    if (parts.length === 1 && method === 'POST') {
      const body = await request.json();
      const { lat, lng, name, desc = '', rating = 0, author_name = '익명', author_token } = body;
      if (typeof lat !== 'number' || typeof lng !== 'number' || !name || !author_token) {
        return jsonRes({ error: 'lat/lng/name/author_token 필요' }, { status: 400, headers: cors });
      }
      if (name.length > 100 || desc.length > 500 || author_name.length > 30) {
        return jsonRes({ error: '입력 길이 초과' }, { status: 400, headers: cors });
      }
      if (containsBlocked(name) || containsBlocked(desc) || containsBlocked(author_name)) {
        return jsonRes({ error: '부적절한 표현 포함' }, { status: 400, headers: cors });
      }
      // 레이트 리밋: 같은 토큰이 1분 안에 5개 초과 저장 방지
      const rate = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM spots WHERE author_token = ? AND created_at > datetime('now', '-1 minute')`
      ).bind(author_token).first();
      if ((rate?.c || 0) >= 5) {
        return jsonRes({ error: '잠시 후 다시 시도해주세요 (분당 5개 제한)' }, { status: 429, headers: cors });
      }

      const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const createdAt = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO spots (id, lat, lng, name, descr, rating, author_name, author_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, lat, lng, name.trim(), (desc || '').trim(), rating, (author_name || '익명').trim(), author_token, createdAt).run();
      return jsonRes({ id, created_at: createdAt }, { status: 201, headers: cors });
    }

    // DELETE /spots/:id?token=xxx
    if (parts.length === 2 && method === 'DELETE') {
      const id = parts[1];
      const token = url.searchParams.get('token');
      if (!token) return jsonRes({ error: 'token 필요' }, { status: 400, headers: cors });
      const row = await env.DB.prepare(`SELECT author_token FROM spots WHERE id = ?`).bind(id).first();
      if (!row) return jsonRes({ error: 'not found' }, { status: 404, headers: cors });
      if (row.author_token !== token) return jsonRes({ error: '본인만 삭제 가능' }, { status: 403, headers: cors });
      await env.DB.prepare(`DELETE FROM spots WHERE id = ?`).bind(id).run();
      return jsonRes({ ok: true }, { headers: cors });
    }

    // POST /spots/:id/report  { token }
    if (parts.length === 3 && parts[2] === 'report' && method === 'POST') {
      const id = parts[1];
      const body = await request.json().catch(() => ({}));
      const token = body.token;
      if (!token) return jsonRes({ error: 'token 필요' }, { status: 400, headers: cors });

      const spot = await env.DB.prepare(`SELECT author_token FROM spots WHERE id = ?`).bind(id).first();
      if (!spot) return jsonRes({ error: 'not found' }, { status: 404, headers: cors });
      if (spot.author_token === token) return jsonRes({ error: '자기 스팟은 신고 불가' }, { status: 400, headers: cors });

      try {
        await env.DB.prepare(
          `INSERT INTO reports (spot_id, reporter_token, created_at) VALUES (?, ?, ?)`
        ).bind(id, token, new Date().toISOString()).run();
      } catch { /* 중복 신고 무시 */ }

      const cnt = await env.DB.prepare(`SELECT COUNT(*) AS c FROM reports WHERE spot_id = ?`).bind(id).first();
      const total = cnt?.c || 0;
      const hidden = total >= 3;
      if (hidden) {
        await env.DB.prepare(`UPDATE spots SET hidden = 1, reports = ? WHERE id = ?`).bind(total, id).run();
      } else {
        await env.DB.prepare(`UPDATE spots SET reports = ? WHERE id = ?`).bind(total, id).run();
      }
      return jsonRes({ reports: total, hidden }, { headers: cors });
    }

    return jsonRes({ error: 'Not Found' }, { status: 404, headers: cors });
  } catch (e) {
    return jsonRes({ error: e.message }, { status: 500, headers: cors });
  }
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

    const url = new URL(request.url);
    // 라우팅:
    //   /health              → ok
    //   /zones?bbox=...      → V-World 세 레이어 통합 GeoJSON
    //   /search?q=...        → Kakao 로컬 검색 결과
    if (url.pathname === '/health') {
      return new Response('ok', { headers: cors });
    }

    // ---------- 커뮤니티 스팟 (D1) ----------
    if (url.pathname === '/spots' || url.pathname.startsWith('/spots/')) {
      return await handleSpots(url, request, env, cors);
    }

    if (url.pathname === '/search') {
      if (!env.KAKAO_KEY) {
        return new Response(JSON.stringify({ error: 'KAKAO_KEY not configured' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
      }
      const q = url.searchParams.get('q');
      if (!q) return new Response('[]', { headers: { 'Content-Type': 'application/json', ...cors } });
      try {
        const results = await kakaoSearch(env, q, {
          lat: url.searchParams.get('lat'),
          lng: url.searchParams.get('lng'),
        });
        return new Response(JSON.stringify(results), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...cors },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...cors } });
      }
    }

    if (!env.VWORLD_KEY) {
      return new Response(JSON.stringify({ error: 'VWORLD_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
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
