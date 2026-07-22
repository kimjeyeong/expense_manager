const test = require('node:test');
const assert = require('node:assert/strict');
const { productCode, dailyAreaProductCode, normalizeOilList } = require('../server');

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
