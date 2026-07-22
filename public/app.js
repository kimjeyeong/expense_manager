const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;
const truncateOnes = (n) => Math.floor(Math.max(0, Number(n) || 0) / 10) * 10;
const statusLabel = { draft: '작성중', completed: '정산완료', submitted: '정산완료', approved: '정산완료', rejected: '작성중', paid: '정산완료' };
const provinceCodes = { 서울:'01', 경기:'02', 강원:'03', 충북:'04', 충남:'05', 전북:'06', 전남:'20', 경북:'08', 경남:'09', 부산:'10', 제주:'11', 대구:'14', 인천:'15', 광주:'20', 대전:'17', 울산:'18', 세종:'19' };
const metro = new Set(['부산','대구','인천','광주','대전','울산','세종']);
const fuelLabels = { gasoline:'휘발유차', diesel:'경유차', lpg:'LPG차', hybrid:'하이브리드차', electric:'전기차', hydrogen:'수소차' };
const energyUnits = { gasoline:'L', diesel:'L', lpg:'L', hybrid:'L', electric:'kWh', hydrogen:'kg' };
const efficiencyUnits = { gasoline:'km/L', diesel:'km/L', lpg:'km/L', hybrid:'km/L', electric:'km/kWh', hydrogen:'km/kg' };
let state = { settings: {}, vehicles: [], trips: [] };
let currentView = 'dashboard';
let editingId = null;
let editorStep = 1;
const staticMode = location.hostname.endsWith('.github.io') || location.protocol === 'file:' || new URLSearchParams(location.search).has('static');
const staticStoreKey = 'gwangyang-travel-expense-data-v1';

async function staticData() {
  const saved = localStorage.getItem(staticStoreKey);
  if (saved) return JSON.parse(saved);
  const defaults = await fetch('./default-data.json').then((res) => {
    if (!res.ok) throw new Error('기본 데이터를 불러오지 못했습니다.');
    return res.json();
  });
  localStorage.setItem(staticStoreKey, JSON.stringify(defaults));
  return defaults;
}

function saveStaticData(data) {
  try { localStorage.setItem(staticStoreKey, JSON.stringify(data)); }
  catch { throw new Error('브라우저 저장 공간이 부족합니다. 첨부파일 용량을 줄이거나 불필요한 증빙을 삭제해 주세요.'); }
}

async function staticRequest(url, options) {
  const path = new URL(url, location.origin).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  const data = await staticData();
  if (path === '/api/data') return data;
  if (path === '/api/opinet') throw new Error('GitHub Pages에서는 오피넷 자동 조회를 지원하지 않습니다. 관리자 기준단가를 사용합니다.');
  if (path === '/api/trips' && options.method === 'POST') {
    const trip = { ...body, id: body.id || crypto.randomUUID(), updatedAt: new Date().toISOString(), createdAt: body.createdAt || new Date().toISOString() };
    const index = data.trips.findIndex((item) => item.id === trip.id);
    if (index >= 0) data.trips[index] = trip; else data.trips.unshift(trip);
    saveStaticData(data); return trip;
  }
  if (path.match(/^\/api\/trips\/[^/]+\/status$/) && options.method === 'POST') {
    const id = path.split('/')[3], trip = data.trips.find((item) => item.id === id);
    if (!trip) throw new Error('출장 정산 건을 찾을 수 없습니다.');
    trip.status = body.status; trip.history = trip.history || [];
    trip.history.push({ at: new Date().toISOString(), action: body.action || body.status, actor: body.actor || '회계담당자', note: body.note || '' });
    saveStaticData(data); return trip;
  }
  if (path === '/api/attachments' && options.method === 'POST') {
    const trip = data.trips.find((item) => item.id === body.tripId);
    if (!trip) throw new Error('먼저 출장 정산 건을 저장해 주세요.');
    const attachment = { id: crypto.randomUUID(), name: body.name, type: /^data:([^;]+);/.exec(body.data || '')?.[1] || 'application/octet-stream', data: body.data, storedName: '', uploadedAt: new Date().toISOString() };
    trip.attachments = trip.attachments || []; trip.attachments.push(attachment);
    saveStaticData(data); return attachment;
  }
  if (path.match(/^\/api\/attachments\/[^/]+$/) && options.method === 'DELETE') {
    const id = path.split('/')[3]; data.trips.forEach((trip) => { trip.attachments = (trip.attachments || []).filter((item) => item.id !== id); });
    saveStaticData(data); return { ok: true };
  }
  if (path === '/api/admin' && options.method === 'POST') {
    if (body.settings) data.settings = { ...data.settings, ...body.settings };
    if (Array.isArray(body.vehicles)) data.vehicles = body.vehicles;
    saveStaticData(data); return { ok: true };
  }
  throw new Error('지원하지 않는 요청입니다.');
}

async function request(url, options = {}) {
  if (staticMode) return staticRequest(url, options);
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '처리 중 오류가 발생했습니다.');
  return data;
}

