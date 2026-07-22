# GitHub Pages 네이버 지도 거리 조회 설정

GitHub Pages는 정적 파일만 실행하므로 오피넷과 네이버 지도처럼 비밀키가 필요한 API를 직접 호출할 수 없습니다. 네이버 Directions 5와 Geocoding API는 Client ID와 Client Secret 요청 헤더가 모두 필요하므로 Secret을 `public/` 또는 브라우저 설정에 넣으면 안 됩니다.

이 저장소에는 GitHub Actions가 Cloudflare Worker를 배포하는 워크플로가 포함되어 있습니다. GitHub 저장소의 **Settings → Secrets and variables → Actions**에 아래 Repository secrets를 등록하세요.

- `CLOUDFLARE_API_TOKEN`: Workers 배포 권한이 있는 Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID
- `NAVER_MAP_CLIENT_ID`
- `NAVER_MAP_CLIENT_SECRET`
- `ALLOWED_ORIGIN`: `https://kimjeyeong.github.io`

`main`에 푸시하면 **Deploy Naver route proxy** Action이 실행되어 Worker secret으로 값을 전달합니다. 성공 후 Worker 주소(기본값: `https://expense-manager-route-proxy.<계정>.workers.dev/route`)를 앱의 **관리자 설정 → 네이버 지도 거리 프록시 URL**에 저장합니다. 이후 출장 작성의 교통·여비 단계에서 출발지와 상세 출장지를 입력하고 **출발지·도착지로 왕복 거리 조회**를 누르면 네이버 경로의 편도 거리 × 2가 자동 입력됩니다.

로컬 서버로 실행할 경우에는 환경 변수 `NAVER_MAP_CLIENT_ID`, `NAVER_MAP_CLIENT_SECRET`를 설정하면 별도 프록시 URL 없이 동일하게 동작합니다.
