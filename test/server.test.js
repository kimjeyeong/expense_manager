const test = require('node:test');
const assert = require('node:assert/strict');
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