async function load() { state = await request('/api/data'); render(); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2400); }
function setView(view) { currentView = view; if (view === 'editor' && !editingId) editorStep = 1; $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view)); render(); }
function daysInclusive(start, end) { if (!start || !end) return 1; return Math.max(1, Math.floor((new Date(end) - new Date(start)) / 86400000) + 1); }
function lodgingCap(province) { const c = state.settings.lodgingCaps || {}; return province === '서울' ? c.seoul : metro.has(province) ? c.metro : c.other; }
function getVehicle(id) { return state.vehicles.find((v) => v.id === id); }

function calculate(t) {
  const days = daysInclusive(t.startDate, t.endDate);
  const dailyRate = Number(state.settings.dailyRate || 0);
  const dailyRateFactor = t.transport === 'official' ? 0.5 : 1;
  const daily = days * dailyRate * dailyRateFactor;
  const mealRate = Number(state.settings.mealRate || 0);
  const providedMeals = Math.min(days * 3, Math.max(0, Number(t.mealProvided || 0)));
  const meals = Math.max(0, days * mealRate - providedMeals * (mealRate / 3));
  const cap = Number(lodgingCap(t.province) || 0) * Number(t.nights || 0);
  const lodging = Math.min(Number(t.lodgingActual || 0), cap);
  const vehicle = getVehicle(t.vehicleId);
  const fuel = t.transport === 'car' && vehicle?.efficiency ? Number(t.distance || 0) / Number(vehicle.efficiency) * Number(t.oilPrice || 0) : 0;
  const transit = ['train','bus','public'].includes(t.transport) ? Number(t.transitActual || 0) : 0;
  const extras = t.transport === 'car' ? Number(t.toll || 0) + Number(t.parking || 0) : 0;
  const grossTotal = Math.floor(daily + meals + lodging + fuel + transit + extras);
  const total = truncateOnes(grossTotal);
  const truncation = grossTotal - total;
  return { days, daily, dailyRateFactor, meals, providedMeals, cap, lodging, fuel, transit, extras, grossTotal, truncation, total };
}

function dashboard() {
  const draftCount = state.trips.filter((t) => ['draft','rejected'].includes(t.status)).length;
  const completedCount = state.trips.filter((t) => !['draft','rejected'].includes(t.status)).length;
  const totalAmount = state.trips.reduce((sum,t)=>sum+calculate(t).total,0);
  return `<div class="hero"><div><h2>복잡한 여비 정산을 한 번에</h2><p>규정·공식연비·지역 유가를 근거로 계산하고 증빙까지 정리합니다.</p></div><button class="btn btn-primary" data-action="new">＋ 새 출장 정산</button></div>
  <div class="metric-grid">
    ${[[draftCount,'작성중','✎'],[completedCount,'정산완료','✓'],[state.trips.length,'전체 정산서','▤'],[won(totalAmount),'총 산정액','₩']].map(([value,label,icon]) => `<div class="metric"><div><span>${label}</span><b>${value}</b></div><i>${icon}</i></div>`).join('')}
  </div>
  <div class="panel"><div class="panel-head"><h2>최근 출장 정산</h2><button class="btn btn-secondary btn-small" data-action="new">전체 작성하기</button></div>${tripTable(state.trips)}</div>`;
}

function tripTable(trips) {
  if (!trips.length) return '<div class="empty">등록된 출장 정산이 없습니다.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>상태</th><th>출장자</th><th>출장기간</th><th>출장지</th><th>목적</th><th>산정액</th></tr></thead><tbody>${trips.map((t) => `<tr class="trip-row" data-id="${t.id}"><td><span class="status status-${t.status}">${statusLabel[t.status]}</span></td><td><b>${esc(t.employee)}</b><br><small>${esc(t.department)}</small></td><td>${t.startDate}<br><small>~ ${t.endDate}</small></td><td>${esc(t.province)} ${esc(t.city || '')}</td><td>${esc(t.purpose)}</td><td><b>${won(calculate(t).total)}</b></td></tr>`).join('')}</tbody></table></div>`;
}

