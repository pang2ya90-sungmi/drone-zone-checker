# V-World 프록시 Worker

GitHub Pages 프론트에서 V-World WFS를 안전하게 부르기 위한 Cloudflare Worker.

## 왜 필요한가
V-World API 키는 도메인 제한을 걸어도 브라우저에 노출되면 남용 위험이 있음. Worker가 키를 감추고 CORS도 처리.

## 배포

```bash
cd worker
npm install
npx wrangler login          # 브라우저 인증 (Cloudflare 계정 필요, 무료)

# V-World 키 (구역 데이터)
npx wrangler secret put VWORLD_KEY

# Kakao 키 (로컬 검색 - 소규모 POI까지)
npx wrangler secret put KAKAO_KEY

# (선택) V-World 키에 도메인 제한이 걸려 있다면
# npx wrangler secret put VWORLD_DOMAIN

npm run deploy
```

배포 완료되면 `https://drone-zone-proxy.<유저>.workers.dev` 형태 URL이 나옵니다.

## 엔드포인트
- `GET /health` — 헬스체크
- `GET /zones?bbox=<lng_min,lat_min,lng_max,lat_max,EPSG:4326>` — V-World 세 레이어(금지/제한/UA) 통합 GeoJSON
  - bbox 생략 시 한국 전체
- `GET /search?q=<keyword>&lat=<lat>&lng=<lng>` — Kakao 로컬 검색 (POI)
  - lat/lng 넣으면 해당 위치 반경 20km 우선
  - 응답: `[{lat, lon, place_name, address, category, phone, display_name}]`

## 로컬 테스트
```bash
npx wrangler dev
# → http://localhost:8787/zones
```

## 캐싱
Cloudflare edge cache로 1시간 유지. 데이터가 자주 바뀌지 않는 특성 반영.
