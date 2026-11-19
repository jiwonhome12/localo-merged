const $ = (id) => document.getElementById(id);
const regionById = new Map(regions.map((region) => [region.id, region]));
const placeById = new Map(places.map((place) => [place.id, place]));
const state = {
  filter: 'all', region: null, category: 'all', place: null, zoom: 1,
  people: 2, support: '일반', basketRegion: 'geochang',
  basket: new Map([['gc-coffee', 2], ['gc-stay', 1], ['gc-soup', 2], ['hy-beef', 2]]),
};

const supportTypes = ['일반', '청년', '가족'];
const sampleRefundRate = 0.5;
const numberFormat = new Intl.NumberFormat('ko-KR');
const won = (value) => numberFormat.format(value) + '원';
const attr = (value) => String(value).replace(/[&"<]/g, (char) => ({
  '&': '&amp;', '"': '&quot;', '<': '&lt;',
})[char]);
const icons = {
  focus: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="2"/>',
  bag: '<rect x="3.5" y="7" width="17" height="13" rx="2"/><path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M4 12h16m-10 0v2h4v-2"/>',
};

for (const element of document.querySelectorAll('[data-icon]')) {
  element.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[element.dataset.icon] + '</svg>';
}

function chip(label, action, value, active, className = '') {
  return `<button type="button" class="chip ${className}" data-action="${action}" data-value="${value}" aria-pressed="${active}">${label}</button>`;
}

function statusBadge(region) {
  return `<span class="status-label ${region.status}">${statuses[region.status]}</span>`;
}

function categoryIcon(category) {
  return `<span class="category-icon ${category}" aria-hidden="true">${categories[category].symbol}</span>`;
}

function visibleRegions() {
  return regions.filter((region) => state.filter === 'all' || region.status === state.filter);
}

function visiblePlaces() {
  return places.filter((place) => place.region === state.region &&
    (state.category === 'all' || place.category === state.category));
}

function renderRegionPane() {
  const pane = $('region-pane');
  const scrollTop = pane.scrollTop;
  const matching = visibleRegions();
  pane.innerHTML = Object.entries(statuses).map(([status, label]) => {
    const group = matching.filter((region) => region.status === status);
    if (!group.length) return '';
    return `<section class="region-card-group ${status}" aria-label="${label} 지역">
      <h3>${label}<span>${group.length}</span></h3>
      <div class="region-cards">${group.map((region) => `
        <button type="button" class="region-card ${status}" data-action="region" data-value="${region.id}"
          aria-pressed="${state.region === region.id}" aria-label="${region.province} ${region.name}, ${label}">
          <span class="region-card-province">${region.province}</span><strong>${region.name}</strong>
          <span class="region-card-status">${label}</span>
        </button>`).join('')}</div>
    </section>`;
  }).join('');
  pane.scrollTop = scrollTop;
}

function renderSelectedRegion() {
  const region = regionById.get(state.region);
  $('selected-region').innerHTML = `<div>
    <span class="panel-eyebrow">${region ? region.province + ' · 선택한 여행지' : '지역 카드로 여행을 시작하세요'}</span>
    <h2 id="selected-region-name" tabindex="-1">${region ? region.name : '전국 여행지'}</h2>
    <div class="selected-region-meta">${region ? statusBadge(region) : '<span>가고 싶은 지역을 선택해 보세요.</span>'}</div>
    </div>${region ? '<button type="button" class="text-button" data-action="reset-map">전국 보기</button>' : ''}`;
}

function renderRegionContent() {
  const region = regionById.get(state.region);
  $('region-content').innerHTML = region ? regionDetail(region) :
    '<p class="photo-intro">사진이나 지역 카드를 선택하면<br>그 지역의 지도와 장소를 볼 수 있어요.</p>';
}