function esc(value='') { return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function currentTrip() { const firstVehicle=state.vehicles[0]; return state.trips.find((t) => t.id === editingId) || { employee:'김광양', department:'데이터정보과', grade:'일반직', startDate:new Date().toISOString().slice(0,10), endDate:new Date().toISOString().slice(0,10), province:'전남', city:'', origin:'광양시청', transport:'car', vehicleId:firstVehicle?.id || '', distance:0, oilPrice:state.settings.fallbackFuel?.[firstVehicle?.fuel||'gasoline'] || 0, oilSource:'관리자 기준단가', toll:0, parking:0, nights:0, lodgingActual:0, transitActual:0, mealProvided:0, status:'draft', attachments:[], notes:'' }; }

function stepper() { return `<div class="stepper">${['출장 정보','교통·여비','증빙자료','정산서 출력'].map((x,i) => `<div class="step ${editorStep === i+1 ? 'active' : editorStep > i+1 ? 'done' : ''}"><span>${editorStep > i+1 ? '✓' : i+1}</span>${x}</div>`).join('')}</div>`; }
function input(name,label,value,type='text',cls='') { return `<div class="field ${cls}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value ?? '')}"></div>`; }
function select(name,label,value,options,cls='') { return `<div class="field ${cls}"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map(([v,l]) => `<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></div>`; }

function editor() {
  const t = currentTrip();
  let body = '';
  if (editorStep === 1) body = `<div class="form-grid">
    ${input('employee','출장자',t.employee)}${input('department','소속 부서',t.department)}${input('grade','직급/구분',t.grade)}
    ${input('startDate','출장 시작일',t.startDate,'date')}${input('endDate','출장 종료일',t.endDate,'date')}${input('purpose','출장 목적',t.purpose)}
    ${select('province','출장 시·도',t.province,Object.keys(provinceCodes).map(x=>[x,x]))}${input('city','시·군·구',t.city)}${input('destination','상세 출장지',t.destination)}
    <div class="field full"><label>비고</label><textarea name="notes">${esc(t.notes)}</textarea></div>
  </div>`;
  if (editorStep === 2) {
    const v = getVehicle(t.vehicleId); const c = calculate(t);
    body = `<div class="form-grid">
      ${select('transport','주 교통수단',t.transport,[['car','자가용'],['train','철도'],['bus','고속·시외버스'],['public','기타 대중교통'],['official','관용차']])}
      ${select('vehicleId','차량 종류',t.vehicleId,state.vehicles.filter(x=>x.active!==false).map(x=>[x.id,`${x.name || fuelLabels[x.fuel]} · ${x.efficiency}${x.unit || efficiencyUnits[x.fuel]}`]),'car-only')}
      ${input('origin','출발지',t.origin || '광양시청','text','car-only')}
      ${input('distance','왕복 이동거리(km)',t.distance,'number','car-only')}
      <div class="field car-only"><label>네이버 지도 경로</label><button type="button" class="btn btn-secondary" data-action="distance">출발지·도착지로 왕복 거리 조회</button><div class="helper" id="distance-result">출발지와 상세 출장지를 입력한 뒤 조회하세요.</div></div>
      <div class="field car-only"><label>에너지 기준단가</label><div class="inline"><input name="oilPrice" type="number" value="${t.oilPrice || 0}"><button type="button" class="btn btn-secondary" data-action="oil">단가 조회</button></div><div class="helper">${esc(t.oilSource || '관리자 기준단가')} · ${v ? `${v.name || fuelLabels[v.fuel]} ${v.efficiency}${v.unit || efficiencyUnits[v.fuel]}` : '차량 종류를 선택하세요'}</div></div>
      ${input('toll','통행료 실비',t.toll,'number','car-only')}${input('parking','주차료 실비',t.parking,'number','car-only')}
      ${input('transitActual','철도·버스 실제 결제액',t.transitActual,'number','transit-only')}
      <div class="field full transit-only notice">철도·버스 운임은 실제 결제액을 입력하고 다음 단계에서 승차권을 첨부합니다. 자동 운임표는 참고값으로만 운영하는 것이 안전합니다.</div>
      <h3 class="section-title">숙박·식비</h3>
      ${input('nights','숙박일수',t.nights,'number')}${input('lodgingActual','숙박 실제 결제액',t.lodgingActual,'number')}${input('mealProvided','무료 제공 식사 횟수(조·중·석)',t.mealProvided,'number')}
      <div class="field full notice ${Number(t.lodgingActual||0)>c.cap?'warn':''}">선택 지역의 숙박비 상한은 ${won(lodgingCap(t.province))}/박입니다. 현재 인정 한도 ${won(c.cap)}, 지급 산정액 ${won(c.lodging)}${Number(t.lodgingActual||0)>c.cap?' — 초과액은 자동 제외됩니다.':''}</div>
      <div class="field full notice">관용차 이용 시 해당 출장일의 일비는 50%만 지급합니다. 식비는 주최기관·교육기관·행사비·법인카드 등으로 본인 부담 없이 제공된 조식·중식·석식만 입력하며, 1식마다 1일 식비의 3분의 1을 감액합니다. 다과·음료는 식사에 포함하지 않습니다.</div>
    </div>`;
  }
  if (editorStep === 3) body = `<div class="upload-box"><p><b>영수증·승차권·통행료 등 증빙자료</b></p><p class="helper">이미지 증빙은 PDF 출력 시 사진대지로 자동 배치됩니다. PDF 증빙은 원본 파일로 별도 보관됩니다.</p><label class="btn btn-primary" for="proof-file">파일 선택</label><input id="proof-file" type="file" accept="image/*,.pdf" multiple></div>${attachmentList(t)}`;
  if (editorStep === 4) body = summary(t);
  return `${stepper()}<form id="trip-form"><div class="panel"><div class="panel-head"><h2>${editingId?'출장 정산 수정':'새 출장 정산'}</h2><span class="status status-${t.status}">${statusLabel[t.status] || '작성중'}</span></div><div class="panel-body">${body}</div></div><div class="actions"><button type="button" class="btn btn-secondary" data-action="cancel">목록으로</button><div class="actions-right">${editorStep>1?'<button type="button" class="btn btn-secondary" data-action="prev">이전</button>':''}<button type="button" class="btn btn-secondary" data-action="save">임시저장</button>${editorStep<4?'<button type="button" class="btn btn-primary" data-action="next">다음</button>':'<button type="button" class="btn btn-primary" data-action="complete">총괄 PDF 출력</button>'}</div></div></form>`;
}

function attachmentUrl(a) { return a.data || `/files/${encodeURIComponent(a.storedName)}`; }
function attachmentList(t) { const list=t.attachments||[]; return `<div class="attachment-list">${list.length?list.map((a,i)=>`<div class="attachment"><div><a href="${attachmentUrl(a)}" target="_blank">${i+1}. ${esc(a.name)}</a><div class="helper">${new Date(a.uploadedAt).toLocaleString('ko-KR')}</div></div><button type="button" class="btn btn-danger btn-small" data-delete-attachment="${a.id}">삭제</button></div>`).join(''):'<div class="empty">첨부된 증빙이 없습니다.</div>'}</div>`; }

function summary(t) { const c=calculate(t), v=getVehicle(t.vehicleId); return `<div class="summary-grid"><div><div class="calc-list">
    <div class="calc-row"><div><b>일비</b><small>${c.days}일 × ${won(state.settings.dailyRate)}${c.dailyRateFactor===0.5?' × 50%(관용차)':''}</small></div><span>${c.dailyRateFactor===0.5?'관용차 감액':'규정 정액'}</span><strong>${won(c.daily)}</strong></div>
    <div class="calc-row"><div><b>식비</b><small>${c.days}일, 무료 제공식 ${c.providedMeals}회 × 1/3 차감</small></div><span>규정 정액</span><strong>${won(c.meals)}</strong></div>
    <div class="calc-row"><div><b>숙박비</b><small>실제 ${won(t.lodgingActual)} / 한도 ${won(c.cap)}</small></div><span>실비·상한 적용</span><strong class="${Number(t.lodgingActual)>c.cap?'cap-over':''}">${won(c.lodging)}</strong></div>
    <div class="calc-row"><div><b>${t.transport==='car'?'자가용 에너지비':t.transport==='official'?'관용차':'교통 운임'}</b><small>${t.transport==='car'?`${t.distance||0}km ÷ ${v?.efficiency||0}${v?.unit || efficiencyUnits[v?.fuel]} × ${won(t.oilPrice)}/${energyUnits[v?.fuel] || '단위'}`:t.transport==='official'?'별도 운임 없음':'실제 결제금액'}</small></div><span>${t.transport==='car'?esc(t.oilSource):t.transport==='official'?'일비 50% 지급':'승차권 증빙'}</span><strong>${won(t.transport==='car'?c.fuel:c.transit)}</strong></div>
    ${c.extras?`<div class="calc-row"><div><b>통행·주차료</b><small>실비 입력</small></div><span>증빙 첨부</span><strong>${won(c.extras)}</strong></div>`:''}
    <div class="calc-row"><div><b>절사 전 합계</b><small>전체 인정금액 합산</small></div><span>소계</span><strong>${won(c.grossTotal)}</strong></div>
    <div class="calc-row"><div><b>원단위 절사</b><small>10원 미만 금액 버림</small></div><span>최종금액 적용</span><strong>-${won(c.truncation)}</strong></div>
  </div><div class="notice">적용 규정: ${esc(state.settings.ruleVersion)} · 출력 시 적용 단가와 계산 근거가 정산 건에 저장됩니다.</div></div><div><div class="total-box"><span>최종 지급 산정액</span><b>${won(c.total)}</b><small>증빙 ${t.attachments?.length||0}건 · 원단위 절사 적용</small></div><div class="panel" style="margin-top:14px"><div class="panel-body"><b>출장 요약</b><p>${esc(t.employee)} · ${esc(t.department)}</p><p>${t.startDate} ~ ${t.endDate}</p><p>${esc(t.province)} ${esc(t.city||'')} · ${esc(t.purpose)}</p></div></div></div></div>`; }

function admin() { const s=state.settings; return `<form id="admin-form"><div class="admin-grid"><div class="panel"><div class="panel-head"><h2>여비 기준</h2></div><div class="panel-body"><div class="form-grid">
    ${input('dailyRate','일비(1일)',s.dailyRate,'number','half')}${input('mealRate','식비(1일)',s.mealRate,'number','half')}
    ${input('capSeoul','숙박 상한·서울(1박)',s.lodgingCaps?.seoul,'number','third')}${input('capMetro','숙박 상한·광역시(1박)',s.lodgingCaps?.metro,'number','third')}${input('capOther','숙박 상한·기타(1박)',s.lodgingCaps?.other,'number','third')}
    ${input('ruleVersion','규정 버전',s.ruleVersion,'text','full')}
  </div></div></div><div class="panel"><div class="panel-head"><h2>오피넷·대체 유가</h2></div><div class="panel-body"><div class="form-grid">
    ${input('opinetKey','오피넷 인증키',s.opinetKey,'password','full')}
    ${input('routeApiUrl','지도·오피넷 Worker 프록시 URL',s.routeApiUrl || '','url','full')}
    <div class="field full notice">GitHub Pages에서는 지도·오피넷 비밀키를 저장할 수 없습니다. 배포한 Worker의 <code>/route</code> URL을 입력하면 거리와 오피넷 유가를 안전하게 자동 조회합니다.</div>
    <div class="field full"><button type="button" class="btn btn-secondary" data-action="key-test">인증키 연결 테스트</button><span id="key-test-result" class="helper" style="display:inline-block;margin-left:10px">현재 등록된 키의 API 응답을 확인합니다.</span></div>
    ${input('gasoline','휘발유 단가(원/L)',s.fallbackFuel?.gasoline,'number')}${input('diesel','경유 단가(원/L)',s.fallbackFuel?.diesel,'number')}${input('lpg','LPG 단가(원/L)',s.fallbackFuel?.lpg,'number')}
    ${input('hybrid','하이브리드 단가(원/L)',s.fallbackFuel?.hybrid,'number')}
    ${input('electric','전기 단가(원/kWh)',s.fallbackFuel?.electric,'number')}${input('hydrogen','수소 단가(원/kg)',s.fallbackFuel?.hydrogen,'number')}
    <div class="field full notice">휘발유·경유·LPG·하이브리드는 오피넷 조회를 시도합니다. 하이브리드는 기본적으로 휘발유 가격을 사용합니다. 전기·수소는 관리자 기준단가를 적용합니다.</div>
  </div></div></div></div>
  <div class="panel"><div class="panel-head"><h2>차량 종류별 기준연비</h2><button type="button" class="btn btn-secondary btn-small" data-action="add-vehicle">＋ 종류 추가</button></div><div class="panel-body"><div class="notice" style="margin-bottom:12px">차량 종류는 휘발유·경유·LPG·하이브리드·전기·수소로 관리합니다. 각 유형의 기준연비는 운영 기준에 맞게 관리자가 수정할 수 있습니다.</div><div id="vehicles">${vehicleRows()}</div></div></div>
  <div class="actions"><span></span><button class="btn btn-primary" type="submit">관리자 설정 저장</button></div></form>`; }

function vehicleRows() { return state.vehicles.map((v,i)=>`<div class="vehicle-card" data-vehicle="${i}"><input value="${esc(v.name || fuelLabels[v.fuel])}" aria-label="차량 종류명" placeholder="예: 전기차"><select aria-label="연료 유형">${Object.entries(fuelLabels).map(([x,l])=>`<option value="${x}" ${x===v.fuel?'selected':''}>${l}</option>`).join('')}</select><input type="number" step="0.01" min="0" value="${v.efficiency}" aria-label="기준연비" placeholder="기준연비 (소수점 둘째 자리)"><input value="${v.unit || efficiencyUnits[v.fuel]}" aria-label="연비 단위" readonly><button type="button" class="btn btn-danger btn-small" data-remove-vehicle="${i}">삭제</button></div>`).join(''); }

function render() {
  const titles={dashboard:'출장 정산 현황',editor:'출장 정산 작성',admin:'운영 기준 관리'};
  $('#page-title').textContent=titles[currentView];
  $('#app').innerHTML=({dashboard,editor,admin}[currentView])();
  bind();
  if(currentView==='editor'&&editorStep===2) toggleTransport();
}

function serializeTrip() {
  const t={...currentTrip()}; const form=$('#trip-form'); if(!form)return t;
  new FormData(form).forEach((v,k)=>{t[k]=v});
  ['distance','oilPrice','toll','parking','nights','lodgingActual','transitActual','mealProvided'].forEach(k=>t[k]=Number(t[k]||0));
  return t;
}
async function saveTrip(status) { const t=serializeTrip(); if(status)t.status=status; const saved=await request('/api/trips',{method:'POST',body:JSON.stringify(t)}); editingId=saved.id; const i=state.trips.findIndex(x=>x.id===saved.id); if(i>=0)state.trips[i]=saved;else state.trips.unshift(saved); toast('저장했습니다.'); return saved; }
function toggleTransport(){const value=$('[name="transport"]')?.value; $$('.car-only').forEach(x=>x.style.display=value==='car'?'':'none'); $$('.transit-only').forEach(x=>x.style.display=['train','bus','public'].includes(value)?'':'none');}

function bind() {
  const mealInput = $('[name="mealProvided"]');
  if (mealInput) { mealInput.min = '0'; mealInput.max = String(daysInclusive(currentTrip().startDate, currentTrip().endDate) * 3); }
  $$('[data-action="new"]').forEach(b=>b.onclick=()=>{editingId=null;editorStep=1;setView('editor')});
  $$('.trip-row').forEach(r=>r.onclick=()=>openDetail(r.dataset.id));
  $('[data-action="cancel"]')?.addEventListener('click',()=>{editingId=null;setView('dashboard')});
  $('[data-action="prev"]')?.addEventListener('click',()=>{saveLocal();editorStep--;render()});
  $('[data-action="next"]')?.addEventListener('click',async()=>{await saveTrip();editorStep++;render()});
  $('[data-action="save"]')?.addEventListener('click',()=>saveTrip());
  $('[data-action="complete"]')?.addEventListener('click',async()=>{const t=await saveTrip('completed');t.history=t.history||[];t.history.push({at:new Date().toISOString(),action:'총괄 정산서 출력',actor:t.employee});await request('/api/trips',{method:'POST',body:JSON.stringify(t)});await load();const completed=state.trips.find(x=>x.id===t.id);printTrip(completed,getVehicle(completed.vehicleId),calculate(completed))});
  $('[name="transport"]')?.addEventListener('change',toggleTransport);
  $('[name="vehicleId"]')?.addEventListener('change',(e)=>{const vehicle=getVehicle(e.target.value);const price=state.settings.fallbackFuel?.[vehicle?.fuel]||0;const priceInput=$('[name="oilPrice"]');if(priceInput)priceInput.value=price;const trip=currentTrip();trip.oilPrice=price;trip.oilSource='관리자 기준단가';toast(`${vehicle?.name || fuelLabels[vehicle?.fuel]} 기준단가를 적용했습니다.`)});
  $('[data-action="oil"]')?.addEventListener('click',lookupOil);
  $('[data-action="distance"]')?.addEventListener('click',lookupDistance);
  $('#proof-file')?.addEventListener('change',uploadFiles);
  $$('[data-delete-attachment]').forEach(b=>b.onclick=async()=>{await request(`/api/attachments/${b.dataset.deleteAttachment}`,{method:'DELETE'});await load();render()});
  $('#admin-form')?.addEventListener('submit',saveAdmin);
  $('[data-action="add-vehicle"]')?.addEventListener('click',()=>{state.vehicles.push({id:crypto.randomUUID(),name:'새 차량 종류',fuel:'gasoline',efficiency:0,unit:'km/L',active:true});render()});
  $('[data-action="key-test"]')?.addEventListener('click',testOpinetKey);
  $$('[data-remove-vehicle]').forEach(b=>b.onclick=()=>{state.vehicles.splice(Number(b.dataset.removeVehicle),1);render()});
  $$('[data-vehicle] select').forEach(s=>s.onchange=()=>{const row=s.closest('[data-vehicle]');const unitInput=$$('input',row)[2];if(unitInput)unitInput.value=efficiencyUnits[s.value]});
}
function saveLocal(){const t=serializeTrip();const i=state.trips.findIndex(x=>x.id===t.id);if(i>=0)state.trips[i]=t;else{t.id=t.id||crypto.randomUUID();editingId=t.id;state.trips.unshift(t)}}
function workerUrl(path){const configured=String(state.settings.routeApiUrl||'').trim();if(!configured)return '';const url=new URL(configured);url.pathname=path;url.search='';return url}
async function lookupOil(){try{const t=serializeTrip(),v=getVehicle(t.vehicleId);if(['electric','hydrogen'].includes(v?.fuel)){const price=state.settings.fallbackFuel?.[v.fuel]||0;$('[name="oilPrice"]').value=price;currentTrip().oilSource='관리자 기준단가';toast(`${v.name || fuelLabels[v.fuel]} 기준단가 ${won(price)}/${energyUnits[v.fuel]}를 적용했습니다.`);return}const area=provinceCodes[t.province]||'';const proxy=workerUrl('/opinet');let result;if(proxy){proxy.search=new URLSearchParams({area,fuel:v?.fuel||'gasoline',date:t.startDate}).toString();const res=await fetch(proxy);result=await res.json();if(!res.ok)throw new Error(result.error||'오피넷 조회에 실패했습니다.')}else result=await request(`/api/opinet?area=${area}&fuel=${v?.fuel||'gasoline'}&date=${t.startDate}`);$('[name="oilPrice"]').value=result.price;const cur=currentTrip();cur.oilPrice=result.price;cur.oilSource=`${result.source} (${result.tradeDate})`;toast(result.notice||`${result.source} ${won(result.price)}/${energyUnits[v?.fuel]||'L'}를 적용했습니다.`)}catch(e){const t=serializeTrip(),v=getVehicle(t.vehicleId);const price=state.settings.fallbackFuel?.[v?.fuel||'gasoline']||0;$('[name="oilPrice"]').value=price;currentTrip().oilSource='관리자 기준단가';toast(`${e.message} 기준단가 ${won(price)}/${energyUnits[v?.fuel]||'L'}를 사용합니다.`)}}
async function lookupDistance(){const result=$('#distance-result');try{const t=serializeTrip();if(!t.origin?.trim()||!t.destination?.trim())throw new Error('출발지와 상세 출장지를 모두 입력해 주세요.');result.textContent='네이버 지도에서 경로를 찾는 중…';let data;const proxy=String(state.settings.routeApiUrl||'').trim();if(proxy){const url=new URL(proxy);url.searchParams.set('origin',t.origin);url.searchParams.set('destination',t.destination);const res=await fetch(url);data=await res.json();if(!res.ok)throw new Error(data.error||'거리 조회에 실패했습니다.')}else{data=await request(`/api/directions?origin=${encodeURIComponent(t.origin)}&destination=${encodeURIComponent(t.destination)}`)}const input=$('[name="distance"]');input.value=data.roundTripKm;const trip=currentTrip();trip.distance=Number(data.roundTripKm);trip.origin=data.origin;trip.distanceSource=`네이버 지도 왕복 (${data.oneWayKm}km × 2)`;result.textContent=`편도 ${data.oneWayKm}km · 왕복 ${data.roundTripKm}km을 적용했습니다.`;toast('네이버 지도 왕복 거리를 입력했습니다.')}catch(error){result.textContent=error.message;toast(error.message)}}
async function testOpinetKey(){const result=$('#key-test-result');result.textContent='확인 중…';try{const today=new Date().toISOString().slice(0,10);const proxy=workerUrl('/opinet');let data;if(proxy){proxy.search=new URLSearchParams({area:'20',fuel:'gasoline',date:today}).toString();const res=await fetch(proxy);data=await res.json();if(!res.ok)throw new Error(data.error||'오피넷 조회에 실패했습니다.')}else data=await request(`/api/opinet?area=20&fuel=gasoline&date=${today}`);result.textContent=`연결 정상 · ${data.source} ${won(data.price)}/L`;result.style.color='#08745f'}catch(e){result.textContent=`연결 실패 · ${e.message}`;result.style.color='#c23b4a'}}
async function uploadFiles(e){try{let t=await saveTrip();const maxSize=staticMode?2:12;for(const file of e.target.files){if(file.size>maxSize*1024*1024){toast(`${file.name}: ${maxSize}MB를 초과합니다.`);continue}const data=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)});const a=await request('/api/attachments',{method:'POST',body:JSON.stringify({tripId:t.id,name:file.name,data})});t.attachments=t.attachments||[];t.attachments.push(a)}await load();editingId=t.id;render();toast('증빙자료를 첨부했습니다.')}catch(error){toast(error.message)}}
async function saveAdmin(e){e.preventDefault();const f=new FormData(e.currentTarget);const rows=$$('[data-vehicle]').map((r,i)=>{const fuel=$('select',r).value;return{id:state.vehicles[i].id||crypto.randomUUID(),name:$$('input',r)[0].value,fuel,efficiency:Number($$('input',r)[1].value),unit:efficiencyUnits[fuel],active:true}});const settings={dailyRate:Number(f.get('dailyRate')),mealRate:Number(f.get('mealRate')),lodgingCaps:{seoul:Number(f.get('capSeoul')),metro:Number(f.get('capMetro')),other:Number(f.get('capOther'))},ruleVersion:f.get('ruleVersion'),opinetKey:f.get('opinetKey'),routeApiUrl:f.get('routeApiUrl').trim(),fallbackFuel:{gasoline:Number(f.get('gasoline')),diesel:Number(f.get('diesel')),lpg:Number(f.get('lpg')),hybrid:Number(f.get('hybrid')),electric:Number(f.get('electric')),hydrogen:Number(f.get('hydrogen'))}};await request('/api/admin',{method:'POST',body:JSON.stringify({settings,vehicles:rows})});await load();toast('관리자 설정을 저장했습니다.')}

function openDetail(id){const t=state.trips.find(x=>x.id===id),c=calculate(t),v=getVehicle(t.vehicleId);const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal"><div class="panel"><div class="panel-head"><div><h2>${esc(t.purpose)}</h2><div class="helper">${t.startDate} ~ ${t.endDate}</div></div><button class="btn btn-secondary btn-small" data-close>닫기</button></div><div class="panel-body"><div class="detail-grid"><div class="detail-item"><small>출장자</small><b>${esc(t.employee)} · ${esc(t.department)}</b></div><div class="detail-item"><small>출장지</small><b>${esc(t.province)} ${esc(t.city||'')}</b></div><div class="detail-item"><small>산정액</small><b>${won(c.total)}</b></div></div><div style="margin-top:20px">${summary(t)}</div><h3>처리 이력</h3><div class="history">${(t.history||[]).map(h=>`<div class="history-item"><b>${esc(h.action)} · ${esc(h.actor)}</b><small>${new Date(h.at).toLocaleString('ko-KR')} ${h.note?'· '+esc(h.note):''}</small></div>`).join('')||'<span class="helper">이력이 없습니다.</span>'}</div><div class="actions"><button class="btn btn-secondary" data-edit>수정</button><button class="btn btn-primary" data-print>총괄 PDF 출력</button></div></div></div></div>`;document.body.append(modal);modal.onclick=e=>{if(e.target===modal||e.target.hasAttribute('data-close'))modal.remove()};$('[data-edit]',modal)?.addEventListener('click',()=>{modal.remove();editingId=id;editorStep=1;setView('editor')});$('[data-print]',modal).onclick=()=>printTrip(t,v,c)}
async function updateStatus(id,status,action,note=''){await request(`/api/trips/${id}/status`,{method:'POST',body:JSON.stringify({status,action,actor:'회계담당자',note})});$$('.modal-backdrop').forEach(x=>x.remove());await load();toast(`${action} 처리했습니다.`)}
function printTrip(t,v,c){const attachments=t.attachments||[], images=attachments.filter(a=>a.type.startsWith('image/')), documents=attachments.filter(a=>!a.type.startsWith('image/'));let report=$('#print-report');if(!report){report=document.createElement('section');report.id='print-report';report.className='print-report';document.body.append(report)}report.innerHTML=`<h1>관외출장 여비 정산 결과보고서</h1><table><tr><th>출장자</th><td>${esc(t.employee)}</td><th>소속</th><td>${esc(t.department)}</td></tr><tr><th>출장기간</th><td>${t.startDate} ~ ${t.endDate}</td><th>출장지</th><td>${esc(t.province)} ${esc(t.city||'')}</td></tr><tr><th>출장목적</th><td colspan="3">${esc(t.purpose)}</td></tr></table><h2>여비 산정 내역</h2><table><tr><th>항목</th><th>산정 근거</th><th>금액</th></tr><tr><td>일비</td><td>${c.days}일 × ${won(state.settings.dailyRate)}${c.dailyRateFactor===0.5?' × 50%(관용차)':''}</td><td>${won(c.daily)}</td></tr><tr><td>식비</td><td>무료 제공식 ${c.providedMeals}회 × 1일 식비의 1/3 차감</td><td>${won(c.meals)}</td></tr><tr><td>숙박비</td><td>실제 ${won(t.lodgingActual)}, 한도 ${won(c.cap)}</td><td>${won(c.lodging)}</td></tr><tr><td>교통비</td><td>${t.transport==='car'?`${esc(v?.name || fuelLabels[v?.fuel])}: ${t.distance}km ÷ ${v?.efficiency}${v?.unit || efficiencyUnits[v?.fuel]} × ${won(t.oilPrice)}/${energyUnits[v?.fuel]} (${esc(t.oilSource)})`:t.transport==='official'?'관용차 이용 · 별도 운임 없음':'실제 운임'}</td><td>${won(t.transport==='car'?c.fuel:c.transit)}</td></tr><tr><td>통행·주차료</td><td>실비</td><td>${won(c.extras)}</td></tr><tr><td>절사 전 합계</td><td>전체 인정금액 합산</td><td>${won(c.grossTotal)}</td></tr><tr><td>원단위 절사</td><td>10원 미만 금액 버림</td><td>-${won(c.truncation)}</td></tr><tr><th colspan="2">최종 지급액</th><th>${won(c.total)}</th></tr></table><p>적용 기준: ${esc(state.settings.ruleVersion)} · 최종금액 원단위 절사</p><h2>증빙자료 목록</h2><table><tr><th>순번</th><th>파일명</th><th>등록일</th></tr>${attachments.length?attachments.map((a,i)=>`<tr><td>${i+1}</td><td>${esc(a.name)}</td><td>${new Date(a.uploadedAt).toLocaleDateString('ko-KR')}</td></tr>`).join(''):'<tr><td colspan="3" class="no-proof">첨부된 증빙자료가 없습니다.</td></tr>'}</table>${images.length?`<section class="evidence-sheet"><div class="evidence-sheet-head"><h2>증빙자료 사진대지</h2><span>총 ${images.length}건</span></div><div class="photo-grid">${images.map(a=>`<figure class="photo-card"><div class="photo-frame"><img src="${attachmentUrl(a)}" alt="${esc(a.name)}"></div><figcaption><b>${esc(a.name)}</b><span>등록일 ${new Date(a.uploadedAt).toLocaleDateString('ko-KR')}</span></figcaption></figure>`).join('')}</div></section>`:''}${documents.length?`<section class="document-proof"><h2>원본 파일 증빙</h2><p>아래 PDF 증빙은 사진대지와 함께 원본 파일로 보관됩니다.</p><ol>${documents.map(a=>`<li>${esc(a.name)} <span>(등록일 ${new Date(a.uploadedAt).toLocaleDateString('ko-KR')})</span></li>`).join('')}</ol></section>`:''}`;window.print()}

$('#nav').addEventListener('click',(e)=>{const b=e.target.closest('button[data-view]');if(b)setView(b.dataset.view)});
load().catch(e=>{document.querySelector('#app').innerHTML=`<div class="panel"><div class="empty">${esc(e.message)}<br>서버를 다시 실행해 주세요.</div></div>`});
