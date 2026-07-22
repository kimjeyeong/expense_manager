# GitHub Pages 네이버 Maps 거리 조회 설정

이 기능은 새 NAVER Cloud Platform `Maps` 상품의 Geocoding과 Directions 5 API로 자동차 경로 거리를 계산합니다. 대표 계정의 무료 이용량은 Directions 5 월 60,000건, Geocoding 월 3,000,000건입니다.

GitHub Pages에는 Client Secret을 저장할 수 없으므로 Cloudflare Worker를 프록시로 사용합니다. 저장소의 **Settings → Secrets and variables → Actions**에 다음 Repository secrets를 등록하세요.

- `CLOUDFLARE_API_TOKEN`: Workers 배포 권한이 있는 Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID
- `NAVER_MAP_CLIENT_ID`: Maps Application의 Client ID
- `NAVER_MAP_CLIENT_SECRET`: Maps Application의 Client Secret
- `ALLOWED_ORIGIN`: `https://kimjeyeong.github.io`

Ncloud Console에서 **Services → Application Services → Maps → Application 등록**으로 이동해 `Directions 5`, `Geocoding`을 선택하세요. 새 Maps 상품을 선택해야 무료 이용량이 적용됩니다.

`main`에 푸시하거나 **Deploy Naver Maps route proxy** Action을 수동 실행하면 Worker가 배포됩니다. 성공 후 Worker 주소 뒤에 `/route`를 붙인 값(예: `https://expense-manager-route-proxy.<계정>.workers.dev/route)을 앱의 **관리자 설정 → 네이버 지도 거리 프록시 URL**에 저장하세요.