function renderPromotionPane() {
  const region = regionById.get(state.region);
  $('photo-title').textContent = region ? region.name + '의 풍경' : '로컬의 풍경';
  const photos = (region ? [region] : regions).flatMap((item) =>
    (regionPhotos[item.id] || []).map((photo) => ({ ...photo, region: item })),
  );
  $('photo-gallery').innerHTML = photos.map((photo, index) => `
    <button type="button" class="promotion-photo" data-action="region" data-value="${photo.region.id}"
      aria-label="${photo.region.name} 지도 보기">
      <img src="${attr(photo.src)}" alt="${attr(photo.alt)}" ${index ? 'loading="lazy"' : 'fetchpriority="high"'}>
      <span class="promotion-caption"><span>${photo.region.province}</span><strong>${photo.region.name}</strong><span>${attr(photo.caption)}</span></span>
      ${photo.isExample ? '<span class="photo-example">예시 이미지</span>' : ''}
    </button>`).join('') || `<div class="photo-placeholder" role="img" aria-label="${region ? region.name : '지역'} 홍보 사진 준비 중">
      <span>${region ? region.name : '로컬의 풍경'}</span><strong>여행의 풍경을 담을 자리</strong><p>홍보 사진 준비 중</p>
    </div>`;
  renderRegionContent();
}

function regionDetail(region) {
  const filters = [['all', { name: '전체' }], ...Object.entries(categories)].map(([key, category]) =>
    chip(category.name, 'category', key, state.category === key),
  ).join('');
  const regionPlaces = visiblePlaces().map((place) => `
    <div class="place-row ${state.place === place.id ? 'selected' : ''}" id="place-${place.id}">
      ${categoryIcon(place.category)}
      <div class="place-info"><b>${place.name}</b><span>${categories[place.category].name} · ${won(place.price)}</span></div>
      <button type="button" class="place-add" data-action="add" data-value="${place.id}" aria-label="${place.name} 담기" ${state.basket.has(place.id) ? 'disabled' : ''}>${state.basket.has(place.id) ? '담음' : '담기'}</button>
    </div>`).join('');

  return `<div class="region-detail">
    <section class="places-heading" aria-label="장소 목록">
      <h2 tabindex="-1" id="region-detail-name">${region.name}의 장소</h2><div class="filter-group" aria-label="장소 유형 필터">${filters}</div>
      ${regionPlaces || '<p class="empty">표시할 예시 장소가 없어요.</p>'}
    </section>
    <details class="region-information"><summary>신청 및 환급 정보</summary><div class="region-facts">
      <dl><div><dt>신청 조건</dt><dd>공고 확인 예정</dd></div>
      <div><dt>환급 조건</dt><dd>공고 확인 예정</dd></div>
      <div><dt>환급 방식</dt><dd>공고 확인 예정</dd></div>
      <div><dt>공식 신청처</dt><dd>연결 예정</dd></div></dl>
      <a class="text-button" href="#guide">사업 안내 보기</a>
    </div></details></div>`;
}

function renderTray() {
  const groups = basketGroups();
  $('tray').innerHTML = `<div class="section-heading"><h2 id="tray-title">담아둔 여행지</h2>
    <span class="count-label">${state.basket.size}곳</span></div>
    <div class="tray-content">${[...groups].map(([id, entries]) => `
      <div class="tray-row"><button type="button" class="tray-region" data-action="basket-region" data-value="${id}" aria-label="${regionById.get(id).name} 바구니 보기">${regionById.get(id).shortName} <span>${entries.length}</span></button>
        <div class="tray-places">${[...entries].reverse().map(([place]) => `
          <span class="tray-place"><span class="place-dot ${place.category}"></span>${place.name}
          <button type="button" data-action="remove" data-value="${place.id}" aria-label="${place.name} 빼기">×</button></span>`).join('')}</div></div>`).join('') ||
          '<p class="empty">지역 상세에서 장소를 담아보세요.</p>'}</div>`;
}

function project(lon, lat) {
  return [112 + (lon - 125.55) * 94, 32 + (38.7 - lat) * 109];
}

