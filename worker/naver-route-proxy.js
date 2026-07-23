// Cloudflare Worker that keeps NAVER Maps and Opinet credentials out of GitHub Pages.
// Required secrets: NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET, NAVER_SEARCH_CLIENT_ID,
// NAVER_SEARCH_CLIENT_SECRET, OPINET_API_KEY.
// Optional secret: ALLOWED_ORIGIN.
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigin(origin, env)) return json({ error: `허용되지 않은 접근입니다: ${origin || 'Origin 없음'}` }, 403, origin, env);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    if (url.pathname === '/opinet') return opinet(url, origin, env);
    if (url.pathname === '/places') return places(url, origin, env);
    if (url.pathname === '/region') return region(url, origin, env);
    if (url.pathname === '/staticmap') return staticMap(url, origin, env);
    if (url.pathname !== '/route') return json({ error: `없는 경로입니다: ${url.pathname}` }, 404, origin, env);
    const startAddress = url.searchParams.get('origin')?.trim();
    const goalAddress = url.searchParams.get('destination')?.trim();
    if (!startAddress || !goalAddress) return json({ error: '출발지와 도착지를 모두 입력해 주세요.' }, 400, origin, env);
    if (!env.NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET) return json({ error: '네이버 Maps 인증키가 설정되지 않았습니다.' }, 500, origin, env);

    try {
      const [start, goal] = await Promise.all([geocode(startAddress, env), geocode(goalAddress, env)]);
      // Directions 5는 지오코딩과 같은 maps.apigw.ntruss.com 게이트웨이를 사용합니다.
      // 구 naveropenapi.apigw.ntruss.com 도메인은 신규 앱에서 401(errorCode 210)을 반환합니다.
      const directionsUrl = new URL('https://maps.apigw.ntruss.com/map-direction/v1/driving');
      directionsUrl.search = new URLSearchParams({ start: coords(start), goal: coords(goal), option: 'trafast', lang: 'ko' }).toString();
      const response = await fetch(directionsUrl, { headers: mapHeaders(env) });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`자동차 경로 조회 오류(${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
      }
      const route = (await response.json()).route?.trafast?.[0];
      const meters = Number(route?.summary?.distance);
      if (!Number.isFinite(meters)) throw new Error('경로 거리를 받지 못했습니다.');
      return json({ origin: startAddress, destination: goalAddress, oneWayMeters: meters, oneWayKm: Number((meters / 1000).toFixed(1)), roundTripKm: Number((meters / 500).toFixed(1)) }, 200, origin, env);
    } catch (error) { return json({ error: error.message || '경로 조회에 실패했습니다.' }, 502, origin, env); }
  }
};

function mapHeaders(env) {
  return { 'x-ncp-apigw-api-key-id': env.NAVER_MAP_CLIENT_ID, 'x-ncp-apigw-api-key': env.NAVER_MAP_CLIENT_SECRET, Accept: 'application/json' };
}

function coords(item) { return `${item.x},${item.y}`; }

async function geocode(address, env) {
  const apiUrl = new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');
  // "광양시청"은 지오코딩 결과가 없을 수 있어, 이 서비스의 고정 출발지는 정확한 도로명 주소로 보정합니다.
  apiUrl.searchParams.set('query', address === '광양시청' ? '전라남도 광양시 시청로 33' : address);
  const response = await fetch(apiUrl, { headers: mapHeaders(env) });
  if (!response.ok) throw new Error(`주소 검색 오류(${response.status})`);
  const item = (await response.json()).addresses?.[0];
  if (!item?.x || !item?.y) throw new Error(`주소를 찾을 수 없습니다: ${address}`);
  return item;
}

// 유가는 출발지 기준으로 조회하므로, 자유 입력된 출발지에서 시·도 이름을 뽑아 줍니다.
async function region(url, origin, env) {
  const query = url.searchParams.get('query')?.trim();
  if (!query) return json({ error: '출발지를 입력해 주세요.' }, 400, origin, env);
  if (!env.NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET) return json({ error: '네이버 Maps 인증키가 설정되지 않았습니다.' }, 500, origin, env);
  try {
    const item = await geocode(query, env);
    const element = (type) => {
      const found = item.addressElements?.find((x) => x.types?.includes(type));
      return found?.longName || found?.shortName || '';
    };
    const name = element('SIDO');
    if (!name) throw new Error(`출발지의 시·도를 확인할 수 없습니다: ${query}`);
    // 유가는 시·군·구 평균이 시·도 평균보다 실제 주유 지점에 가깝습니다.
    // 시·군·구를 못 얻어도 시·도만으로 조회가 되므로 여기서 실패시키지 않습니다.
    return json({ query, sido: name, sigungu: element('SIGUGUN'), address: item.roadAddress || item.jibunAddress || '' }, 200, origin, env);
  } catch (error) { return json({ error: error.message || '출발지 지역 조회에 실패했습니다.' }, 502, origin, env); }
}

// 출발지·도착지에 마커를 찍은 지도 이미지를 정산 증빙용으로 돌려줍니다.
// Static Map은 Geocoding·Directions 5와 같은 게이트웨이·같은 인증키를 씁니다.
// 콘솔에서 Static Map을 구독하지 않았으면 여기서 실패하고, 앱은 지도 없이 계속 동작합니다.
async function staticMap(url, origin, env) {
  const from = url.searchParams.get('origin')?.trim();
  const to = url.searchParams.get('destination')?.trim();
  if (!from || !to) return json({ error: '출발지와 도착지를 모두 입력해 주세요.' }, 400, origin, env);
  if (!env.NAVER_MAP_CLIENT_ID || !env.NAVER_MAP_CLIENT_SECRET) return json({ error: '네이버 Maps 인증키가 설정되지 않았습니다.' }, 500, origin, env);
  try {
    const [start, goal] = await Promise.all([geocode(from, env), geocode(to, env)]);
    const width = 700, height = 420;
    const view = mapView(start, goal, width, height);
    const map = new URL('https://maps.apigw.ntruss.com/map-static/v2/raster');
    map.searchParams.set('center', view.center);
    map.searchParams.set('level', String(view.level));
    map.searchParams.set('w', String(width));
    map.searchParams.set('h', String(height));
    map.searchParams.set('format', 'jpg');
    map.searchParams.set('lang', 'ko');
    map.searchParams.append('markers', `type:d|size:mid|color:blue|pos:${ax} ${ay}`);
    map.searchParams.append('markers', `type:d|size:mid|color:red|pos:${bx} ${by}`);
    const response = await fetch(map, { headers: mapHeaders(env) });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`지도 이미지 조회 오류(${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    return json({ image: `data:image/jpeg;base64,${base64(await response.arrayBuffer())}` }, 200, origin, env);
  } catch (error) { return json({ error: error.message || '지도 이미지 조회에 실패했습니다.' }, 502, origin, env); }
}

// 마커 핀은 좌표점이 뾰족한 아래 끝이고 그림은 위로 뻗습니다(실측 가로 38px·세로 49px).
// 좌표점이 화면 안에 있어도 가장자리에 붙으면 핀 머리가 잘리므로 미리 자리를 비워 둡니다.
const MARKER_WIDTH = 44;
const MARKER_HEIGHT = 56;
const TILE = 256;
// 네이버 static map의 level은 표준 타일 줌보다 1 작습니다. 배포본 실측으로 확인했습니다:
// level 7에서 위도 1도가 약 224px(줌 8), level 10에서 경도 1도가 약 1452px(줌 11).
const LEVEL_OFFSET = 1;

function mercatorY(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)); }

