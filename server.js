const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const seed = {
  settings: {
    organization: '광양시',
    opinetKey: '',
    dailyRate: 25000,
    mealRate: 25000,
    lodgingCaps: { seoul: 100000, metro: 80000, other: 70000 },
    fallbackFuel: { gasoline: 1700, diesel: 1550, lpg: 1100, hybrid: 1700, phev: 1700, electric: 350, hydrogen: 9900 },
    ruleVersion: '공무원 여비 규정 기준(검토용)',
    approver: '회계담당자'
  },
  vehicles: [
    { id: 'type-gasoline', name: '휘발유차', fuel: 'gasoline', efficiency: 11.97, unit: 'km/L', active: true },
    { id: 'type-diesel', name: '경유차', fuel: 'diesel', efficiency: 12.52, unit: 'km/L', active: true },
    { id: 'type-lpg', name: 'LPG차', fuel: 'lpg', efficiency: 8.83, unit: 'km/L', active: true },
    { id: 'type-hybrid', name: '하이브리드차', fuel: 'hybrid', efficiency: 15.37, unit: 'km/L', active: true },
    { id: 'type-phev', name: '플러그인하이브리드차', fuel: 'phev', efficiency: 10.61, unit: 'km/L', electricEfficiency: 2.84, electricUnit: 'km/kWh', active: true },
    { id: 'type-electric', name: '전기차', fuel: 'electric', efficiency: 5.22, unit: 'km/kWh', active: true },
    { id: 'type-hydrogen', name: '수소차', fuel: 'hydrogen', efficiency: 94.9, unit: 'km/kg', active: true }
  ],
  trips: [
    {
      id: 'sample-1', employee: '김광양', department: '데이터정보과', grade: '일반직',
      purpose: '공공데이터 업무협의', startDate: '2026-07-20', endDate: '2026-07-21',
      province: '전남', city: '순천시', destination: '순천시청', transport: 'car', vehicleId: 'type-gasoline',
      distance: 52, oilPrice: 1700, oilSource: '관리자 기준단가', toll: 0, parking: 0,
      nights: 1, lodgingActual: 65000, transitActual: 0, mealProvided: 1,
      status: 'draft', notes: '', attachments: [], history: [{ at: '2026-07-22T09:00:00.000Z', action: '작성', actor: '김광양' }]
    }
  ]
};

function ensureData() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(seed, null, 2), 'utf8');
}

function loadStore() {
  ensureData();
  const store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  let changed = false;
  store.settings.fallbackFuel = { gasoline: 1700, diesel: 1550, lpg: 1100, hybrid: 1700, phev: 1700, electric: 350, hydrogen: 9900, ...(store.settings.fallbackFuel || {}) };
  if (!store.vehicles.some((vehicle) => vehicle.fuel === 'electric')) {
    const key = store.settings.opinetKey;
    store.vehicles = seed.vehicles.map((vehicle) => ({ ...vehicle }));
    store.settings.opinetKey = key;
    for (const trip of store.trips) {
      const previousFuel = trip.vehicleId === 'veh-2' ? 'diesel' : trip.vehicleId === 'veh-3' ? 'lpg' : 'gasoline';
      trip.vehicleId = `type-${previousFuel}`;
    }
    changed = true;
  }
  if (!store.vehicles.some((vehicle) => vehicle.fuel === 'hybrid')) {
    const hybrid = seed.vehicles.find((vehicle) => vehicle.fuel === 'hybrid');
    const electricIndex = store.vehicles.findIndex((vehicle) => vehicle.fuel === 'electric');
    if (electricIndex >= 0) store.vehicles.splice(electricIndex, 0, { ...hybrid });
    else store.vehicles.push({ ...hybrid });
    changed = true;
  }
  if (!store.vehicles.some((vehicle) => vehicle.fuel === 'phev')) {
    const phev = seed.vehicles.find((vehicle) => vehicle.fuel === 'phev');
    const hybridIndex = store.vehicles.findIndex((vehicle) => vehicle.fuel === 'hybrid');
    if (hybridIndex >= 0) store.vehicles.splice(hybridIndex + 1, 0, { ...phev });
    else store.vehicles.push({ ...phev });
    changed = true;
  }
  if (changed) saveStore(store);
  return store;
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(new Error('요청 파일이 너무 큽니다.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('잘못된 JSON 요청입니다.')); }
    });
    req.on('error', reject);
  });
}

