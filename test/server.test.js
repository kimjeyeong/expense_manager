const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { productCode, dailyAreaProductCode, normalizeOilList, fetchNaverDistance, matchArea } = require('../server');

test('유종을 오피넷 제품코드로 변환한다', () => {
  assert.equal(productCode('gasoline'), 'B027');
  assert.equal(productCode('diesel'), 'D047');
  assert.equal(productCode('lpg'), 'K015');
  assert.equal(productCode('hybrid'), 'B027');
  assert.equal(dailyAreaProductCode('lpg'), 'K105');
  assert.equal(dailyAreaProductCode('gasoline'), 'B027');
});

test('오피넷 단일 결과와 배열 결과를 동일하게 정규화한다', () => {
  assert.deepEqual(normalizeOilList({ RESULT: { OIL: { PRICE: 1700 } } }), [{ PRICE: 1700 }]);
  assert.deepEqual(normalizeOilList({ RESULT: { OIL: [{ PRICE: 1700 }, { PRICE: 1600 }] } }), [{ PRICE: 1700 }, { PRICE: 1600 }]);
  assert.deepEqual(normalizeOilList({}), []);
});

test('지오코딩 시·군·구 이름을 오피넷 지역코드로 맞춘다', () => {
  const 전남광주 = [
    { AREA_CD: '2001', AREA_NM: '동구' }, { AREA_CD: '2002', AREA_NM: '서구' },
    { AREA_CD: '2008', AREA_NM: '순천시' }, { AREA_CD: '2010', AREA_NM: '광양시' }
  ];
  assert.deepEqual(matchArea(전남광주, '광양시'), { code: '2010', name: '광양시' });
  assert.deepEqual(matchArea(전남광주, '동구'), { code: '2001', name: '동구' });

  // 오피넷에 구 단위가 없는 시는 앞부분으로 맞춘다. 여기가 틀리면 조용히 시·도 평균으로 내려간다.
  const 경기 = [{ AREA_CD: '0201', AREA_NM: '수원시' }, { AREA_CD: '0203', AREA_NM: '성남시' }];
  assert.deepEqual(matchArea(경기, '성남시 분당구'), { code: '0203', name: '성남시' });
  assert.deepEqual(matchArea(경기, '수원시 영통구'), { code: '0201', name: '수원시' });

  // 맞는 지역이 없으면 null을 돌려 호출부가 시·도 평균으로 내려가게 한다.
  assert.equal(matchArea(경기, '광양시'), null);
  assert.equal(matchArea(전남광주, ''), null);
});

test('네이버 지도 결과를 왕복 거리로 변환한다', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    const value = String(url);
    requests.push(value);
    if (value.includes('map-geocode')) return { ok: true, json: async () => ({ addresses: [{ x: '127.7', y: '34.9' }] }) };
    return { ok: true, json: async () => ({ route: { trafast: [{ summary: { distance: 12500 } }] } }) };
  };
  try {
    const result = await fetchNaverDistance({ naverClientId: 'id', naverClientSecret: 'secret' }, new URLSearchParams({ origin: '광양시청', destination: '순천시청' }));
    assert.deepEqual(result, { origin: '광양시청', destination: '순천시청', oneWayMeters: 12500, oneWayKm: 12.5, roundTripKm: 25 });
    assert.equal(requests.filter((url) => url.includes('map-geocode')).length, 2);
    assert.ok(requests.some((url) => url.includes('map-direction')));
    // 구 naveropenapi 도메인은 신규 Maps 앱에서 401(errorCode 210)을 반환하므로 게이트웨이를 고정한다.
    assert.ok(requests.every((url) => url.startsWith('https://maps.apigw.ntruss.com/')), requests.join('\n'));
  } finally { global.fetch = originalFetch; }
});

// Worker는 ESM이라 이 CommonJS 테스트에서 require할 수 없습니다. 소스를 data URL 모듈로
// 올려 실제로 실행합니다. node --check는 구문만 보므로 지우고 남은 변수 참조를 못 잡습니다.
async function loadWorker() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'worker', 'naver-route-proxy.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64'));
}

test('경로 지도 요청이 마커 좌표와 배율을 갖춰 나간다', async () => {
  const worker = await loadWorker();
  const points = { '전라남도 광양시 시청로 33': { x: '127.6959', y: '34.9407' }, '세종특별자치시 한누리대로 2130': { x: '127.2891', y: '36.4800' } };
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes('map-geocode')) {
      const query = new URL(value).searchParams.get('query');
      return { ok: true, json: async () => ({ addresses: [points[query]] }) };
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  };
  try {
    const request = new Request('https://worker.test/staticmap?origin=' + encodeURIComponent('광양시청') + '&destination=' + encodeURIComponent('세종특별자치시 한누리대로 2130'));
    const response = await worker.default.fetch(request, { NAVER_MAP_CLIENT_ID: 'id', NAVER_MAP_CLIENT_SECRET: 'secret' });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.ok(String(body.image).startsWith('data:image/jpeg;base64,'));

    const map = new URL(calls.find((url) => url.includes('map-static')));
    const markers = map.searchParams.getAll('markers');
    // 좌표가 빠지면 지도에 마커가 아예 찍히지 않는다. 예전에 undefined가 나간 적이 있다.
    assert.ok(markers.some((x) => x.includes('color:blue') && x.includes('127.6959 34.9407')), markers.join(' | '));
    assert.ok(markers.some((x) => x.includes('color:red') && x.includes('127.2891 36.48')), markers.join(' | '));

    // 핀이 잘리지 않으려면 두 마커 간격이 핀 자리를 뺀 크기 안에 들어야 한다.
    const level = Number(map.searchParams.get('level'));
    const width = Number(map.searchParams.get('w')), height = Number(map.searchParams.get('h'));
    assert.ok(level >= 1 && level <= 14, `level=${level}`);
    const world = 256 * 2 ** (level + 1); // NAVER level은 표준 타일 줌보다 1 작다
    const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    const gapX = Math.abs(127.6959 - 127.2891) / 360 * world;
    const gapY = Math.abs(mercator(34.9407) - mercator(36.48)) / (2 * Math.PI) * world;
    assert.ok(gapX <= width - 44, `가로 ${gapX.toFixed(0)}px > ${width - 44}px`);
    assert.ok(gapY <= height - 112, `세로 ${gapY.toFixed(0)}px > ${height - 112}px`);
  } finally { global.fetch = originalFetch; }
});