const districtByName = new Map(regions.map((region) => [
  region.name === '고성군' ? '38340' : region.name, region,
]));
const mapRegionPaths = new Map();
const mapGeometry = $('map-geometry');
mapGeometry.innerHTML = districtPaths.map(([code, name, path]) => {
  const region = districtByName.get(name === '고성군' ? code : name);
  return `<path class="district${region ? ' ' + region.status : ''}" ${region ? 'data-region="' + region.id + '"' : ''} d="${path}"/>`;
}).join('') + '<g id="map-labels"></g>';
for (const path of mapGeometry.querySelectorAll('[data-region]')) {
  mapRegionPaths.set(path.dataset.region, path);
}

function setMapZoom(zoom) {
  const nextZoom = Math.min(8, Math.max(1, zoom));
  if (nextZoom === state.zoom) return false;
  state.zoom = nextZoom;
  return true;
}

function renderMap() {
  const region = regionById.get(state.region);
  const matching = visibleRegions();
  const [centerX, centerY] = region ? project(region.lon, region.lat) : [310, 320];
  const width = 620 / state.zoom;
  const height = 640 / state.zoom;
  const originX = centerX - width / 2;
  const originY = centerY - height / 2;
  const position = (x, y) => `left:${(x - originX) * 100 / width}%;top:${(y - originY) * 100 / height}%`;

  $('map-header').innerHTML = region
    ? `<div class="map-heading"><span class="panel-eyebrow">${region.province}에서 찾은 여행</span><h1 id="map-title" tabindex="-1">${region.name} 지도</h1><p>${statuses[region.status]} · 가고 싶은 장소를 바구니에 담아보세요.</p></div><div class="map-header-actions">
      <button type="button" class="chip mobile-details" data-action="show-details">지역 상세</button>
      <button type="button" class="chip" data-action="reset-map">전국 지도</button></div>`
    : `<div class="map-heading"><span class="panel-eyebrow">가까운 곳에서 발견하는 새로운 여행</span><h1 id="map-title" tabindex="-1">반값여행 지역 지도</h1><p>지역을 선택하고, 나만의 여행을 만들어보세요.</p></div>
      <span class="map-badge"><span>${state.filter === 'all' ? '대상 지역' : '표시 지역'}</span><span><b>${matching.length}</b>곳</span></span>`;

  mapGeometry.setAttribute('viewBox', `${originX} ${originY} ${width} ${height}`);
  const highlighted = new Set(region ? [region.id] : matching.map(({ id }) => id));
  for (const [id, path] of mapRegionPaths) {
    path.classList.toggle('target', highlighted.has(id));
    path.classList.toggle('selected', id === state.region);
  }

  const lines = [];
  const labels = [];
  if (region) {
    for (const place of visiblePlaces()) {
      const x = centerX + place.x;
      const y = centerY + place.y;
      labels.push(`<button type="button" class="map-marker place ${state.place === place.id ? 'active' : ''}"
        data-action="place" data-value="${place.id}" style="${position(x, y)}">${categoryIcon(place.category)}${place.name}</button>`);
    }
    labels.push(`<span class="area-label" aria-hidden="true">${region.shortName}</span>`);
  } else {
    // Keep all map text in the HTML overlay so SVG zoom only scales geometry.
    for (const [name, x, y] of [['서해', 71, 344], ['동해', 539, 253], ['남해', 446, 550]]) {
      labels.push(`<span class="sea-label" aria-hidden="true" style="${position(x, y)}">${name}</span>`);
    }
    for (const item of matching) {
      const [x, y] = project(item.lon, item.lat);
      const labelX = x + item.offsetX;
      const labelY = y + item.offsetY;
      const [screenX, screenY] = [(labelX - originX) / width, (labelY - originY) / height];
      if (screenX < 0.03 || screenX > 0.97 || screenY < 0.02 || screenY > 0.98) continue;
      lines.push(`<line class="map-leader" x1="${x}" y1="${y}" x2="${labelX}" y2="${labelY}"/><circle class="map-anchor" cx="${x}" cy="${y}" r="1.7"/>`);
      labels.push(`<button type="button" class="map-marker ${item.status}" data-action="region" data-value="${item.id}"
        aria-label="${item.name} ${statuses[item.status]}" style="${position(labelX, labelY)}">
        ${item.shortName}</button>`);
    }
  }
  $('map-labels').innerHTML = lines.join('');
  $('map-markers').innerHTML = labels.join('');
  $('map-stage').querySelector('[data-action="zoom-in"]').disabled = state.zoom >= 8;
  $('map-stage').querySelector('[data-action="zoom-out"]').disabled = state.zoom <= 1;
}

