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

시크릿은 `.dev.vars` (git에 커밋 안 됨) 에서 읽습니다.

```bash
cp .dev.vars.example .dev.vars     # 처음 한 번만
# .dev.vars 열어서 실제 키 값 채우기
npx wrangler dev
# → http://localhost:8787/search?q=통통통놀이터
# → http://localhost:8787/zones
```

## 키 관리 규칙
- 커밋 금지: `.dev.vars`, `.env` (모두 `.gitignore` 처리됨)
- 프로덕션 시크릿은 Cloudflare가 관리 → `npx wrangler secret put KAKAO_KEY`
- 노출됐다 싶으면 즉시 Kakao/V-World 콘솔에서 **재발급(Regenerate)**

## 캐싱
Cloudflare edge cache로 1시간 유지. 데이터가 자주 바뀌지 않는 특성 반영.