// 두 지점이 핀까지 온전히 들어가는 가장 가까운 배율과 중심을 고릅니다.
function mapView(start, goal, width, height) {
  const ax = Number(start.x), ay = Number(start.y), bx = Number(goal.x), by = Number(goal.y);
  // 두 마커는 중심을 사이에 두고 마주 놓이므로, 위아래·좌우로 같은 여백을 잡습니다.
  const spanX = Math.max(1, width - MARKER_WIDTH);
  const spanY = Math.max(1, height - 2 * MARKER_HEIGHT);
  const lngGap = Math.abs(ax - bx) / 360;
  const latGap = Math.abs(mercatorY(ay) - mercatorY(by)) / (2 * Math.PI);
  const world = Math.min(lngGap > 0 ? spanX / lngGap : Infinity, latGap > 0 ? spanY / latGap : Infinity);
  // 출발지와 도착지가 같으면 배율을 정할 수 없으므로 가장 가까이 본 값으로 둡니다.
  const zoom = Number.isFinite(world) ? Math.floor(Math.log2(world / TILE)) : 20;
  // 세로 중심은 위도 평균이 아니라 투영 좌표의 중간이어야 두 마커가 중앙에 대칭으로 놓입니다.
  const centerLat = Math.atan(Math.sinh((mercatorY(ay) + mercatorY(by)) / 2)) * 180 / Math.PI;
  return { level: Math.max(1, Math.min(14, zoom - LEVEL_OFFSET)), center: `${(ax + bx) / 2},${centerLat}` };
}