function basketGroups() {
  const groups = new Map();
  for (const [id, quantity] of state.basket) {
    const place = placeById.get(id);
    if (!groups.has(place.region)) groups.set(place.region, []);
    groups.get(place.region).push([place, quantity]);
  }
  return groups;
}

function tripNights() {
  const time = Date.parse($('end-date').value) - Date.parse($('start-date').value);
  return Number.isFinite(time) ? Math.max(0, Math.round(time / 86400000)) : 0;
}

function itemCost(place, quantity) {
  return place.price * quantity * (place.category === 'stay' ? tripNights() : 1);
}

function basketItem(place, quantity) {
  const unit = categories[place.category].unit;
  const calculation = `${won(place.price)} × ${place.category === 'stay' ? tripNights() + '박 × ' : ''}${quantity}${unit}`;
  const controlLabel = attr(place.name + ' 수량');
  return `<div class="basket-item">
    <div class="item-title">${categoryIcon(place.category)}<strong>${place.name}</strong><strong class="item-price">${won(itemCost(place, quantity))}</strong></div>
    <div class="item-meta"><span>${calculation}</span><div class="item-controls"><div class="stepper mini">
      <button type="button" data-action="quantity" data-value="${place.id}" data-delta="-1" aria-label="${controlLabel} 줄이기" ${quantity <= 1 ? 'disabled' : ''}>−</button>
      <output>${quantity}${unit}</output>
      <button type="button" data-action="quantity" data-value="${place.id}" data-delta="1" aria-label="${controlLabel} 늘리기" ${quantity >= 99 ? 'disabled' : ''}>+</button>
    </div><button type="button" class="delete-item" data-action="remove" data-value="${place.id}" aria-label="${place.name} 삭제">삭제</button></div></div>
  </div>`;
}

