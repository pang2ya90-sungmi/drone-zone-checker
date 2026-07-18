# 드론 비행 가능 구역 체커 (프로토타입)

현재 GPS 위치가 드론 비행금지/제한 구역 안인지 실시간으로 표시하는 단일 페이지 웹앱.

## 실행

```bash
cd ~/drone-zone-checker
python3 -m http.server 8000
# 또는:  npx serve .
```

브라우저에서 `http://localhost:8000` 열기.
휴대폰에서 테스트하려면 같은 Wi-Fi에서 맥의 IP로 접속: `http://192.168.x.x:8000`.

> ⚠️ **Geolocation은 HTTPS 또는 localhost에서만 동작**합니다. 폰에서 IP 접속으로 열면 위치 권한이 안 뜰 수 있어요. 그 땐 아래 배포 옵션 참고.

## 기능
- OSM 지도 + 샘플 비행금지/제한 구역 폴리곤 오버레이
- `navigator.geolocation.watchPosition`으로 실시간 위치 추적
- Point-in-polygon 판정 → 상단 배너에 🟢 안전 / 🟡 제한 / 🔴 금지 표시
- 🧪 시뮬레이션 버튼: 지도 클릭 지점을 내 위치로 취급 (실외 이동 없이 테스트용)

## 파일
- `index.html` — 지도, UI, 판정 로직
- `zones.js` — 샘플 금지/제한 구역 GeoJSON (현재는 근사치)

## 실데이터로 교체하기

`zones.js`의 `ZONES`를 실제 데이터로 바꾸세요. 소스 후보:

1. **공공데이터포털** (data.go.kr) → "드론 비행공역" / "무인비행장치 비행공역" 검색
   → SHP/GeoJSON 다운로드 → [mapshaper](https://mapshaper.org)로 GeoJSON 변환
2. **V-World** (vworld.kr) → 개발자 API 키 발급 → WFS로 `LT_C_UAVPMAREA` 등 레이어 요청
3. **드론 원스톱 민원서비스** (drone.onestop.go.kr) → 공식 지도 시각 확인용

## 다음 단계 아이디어
- PWA 만들기 (오프라인에서도 GeoJSON 캐시로 동작)
- 250g 이하 완구용 드론 규정으로 필터링 (야간/사람 위 비행만 제한 등)
- 구역 진입 시 진동/알림
- iOS/안드로이드 홈화면 추가 아이콘 (`manifest.json`)

## 배포 (HTTPS 필요 시)
- Netlify Drop: 폴더 드래그만 하면 HTTPS URL 생성
- Vercel / Cloudflare Pages / GitHub Pages 모두 무료
