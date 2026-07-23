# 여비처리기 인수인계서

작성일: 2026-07-22

## 프로젝트 정보

- GitHub 저장소: `kimjeyeong/expense_manager`
- GitHub Pages: <https://kimjeyeong.github.io/expense_manager/>
- 로컬 경로: `C:\Users\01057\OneDrive\바탕 화면\광양시청 관련\여비처리기`
- 정적 프론트엔드: `public/`
- Cloudflare Worker: `worker/naver-route-proxy.js`
- Worker 주소: `https://expense-manager-route-proxy.gwangyang-expense.workers.dev`

## 현재 구조

GitHub Pages는 정적 사이트라 API 비밀키를 보관하거나 서버 API를 직접 실행할 수 없다. 따라서 지도, 장소검색, 오피넷은 Cloudflare Worker를 경유한다.

```text
GitHub Pages 브라우저 앱
  └─ Cloudflare Worker
       ├─ NAVER Maps Geocoding / Directions 5
       ├─ NAVER API HUB Local Search
       └─ Opinet
```

Worker URL은 비밀값이 아니므로 `public/app.js`의 `defaultWorkerRouteUrl`에 고정했다. 사용자는 관리자 설정에서 Worker URL을 입력할 필요가 없다.

## GitHub Secrets

값은 절대 코드나 채팅에 기록하지 않는다. GitHub 저장소의 `Settings → Secrets and variables → Actions → Secrets`에 아래 이름으로 등록한다.

| Secret 이름 | 용도 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Worker 배포 권한 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 |
| `NAVER_CLIENT_ID` | NAVER Maps 앱 Client ID |
| `NAVER_CLIENT_SECRET` | NAVER Maps 앱 Client Secret |
| `NAVER_SEARCH_CLIENT_ID` | NAVER API HUB Search Local 앱 Client ID |
| `NAVER_SEARCH_CLIENT_SECRET` | NAVER API HUB Search Local 앱 Client Secret |
| `OPINET_API_KEY` | 오피넷 인증키 |
| `ALLOWED_ORIGIN` | `https://kimjeyeong.github.io` |

`.github/workflows/deploy-route-proxy.yml`이 위 GitHub Secrets를 Cloudflare Worker Secret으로 업로드한다. Secret 값을 수정한 경우에는 자동 배포되지 않으므로 GitHub Actions에서 `Deploy Naver Maps route proxy` 워크플로를 수동 실행해야 한다.

## 구현 및 동작 상태

### 정상 확인됨

- GitHub Pages 배포 성공.
- Cloudflare Worker 배포 성공.
- 오피넷: `/opinet` 엔드포인트 응답 확인.
- 장소검색: `/places?query=서울역` 엔드포인트 응답 확인.
  - 서울역 공항철도, 서울역(고속철도) 등 최대 5개 결과를 반환한다.
- 앱의 `상세 출장지` 입력칸에 **장소 검색** 버튼을 추가했다.
  - 장소명을 입력하고 결과를 선택하면 도로명/지번 주소가 상세 출장지에 들어간다.
- 차량 기준연비 입력은 `step="0.01"`로 소수점 둘째 자리까지 입력 가능하다.
- 관리자 설정의 숙박 상한 3개 입력칸 레이아웃을 동일 3열로 수정했다.
- Worker URL은 앱의 고정값으로 자동 적용된다.

### 길찾기 401 원인 규명 및 수정 (2026-07-22)

`/route`가 반환하던 오류:

```text
자동차 경로 조회 오류(401): {"error":{"errorCode":"210","message":"Permission Denied","details":"A subscription to the API is required."}}
```

**원인은 인증키나 구독이 아니라 호출 도메인이었다.**

배포본을 직접 호출해 확인한 결과, 같은 인증키로 진행되는 지오코딩(`maps.apigw.ntruss.com/map-geocode/v2/geocode`)은 출발지·도착지 모두 성공했다. 지오코딩이 실패했다면 `주소 검색 오류(401)`이 났어야 하는데, 오류는 Directions 호출 단계에서만 발생했다. 즉 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`는 유효하고 Maps 앱 구독도 정상이다.

문제는 지오코딩만 신규 게이트웨이(`maps.apigw.ntruss.com`)를 쓰고, Directions 5는 구 게이트웨이(`naveropenapi.apigw.ntruss.com`)를 쓰고 있었다는 점이다. 신규 NCP Maps 앱은 구 도메인에 구독이 없어 `errorCode 210`을 돌려준다.

수정 내용:

- `worker/naver-route-proxy.js`: Directions 호출을 `https://maps.apigw.ntruss.com/map-direction/v1/driving`로 변경.
- `server.js`: 로컬 개발 서버도 동일하게 변경.
- `test/server.test.js`: 모든 NAVER 호출이 `https://maps.apigw.ntruss.com/`로 나가는지 검증하는 어서션 추가(회귀 방지).

배포 및 검증:

1. 변경을 `main`에 푸시하면 `worker/**` 경로 변경이므로 `Deploy Naver Maps route proxy`가 자동 실행된다.
2. 배포 후 아래로 실응답을 확인한다.