function renderTrip() {
  const groups = basketGroups();
  const showCostDetails = $('cost-details')?.open ?? false;
  if (state.basketRegion !== 'all' && !groups.has(state.basketRegion)) state.basketRegion = groups.keys().next().value ?? 'all';
  const tabs = [['all', '전체 ' + state.basket.size], ...[...groups].map(([id, entries]) => [id, regionById.get(id).name + ' ' + entries.length])];
  const activeGroups = [...groups].filter(([id]) => state.basketRegion === 'all' || id === state.basketRegion);
  const totals = { food: 0, stay: 0, cafe: 0, spot: 0 };
  for (const [, entries] of activeGroups) {
    for (const [place, quantity] of entries) totals[place.category] += itemCost(place, quantity);
  }
  const total = Object.values(totals).reduce((sum, price) => sum + price, 0);
  const discount = Math.floor(total * sampleRefundRate);

  $('people-label').textContent = state.people + '명';
  document.querySelector('[data-action="people"][data-delta="-1"]').disabled = state.people <= 1;
  document.querySelector('[data-action="people"][data-delta="1"]').disabled = state.people >= 99;
  $('support-options').innerHTML = supportTypes.map((type) =>
    `<button type="button" data-action="support" data-value="${type}" aria-pressed="${state.support === type}">${type}</button>`,
  ).join('');
  $('trip-items').innerHTML = `
    <div class="trip-tabs" aria-label="여행 경비를 볼 지역">${tabs.map(([key, label]) => chip(label, 'basket-region', key, state.basketRegion === key)).join('')}</div>
    <div class="basket-section-heading"><h3>담은 장소</h3><span>${activeGroups.reduce((count, [, entries]) => count + entries.length, 0)}곳</span></div>
    ${activeGroups.map(([id, entries]) => {
      const region = regionById.get(id);
      const subtotal = entries.reduce((sum, [place, quantity]) => sum + itemCost(place, quantity), 0);
      return `<section class="basket-card">
        <div class="basket-heading"><h4>${region.name}</h4>${statusBadge(region)}<strong>${won(subtotal)}</strong></div>
        ${entries.map(([place, quantity]) => basketItem(place, quantity)).join('')}</section>`;
    }).join('') || '<div class="basket-empty"><span aria-hidden="true">＋</span><h3>어떤 여행을 떠나볼까요?</h3><p>지도에서 지역을 고른 뒤<br>가고 싶은 장소를 담아보세요.</p></div>'}
    <details class="cost-details" id="cost-details" ${showCostDetails ? 'open' : ''}>
      <summary>항목별 경비</summary>
      <div class="breakdown" aria-hidden="true">${Object.entries(totals).map(([key, cost]) => `<span class="${key}" style="width:${total ? cost * 100 / total : 0}%"></span>`).join('')}</div>
      <div class="category-totals">${Object.entries(totals).map(([key, price]) => `<span><i class="place-dot ${key}" aria-hidden="true"></i>${categories[key].name} <b>${won(price)}</b></span>`).join('')}</div>
    </details>`;

  const nights = tripNights();
  $('trip-summary').innerHTML = `<div class="summary-heading"><h3>예상 여행 경비</h3><span>${nights ? nights + '박 ' + (nights + 1) + '일' : '당일'} · ${state.people}명</span></div><dl>
    <div><dt>예상 경비 합계</dt><dd>${won(total)}</dd></div>
    <div><dt>예상 환급 (${state.support} · 50% 예시)</dt><dd class="discount">−${won(discount)}</dd></div>
    </dl><div class="total"><span>실제 부담 예상<small>환급 후 예상 금액</small></span><output>${won(total - discount)}</output></div>
    <p class="fine-print">시안용 계산이에요. 실제 환급 조건과 한도는 지자체 공고에서 확인하세요.</p>`;
}

function renderSecondary(page) {
  const copy = {
    route: ['AI 코스 추천', '지역별 장바구니로 여행 코스 화면을 미리 확인해 보세요.'],
    guide: ['반값여행 안내', '지역사랑휴가지원사업 신청에 필요한 정보를 찾아보세요.'],
  };
  const [title, description] = copy[page];
  let content;
  if (page === 'route') {
    content = [...basketGroups()].map(([id, entries]) => {
      const ordered = [...entries].sort(([a], [b]) => Number(b.category === 'stay') - Number(a.category === 'stay'));
      return `<article class="secondary-card"><h2>${regionById.get(id).name} 코스 예시</h2>
        <ol>${ordered.map(([place]) => `<li>${place.name} · ${categories[place.category].name}</li>`).join('')}</ol>
      </article>`;
    }).join('') || '<article class="secondary-card"><p>지역 지도에서 장소를 담으면 여기에 코스가 표시돼요.</p></article>';
  } else {
    content = [
      ['신청 조건', '여행 전 신청 기간, 거주지나 인원 제한, 필요한 서류를 확인하는 영역입니다.'],
      ['환급 조건과 방식', '환급 기준, 인정되는 결제 방식, 증빙 제출 기간, 지급 수단을 확인하는 영역입니다.'],
      ['인정 업체와 공식 신청처', '지역별 인정 업체와 지자체 공고 및 신청 페이지를 연결하는 영역입니다.'],
    ].map(([heading, body]) => `<article class="secondary-card"><h2>${heading}</h2><p>${body}</p></article>`).join('');
  }
  $('secondary').innerHTML = `<header class="secondary-header"><h1>${title}</h1><p>${description}</p></header>
    <div class="secondary-body">${content}</div>`;
}

