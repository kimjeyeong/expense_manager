// Cloudflare Worker: GitHub Pages에서 네이버 지도 비밀키를 안전하게 보관하기 위한 프록시입니다.
// Secrets: NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET
// Optional secret: ALLOWED_ORIGIN (예: https://kimjeyeong.github.io)
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }
    const url = new URL(request.url);
    if (url.pathname !== '/route') return new Response('Not found', { status: 404 });
    const startAddress = url.searchParams.get('origin')?.trim();
    const goalAddress = url.searchParams.get('destination')?.trim();
    if (!startAddress || !goalAddress) return json({ error: '출발지와 도착지를 모두 입력해 주세요.' }, 400, origin, env);

    const headers = {
      'x-ncp-apigw-api-key-id': env.NAVER_MAP_CLIENT_ID,
      'x-ncp-apigw-api-key': env.NAVER_MAP_CLIENT_SECRET,
      Accept: 'application/json'
    };
    try {
      const geocode = async (address) => {
        const apiUrl = new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');
        apiUrl.searchParams.set('query', address);
        const response = await fetch(apiUrl, { headers });
        if (!response.ok) throw new Error(`네이버 지오코딩 오류(${response.status})`);
        const item = (await response.json()).addresses?.[0];
        if (!item?.x || !item?.y) throw new Error(`주소를 찾을 수 없습니다: ${address}`);
        return `${item.x},${item.y}`;
      };
      const [start, goal] = await Promise.all([geocode(startAddress), geocode(goalAddress)]);
      const directionsUrl = new URL('https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving');
      directionsUrl.search = new URLSearchParams({ start, goal, option: 'trafast', lang: 'ko' }).toString();
      const response = await fetch(directionsUrl, { headers });
      if (!response.ok) throw new Error(`네이버 길찾기 오류(${response.status})`);
      const data = await response.json();
      const route = data.route?.trafast?.[0] || data.route?.traoptimal?.[0];
      const meters = Number(route?.summary?.distance);
      if (!Number.isFinite(meters)) throw new Error('경로 거리를 받지 못했습니다.');
      return json({ origin: startAddress, destination: goalAddress, oneWayMeters: meters, oneWayKm: Number((meters / 1000).toFixed(1)), roundTripKm: Number((meters / 500).toFixed(1)) }, 200, origin, env);
    } catch (error) { return json({ error: error.message || '경로 조회에 실패했습니다.' }, 502, origin, env); }
  }
};

function json(body, status, origin, env) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin && (!env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN)) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}
