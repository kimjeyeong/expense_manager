const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;
const truncateOnes = (n) => Math.floor(Math.max(0, Number(n) || 0) / 10) * 10;
const statusLabel = { draft: '작성중', completed: '정산완료', submitted: '정산완료', approved: '정산완료', rejected: '작성중', paid: '정산완료' };
// 2026-07-01 전라남도와 광주광역시가 전남광주통합특별시로 통합되었습니다.
// 나열 순서가 곧 드롭다운 순서입니다. 값은 오피넷 지역코드이고 순서는 직제순을 따릅니다.
// 통합특별시는 종전 전라남도 자리에 둡니다.
const provinceCodes = { 서울:'01', 부산:'10', 대구:'14', 인천:'15', 대전:'17', 울산:'18', 세종:'19', 경기:'02', 강원:'03', 충북:'04', 충남:'05', 전북:'06', 전남광주:'20', 경북:'08', 경남:'09', 제주:'11' };
const provinceLabels = { 서울:'서울특별시', 부산:'부산광역시', 대구:'대구광역시', 인천:'인천광역시', 대전:'대전광역시', 울산:'울산광역시', 세종:'세종특별자치시', 경기:'경기도', 강원:'강원특별자치도', 충북:'충청북도', 충남:'충청남도', 전북:'전북특별자치도', 전남광주:'전남광주통합특별시', 경북:'경상북도', 경남:'경상남도', 제주:'제주특별자치도' };
// 지오코딩이 돌려주는 시·도 정식 명칭은 provinceCodes의 약칭으로 시작하지 않는 경우가 있습니다.
// 통합 이전 주소 표기(전라남도·광주광역시)도 통합 시·도로 받습니다.
const provinceAliases = { 충청북도:'충북', 충청남도:'충남', 전라북도:'전북', 전라남도:'전남광주', 광주광역시:'전남광주', 경상북도:'경북', 경상남도:'경남' };
// 통합 이전에 저장된 '전남'·'광주' 값도 계속 읽히도록 남겨 둡니다.
const metro = new Set(['부산','대구','인천','광주','대전','울산','세종']);
const districts = {
  서울:['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'],
  부산:['중구','서구','동구','영도구','부산진구','동래구','남구','북구','해운대구','사하구','금정구','강서구','연제구','수영구','사상구','기장군'],
  대구:['중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군'],
  인천:['중구','동구','미추홀구','연수구','남동구','부평구','계양구','서구','강화군','옹진군'],
  대전:['동구','중구','서구','유성구','대덕구'],
  울산:['중구','남구','동구','북구','울주군'],
  세종:['세종시'],
  경기:['수원시','성남시','의정부시','안양시','부천시','광명시','평택시','동두천시','안산시','고양시','과천시','구리시','남양주시','오산시','시흥시','군포시','의왕시','하남시','용인시','파주시','이천시','안성시','김포시','화성시','광주시','양주시','포천시','여주시','연천군','가평군','양평군'],
  강원:['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군'],
  충북:['청주시','충주시','제천시','보은군','옥천군','영동군','증평군','진천군','괴산군','음성군','단양군'],
  충남:['천안시','공주시','보령시','아산시','서산시','논산시','계룡시','당진시','금산군','부여군','서천군','청양군','홍성군','예산군','태안군'],
  전북:['전주시','군산시','익산시','정읍시','남원시','김제시','완주군','진안군','무주군','장수군','임실군','순창군','고창군','부안군'],
  전남광주:['동구','서구','남구','북구','광산구','목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군','장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군'],
  경북:['포항시','경주시','김천시','안동시','구미시','영주시','영천시','상주시','문경시','경산시','의성군','청송군','영양군','영덕군','청도군','고령군','성주군','칠곡군','예천군','봉화군','울진군','울릉군'],
  경남:['창원시','진주시','통영시','사천시','김해시','밀양시','거제시','양산시','의령군','함안군','창녕군','고성군','남해군','하동군','산청군','함양군','거창군','합천군'],
  제주:['제주시','서귀포시']
};
function provinceName(key) { return provinceLabels[key] || key || ''; }
function districtOptions(province, city) { return (districts[province] || []).map((x) => `<option value="${x}" ${x===city?'selected':''}>${x}</option>`).join(''); }
const fuelLabels = { gasoline:'휘발유차', diesel:'경유차', lpg:'LPG차', hybrid:'하이브리드차', phev:'플러그인하이브리드차', electric:'전기차', hydrogen:'수소차' };
const energyUnits = { gasoline:'L', diesel:'L', lpg:'L', hybrid:'L', phev:'L', electric:'kWh', hydrogen:'kg' };
const efficiencyUnits = { gasoline:'km/L', diesel:'km/L', lpg:'km/L', hybrid:'km/L', phev:'km/L', electric:'km/kWh', hydrogen:'km/kg' };
let state = { settings: {}, vehicles: [], trips: [] };
let currentView = 'dashboard';
let editingId = null;
let editorStep = 1;
const staticMode = location.hostname.endsWith('.github.io') || location.protocol === 'file:' || new URLSearchParams(location.search).has('static');
const staticStoreKey = 'gwangyang-travel-expense-data-v1';
// 관리자 화면은 메뉴에 없고 ?admin 을 붙여야만 열립니다.
const adminMode = new URLSearchParams(location.search).has('admin');
// 마지막으로 읽은 배포본 기준값입니다. 저장할 때 이것과 같으면 덮어쓰기를 남기지 않습니다.
let shippedBaseline = null;
const defaultWorkerRouteUrl = 'https://expense-manager-route-proxy.gwangyang-expense.workers.dev/route';

// 여비 기준과 차량 기준연비는 배포본(default-data.json)만을 따릅니다.
// 브라우저에는 정산 건만 남기므로, 기준을 고쳐 배포하면 모든 사용자에게 곧바로 반영됩니다.
async function staticData() {
  const shipped = await fetch('./default-data.json').then((res) => {
    if (!res.ok) throw new Error('기본 데이터를 불러오지 못했습니다.');
    return res.json();
  });
  shippedBaseline = { settings: shipped.settings, vehicles: shipped.vehicles };
  const saved = localStorage.getItem(staticStoreKey);
  const local = saved ? JSON.parse(saved) : {};
  const trips = saved ? (local.trips || []) : (shipped.trips || []);
  // overrides는 관리자 화면에서 저장한 이 브라우저 전용 값입니다. 없으면 배포본을 그대로 씁니다.
  return {
    ...shipped,
    trips,
    settings: { ...shipped.settings, ...(local.settings || {}) },
    vehicles: local.vehicles || shipped.vehicles
  };
}