function safeFile(base, requested) {
  const resolved = path.resolve(base, '.' + requested);
  return resolved.startsWith(path.resolve(base)) ? resolved : null;
}

function serveStatic(req, res, pathname) {
  const route = pathname === '/' ? '/index.html' : pathname;
  const file = safeFile(PUBLIC_DIR, route);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

function productCode(fuel) {
  return { gasoline: 'B027', diesel: 'D047', lpg: 'K015', hybrid: 'B027', phev: 'B027' }[fuel] || 'B027';
}

function dailyAreaProductCode(fuel) {
  return fuel === 'lpg' ? 'K105' : productCode(fuel);
}

function normalizeOilList(payload) {
  const result = payload?.RESULT?.OIL ?? payload?.result?.oil ?? [];
  return Array.isArray(result) ? result : [result].filter(Boolean);
}

async function naverJson(url, options, settings) {
  if (!settings.naverClientId || !settings.naverClientSecret) throw new Error('네이버 Maps 인증키를 설정해 주세요.');
  const response = await fetch(url, {
    ...options,
    headers: { 'x-ncp-apigw-api-key-id': settings.naverClientId, 'x-ncp-apigw-api-key': settings.naverClientSecret, Accept: 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`네이버 Maps API 응답 오류(${response.status})`);
  return response.json();
}

async function fetchNaverDistance(settings, query) {
  const origin = String(query.get('origin') || '').trim();
  const destination = String(query.get('destination') || '').trim();
  if (!origin || !destination) throw new Error('출발지와 도착지를 모두 입력해 주세요.');

  const geocode = async (address) => {
    const url = new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');
    url.searchParams.set('query', address);
    const data = await naverJson(url, {}, settings);
    const item = data.addresses?.[0];
    if (!item?.x || !item?.y) throw new Error(`주소를 찾을 수 없습니다: ${address}`);
    return `${item.x},${item.y}`;
  };
  const [start, goal] = await Promise.all([geocode(origin), geocode(destination)]);
  const directionUrl = new URL('https://maps.apigw.ntruss.com/map-direction/v1/driving');
  directionUrl.search = new URLSearchParams({ start, goal, option: 'trafast', lang: 'ko' }).toString();
  const directions = await naverJson(directionUrl, {}, settings);
  const route = directions.route?.trafast?.[0] || directions.route?.traoptimal?.[0];
  const distance = Number(route?.summary?.distance);
  if (!Number.isFinite(distance)) throw new Error('네이버 지도에서 경로 거리를 받지 못했습니다.');
  return { origin, destination, oneWayMeters: distance, oneWayKm: Number((distance / 1000).toFixed(1)), roundTripKm: Number((distance / 500).toFixed(1)) };
}

async function fetchOpinet(settings, query) {
  if (!settings.opinetKey) throw new Error('오피넷 인증키가 설정되지 않았습니다. data/store.json의 opinetKey를 확인해 주세요.');
  if (['electric', 'hydrogen'].includes(query.get('fuel'))) throw new Error('전기·수소 단가는 오피넷 대상이 아닙니다. 실제 충전단가를 직접 입력해 주세요.');
  const fuel = query.get('fuel');
  const prodcd = productCode(fuel);
  const area = query.get('area') || '';
  const requestedDate = (query.get('date') || '').replaceAll('-', '');
  const areaCode = area.slice(0, 4);
  let match;
  let source;
  let notice = '';

  if (requestedDate && areaCode) {
    const dailyProdcd = dailyAreaProductCode(fuel);
    const datedUrl = new URL('https://www.opinet.co.kr/api/dateAreaAvgRecentPrice.do');
    const datedParams = { out: 'json', code: settings.opinetKey, area: areaCode, date: requestedDate };
    // The guide lists K105 for regional daily LPG, while the live API can return K015.
    // Omitting the optional product filter for LPG lets us accept either response code.
    if (fuel !== 'lpg') datedParams.prodcd = dailyProdcd;
    datedUrl.search = new URLSearchParams(datedParams).toString();
    const datedResponse = await fetch(datedUrl, { signal: AbortSignal.timeout(10000) });
    if (!datedResponse.ok) throw new Error(`오피넷 일자별 지역 유가 응답 오류(${datedResponse.status})`);
    const datedItems = normalizeOilList(await datedResponse.json());
    const acceptedProductCodes = fuel === 'lpg' ? ['K105', 'K015'] : [dailyProdcd];
    match = datedItems.find((item) =>
      String(item.DATE || '') === requestedDate &&
      (!item.PRODCD || acceptedProductCodes.includes(item.PRODCD)) &&
      (!item.AREA_CD || String(item.AREA_CD).startsWith(areaCode))
    );
    if (match) source = '오피넷 해당일자 지역 평균';
  }

  if (!match) {
    const currentUrl = new URL('https://www.opinet.co.kr/api/avgSidoPrice.do');
    currentUrl.search = new URLSearchParams({ out: 'json', code: settings.opinetKey, sido: area.slice(0, 2), prodcd }).toString();
    let response = await fetch(currentUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`오피넷 응답 오류(${response.status})`);
    let payload = await response.json();
    let items = normalizeOilList(payload);
    match = items.find((x) => (!x.PRODCD || x.PRODCD === prodcd) && (!area || String(x.SIDOCD || x.AREA_CD || '').startsWith(area.slice(0, 2))));
    if (match) {
      source = area ? '오피넷 현재 시도 평균' : '오피넷 현재 전국 평균';
      if (requestedDate) notice = '선택일자의 확정 유가가 아직 없어 현재 지역 평균을 적용했습니다.';
    }

    if (!match) {
      const nationalUrl = new URL('https://www.opinet.co.kr/api/avgAllPrice.do');
      nationalUrl.search = new URLSearchParams({ out: 'json', code: settings.opinetKey }).toString();
      response = await fetch(nationalUrl, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`오피넷 전국평균 응답 오류(${response.status})`);
      payload = await response.json();
      items = normalizeOilList(payload);
      match = items.find((x) => x.PRODCD === prodcd);
      if (match) {
        source = '오피넷 현재 전국 평균';
        if (requestedDate) notice = '선택일자의 지역 확정 유가가 없어 현재 전국 평균을 적용했습니다.';
      }
    }
  }
  if (!match || !Number(match.PRICE)) throw new Error('오피넷이 가격 데이터를 반환하지 않았습니다. 인증키 활성화·이용 권한을 확인해 주세요.');
  return {
    price: Number(match.PRICE),
    tradeDate: match.DATE || match.TRADE_DT || new Date().toISOString().slice(0, 10).replaceAll('-', ''),
    source,
    areaCode: match.SIDOCD || match.AREA_CD || area,
    productCode: match.PRODCD || prodcd,
    notice
  };
}

async function api(req, res, url) {
  const store = loadStore();
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/data') return send(res, 200, { ...store, settings: { ...store.settings, opinetKey: store.settings.opinetKey ? '••••••••' : '' } });

  if (req.method === 'POST' && pathname === '/api/trips') {
    const body = await readJson(req);
    const now = new Date().toISOString();
    const trip = { ...body, id: body.id || crypto.randomUUID(), updatedAt: now };
    const index = store.trips.findIndex((x) => x.id === trip.id);
    const previous = index >= 0 ? store.trips[index] : null;
    trip.createdAt = previous?.createdAt || now;
    trip.attachments = previous?.attachments || body.attachments || [];
    trip.history = body.history || previous?.history || [];
    if (index >= 0) store.trips[index] = trip; else store.trips.unshift(trip);
    saveStore(store);
    return send(res, 200, trip);
  }

  if (req.method === 'POST' && pathname.match(/^\/api\/trips\/[^/]+\/status$/)) {
    const id = pathname.split('/')[3];
    const body = await readJson(req);
    const trip = store.trips.find((x) => x.id === id);
    if (!trip) return send(res, 404, { error: '출장 건을 찾을 수 없습니다.' });
    trip.status = body.status;
    trip.reviewNote = body.note || '';
    trip.history = trip.history || [];
    trip.history.push({ at: new Date().toISOString(), action: body.action || body.status, actor: body.actor || '검토자', note: body.note || '' });
    saveStore(store);
    return send(res, 200, trip);
  }

  if (req.method === 'POST' && pathname === '/api/attachments') {
    const body = await readJson(req);
    const trip = store.trips.find((x) => x.id === body.tripId);
    if (!trip) return send(res, 404, { error: '먼저 출장 건을 저장해 주세요.' });
    const match = /^data:([^;]+);base64,(.+)$/.exec(body.data || '');
    if (!match) return send(res, 400, { error: '첨부파일 데이터가 올바르지 않습니다.' });
    const id = crypto.randomUUID();
    const ext = path.extname(body.name || '').replace(/[^.a-zA-Z0-9]/g, '').slice(0, 8);
    const storedName = `${id}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), Buffer.from(match[2], 'base64'));
    const attachment = { id, name: body.name, type: match[1], description: body.description || '', storedName, uploadedAt: new Date().toISOString() };
    trip.attachments = trip.attachments || [];
    trip.attachments.push(attachment);
    saveStore(store);
    return send(res, 200, attachment);
  }

  if (req.method === 'DELETE' && pathname.match(/^\/api\/attachments\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    let removed;
    for (const trip of store.trips) {
      const index = (trip.attachments || []).findIndex((x) => x.id === id);
      if (index >= 0) [removed] = trip.attachments.splice(index, 1);
    }
    if (removed) {
      const file = path.join(UPLOAD_DIR, removed.storedName);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      saveStore(store);
    }
    return send(res, 200, { ok: true });
  }

  if (req.method === 'POST' && pathname === '/api/admin') {
    const body = await readJson(req);
    if (body.settings) {
      const incoming = { ...body.settings };
      if (incoming.opinetKey === '••••••••') delete incoming.opinetKey;
      store.settings = { ...store.settings, ...incoming };
    }
    if (Array.isArray(body.vehicles)) store.vehicles = body.vehicles;
    saveStore(store);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/opinet') {
    try { return send(res, 200, await fetchOpinet(store.settings, url.searchParams)); }
    catch (error) { return send(res, 502, { error: error.message }); }
  }

  if (req.method === 'GET' && pathname === '/api/directions') {
    try {
      return send(res, 200, await fetchNaverDistance({ naverClientId: process.env.NAVER_MAP_CLIENT_ID, naverClientSecret: process.env.NAVER_MAP_CLIENT_SECRET }, url.searchParams));
    } catch (error) { return send(res, 502, { error: error.message }); }
  }

  return send(res, 404, { error: 'API 경로를 찾을 수 없습니다.' });
}

ensureData();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/files/')) {
      const name = path.basename(decodeURIComponent(url.pathname.slice('/files/'.length)));
      const file = path.join(UPLOAD_DIR, name);
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      const meta = loadStore().trips.flatMap((x) => x.attachments || []).find((x) => x.storedName === name);
      res.writeHead(200, { 'Content-Type': meta?.type || 'application/octet-stream', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta?.name || name)}` });
      return fs.createReadStream(file).pipe(res);
    }
    if (serveStatic(req, res, url.pathname)) return;
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: error.message || '서버 오류가 발생했습니다.' });
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`여비처리기 실행 중: http://127.0.0.1:${PORT}`);
  });
}

module.exports = { server, productCode, dailyAreaProductCode, normalizeOilList, fetchNaverDistance };