// 큰 배열을 한 번에 펼치면 스택이 넘치므로 나눠서 인코딩합니다.
function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function places(url, origin, env) {
  const query = url.searchParams.get('query')?.trim();
  if (!query) return json({ error: '검색할 장소명을 입력해 주세요.' }, 400, origin, env);
  if (!env.NAVER_SEARCH_CLIENT_ID || !env.NAVER_SEARCH_CLIENT_SECRET) return json({ error: '네이버 장소검색 인증키가 설정되지 않았습니다.' }, 500, origin, env);
  try {
    const searchUrl = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local');
    // sort는 random(정확도)만 씁니다. comment(리뷰순)로 바꾸면 "서울역"에
    // 역 대신 역사 안 상가(마트·햄버거·약국)가 올라옵니다.
    searchUrl.search = new URLSearchParams({ query, display: '5', start: '1', sort: 'random', format: 'json' }).toString();
    const response = await fetch(searchUrl, { headers: { 'x-ncp-apigw-api-key-id': env.NAVER_SEARCH_CLIENT_ID, 'x-ncp-apigw-api-key': env.NAVER_SEARCH_CLIENT_SECRET, Accept: 'application/json' } });
    if (!response.ok) throw new Error(`네이버 장소검색 오류(${response.status})`);
    const data = await response.json();
    const results = (data.items || []).map((item) => ({ title: String(item.title || '').replace(/<[^>]*>/g, ''), address: item.roadAddress || item.address || '', category: item.category || '' })).filter((item) => item.address);
    // Array.prototype.sort는 안정 정렬이라, 점수가 같으면 네이버 정확도 순서를 그대로 유지합니다.
    results.sort((a, b) => placeScore(b, query) - placeScore(a, query));
    return json({ query, results }, 200, origin, env);
  } catch (error) { return json({ error: error.message || '장소검색에 실패했습니다.' }, 502, origin, env); }
}

// 출장지 주소를 찾는 검색이므로, 검색어 자체를 가리키는 대표 장소를 위로 올립니다.
// "서울역"처럼 노선별 지하철역과 상가가 뒤섞여 나오는 검색어를 위한 보정입니다.
function placeScore(item, query) {
  const title = String(item.title).replace(/\s+/g, '');
  const target = String(query).replace(/\s+/g, '');
  let score = 0;
  if (title === target) score += 10;          // 상호가 검색어와 정확히 일치
  else if (title.startsWith(target)) score += 5; // "서울역 …" 처럼 검색어로 시작
  score += categoryScore(item.category);
  return score;
}

// 같은 이름이 여러 건일 때 대표 시설(기차역·관공서)을 출입구·노선·상가보다 앞세웁니다.
function categoryScore(category) {
  const value = String(category);
  if (/기차|철도|공항/.test(value)) return 3;
  if (/관공서|공공|정부|대학/.test(value)) return 3;
  if (/지하철|전철|버스/.test(value)) return 1;
  return 0;
}