// 배포본과 같은 값을 굳이 저장하면 이후 배포에서 기준이 바뀌어도 반영되지 않습니다.
// 그래서 실제로 달라진 항목만 덮어쓰기로 남깁니다.
function overrideOf(value, baseline) {
  return JSON.stringify(value) === JSON.stringify(baseline) ? undefined : value;
}
function saveStaticData(data) {
  const record = { trips: data.trips || [] };
  if (shippedBaseline) {
    const settings = overrideOf(data.settings, shippedBaseline.settings);
    const vehicles = overrideOf(data.vehicles, shippedBaseline.vehicles);
    if (settings) record.settings = settings;
    if (vehicles) record.vehicles = vehicles;
  }
  try { localStorage.setItem(staticStoreKey, JSON.stringify(record)); }
  catch {
    // 호출부가 사진을 더 줄여 재시도할 수 있도록 저장 공간 부족을 구분해 알립니다.
    const error = new Error('브라우저 저장 공간이 부족합니다. 첨부파일 용량을 줄이거나 불필요한 증빙을 삭제해 주세요.');
    error.code = 'QUOTA';
    throw error;
  }
}

async function staticRequest(url, options) {
  const path = new URL(url, location.origin).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  const data = await staticData();
  if (path === '/api/data') return data;
  if (path === '/api/opinet') throw new Error('GitHub Pages에서는 오피넷 자동 조회를 지원하지 않습니다. 기준단가를 사용합니다.');
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
  if (path === '/api/admin' && options.method === 'POST') {
    if (body.settings) data.settings = { ...data.settings, ...body.settings };
    if (Array.isArray(body.vehicles)) data.vehicles = body.vehicles;
    saveStaticData(data); return { ok: true };
  }
  if (path === '/api/admin/reset' && options.method === 'POST') {
    // 덮어쓴 값을 지우고 배포본 기준으로 되돌립니다. 정산 건은 남깁니다.
    localStorage.setItem(staticStoreKey, JSON.stringify({ trips: data.trips || [] }));
    return { ok: true };
  }
  if (path.match(/^\/api\/attachments\/[^/]+$/) && options.method === 'DELETE') {
    const id = path.split('/')[3]; data.trips.forEach((trip) => { trip.attachments = (trip.attachments || []).filter((item) => item.id !== id); });
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
function lodgingCap(province) {
  const c = state.settings.lodgingCaps || {};
  if (province === '서울') return c.seoul;
  // 통합특별시는 옛 광주 5개 구를 포함해 전역에 기타 상한을 적용합니다.
  if (province === '전남광주') return c.other;
  return metro.has(province) ? c.metro : c.other;
}
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
  return `<div class="table-wrap"><table><thead><tr><th>상태</th><th>출장자</th><th>출장기간</th><th>출장지</th><th>목적</th><th>산정액</th></tr></thead><tbody>${trips.map((t) => `<tr class="trip-row" data-id="${t.id}"><td><span class="status status-${t.status}">${statusLabel[t.status]}</span></td><td><b>${esc(t.employee)}</b><br><small>${esc(t.department)}</small></td><td>${t.startDate}<br><small>~ ${t.endDate}</small></td><td>${esc(provinceName(t.province))} ${esc(t.city || '')}</td><td>${esc(t.purpose)}</td><td><b>${won(calculate(t).total)}</b></td></tr>`).join('')}</tbody></table></div>`;
}

function esc(value='') { return String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
// 통합 이전에 저장된 '전남'·'광주'는 편집할 때 통합 시·도로 옮깁니다.
// 옛 광주 건은 시·군·구('북구' 등)가 그대로 남아 광역시 숙박 상한이 유지됩니다.
const legacyProvinces = { 전남:'전남광주', 광주:'전남광주' };
function currentTrip() { const firstVehicle=state.vehicles[0]; const found=state.trips.find((t) => t.id === editingId); if (found) { if (legacyProvinces[found.province]) found.province = legacyProvinces[found.province]; return found; } return { employee:'김광양', department:'데이터정보과', grade:'일반직', startDate:new Date().toISOString().slice(0,10), endDate:new Date().toISOString().slice(0,10), startTime:'09:00', endTime:'18:00', province:'전남광주', city:'', origin:'광양시청', transport:'car', vehicleId:firstVehicle?.id || '', distance:0, oilPrice:state.settings.fallbackFuel?.[firstVehicle?.fuel||'gasoline'] || 0, oilSource:'기준단가', toll:0, parking:0, nights:0, lodgingActual:0, transitActual:0, mealProvided:0, status:'draft', attachments:[], notes:'' }; }

function stepper() { return `<div class="stepper">${['출장 정보','교통·여비','증빙자료','정산서 출력'].map((x,i) => `<div class="step ${editorStep === i+1 ? 'active' : editorStep > i+1 ? 'done' : ''}"><span>${editorStep > i+1 ? '✓' : i+1}</span>${x}</div>`).join('')}</div>`; }
function input(name,label,value,type='text',cls='') { return `<div class="field ${cls}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value ?? '')}"></div>`; }
function select(name,label,value,options,cls='') { return `<div class="field ${cls}"><label for="${name}">${label}</label><select id="${name}" name="${name}">${options.map(([v,l]) => `<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></div>`; }

function editor() {
  const t = currentTrip();
  let body = '';
  if (editorStep === 1) body = `<div class="form-grid">
    ${input('employee','출장자',t.employee)}${input('department','소속 부서',t.department)}${input('grade','직급/구분',t.grade)}
    ${input('startDate','출장 시작일',t.startDate,'date')}${input('endDate','출장 종료일',t.endDate,'date')}${input('purpose','출장 목적',t.purpose)}
    ${input('startTime','출장 시작시간',t.startTime||'09:00','time')}${input('endTime','출장 종료시간',t.endTime||'18:00','time')}
    ${select('province','출장 시·도',t.province,Object.keys(provinceCodes).map(x=>[x,provinceName(x)]))}
    <div class="field"><label for="city">시·군·구</label><select id="city" name="city"><option value="">선택 안 함</option>${districtOptions(t.province,t.city)}</select></div>
    ${placeSearchField(t.destination)}
    <div class="field full"><label>비고</label><textarea name="notes">${esc(t.notes)}</textarea></div>
  </div>`;
  if (editorStep === 2) {
    const v = getVehicle(t.vehicleId); const c = calculate(t);
    body = `<div class="form-grid">
      ${select('transport','주 교통수단',t.transport,[['car','자가용'],['train','철도'],['bus','고속·시외버스'],['public','기타 대중교통'],['official','관용차']])}
      ${select('vehicleId','차량 종류',t.vehicleId,state.vehicles.filter(x=>x.active!==false).map(x=>[x.id,`${x.name || fuelLabels[x.fuel]} · ${x.efficiency}${x.unit || efficiencyUnits[x.fuel]}${x.electricEfficiency?` / 전비 ${x.electricEfficiency}${x.electricUnit||'km/kWh'}`:''}`]),'car-only')}
      ${input('origin','출발지',t.origin || '광양시청','text','car-only')}
      ${input('distance','왕복 이동거리(km)',t.distance,'number','car-only')}
      <div class="field car-only"><label>네이버 지도 경로</label><button type="button" class="btn btn-secondary" data-action="distance">출발지·도착지로 왕복 거리 조회</button><div class="helper" id="distance-result">출발지와 상세 출장지를 입력한 뒤 조회하세요.</div></div>
      <div class="field car-only"><label>에너지 기준단가</label><div class="inline"><input name="oilPrice" type="number" value="${t.oilPrice || 0}"><button type="button" class="btn btn-secondary" data-action="oil">단가 조회</button></div><div class="helper">${esc(t.oilSource || '기준단가')} · ${v ? `${v.name || fuelLabels[v.fuel]} ${v.efficiency}${v.unit || efficiencyUnits[v.fuel]}` : '차량 종류를 선택하세요'}</div></div>
      ${input('toll','통행료 실비',t.toll,'number','car-only')}${input('parking','주차료 실비',t.parking,'number','car-only')}
      ${input('transitActual','철도·버스 실제 결제액',t.transitActual,'number','transit-only')}
      <div class="field full transit-only notice">철도·버스 운임은 실제 결제액을 입력하고 다음 단계에서 승차권을 첨부합니다. 자동 운임표는 참고값으로만 운영하는 것이 안전합니다.</div>
      <h3 class="section-title">숙박·식비</h3>
      ${input('nights','숙박일수',t.nights,'number')}${input('lodgingActual','숙박 실제 결제액',t.lodgingActual,'number')}${input('mealProvided','무료 제공 식사 횟수(조·중·석)',t.mealProvided,'number')}
      <div class="field full notice ${Number(t.lodgingActual||0)>c.cap?'warn':''}">선택 지역의 숙박비 상한은 ${won(lodgingCap(t.province))}/박입니다. 현재 인정 한도 ${won(c.cap)}, 지급 산정액 ${won(c.lodging)}${Number(t.lodgingActual||0)>c.cap?' — 초과액은 자동 제외됩니다.':''}</div>
      <div class="field full notice">관용차 이용 시 해당 출장일의 일비는 50%만 지급합니다. 식비는 주최기관·교육기관·행사비·법인카드 등으로 본인 부담 없이 제공된 조식·중식·석식만 입력하며, 1식마다 1일 식비의 3분의 1을 감액합니다. 다과·음료는 식사에 포함하지 않습니다.</div>
    </div>`;
  }
  if (editorStep === 3) body = `<div class="upload-box"><p><b>영수증·승차권·통행료 등 증빙자료</b></p><p class="helper">이미지 증빙은 PDF 출력 시 사진대지로 자동 배치됩니다. PDF 증빙은 원본 파일로 별도 보관됩니다.</p>${storageHelper()}<label class="btn btn-primary" for="proof-file">파일 선택</label><input id="proof-file" type="file" accept="image/*,.pdf" multiple></div>${attachmentList(t)}`;
  if (editorStep === 4) body = summary(t);
  return `${stepper()}<form id="trip-form"><div class="panel"><div class="panel-head"><h2>${editingId?'출장 정산 수정':'새 출장 정산'}</h2><span class="status status-${t.status}">${statusLabel[t.status] || '작성중'}</span></div><div class="panel-body">${body}</div></div><div class="actions"><button type="button" class="btn btn-secondary" data-action="cancel">목록으로</button><div class="actions-right">${editorStep>1?'<button type="button" class="btn btn-secondary" data-action="prev">이전</button>':''}<button type="button" class="btn btn-secondary" data-action="save">임시저장</button>${editorStep<4?'<button type="button" class="btn btn-primary" data-action="next">다음</button>':'<button type="button" class="btn btn-primary" data-action="complete">총괄 PDF 출력</button>'}</div></div></form>`;
}

function attachmentUrl(a) { return a.data || `/files/${encodeURIComponent(a.storedName)}`; }
function placeSearchField(value) { return `<div class="field"><label for="destination">상세 출장지</label><div class="inline"><input id="destination" name="destination" value="${esc(value ?? '')}" placeholder="예: 서울역"><button type="button" class="btn btn-secondary" data-action="place-search">장소 검색</button></div><div id="place-results" class="place-results helper">장소명을 입력한 뒤 검색해 선택하세요.</div></div>`; }
function attachmentList(t) { const list=t.attachments||[]; return `<div class="attachment-list">${list.length?list.map((a,i)=>`<div class="attachment"><div><a href="${attachmentUrl(a)}" target="_blank">${i+1}. ${esc(a.name)}</a><div class="helper">${new Date(a.uploadedAt).toLocaleString('ko-KR')}</div></div><button type="button" class="btn btn-danger btn-small" data-delete-attachment="${a.id}">삭제</button></div>`).join(''):'<div class="empty">첨부된 증빙이 없습니다.</div>'}</div>`; }

function summary(t) { const c=calculate(t), v=getVehicle(t.vehicleId); return `<div class="summary-grid"><div><div class="calc-list">
    <div class="calc-row"><div><b>일비</b><small>${c.days}일 × ${won(state.settings.dailyRate)}${c.dailyRateFactor===0.5?' × 50%(관용차)':''}</small></div><span>${c.dailyRateFactor===0.5?'관용차 감액':'규정 정액'}</span><strong>${won(c.daily)}</strong></div>
    <div class="calc-row"><div><b>식비</b><small>${c.days}일, 무료 제공식 ${c.providedMeals}회 × 1/3 차감</small></div><span>규정 정액</span><strong>${won(c.meals)}</strong></div>
    <div class="calc-row"><div><b>숙박비</b><small>실제 ${won(t.lodgingActual)} / 한도 ${won(c.cap)}</small></div><span>실비·상한 적용</span><strong class="${Number(t.lodgingActual)>c.cap?'cap-over':''}">${won(c.lodging)}</strong></div>
    <div class="calc-row"><div><b>${t.transport==='car'?'자가용 에너지비':t.transport==='official'?'관용차':'교통 운임'}</b><small>${t.transport==='car'?`${t.distance||0}km ÷ ${v?.efficiency||0}${v?.unit || efficiencyUnits[v?.fuel]} × ${won(t.oilPrice)}/${energyUnits[v?.fuel] || '단위'}`:t.transport==='official'?'별도 운임 없음':'실제 결제금액'}</small></div><span>${t.transport==='car'?esc(t.oilSource):t.transport==='official'?'일비 50% 지급':'승차권 증빙'}</span><strong>${won(t.transport==='car'?c.fuel:c.transit)}</strong></div>
    ${c.extras?`<div class="calc-row"><div><b>통행·주차료</b><small>실비 입력</small></div><span>증빙 첨부</span><strong>${won(c.extras)}</strong></div>`:''}
    <div class="calc-row"><div><b>절사 전 합계</b><small>전체 인정금액 합산</small></div><span>소계</span><strong>${won(c.grossTotal)}</strong></div>
    <div class="calc-row"><div><b>원단위 절사</b><small>10원 미만 금액 버림</small></div><span>최종금액 적용</span><strong>-${won(c.truncation)}</strong></div>
  </div><div class="notice">적용 규정: ${esc(state.settings.ruleVersion)} · 출력 시 적용 단가와 계산 근거가 정산 건에 저장됩니다.</div></div><div><div class="total-box"><span>최종 지급 산정액</span><b>${won(c.total)}</b><small>증빙 ${t.attachments?.length||0}건 · 원단위 절사 적용</small></div><div class="panel" style="margin-top:14px"><div class="panel-body"><b>출장 요약</b><p>${esc(t.employee)} · ${esc(t.department)}</p><p>${t.startDate} ~ ${t.endDate}</p><p>${esc(provinceName(t.province))} ${esc(t.city||'')} · ${esc(t.purpose)}</p></div></div></div></div>`; }

function render() {
  const titles={dashboard:'출장 정산 현황',editor:'출장 정산 작성',admin:'운영 기준 관리(숨김)'};
  if(currentView==='admin'&&!adminMode)currentView='dashboard';
  $('#page-title').textContent=titles[currentView];
  $('#app').innerHTML=({dashboard,editor,admin}[currentView]||dashboard)();
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
  // 시·도를 바꾸면 시·군·구 목록도 그 시·도 것으로 갈아 끼웁니다.
  $('[name="province"]')?.addEventListener('change',(e)=>{const city=$('[name="city"]');if(!city)return;city.innerHTML=`<option value="">선택 안 함</option>${districtOptions(e.target.value,'')}`;currentTrip().city=''});
  $('[name="transport"]')?.addEventListener('change',toggleTransport);
  $('[name="vehicleId"]')?.addEventListener('change',(e)=>{const vehicle=getVehicle(e.target.value);const price=state.settings.fallbackFuel?.[vehicle?.fuel]||0;const priceInput=$('[name="oilPrice"]');if(priceInput)priceInput.value=price;const trip=currentTrip();trip.oilPrice=price;trip.oilSource='기준단가';toast(`${vehicle?.name || fuelLabels[vehicle?.fuel]} 기준단가를 적용했습니다.`)});
  $('#admin-form')?.addEventListener('submit',saveAdmin);
  $('[data-action="add-vehicle"]')?.addEventListener('click',()=>{state.vehicles.push({id:crypto.randomUUID(),name:'새 차량 종류',fuel:'gasoline',efficiency:0,unit:'km/L',active:true});render()});
  $('[data-action="key-test"]')?.addEventListener('click',testOpinetKey);
  $('[data-action="admin-reset"]')?.addEventListener('click',async()=>{await request('/api/admin/reset',{method:'POST',body:'{}'});await load();toast('배포본 기준으로 되돌렸습니다.')});
  $$('[data-remove-vehicle]').forEach(b=>b.onclick=()=>{state.vehicles.splice(Number(b.dataset.removeVehicle),1);render()});
  $$('[data-vehicle] select').forEach(sel=>sel.onchange=()=>{const row=sel.closest('[data-vehicle]');const unitInput=$$('input',row)[2];if(unitInput)unitInput.value=efficiencyUnits[sel.value]});
  $('[data-action="oil"]')?.addEventListener('click',lookupOil);
  $('[data-action="distance"]')?.addEventListener('click',lookupDistance);
  $('[data-action="place-search"]')?.addEventListener('click',searchPlaces);
  $('#proof-file')?.addEventListener('change',uploadFiles);
  $$('[data-delete-attachment]').forEach(b=>b.onclick=async()=>{await request(`/api/attachments/${b.dataset.deleteAttachment}`,{method:'DELETE'});await load();render()});
}
function saveLocal(){const t=serializeTrip();const i=state.trips.findIndex(x=>x.id===t.id);if(i>=0)state.trips[i]=t;else{t.id=t.id||crypto.randomUUID();editingId=t.id;state.trips.unshift(t)}}
function workerUrl(path){const configured=String(state.settings.routeApiUrl||defaultWorkerRouteUrl).trim();const url=new URL(configured);url.pathname=path;url.search='';return url}
// Worker 호출은 연결이 끊기거나 응답이 비는 경우가 드물게 있어 재시도합니다.
// 응답이 왔는데 실패한 경우(4xx·5xx)는 원인이 분명하므로 재시도하지 않고 서버 메시지를 그대로 씁니다.
async function workerJson(url,failureMessage,attempts=3){let lastError=new Error(failureMessage);for(let attempt=1;attempt<=attempts;attempt++){if(attempt>1)await new Promise(done=>setTimeout(done,300*(attempt-1)));let response,body;try{response=await fetch(url,{signal:AbortSignal.timeout(15000)});body=await response.text()}catch(error){lastError=new Error(error.name==='TimeoutError'?`${failureMessage} 응답이 15초 안에 오지 않았습니다.`:`${failureMessage} 네트워크 연결에 실패했습니다.`);continue}let data=null;try{data=body?JSON.parse(body):null}catch{data=null}if(!data){lastError=new Error(`${failureMessage} 서버가 빈 응답을 보냈습니다.`);continue}if(!response.ok)throw new Error(data.error||failureMessage);return data}throw new Error(`${lastError.message} (${attempts}회 시도)`)}
async function searchPlaces(){const input=$('[name="destination"]'),results=$('#place-results');try{const query=input?.value.trim();if(!query||query.length<2)throw new Error('두 글자 이상 장소명을 입력해 주세요.');const url=workerUrl('/places');results.textContent='장소를 검색하는 중…';url.search=new URLSearchParams({query}).toString();const data=await workerJson(url,'장소검색에 실패했습니다.');if(!data.results?.length)throw new Error('검색 결과가 없습니다. 더 자세한 장소명을 입력해 주세요.');results.classList.add('place-result-list');results.innerHTML=data.results.map((item,i)=>`<button type="button" class="place-result" data-place-index="${i}"><b>${esc(item.title)}</b><span>${esc(item.address)}</span>${item.category?`<small>${esc(item.category)}</small>`:''}</button>`).join('');$$('[data-place-index]',results).forEach(button=>button.onclick=()=>{const item=data.results[Number(button.dataset.placeIndex)];input.value=item.address;results.classList.remove('place-result-list');results.textContent=`선택됨: ${item.title} · ${item.address}`;toast('선택한 장소 주소를 적용했습니다.');});}catch(error){results.classList.remove('place-result-list');results.textContent=error.message;toast(error.message)}}
function provinceKey(sido){const name=String(sido||'').replace(/\s+/g,'');if(!name)return '';const alias=Object.keys(provinceAliases).find(x=>name.startsWith(x));if(alias)return provinceAliases[alias];return Object.keys(provinceCodes).find(x=>name.includes(x))||''}
// 유가는 출발지 시·도 기준으로 조회합니다. 출발지에서 시·도를 못 얻으면 출장지 시·도로 되돌립니다.
async function originArea(t){const fallback={area:provinceCodes[t.province]||'',label:`출장지 ${t.province}`};const origin=t.origin?.trim();if(!origin)return fallback;try{const url=workerUrl('/region');url.search=new URLSearchParams({query:origin}).toString();const data=await workerJson(url,'출발지 지역을 확인하지 못했습니다.');const area=provinceCodes[provinceKey(data.sido)];if(!area)throw new Error(`출발지 시·도를 알 수 없습니다: ${data.sido}`);return{area,label:`출발지 ${data.sido}`}}catch(error){return{...fallback,notice:`${error.message} 출장지 ${t.province} 기준으로 조회합니다.`}}}
async function lookupOil(){try{const t=serializeTrip(),v=getVehicle(t.vehicleId);if(['electric','hydrogen'].includes(v?.fuel)){const price=state.settings.fallbackFuel?.[v.fuel]||0;$('[name="oilPrice"]').value=price;currentTrip().oilSource='기준단가';toast(`${v.name || fuelLabels[v.fuel]} 기준단가 ${won(price)}/${energyUnits[v.fuel]}를 적용했습니다.`);return}const region=await originArea(t);const area=region.area;if(region.notice)toast(region.notice);const proxy=workerUrl('/opinet');let result;if(proxy){proxy.search=new URLSearchParams({area,fuel:v?.fuel||'gasoline',date:t.startDate}).toString();result=await workerJson(proxy,'오피넷 조회에 실패했습니다.')}else result=await request(`/api/opinet?area=${area}&fuel=${v?.fuel||'gasoline'}&date=${t.startDate}`);$('[name="oilPrice"]').value=result.price;const cur=currentTrip();cur.oilPrice=result.price;cur.oilSource=`${result.source} (${result.tradeDate}) · ${region.label}`;toast(result.notice||`${region.label} 기준 ${result.source} ${won(result.price)}/${energyUnits[v?.fuel]||'L'}를 적용했습니다.`)}catch(e){const t=serializeTrip(),v=getVehicle(t.vehicleId);const price=state.settings.fallbackFuel?.[v?.fuel||'gasoline']||0;$('[name="oilPrice"]').value=price;currentTrip().oilSource='기준단가';toast(`${e.message} 기준단가 ${won(price)}/${energyUnits[v?.fuel]||'L'}를 사용합니다.`)}}
async function lookupDistance(){const result=$('#distance-result');try{const t=serializeTrip();if(!t.origin?.trim()||!t.destination?.trim())throw new Error('출발지와 상세 출장지를 모두 입력해 주세요.');result.textContent='네이버 지도에서 경로를 찾는 중…';const url=workerUrl('/route');url.searchParams.set('origin',t.origin);url.searchParams.set('destination',t.destination);const data=await workerJson(url,'거리 조회에 실패했습니다.');const input=$('[name="distance"]');input.value=data.roundTripKm;const trip=currentTrip();trip.distance=Number(data.roundTripKm);trip.origin=data.origin;trip.distanceSource=`네이버 지도 왕복 (${data.oneWayKm}km × 2)`;result.textContent=`편도 ${data.oneWayKm}km · 왕복 ${data.roundTripKm}km을 적용했습니다.`;toast('네이버 지도 왕복 거리를 입력했습니다.')}catch(error){result.textContent=error.message;toast(error.message)}}
// 정적 모드에서만 의미가 있는 안내입니다. 서버 모드는 파일을 디스크에 저장합니다.
function storageHelper(){if(!staticMode)return '';const used=(localStorage.getItem(staticStoreKey)||'').length;return `<p class="helper">사진은 긴 변 1600px·JPEG로 줄여 저장하고, 저장 공간이 부족하면 들어갈 때까지 자동으로 더 줄입니다(원본 최대 12MB, PDF 4MB). 현재 브라우저 저장 사용량 약 ${sizeText(used)}입니다.</p>`}
function readDataUrl(file){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file)})}
// GitHub Pages 모드는 증빙을 localStorage에 base64로 담습니다. 브라우저 할당량(보통 5~10MB)은
// 코드로 못 늘리므로, 영수증 사진을 읽을 수 있는 선까지 줄여 담을 수 있는 건수를 늘립니다.
async function compressImage(file,maxEdge=1600,quality=0.72){try{const bitmap=await createImageBitmap(file);const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas.toDataURL('image/jpeg',quality)}catch{return readDataUrl(file)}}
function dataUrlBytes(dataUrl){const base64=String(dataUrl).split(',')[1]||'';return Math.floor(base64.length*3/4)}
function sizeText(bytes){return bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)}MB`:`${Math.max(1,Math.round(bytes/1024))}KB`}
async function uploadFiles(e){try{let t=await saveTrip();let saved=0;for(const file of e.target.files){const isImage=file.type.startsWith('image/');
  // 사진은 압축해서 담으므로 원본이 커도 받습니다. PDF는 줄일 수 없어 정적 모드에서만 제한을 둡니다.
  const maxSize=!staticMode||isImage?12:4;if(file.size>maxSize*1024*1024){toast(`${file.name}: ${maxSize}MB를 초과합니다.`);continue}
  const a=await storeAttachment(t,file,isImage);if(!a)continue;if(staticMode&&isImage)saved+=Math.max(0,file.size-dataUrlBytes(a.data));t.attachments=t.attachments||[];t.attachments.push(a)}
  await load();editingId=t.id;render();toast(saved>0?`증빙자료를 첨부했습니다. 사진을 ${sizeText(saved)} 줄여 저장했습니다.`:'증빙자료를 첨부했습니다.')}catch(error){toast(error.message)}}
// 저장 공간이 부족하면 실패시키지 않고 사진을 한 단계씩 더 줄여 다시 시도합니다.
// 실패한 저장은 localStorage를 건드리지 않으므로(staticData가 매번 새로 읽음) 그대로 재시도해도 안전합니다.
const compressionSteps=[[1600,0.72],[1200,0.6],[900,0.5],[640,0.4],[480,0.35],[360,0.3]];
async function storeAttachment(trip,file,isImage){
  const attempts=staticMode&&isImage?compressionSteps:[null];
  for(let i=0;i<attempts.length;i++){
    const step=attempts[i];
    const data=step?await compressImage(file,step[0],step[1]):await readDataUrl(file);
    try{const saved=await request('/api/attachments',{method:'POST',body:JSON.stringify({tripId:trip.id,name:file.name,data})});if(step&&i>0)toast(`${file.name}: 저장 공간에 맞춰 ${step[0]}px로 더 줄였습니다.`);return saved}
    catch(error){
      if(error.code!=='QUOTA')throw error;
      if(i<attempts.length-1)continue;
      toast(step?`${file.name}: 최소 화질로도 저장 공간이 부족합니다. 예전 증빙을 삭제해 주세요.`:`${file.name}: 저장 공간이 부족합니다. PDF는 줄일 수 없으니 예전 증빙을 삭제해 주세요.`);
      return null;
    }
  }
  return null;
}
function openDetail(id){const t=state.trips.find(x=>x.id===id),c=calculate(t),v=getVehicle(t.vehicleId);const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal"><div class="panel"><div class="panel-head"><div><h2>${esc(t.purpose)}</h2><div class="helper">${t.startDate} ~ ${t.endDate}</div></div><button class="btn btn-secondary btn-small" data-close>닫기</button></div><div class="panel-body"><div class="detail-grid"><div class="detail-item"><small>출장자</small><b>${esc(t.employee)} · ${esc(t.department)}</b></div><div class="detail-item"><small>출장지</small><b>${esc(provinceName(t.province))} ${esc(t.city||'')}</b></div><div class="detail-item"><small>산정액</small><b>${won(c.total)}</b></div></div><div style="margin-top:20px">${summary(t)}</div><h3>처리 이력</h3><div class="history">${(t.history||[]).map(h=>`<div class="history-item"><b>${esc(h.action)} · ${esc(h.actor)}</b><small>${new Date(h.at).toLocaleString('ko-KR')} ${h.note?'· '+esc(h.note):''}</small></div>`).join('')||'<span class="helper">이력이 없습니다.</span>'}</div><div class="actions"><button class="btn btn-secondary" data-edit>수정</button><button class="btn btn-primary" data-print>총괄 PDF 출력</button></div></div></div></div>`;document.body.append(modal);modal.onclick=e=>{if(e.target===modal||e.target.hasAttribute('data-close'))modal.remove()};$('[data-edit]',modal)?.addEventListener('click',()=>{modal.remove();editingId=id;editorStep=1;setView('editor')});$('[data-print]',modal).onclick=()=>printTrip(t,v,c)}
async function updateStatus(id,status,action,note=''){await request(`/api/trips/${id}/status`,{method:'POST',body:JSON.stringify({status,action,actor:'회계담당자',note})});$$('.modal-backdrop').forEach(x=>x.remove());await load();toast(`${action} 처리했습니다.`)}
function md(date){return String(date||'').slice(5)}
function transportLabel(kind){return {car:'자가용',train:'철도',bus:'버스',public:'기타 대중교통',official:'관용차'}[kind]||'-'}
function printStamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}년 ${p(d.getMonth()+1)}월 ${p(d.getDate())}일 ${p(d.getHours())}시 ${p(d.getMinutes())}분 ${p(d.getSeconds())}초`}
// 광양시 「여비 지급명세서」 서식입니다. 15개 열 구성과 3개 행(내역·공무용차량·합계)을 그대로 따릅니다.
function expenseSheet(t,v,c){
  const fare=Math.floor(c.fuel+c.transit), km=Number(t.distance||0);
  const local=0; // 현지교통비: 앱에 대응 입력이 없어 0으로 출력합니다.
  return `<section class="expense-sheet"><h1><span>여비 지급명세서</span></h1><table><colgroup><col style="width:8%"><col style="width:10%"><col style="width:9%"><col style="width:8%"><col style="width:8%"><col style="width:5%"><col style="width:7%"><col style="width:6%"><col style="width:6%"><col style="width:6%"><col style="width:5%"><col style="width:5%"><col style="width:6%"><col style="width:6%"><col style="width:5%"></colgroup>
    <thead><tr><th>출장자</th><th rowspan="2">출장목적</th><th>출장월일<br>(출장시간)</th><th colspan="4">출장지(경로요금 포함)</th><th rowspan="2">식비</th><th rowspan="2">숙박비</th><th rowspan="2">일비</th><th rowspan="2">현지<br>교통비</th><th rowspan="2">기타</th><th rowspan="2">계</th><th rowspan="2">청구액및<br>수령액</th><th rowspan="2">영수인<br>(청구액외<br>포기함)</th></tr>
    <tr><th>소속/직급/성명</th><th>공무용차량</th><th>출발</th><th>도착</th><th>종별</th><th>거리/요금</th></tr></thead>
    <tbody><tr>
      <td class="who">${esc(t.department)}<br>${esc(t.grade)}<br>${esc(t.employee)}</td>
      <td class="purpose">${esc(t.purpose)}</td>
      <td>${md(t.startDate)}~${md(t.endDate)}<br>(${esc(t.startTime||'')} ~ ${esc(t.endTime||'')})</td>
      <td>${esc(t.origin||'-')}</td><td>${esc(t.destination||'-')}</td><td>${transportLabel(t.transport)}</td>
      <td class="fare">${km}Km<br>${won(fare)}</td>
      <td class="money">${won(c.meals)}</td><td class="money">${won(c.lodging)}</td><td class="money">${won(c.daily)}</td>
      <td class="money">${won(local)}</td><td class="money">${won(c.extras)}</td><td class="money">${won(c.grossTotal)}</td>
      <td class="money">${won(c.total)}</td><td></td></tr>
    <tr><td></td><td></td><td>공무용차량(${t.transport==='official'?'사용':'미사용-'})</td><td colspan="2"></td><td>합계</td>
      <td class="fare">${km}Km<br>${won(fare)}</td><td colspan="8"></td></tr>
    <tr class="sum"><td colspan="6">합　　계</td><td class="money">${won(fare)}</td>
      <td class="money">${won(c.meals)}</td><td class="money">${won(c.lodging)}</td><td class="money">${won(c.daily)}</td>
      <td class="money">${won(local)}</td><td class="money">${won(c.extras)}</td><td class="money">${won(c.grossTotal)}</td>
      <td class="money">${won(c.total)}</td><td></td></tr></tbody></table>
    <div class="sheet-foot"><span>광양시 ${esc(t.department)}</span><span>1/1</span><span>${esc(t.employee)} ${printStamp()}</span></div></section>`;
}
// 이미지는 data URL이라도 비동기로 그려집니다. 곧바로 print()를 부르면
// 사진대지의 사진 자리가 빈 채로 인쇄됩니다. 다 그려질 때까지 기다립니다.
function waitForImages(root, timeout = 8000) {
  const pending = $$('img', root).filter((img) => !img.complete || !img.naturalWidth);
  if (!pending.length) return Promise.resolve();
  const loaded = Promise.all(pending.map((img) => new Promise((done) => { img.onload = img.onerror = done; })));
  // 한 장이 깨져도 인쇄 자체가 막히지 않도록 상한을 둡니다.
  return Promise.race([loaded, new Promise((done) => setTimeout(done, timeout))]);
}
async function printTrip(t,v,c){const attachments=t.attachments||[], images=attachments.filter(a=>a.type.startsWith('image/')), documents=attachments.filter(a=>!a.type.startsWith('image/'));let report=$('#print-report');if(!report){report=document.createElement('section');report.id='print-report';report.className='print-report';document.body.append(report)}report.innerHTML=`${expenseSheet(t,v,c)}${images.length?`<section class="evidence-sheet"><div class="evidence-sheet-head"><h2>증빙자료 사진대지</h2><span>총 ${images.length}건</span></div><div class="photo-grid">${images.map(a=>`<figure class="photo-card"><div class="photo-frame"><img src="${attachmentUrl(a)}" alt="${esc(a.name)}"></div><figcaption><b>${esc(a.name)}</b><span>등록일 ${new Date(a.uploadedAt).toLocaleDateString('ko-KR')}</span></figcaption></figure>`).join('')}</div></section>`:''}${documents.length?`<section class="document-proof"><h2>원본 파일 증빙</h2><p>아래 PDF 증빙은 사진대지와 함께 원본 파일로 보관됩니다.</p><ol>${documents.map(a=>`<li>${esc(a.name)} <span>(등록일 ${new Date(a.uploadedAt).toLocaleDateString('ko-KR')})</span></li>`).join('')}</ol></section>`:''}`;await waitForImages(report);window.print()}

$('#nav').addEventListener('click',(e)=>{const b=e.target.closest('button[data-view]');if(b)setView(b.dataset.view)});
// ?admin 으로 들어왔을 때만 메뉴에 관리자 항목을 붙이고 그 화면으로 시작합니다.
if(adminMode){const b=document.createElement('button');b.dataset.view='admin';b.innerHTML='<span>⚙</span> 관리자 설정';$('#nav').append(b);currentView='admin'}
load().catch(e=>{document.querySelector('#app').innerHTML=`<div class="panel"><div class="empty">${esc(e.message)}<br>서버를 다시 실행해 주세요.</div></div>`});

function admin() { const s=state.settings; return `<form id="admin-form"><div class="admin-grid"><div class="panel"><div class="panel-head"><h2>여비 기준</h2></div><div class="panel-body"><div class="form-grid">
    ${input('dailyRate','일비(1일)',s.dailyRate,'number','half')}${input('mealRate','식비(1일)',s.mealRate,'number','half')}
    ${input('capSeoul','숙박 상한·서울(1박)',s.lodgingCaps?.seoul,'number','third')}${input('capMetro','숙박 상한·광역시(1박)',s.lodgingCaps?.metro,'number','third')}${input('capOther','숙박 상한·기타(1박)',s.lodgingCaps?.other,'number','third')}
    ${input('ruleVersion','규정 버전',s.ruleVersion,'text','full')}
  </div></div></div><div class="panel"><div class="panel-head"><h2>오피넷·대체 유가</h2></div><div class="panel-body"><div class="form-grid">
    <input type="hidden" name="routeApiUrl" value="${esc(s.routeApiUrl || defaultWorkerRouteUrl)}">
    <div class="field full notice">지도·오피넷 조회 Worker는 자동 연결됩니다. 인증키는 Cloudflare Worker에 보관되므로 여기에 입력할 필요가 없습니다.</div>
    <div class="field full"><button type="button" class="btn btn-secondary" data-action="key-test">유가 조회 연결 테스트</button><span id="key-test-result" class="helper" style="display:inline-block;margin-left:10px">Worker를 통해 오피넷 응답을 확인합니다.</span></div>
    ${input('gasoline','휘발유 단가(원/L)',s.fallbackFuel?.gasoline,'number')}${input('diesel','경유 단가(원/L)',s.fallbackFuel?.diesel,'number')}${input('lpg','LPG 단가(원/L)',s.fallbackFuel?.lpg,'number')}
    ${input('hybrid','하이브리드 단가(원/L)',s.fallbackFuel?.hybrid,'number')}
    ${input('electric','전기 단가(원/kWh)',s.fallbackFuel?.electric,'number')}${input('hydrogen','수소 단가(원/kg)',s.fallbackFuel?.hydrogen,'number')}
    <div class="field full notice">휘발유·경유·LPG·하이브리드는 오피넷 조회를 시도하며, 지역 유가는 <b>출발지 시·도</b> 기준으로 조회합니다. 출발지에서 시·도를 확인하지 못하면 출장 시·도로 조회합니다. 하이브리드는 기본적으로 휘발유 가격을 사용합니다. 전기·수소는 관리자 기준단가를 적용합니다.</div>
  </div></div></div></div>
  <div class="panel"><div class="panel-head"><h2>차량 종류별 기준연비</h2><button type="button" class="btn btn-secondary btn-small" data-action="add-vehicle">＋ 종류 추가</button></div><div class="panel-body"><div class="notice" style="margin-bottom:12px">차량 종류는 휘발유·경유·LPG·하이브리드·전기·수소로 관리합니다. 각 유형의 기준연비는 운영 기준에 맞게 관리자가 수정할 수 있습니다.</div><div id="vehicles">${vehicleRows()}</div></div></div>
  <div class="field full notice">이 화면은 메뉴에 없으며 주소 뒤에 <b>?admin</b>을 붙여야 열립니다. 여기서 저장한 값은 <b>이 브라우저에만</b> 적용되고 다른 사용자에게는 배포본 기준이 그대로 보입니다. 모두에게 반영하려면 <b>public/default-data.json</b>을 고쳐 배포해야 합니다.</div>
  <div class="actions"><button type="button" class="btn btn-secondary" data-action="admin-reset">배포본 값으로 되돌리기</button><button class="btn btn-primary" type="submit">관리자 설정 저장</button></div></form>`; }

function vehicleRows() { return state.vehicles.map((v,i)=>`<div class="vehicle-card" data-vehicle="${i}"><input value="${esc(v.name || fuelLabels[v.fuel])}" aria-label="차량 종류명" placeholder="예: 전기차"><select aria-label="연료 유형">${Object.entries(fuelLabels).map(([x,l])=>`<option value="${x}" ${x===v.fuel?'selected':''}>${l}</option>`).join('')}</select><input type="number" step="0.01" min="0" value="${v.efficiency}" aria-label="기준연비" placeholder="기준연비 (소수점 둘째 자리)"><input value="${v.unit || efficiencyUnits[v.fuel]}" aria-label="연비 단위" readonly><button type="button" class="btn btn-danger btn-small" data-remove-vehicle="${i}">삭제</button></div>`).join(''); }

async function saveAdmin(e){e.preventDefault();const f=new FormData(e.currentTarget);const rows=$$('[data-vehicle]').map((r,i)=>{const fuel=$('select',r).value;return{id:state.vehicles[i].id||crypto.randomUUID(),name:$$('input',r)[0].value,fuel,efficiency:Number($$('input',r)[1].value),unit:efficiencyUnits[fuel],active:true}});const settings={dailyRate:Number(f.get('dailyRate')),mealRate:Number(f.get('mealRate')),lodgingCaps:{seoul:Number(f.get('capSeoul')),metro:Number(f.get('capMetro')),other:Number(f.get('capOther'))},ruleVersion:f.get('ruleVersion'),routeApiUrl:f.get('routeApiUrl').trim(),fallbackFuel:{gasoline:Number(f.get('gasoline')),diesel:Number(f.get('diesel')),lpg:Number(f.get('lpg')),hybrid:Number(f.get('hybrid')),electric:Number(f.get('electric')),hydrogen:Number(f.get('hydrogen'))}};await request('/api/admin',{method:'POST',body:JSON.stringify({settings,vehicles:rows})});await load();toast('관리자 설정을 저장했습니다.')}

async function testOpinetKey(){const result=$('#key-test-result');result.textContent='확인 중…';try{const today=new Date().toISOString().slice(0,10);const proxy=workerUrl('/opinet');let data;if(proxy){proxy.search=new URLSearchParams({area:'20',fuel:'gasoline',date:today}).toString();data=await workerJson(proxy,'오피넷 조회에 실패했습니다.')}else data=await request(`/api/opinet?area=20&fuel=gasoline&date=${today}`);result.textContent=`연결 정상 · ${data.source} ${won(data.price)}/L`;result.style.color='#08745f'}catch(e){result.textContent=`연결 실패 · ${e.message}`;result.style.color='#c23b4a'}}
