// Cloudflare Worker that keeps NAVER Maps and Opinet credentials out of GitHub Pages.
// Required secrets: NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET, NAVER_SEARCH_CLIENT_ID,
// NAVER_SEARCH_CLIENT_SECRET, OPINET_API_KEY.
// Optional secret: ALLOWED_ORIGIN.
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    if (url.pathname === '/opinet') return opinet(url, origin, env);
    if (url.pathname === '/places') return places(url, origin, env);
    if (url.pathname === '/region') return region(url, origin, env);
    if (url.pathname !== '/route') return new Response('Not found', { status: 404 });
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
    const sido = item.addressElements?.find((element) => element.types?.includes('SIDO'));
    const name = sido?.longName || sido?.shortName || '';
    if (!name) throw new Error(`출발지의 시·도를 확인할 수 없습니다: ${query}`);
    return json({ query, sido: name, address: item.roadAddress || item.jibunAddress || '' }, 200, origin, env);
  } catch (error) { return json({ error: error.message || '출발지 지역 조회에 실패했습니다.' }, 502, origin, env); }
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
    const area = url.searchParams.get('area') || '';
    const requestedDate = (url.searchParams.get('date') || '').replaceAll('-', '');
    const areaCode = area.slice(0, 4);
    let match;
    let source = '';
    let notice = '';

    if (requestedDate && areaCode) {
      const params = { out: 'json', code: env.OPINET_API_KEY, area: areaCode, date: requestedDate };
      if (fuel !== 'lpg') params.prodcd = fuel === 'hybrid' ? 'B027' : prodcd;
      const dated = new URL('https://www.opinet.co.kr/api/dateAreaAvgRecentPrice.do');
      dated.search = new URLSearchParams(params).toString();
      const items = oilList(await opinetJson(dated));
      const accepted = fuel === 'lpg' ? ['K105', 'K015'] : [params.prodcd];
      match = items.find((item) => String(item.DATE || '') === requestedDate && (!item.PRODCD || accepted.includes(item.PRODCD)) && (!item.AREA_CD || String(item.AREA_CD).startsWith(areaCode)));
      if (match) source = '오피넷 해당일 지역 평균';
    }

    if (!match) {
      const current = new URL('https://www.opinet.co.kr/api/avgSidoPrice.do');
      current.search = new URLSearchParams({ out: 'json', code: env.OPINET_API_KEY, sido: area.slice(0, 2), prodcd }).toString();
      let items = oilList(await opinetJson(current));
      match = items.find((item) => (!item.PRODCD || item.PRODCD === prodcd) && (!area || String(item.SIDOCD || item.AREA_CD || '').startsWith(area.slice(0, 2))));
      if (match) {
        source = area ? '오피넷 현재 시도 평균' : '오피넷 현재 전국 평균';
        if (requestedDate) notice = '선택일의 확정 유가가 없어 현재 지역 평균을 적용했습니다.';
      }
      if (!match) {
        const national = new URL('https://www.opinet.co.kr/api/avgAllPrice.do');
        national.search = new URLSearchParams({ out: 'json', code: env.OPINET_API_KEY }).toString();
        items = oilList(await opinetJson(national));
        match = items.find((item) => item.PRODCD === prodcd);
        if (match) {
          source = '오피넷 현재 전국 평균';
          if (requestedDate) notice = '선택일의 지역 확정 유가가 없어 현재 전국 평균을 적용했습니다.';
        }
      }
    }
    if (!match || !Number(match.PRICE)) throw new Error('오피넷이 가격 데이터를 반환하지 않았습니다. 인증키와 서비스 권한을 확인해 주세요.');
    return json({ price: Number(match.PRICE), tradeDate: match.DATE || match.TRADE_DT || new Date().toISOString().slice(0, 10).replaceAll('-', ''), source, areaCode: match.SIDOCD || match.AREA_CD || area, productCode: match.PRODCD || prodcd, notice }, 200, origin, env);
  } catch (error) {
    return json({ error: error.message || '오피넷 조회에 실패했습니다.' }, 502, origin, env);
  }
}

function productCode(fuel) { return { gasoline: 'B027', diesel: 'D047', lpg: 'K015', hybrid: 'B027' }[fuel] || 'B027'; }
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

function corsHeaders(origin, env) {
  return origin && (!env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    : {};
}