```text
https://expense-manager-route-proxy.gwangyang-expense.workers.dev/route?origin=%EA%B4%91%EC%96%91%EC%8B%9C%EC%B2%AD&destination=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EC%9A%A9%EC%82%B0%EA%B5%AC%20%ED%95%9C%EA%B0%95%EB%8C%80%EB%A1%9C%20405
```

`광양시청` → `전라남도 광양시 시청로 33` 보정은 Worker에 반영되어 있고, 위 테스트 호출에서 지오코딩이 성공한 것으로 보아 배포본에도 정상 반영되어 있다.

### 남은 개선 후보 (동작에는 영향 없음)

- Worker의 404/403 응답에는 CORS 헤더가 없어, 브라우저에서 경로를 잘못 호출하면 실제 메시지 대신 CORS 오류로 보인다.
- Worker의 `/route`는 `route.trafast`만 읽고, `server.js`에 있는 `traoptimal` 폴백이 없다.
- `광양시청` 주소 보정이 Worker에만 있고 `server.js`에는 없다.

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `public/app.js` | 화면, 장소검색 UI, 거리/유가 조회, Worker 기본 URL |
| `public/default-data.json` | 초기 설정 및 차량 기준연비 |
| `public/styles.css` | 관리자 설정과 장소검색 결과 UI |
| `worker/naver-route-proxy.js` | `/route`, `/places`, `/opinet` API 프록시 |
| `.github/workflows/deploy-route-proxy.yml` | GitHub Secret을 Worker Secret으로 업로드 및 Worker 배포 |
| `.github/workflows/deploy-pages.yml` | GitHub Pages 배포 |

## Worker 엔드포인트

| 경로 | 설명 |
| --- | --- |
| `/route?origin=...&destination=...` | Naver Geocoding + Directions 5로 왕복 거리 조회 |
| `/places?query=서울역` | NAVER API HUB 지역/장소 검색, 최대 5개 결과 |
| `/region?query=광양시청` | 출발지의 시·도와 시·군·구 이름 반환 (유가 조회 지역 결정용) |
| `/staticmap?origin=...&destination=...` | 출발지·도착지 마커 지도 이미지 (증빙용) |
| `/opinet?area=20&sigungu=광양시&fuel=gasoline&date=YYYY-MM-DD` | 지역 평균 유가 조회 |

## 유가 조회 단위 (2026-07-23)

오피넷 집계 최소 단위는 **시·군·구**입니다. 동·읍·면 단위 API는 없습니다(`areaCode.do?area=2010`이 빈 결과, 6자리 코드도 빈 결과). 좌표 반경 내 개별 주유소를 받아 직접 평균 내는 우회로가 있으나, 오피넷 공표값이 아닌 자체 산출값이 되므로 정산 근거로는 쓰지 않습니다.

`/opinet` 폴백 순서:

1. 해당일 시·군·구 평균 (`dateAreaAvgRecentPrice.do`, area=4자리)
2. 해당일 시·도 평균 (`dateAreaAvgRecentPrice.do`, area=2자리)
3. 현재 시·군·구 평균 (`avgSigunPrice.do`)
4. 현재 시·도 평균 (`avgSidoPrice.do`)
5. 현재 전국 평균 (`avgAllPrice.do`)

주의할 점:

- **시·군·구 코드를 표로 굳히지 않습니다.** 2026-07-01 시·도 통합으로 코드가 재편됐고, 낡은 표는 조용히 틀린 단가를 만듭니다. `areaCode.do`로 조회 시점에 확인합니다.
- **오피넷에 구 단위가 없는 시가 있습니다.** 지오코딩이 `성남시 분당구`를 주지만 오피넷은 `성남시`(0202)까지입니다. 이름 매칭은 정확히 일치 → 최장 접두 순이며, `server.js`의 `matchArea`에 회귀 테스트가 있습니다.
- **당일 확정 유가는 없습니다.** 오피넷 확정 평균은 며칠 뒤 공표라 당일 조회는 3번으로 폴백합니다. 출장 며칠 뒤에 정산하면 1번이 잡힙니다.
- 정산서 근거란에 `기준 지점`(출발지)과 `집계 지역`(실제 적용 단위)을 나눠 인쇄합니다. 폴백이 일어나면 둘이 달라지므로 검토자가 확인할 수 있어야 합니다.

## 최근 병합 PR

- PR #3: Opinet Worker 프록시
- PR #4: 연비 소수점 둘째 자리 입력
- PR #5: 숙박 상한 입력 레이아웃 수정
- PR #6: NAVER API HUB 장소검색 기능
- PR #7: Worker URL 자동 고정 설정

## 검증 명령

```powershell
npm test
node --check public/app.js
node --check worker/naver-route-proxy.js
```

## 다음 담당자가 우선 할 일

1. Naver Maps Directions 5의 401 권한 문제 해결 및 `/route` 실응답 확인.
2. GitHub Pages에서 `서울역` 장소검색 → 결과 선택 → 거리 조회 흐름을 브라우저로 최종 확인.
3. 필요하면 장소검색 결과에 역 종류, 주소, 선택 상태를 더 보기 좋게 개선.