function renderPage() {
  const name = location.hash.slice(1);
  const page = ['calendar', 'route', 'guide'].includes(name) ? name : 'map';
  document.body.dataset.page = page;
  $('workspace').hidden = page !== 'map';
  $('secondary').hidden = page === 'map';
  $('secondary').classList.toggle('calendar-page', page === 'calendar');
  for (const link of document.querySelectorAll('.navigation [data-page]')) {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (page === 'calendar') festivalCalendar.mount($('secondary'));
  else if (page !== 'map') renderSecondary(page);
}

function selectRegion(regionId, focusHeading) {
  state.region = regionId;
  state.category = 'all';
  state.place = null;
  state.zoom = regionId ? 5 : 1;
  renderRegionPane();
  renderSelectedRegion();
  renderPromotionPane();
  $('photo-scroll').scrollTop = 0;
  renderMap();
  if (focusHeading) {
    const card = regionId && $('region-pane').querySelector(`[data-value="${regionId}"]`);
    (card || $('selected-region-name')).focus({ preventScroll: true });
  }
}

function updateBasket() {
  renderTray();
  renderTrip();
  if (state.region) renderRegionContent();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const { action, value, delta } = button.dataset;
  const keyboard = event.detail === 0;
  switch (action) {
    case 'filter':
      state.filter = value;
      renderRegionPane();
      $('region-pane').scrollTop = 0;
      renderMap();
      break;
    case 'region':
      selectRegion(value, keyboard);
      return;
    case 'reset-map':
      selectRegion(null, keyboard);
      return;
    case 'show-details':
      $('region-content').scrollIntoView({ block: 'start', behavior: 'smooth' });
      $('region-detail-name').focus({ preventScroll: true });
      return;
    case 'zoom-in':
    case 'zoom-out':
      if (setMapZoom(state.zoom * (action === 'zoom-in' ? 1.25 : 0.8))) renderMap();
      break;
    case 'category':
      state.category = value;
      state.place = null;
      renderRegionContent();
      renderMap();
      break;
    case 'place':
      state.place = value;
      renderRegionContent();
      renderMap();
      if (getComputedStyle(document.querySelector('.mobile-details')).display === 'none') {
        $('place-' + value)?.scrollIntoView({ block: 'nearest' });
      }
      break;
    case 'people':
      state.people += Number(delta);
      renderTrip();
      break;
    case 'support':
      state.support = value;
      renderTrip();
      break;
    case 'basket-region':
      state.basketRegion = value;
      renderTrip();
      break;
    case 'add': {
      const place = placeById.get(value);
      state.basket.set(value, place.category === 'stay' ? 1 : state.people);
      state.basketRegion = place.region;
      updateBasket();
      break;
    }
    case 'remove':
      state.basket.delete(value);
      updateBasket();
      break;
    case 'quantity':
      state.basket.set(value, state.basket.get(value) + Number(delta));
      renderTrip();
      break;
  }
  if (keyboard && !button.isConnected) {
    [...document.querySelectorAll('button[data-action]')].find((candidate) =>
      candidate.dataset.action === action && candidate.dataset.value === value && candidate.dataset.delta === delta,
    )?.focus({ preventScroll: true });
  }
});

let wheelZoomFrame = null;
$('map-stage').addEventListener('wheel', (event) => {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
  // Consume vertical scrolling only over the map, including at zoom limits.
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('map-stage').clientHeight : 1;
  const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
  if (!setMapZoom(state.zoom * Math.exp(-delta * 0.0025))) return;
  // Trackpads can emit several events per frame; redraw the latest zoom once.
  if (wheelZoomFrame === null) {
    wheelZoomFrame = requestAnimationFrame(() => {
      wheelZoomFrame = null;
      renderMap();
    });
  }
}, { passive: false });

for (const id of ['start-date', 'end-date']) {
  $(id).addEventListener('change', () => {
    const start = $('start-date');
    const end = $('end-date');
    end.min = start.value;
    if (start.value && end.value && end.value < start.value) end.value = start.value;
    renderTrip();
  });
}

window.addEventListener('hashchange', renderPage);
renderRegionPane();
renderSelectedRegion();
renderPromotionPane();
renderTray();
renderMap();
renderTrip();
renderPage();