async function opinet(url, origin, env) {
  if (!env.OPINET_API_KEY) return json({ error: '오피넷 인증키가 설정되지 않았습니다.' }, 500, origin, env);
  const fuel = url.searchParams.get('fuel') || 'gasoline';
  if (['electric', 'hydrogen'].includes(fuel)) return json({ error: '전기·수소는 오피넷 대상이 아닙니다.' }, 400, origin, env);

  try {
    const prodcd = productCode(fuel);
    const sido = (url.searchParams.get('area') || '').slice(0, 2);
    const sigunguName = url.searchParams.get('sigungu')?.trim() || '';
    const requestedDate = (url.searchParams.get('date') || '').replaceAll('-', '');
    // 시·군·구 코드는 시·도 통합 같은 개편으로 바뀝니다. 표로 굳히면 그때 조용히 틀리므로
    // 오피넷이 지금 쓰는 코드를 그때그때 받아 이름으로 맞춥니다.
    const sigungu = sido && sigunguName ? await sigunguArea(sido, sigunguName, env) : null;
    let match;
    let source = '';
    let notice = '';
    let areaName = '';

    if (requestedDate && sigungu) {
      match = await datedAverage(sigungu.code, requestedDate, fuel, prodcd, env);
      if (match) { source = '오피넷 해당일 시·군·구 평균'; areaName = sigungu.name; }
    }

    if (!match && requestedDate && sido) {
      match = await datedAverage(sido, requestedDate, fuel, prodcd, env);
      if (match) {
        source = '오피넷 해당일 시·도 평균';
        areaName = String(match.AREA_NM || '');
        if (sigungu) notice = `${sigungu.name}의 해당일 확정 유가가 없어 시·도 평균을 적용했습니다.`;
      }
    }

    if (!match && sigungu) {
      const current = new URL('https://www.opinet.co.kr/api/avgSigunPrice.do');
      current.search = new URLSearchParams({ out: 'json', code: env.OPINET_API_KEY, sido, prodcd }).toString();
      match = oilList(await opinetJson(current)).find((item) => String(item.SIGUNCD || '') === sigungu.code && (!item.PRODCD || item.PRODCD === prodcd));
      if (match) {
        source = '오피넷 현재 시·군·구 평균';
        areaName = String(match.SIGUNNM || sigungu.name);
        if (requestedDate) notice = '선택일의 확정 유가가 아직 없어 현재 시·군·구 평균을 적용했습니다.';
      }
    }

    if (!match) {
      const current = new URL('https://www.opinet.co.kr/api/avgSidoPrice.do');
      current.search = new URLSearchParams({ out: 'json', code: env.OPINET_API_KEY, sido, prodcd }).toString();
      let items = oilList(await opinetJson(current));
      match = items.find((item) => (!item.PRODCD || item.PRODCD === prodcd) && (!sido || String(item.SIDOCD || item.AREA_CD || '').startsWith(sido)));
      if (match) {
        source = sido ? '오피넷 현재 시·도 평균' : '오피넷 현재 전국 평균';
        areaName = String(match.SIDONM || match.AREA_NM || '');
        if (requestedDate) notice = '선택일의 확정 유가가 아직 없어 현재 시·도 평균을 적용했습니다.';
      }
      if (!match) {
        const national = new URL('https://www.opinet.co.kr/api/avgAllPrice.do');
        national.search = new URLSearchParams({ out: 'json', code: env.OPINET_API_KEY }).toString();
        items = oilList(await opinetJson(national));
        match = items.find((item) => item.PRODCD === prodcd);
        if (match) {
          source = '오피넷 현재 전국 평균';
          areaName = '전국';
          if (requestedDate) notice = '선택일의 지역 확정 유가가 없어 현재 전국 평균을 적용했습니다.';
        }
      }
    }
    if (!match || !Number(match.PRICE)) throw new Error('오피넷이 가격 데이터를 반환하지 않았습니다. 인증키와 서비스 권한을 확인해 주세요.');
    return json({ price: Number(match.PRICE), tradeDate: match.DATE || match.TRADE_DT || new Date().toISOString().slice(0, 10).replaceAll('-', ''), source, areaCode: match.SIGUNCD || match.AREA_CD || match.SIDOCD || sido, areaName, productCode: match.PRODCD || prodcd, notice }, 200, origin, env);
  } catch (error) {
    return json({ error: error.message || '오피넷 조회에 실패했습니다.' }, 502, origin, env);
  }
}

