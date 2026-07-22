const test = require('node:test');
const assert = require('node:assert/strict');
const { productCode, dailyAreaProductCode, normalizeOilList, fetchNaverDistance } = require('../server');

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

test('네이버 지오코딩과 길찾기 결과를 왕복 거리로 변환한다', async () => {
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
  } finally { global.fetch = originalFetch; }
});