// 해당일 지역 평균 한 건. 응답은 최근 며칠치가 함께 오므로 요청한 날짜만 골라냅니다.
async function datedAverage(area, requestedDate, fuel, prodcd, env) {
  const params = { out: 'json', code: env.OPINET_API_KEY, area, date: requestedDate };
  if (fuel !== 'lpg') params.prodcd = ['hybrid', 'phev'].includes(fuel) ? 'B027' : prodcd;
  const dated = new URL('https://www.opinet.co.kr/api/dateAreaAvgRecentPrice.do');
  dated.search = new URLSearchParams(params).toString();
  const items = oilList(await opinetJson(dated));
  const accepted = fuel === 'lpg' ? ['K105', 'K015'] : [params.prodcd];
  return items.find((item) => String(item.DATE || '') === requestedDate && (!item.PRODCD || accepted.includes(item.PRODCD)) && (!item.AREA_CD || String(item.AREA_CD) === String(area))) || null;
}

// 지오코딩이 준 시·군·구 이름을 오피넷 지역코드로 옮깁니다. 실패하면 null을 돌려
// 호출부가 시·도 평균으로 내려가게 합니다. 유가 조회 자체를 막을 일은 아닙니다.
async function sigunguArea(sido, name, env) {
  try {
    const url = new URL('https://www.opinet.co.kr/api/areaCode.do');
    url.search = new URLSearchParams({ out: 'json', code: env.OPINET_API_KEY, area: sido }).toString();
    return matchArea(oilList(await opinetJson(url)), name);
  } catch { return null; }
}

// 오피넷에 구 단위가 없는 곳이 있습니다("성남시 분당구" → 오피넷은 "성남시"까지).
// 정확히 같은 이름을 먼저 찾고, 없으면 가장 길게 겹치는 이름을 씁니다.
export function matchArea(list, name) {
  const target = String(name || '').replace(/\s+/g, '');
  if (!target) return null;
  let best = null;
  for (const item of list) {
    const areaName = String(item.AREA_NM || '').replace(/\s+/g, '');
    const code = String(item.AREA_CD || '');
    if (!areaName || !code) continue;
    if (areaName === target) return { code, name: areaName };
    if (target.startsWith(areaName) && (!best || areaName.length > best.name.length)) best = { code, name: areaName };
  }
  return best;
}

// 하이브리드와 플러그인하이브리드는 휘발유 가격을 씁니다.
function productCode(fuel) { return { gasoline: 'B027', diesel: 'D047', lpg: 'K015', hybrid: 'B027', phev: 'B027' }[fuel] || 'B027'; }
function oilList(payload) {
  const result = payload?.RESULT?.OIL ?? payload?.result?.oil ?? [];
  return Array.isArray(result) ? result : [result].filter(Boolean);
}
async function opinetJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`오피넷 응답 오류(${response.status})`);
  return response.json();
}

function json(body, status, origin, env) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin, env) };
  return new Response(JSON.stringify(body), { status, headers });
}

// ALLOWED_ORIGIN은 쉼표로 여러 개를 넣을 수 있습니다. 개발용 localhost는 본인 PC에서만
// 닿을 수 있으므로 항상 허용합니다. Origin이 아예 없는 호출(curl 등)은 계속 막습니다.
function allowedOrigin(origin, env) {
  if (!env.ALLOWED_ORIGIN) return true;
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return env.ALLOWED_ORIGIN.split(',').map((x) => x.trim()).filter(Boolean).includes(origin);
}

// 거부한 응답에도 CORS 헤더를 붙여야 브라우저가 "네트워크 실패" 대신 실제 사유를 보여 줍니다.
function corsHeaders(origin, env) {
  return origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' } : {};
}
