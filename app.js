const $ = (id) => document.getElementById(id);
const regionById = new Map(regions.map((region) => [region.id, region]));
const placeById = new Map(places.map((place) => [place.id, place]));
const state = {
  filter: 'all', region: null, regionListOpen: null, category: 'all', photoCategory: 'spot', place: null, landmark: null, zoom: 1,
  people: 2, support: '일반', basketRegion: 'all', basket: new Map(),
  drawerOpen: false, drawerManuallyClosed: false, page: 'map',
};

const supportTypes = ['일반', '청년', '가족'];
const sampleRefundRate = 0.5;
const numberFormat = new Intl.NumberFormat('ko-KR');
const won = (value) => numberFormat.format(value) + '원';
const attr = (value) => String(value).replace(/[&"<]/g, (char) => ({
  '&': '&amp;', '"': '&quot;', '<': '&lt;',
})[char]);
const star = '<span class="tourism-star" aria-label="디지털 관광주민증 혜택">★</span>';
const icons = {
  focus: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="2"/>',
  bag: '<path d="m6.5 9 4-5.5M17.5 9l-4-5.5M3 9h18l-1.6 9.3a2 2 0 0 1-2 1.7H6.6a2 2 0 0 1-2-1.7L3 9Z"/><path d="M9 12.3v4M15 12.3v4"/>',
};

for (const element of document.querySelectorAll('[data-icon]')) {
  element.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[element.dataset.icon] + '</svg>';
}

function chip(label, action, value, active, className = '') {
  return `<button type="button" class="chip ${className}" data-action="${action}" data-value="${value}" aria-pressed="${active}">${label}</button>`;
}

function categoryIcon(category) {
  return `<span class="category-icon ${category}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${categories[category].icon}</svg></span>`;
}

const travelLabels = { available: '여행 가능', applying: '신청 중', upcoming: '여행 예정', ended: '여행 종료', unknown: '일정 미정' };
const travelDateFormat = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
});
const koreaClock = new Intl.DateTimeFormat('sv-SE', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul',
});

function openForApplications(period, date, time) {
  return period.start <= date && date <= period.end &&
    (date !== period.end || !period.closingTime || time < period.closingTime);
}

function travelStatus(regionId, date = travelDateFormat.format(new Date()), time = koreaClock.format(new Date())) {
  const periods = travelPeriods.filter((period) => period.region === regionId);
  if (periods.some(({ start, end }) => start <= date && date <= end)) return 'available';
  if (applicationPeriods.some((p) => p.region === regionId && openForApplications(p, date, time))) return 'applying';
  if (periods.some(({ start }) => date < start)) return 'upcoming';
  return periods.length ? 'ended' : 'unknown';
}

function selectableStatus(status) {
  return status === 'available' || status === 'applying';
}

function visibleRegions() {
  return regions.filter((region) => state.filter === 'all' || travelStatus(region.id) === 'available');
}

function visiblePlaces() {
  return places.filter((place) => place.region === state.region &&
    (state.category === 'all' || place.category === state.category));
}

const compactRegions = window.matchMedia('(max-width: 820px)');
function regionListVisible() {
  return state.regionListOpen ?? !compactRegions.matches;
}

function slidePanel(panel, open, movingElement) {
  if (panel.dataset.open === String(open)) return;
  const firstRender = panel.dataset.open === undefined;
  panel.inert = !open;
  if (open && panel.hidden) {
    panel.hidden = false;
    // Establish the offscreen position before reversing the transition.
    panel.getBoundingClientRect();
  }
  panel.dataset.open = String(open);
  if (open) return;
  const animations = firstRender ? [] : movingElement.getAnimations();
  if (!animations.length) {
    panel.hidden = true;
    return;
  }
  Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    if (panel.inert && !movingElement.getAnimations().length) panel.hidden = true;
  });
}

function syncRegionList() {
  const open = regionListVisible();
  const panel = $('region-list-panel');
  document.querySelector('[data-action="region-list"]')?.setAttribute('aria-expanded', String(open));
  slidePanel(panel, open, panel.querySelector('.rail-filter'));
  syncTourismPanel(Boolean(state.region) && !open);
}
compactRegions.addEventListener('change', syncRegionList);

function setRegionList(open, keyboard = false) {
  // The list is an overlay. Stop on the displayed frame if it opens mid-zoom.
  if (open) {
    cancelMapAnimation();
    setRegionInfo(false);
  }
  state.regionListOpen = open;
  syncRegionList();
  if (keyboard) {
    const target = open
      ? $('region-pane').querySelector('.region-row[aria-pressed="true"]') || $('region-pane').querySelector('.rail-filter .chip[aria-pressed="true"]')
      : document.querySelector('[data-action="region-list"]');
    target?.focus({ preventScroll: true });
  }
}

function landmarkPhoto(regionId) {
  return regionPhotos[regionId]?.find((photo) => !photo.isExample);
}

const photoCategories = { spot: '관광지', food: '식당', cafe: '베이커리 앤 카페', other: '그 외' };

function tourismCards(photos) {
  return photos.map((photo) => `<figure class="tourism-photo">
      <img src="${attr(photo.src)}" alt="${attr(photo.alt)}" width="480" height="540" decoding="async">
      <figcaption><strong>${attr(photo.caption)}</strong>${photo.description ? `<span>${attr(photo.description)}</span>` : ''}</figcaption>
      <button type="button" class="tourism-locate" data-action="${photo.placeId ? 'place' : 'landmark-location'}" data-value="${attr(photo.placeId || photo.caption)}"
        aria-label="${attr(photo.caption)}${photo.isExample ? ' (예시 장소)' : ''} 지도에서 위치 보기"${photo.placeId ? '' : ` aria-pressed="${photo === state.landmark}"`}></button>
      ${photo.credit ? `<details class="tourism-credit"><summary aria-label="${attr(photo.caption)} 사진 출처">ⓘ</summary>
        <small><a href="${attr(photo.source)}" target="_blank" rel="noreferrer">${attr(photo.credit)}</a> ·
        <a href="${attr(photo.licenseUrl)}" target="_blank" rel="noreferrer">${attr(photo.license)}</a> · 축소·크롭</small></details>` : ''}
    </figure>`).join('');
}

function renderTourismCategory() {
  const category = state.photoCategory;
  const label = photoCategories[category];
  for (const button of $('tourism-filters').children) {
    button.setAttribute('aria-pressed', String(button.dataset.value === category));
  }
  $('tourism-select').value = category;
  const scroll = $('region-tourism-scroll');
  scroll.setAttribute('aria-label', `${regionById.get(state.region).name} · ${label} 사진 목록`);
  const photos = regionGalleryPhotos(state.region, category);
  $('region-tourism-cards').innerHTML = photos.length ? tourismCards(photos)
    : '<p class="tourism-empty">등록된 사진이 없어요.</p>';
  scroll.scrollTop = 0;
}

function selectPhotoCategory(category) {
  if (!state.region || !Object.hasOwn(photoCategories, category) || state.photoCategory === category) return;
  if (pendingPhotoId || state.landmark) cancelMapAnimation();
  if (state.landmark) setLandmark(null);
  closeBalloon(false);
  state.photoCategory = category;
  renderTourismCategory();
}

function syncTourismPanel(open) {
  const panel = $('region-tourism');
  const region = regionById.get(state.region);
  if (!region) delete panel.dataset.region;
  if (open && panel.dataset.region !== region.id) {
    // A selection via the map can switch directly between two open galleries.
    panel.hidden = true;
    panel.dataset.open = 'false';
    panel.dataset.region = region.id;
    $('region-tourism-title').textContent = region.name + ' 가볼 만한 곳';
    state.photoCategory = 'spot';
    renderTourismCategory();
  }
  const opening = open && panel.dataset.open !== 'true';
  slidePanel(panel, open, panel.firstElementChild);
  if (opening) $('region-tourism-scroll').scrollTop = 0;
}

function regionListContent(statuses) {
  const availableCount = regions.filter((item) => statuses[item.id] === 'available').length;
  const filters = chip('전체 ' + regions.length, 'filter', 'all', false) +
    chip('여행 가능 ' + availableCount, 'filter', 'available', false);
  function provinceCard(province) {
    const group = regions.filter((region) => region.province === province);
    const rows = group.map((region) => {
      const status = statuses[region.id];
      const title = travelLabels[status];
      return `
      <button type="button" class="region-row ${status}" data-action="region" data-value="${region.id}"
        ${selectableStatus(status) ? 'aria-pressed="false"' : 'aria-disabled="true" tabindex="-1"'}
        aria-label="${region.province} ${region.name}, ${title}" title="${region.province} ${region.name} · ${title}">
        <span class="region-name">${region.shortName}${region.star ? star : ''}</span>
        ${status === 'unknown' ? '' : `<span class="region-state">${title}</span>`}
      </button>`;
    }).join('');
    return `<section class="province-group province-card" aria-labelledby="province-${province}">
      <h2 id="province-${province}">${province}</h2>
      <div class="province-tiles">${rows}</div>
    </section>`;
  }
  const banks = [
    ['west', ['충북', '충남', '전북', '전남']],
    ['east', ['강원', '경북', '경남']],
  ].map(([side, provinces]) => {
    const cards = provinces.map(provinceCard).join('');
    return `<div class="region-bank bank-${side}">${cards}</div>`;
  }).join('');

  return `<div class="rail-filter" role="group" aria-label="여행 가능 지역 필터">${filters}
      ${availableCount === 0 ? '<span class="region-empty">오늘 여행 가능한 예시 지역이 없어요.</span>' : ''}
    </div><div class="region-list" tabindex="0" role="region" aria-label="시도별 지역 목록">${banks}</div>`;
}

function renderRegionPane() {
  const pane = $('region-pane');
  const now = new Date();
  const date = travelDateFormat.format(now), time = koreaClock.format(now);
  const statuses = Object.fromEntries(regions.map(({ id }) => [id, travelStatus(id, date, time)]));
  const statusKey = Object.values(statuses).join(',');
  if (pane.dataset.statuses !== statusKey) {
    pane.innerHTML = regionListContent(statuses);
    pane.dataset.statuses = statusKey;
  }
  pane.dataset.filter = state.filter;
  for (const button of pane.querySelectorAll('[data-action="filter"]')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === state.filter));
  }
  for (const button of pane.querySelectorAll('.region-row[aria-pressed]')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === state.region));
  }
  $('workspace').classList.toggle('has-region', Boolean(state.region));
  syncRegionList();
}

function refreshRegionInfo() {
  const panel = $('region-information');
  if (!panel.hidden && state.region) panel.innerHTML = regionDetail(regionById.get(state.region));
}

function setRegionInfo(open, focus = false) {
  const panel = $('region-information');
  const trigger = document.querySelector('[data-action="show-details"]');
  if (open && !state.region) return;
  panel.hidden = !open;
  trigger?.setAttribute('aria-expanded', String(open));
  if (open) {
    refreshRegionInfo();
    panel.scrollTop = 0;
    if (focus) $('region-detail-name').focus({ preventScroll: true });
  } else if (focus) {
    trigger?.focus({ preventScroll: true });
  }
}

document.addEventListener('pointerdown', (event) => {
  if ($('basket-confirm').open) return;
  if ((state.region || compactRegions.matches) && regionListVisible() &&
      !event.target.closest('#region-list-panel, [data-action="region-list"]')) {
    setRegionList(false);
  }
  if (!$('region-information').hidden && !event.target.closest('#region-information, [data-action="show-details"]')) {
    setRegionInfo(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || $('basket-confirm').open) return;
  if (regionListVisible() && (state.region || compactRegions.matches || $('region-list-panel').contains(event.target)) && state.page === 'map' && !$('intro').open) {
    event.preventDefault();
    event.stopPropagation();
    setRegionList(false, true);
  } else if (!$('region-information').hidden) {
    event.preventDefault();
    event.stopPropagation();
    setRegionInfo(false, true);
  }
}, true);

function regionDetail(region) {
  const site = reservationSites[region.id];
  const today = travelDateFormat.format(new Date());
  const time = koreaClock.format(new Date());
  const status = travelStatus(region.id, today, time);
  const application = applicationPeriods.find((item) => item.region === region.id && openForApplications(item, today, time));
  const period = travelPeriods.find((item) => item.region === region.id && item.end >= today);
  const range = (item) => item.start.slice(5).replace('-', '.') + ' ~ ' + item.end.slice(5).replace('-', '.');
  const photo = landmarkPhoto(region.id);
  const filters = [['all', { name: '전체' }], ...Object.entries(categories)].map(([key, category]) =>
    chip(category.name, 'category', key, state.category === key),
  ).join('');
  const regionPlaces = visiblePlaces().map((place) => `
    <div class="place-row ${state.place === place.id ? 'selected' : ''}" id="place-${place.id}">
      ${categoryIcon(place.category)}
      <button type="button" class="place-info place-select" data-action="place" data-value="${place.id}"><b>${place.name}</b><span>${categories[place.category].name} · ${won(place.price)}</span></button>
      <button type="button" class="place-add" data-action="add" data-value="${place.id}" aria-label="${place.name} 담기" ${state.basket.has(place.id) ? 'disabled' : ''}>${state.basket.has(place.id) ? '담음' : '담기'}</button>
    </div>`).join('');

  return `<div class="region-detail"><button type="button" class="info-close" data-action="hide-details" aria-label="지역 상세 닫기">×</button>
    <div class="detail-name"><h2 tabindex="-1" id="region-detail-name">${region.name}</h2><span class="status-label ${status}">${travelLabels[status]}</span></div>
    <p class="detail-meta">${region.province} ${region.newRegion ? '· 하반기 신규' : ''} ${region.star ? '· ' + star + ' 관광주민증 혜택' : ''}</p>
    ${photo ? `<figure class="landmark-detail">
      <img src="${attr(photo.src)}" alt="${attr(photo.alt)}" width="480" height="300" decoding="async">
      <figcaption><strong>${attr(photo.caption)}</strong>
        <span><a href="${attr(photo.source)}" target="_blank" rel="noreferrer">${attr(photo.credit)}</a>
          · <a href="${attr(photo.licenseUrl)}" target="_blank" rel="noreferrer">${attr(photo.license)}</a> · 축소·크롭</span>
      </figcaption></figure>` : ''}
    <div class="region-facts"><h3>여행 및 환급 정보</h3>
      <dl>${application ? `<div><dt>신청 기간</dt><dd>${range(application)}${application.closingTime ? ' ' + application.closingTime + ' 마감' : ''}</dd></div>` : ''}
        ${period ? `<div><dt>여행 가능 기간</dt><dd>${range(period)}</dd></div>` : ''}
        <div><dt>신청 조건</dt><dd>공고 확인 예정</dd></div>
      <div><dt>환급 조건</dt><dd>공고 확인 예정</dd></div>
      <div><dt>환급 방식</dt><dd>공고 확인 예정</dd></div>
      <div><dt>공식 신청처</dt><dd><a href="${attr(site.url)}" target="_blank" rel="noopener noreferrer">${site.label || '사전 신청'} ↗</a></dd></div></dl>
    </div>
    <section class="places-heading" aria-label="장소 목록">
      <h3>장소 둘러보기</h3><div class="filter-group" aria-label="장소 유형 필터">${filters}</div>
      ${regionPlaces || '<p class="empty">표시할 예시 장소가 없어요.</p>'}
    </section></div>`;
}

function project(lon, lat) {
  return [112 + (lon - 125.55) * 94, 32 + (38.7 - lat) * 109];
}

const mapRegionPaths = new Map();
const emphasisBounds = new Map();
const mapGeometry = $('map-geometry');
const mapViewport = $('map-viewport');
$('skip-map').addEventListener('click', (event) => {
  event.preventDefault();
  mapViewport.focus();
});
const mapScene = $('map-scene');
const minMapZoom = 0.3;
const maxMapZoom = 400;
let placePinZoom = Infinity;
let tallestRegionId;
// Extents of the contiguous mainland and Jeju in this map's projected coordinates.
const mainlandAndJeju = { left: 164.8, right: 491.2, top: 41.4, bottom: 632.1 - 36 };
let mapLayout;
let mapAnimation = 0;
let completeMapAnimation = null;
let pendingZoom = null;
let pendingAnchor = null;
let pendingPhotoId = null;

const provinceLayer = provincePaths.map(([code, path]) =>
  `<path class="district province" data-province="${code}" d="${path}"/>`).join('');
const targetLayer = targetPaths.map(([id, path]) =>
  `<path class="district target" data-region="${id}" d="${path}"/>`).join('');
mapGeometry.innerHTML = `<defs><filter id="land-shadow" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#554d55" flood-opacity=".2"/>
  </filter></defs>
  <g id="map-provinces" fill-rule="evenodd" filter="url(#land-shadow)">${provinceLayer}</g>
  <g id="map-districts">${targetLayer}</g>
  <g id="district-halos" aria-hidden="true"></g>
  <g class="district-outlines" aria-hidden="true"><path id="hover-outline"/><path id="selection-outline"/></g><g id="map-labels"></g>`;
for (const path of mapGeometry.querySelectorAll('[data-region]')) {
  mapRegionPaths.set(path.dataset.region, path);
}

const districtOutlines = [$('hover-outline'), $('selection-outline')];
const landShadow = $('land-shadow');
const shadowEffect = landShadow.firstElementChild;

// Lift the printed shape very slightly in the overview. Even outlying islands
// move at most two screen pixels, and the base path owns every pointer event.
function scaleDistrictOutline(layer) {
  const regionId = layer.dataset.outlineFor;
  if (!regionId || !mapLayout || state.zoom >= 8) {
    layer.removeAttribute('transform');
    return;
  }
  if (!emphasisBounds.has(regionId)) {
    const { x, y, width, height } = mapRegionPaths.get(regionId).getBBox();
    if (!width || !height) return;
    emphasisBounds.set(regionId, { x: x + width / 2, y: y + height / 2, radius: Math.hypot(width, height) / 2 });
  }
  const { x, y, radius } = emphasisBounds.get(regionId);
  const screenRadius = radius * mapLayout.width / 620;
  const amount = Math.min(.035, 2 / screenRadius) * (8 - state.zoom) / 7;
  const transform = `matrix(${1 + amount} 0 0 ${1 + amount} ${-x * amount} ${-y * amount})`;
  if (layer.getAttribute('transform') !== transform) layer.setAttribute('transform', transform);
}

function setDistrictOutline(layer, regionId) {
  if (layer.dataset.outlineFor === (regionId || '')) return;
  layer.dataset.outlineFor = regionId || '';
  const outline = mapRegionPaths.get(regionId)?.getAttribute('d');
  if (outline) {
    layer.setAttribute('d', outline);
    layer.setAttribute('class', travelStatus(regionId));
  } else {
    layer.removeAttribute('d');
  }
  scaleDistrictOutline(layer);
}

function layoutMap(center, anchor) {
  const locked = state.zoom <= 1;
  mapViewport.classList.toggle('national-view', locked);
  const viewportWidth = mapViewport.clientWidth;
  const viewportHeight = mapViewport.clientHeight;
  if (!viewportWidth || !viewportHeight) return;
  const viewport = mapViewport.getBoundingClientRect();
  const regionFrame = state.region && !locked ? regionalFrame(state.region) : null;
  const usable = regionFrame || visibleMapBounds();
  const centerX = (regionFrame?.centerX ?? (usable.left + usable.right) / 2) - viewport.left;
  const centerY = (usable.top + usable.bottom) / 2 - viewport.top;
  const fittedWidth = fittedMapWidth();
  const previous = mapLayout;
  if (!center && previous) {
    const oldX = anchor?.[0] ?? previous.centerX;
    const oldY = anchor?.[1] ?? previous.centerY;
    center = [
      (mapViewport.scrollLeft + oldX - previous.left) / previous.width,
      (mapViewport.scrollTop + oldY - previous.top) / previous.height,
    ];
  }
  center ??= overviewCenter();
  const width = fittedWidth * state.zoom;
  const height = width * 640 / 620;
  const targetX = anchor?.[0] ?? centerX;
  const targetY = anchor?.[1] ?? centerY;
  const left = locked ? targetX - width * center[0] : viewportWidth;
  const top = locked ? targetY - height * center[1] : viewportHeight;
  mapLayout = { width, height, left, top, centerX, centerY };
  // Only this empty spacer grows with zoom. SVG painting stays viewport-sized.
  $('map-surface').style.width = (locked ? viewportWidth : width + left * 2) + 'px';
  $('map-surface').style.height = (locked ? viewportHeight : height + top * 2) + 'px';
  mapScene.style.width = viewportWidth + 'px';
  mapScene.style.height = viewportHeight + 'px';
  mapViewport.scrollLeft = locked ? 0 : left + width * center[0] - targetX;
  mapViewport.scrollTop = locked ? 0 : top + height * center[1] - targetY;
  syncMapProjection();
  positionMapControls(regionFrame);
  if (!state.region && locked && !mapAnimation) positionRegionLabels(usable, []);
}

function fittedMapWidth() {
  const frame = visibleMapBounds({ baseline: true });
  return Math.max(1, 620 * Math.min((frame.right - frame.left - 4) / (mainlandAndJeju.right - mainlandAndJeju.left),
    (frame.bottom - frame.top - 4) / (mainlandAndJeju.bottom - mainlandAndJeju.top)));
}

function syncMapProjection() {
  if (!mapLayout) return;
  for (const layer of districtOutlines) scaleDistrictOutline(layer);
  const scale = mapLayout.width / 620;
  const x = mapViewport.scrollLeft - mapLayout.left;
  const y = mapViewport.scrollTop - mapLayout.top;
  mapScene.style.setProperty('--pixel-scale', scale + 'px');
  mapScene.style.setProperty('--origin-x', -x + 'px');
  mapScene.style.setProperty('--origin-y', -y + 'px');
  mapGeometry.setAttribute('viewBox', `${x / scale} ${y / scale} ${mapViewport.clientWidth / scale} ${mapViewport.clientHeight / scale}`);
  // Clip the shadow surface to the viewport and keep its relief a few screen pixels at every scale.
  landShadow.setAttribute('x', (x - 6) / scale);
  landShadow.setAttribute('y', (y - 6) / scale);
  landShadow.setAttribute('width', (mapViewport.clientWidth + 12) / scale);
  landShadow.setAttribute('height', (mapViewport.clientHeight + 12) / scale);
  shadowEffect.setAttribute('dy', 1.5 / scale);
  shadowEffect.setAttribute('stdDeviation', 1.2 / scale);
  // Leader offsets belong to the labels on screen, not to the terrain.
  // Ease them down to zero by 200%, where every label sits on its coordinate.
  const labelScale = Math.min(scale, 1) * Math.max(0, 2 - state.zoom);
  mapLayout.labelScale = labelScale;
  mapScene.style.setProperty('--label-scale', labelScale + 'px');
  for (const line of mapGeometry.querySelectorAll('[data-leader]')) {
    const region = regionById.get(line.dataset.leader);
    const [x1, y1] = project(region.lon, region.lat);
    line.setAttribute('x2', x1 + region.offsetX * labelScale / scale);
    line.setAttribute('y2', y1 + region.offsetY * labelScale / scale);
    line.nextElementSibling.setAttribute('r', 1.7 / scale);
  }
  mapScene.classList.toggle('direct-labels', state.zoom >= 2);
}

function overviewCenter() {
  return [(mainlandAndJeju.left + mainlandAndJeju.right) / 2 / 620,
    (mainlandAndJeju.top + mainlandAndJeju.bottom) / 2 / 640];
}

function updateZoomControls() {
  $('map-zoom').value = numberFormat.format(Math.round(state.zoom * 100)) + '%';
  $('map-stage').querySelector('[data-action="zoom-in"]').disabled = state.zoom >= maxMapZoom;
  $('map-stage').querySelector('[data-action="zoom-out"]').disabled = state.zoom <= minMapZoom;
}

function cancelMapAnimation() {
  if (mapAnimation) cancelAnimationFrame(mapAnimation);
  mapAnimation = 0;
  completeMapAnimation = null;
  pendingZoom = null;
  pendingAnchor = null;
  pendingPhotoId = null;
}

function animateMap(previous, center, zoom, fittedWidth, anchor, onArrival) {
  function draw(value, focus, zoomAnchor) {
    const overviewChanged = (state.zoom <= 1) !== (value <= 1);
    const placesChanged = state.region && placePinsVisible() !== placePinsVisible(value);
    state.zoom = value;
    if (overviewChanged) renderMap();
    else if (placesChanged) renderMapMarkers();
    layoutMap(focus, zoomAnchor);
    updateZoomControls();
    positionBalloon();
  }
  const finish = () => {
    const target = pendingZoom ?? zoom;
    cancelMapAnimation();
    draw(target, center, anchor);
    onArrival?.();
  };
  if (!previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  let startZoom = Math.min(maxMapZoom, Math.max(minMapZoom, previous.width / fittedWidth));
  let startTime = performance.now();
  let targetZoom = zoom;
  // Accelerate through the first 90%, using just the final tenth to come to rest.
  const ease = (t) => t < 0.9 ? t * t / 0.9 : 1 - (1 - t) ** 2 / 0.1;
  function frame(now) {
    let t = Math.min(1, (now - startTime) / 510);
    const target = pendingZoom ?? zoom;
    if (target !== targetZoom) {
      const current = startZoom * (targetZoom / startZoom) ** ease(t);
      // Rebase from this frame, keeping momentum and time to reach a new goal.
      t = Math.min(t, 0.55);
      const p = ease(t);
      startZoom = Math.exp((Math.log(current) - p * Math.log(target)) / (1 - p));
      startTime = now - t * 510;
      targetZoom = target;
    }
    if (t >= 1) { finish(); return; }
    const progress = ease(t);
    const focus = previous.center.map((value, index) => value + (center[index] - value) * progress);
    draw(startZoom * (targetZoom / startZoom) ** progress, focus, anchor);
    mapAnimation = requestAnimationFrame(frame);
  }
  completeMapAnimation = finish;
  mapAnimation = requestAnimationFrame(frame);
}

function currentMapCamera(anchor) {
  if (!mapLayout) return null;
  const x = anchor?.[0] ?? mapLayout.centerX;
  const y = anchor?.[1] ?? mapLayout.centerY;
  return { width: mapLayout.width, center: [
    (mapViewport.scrollLeft + x - mapLayout.left) / mapLayout.width,
    (mapViewport.scrollTop + y - mapLayout.top) / mapLayout.height,
  ] };
}

function zoomMap(factor, anchor) {
  const zoom = Math.min(maxMapZoom, Math.max(minMapZoom, (pendingZoom ?? state.zoom) * factor));
  if (zoom === pendingZoom || (!mapAnimation && state.zoom === zoom)) return;
  const sameAnchor = anchor && pendingAnchor ? Math.hypot(anchor[0] - pendingAnchor[0], anchor[1] - pendingAnchor[1]) < 2
    : !anchor && !pendingAnchor;
  if (pendingZoom !== null && mapAnimation && sameAnchor && (zoom <= 1) === (pendingZoom <= 1)) {
    // A stream of wheel ticks should keep moving instead of restarting the ease-in.
    pendingZoom = zoom;
    return;
  }
  cancelMapAnimation();
  // Nationwide zoom steps use the current center, including any manual pan.
  if (zoom <= 1) anchor = null;
  const previous = currentMapCamera(anchor);
  const width = fittedMapWidth();
  const center = previous?.center ?? overviewCenter();
  pendingZoom = zoom;
  pendingAnchor = anchor;
  animateMap(previous, center, zoom, width, anchor);
}

function mapPosition(x, y) {
  return `--map-x:${x};--map-y:${y};left:calc(var(--origin-x) + var(--map-x) * var(--pixel-scale));top:calc(var(--origin-y) + var(--map-y) * var(--pixel-scale))`;
}

function placeBalloon(place, x, y) {
  const added = state.basket.has(place.id);
  const region = regionById.get(place.region);
  const location = [region.name, place.locality].filter(Boolean).join(' ');
  const name = attr(place.name);
  const cartAction = added ? '<path d="m14 5 2 2 4-4"/>' : '<path d="M17 2v6m-3-3h6"/>';
  return `<article class="place-balloon ${place.category}" style="${mapPosition(x, y)}" draggable="true"
      data-drag-place="${place.id}" aria-label="${name} 사진과 위치">
    <div class="balloon-bubble">
      <div class="balloon-face">
        <img src="assets/places/${place.photo || place.id}.jpg" alt="${name} 예시 사진" draggable="false">
        <div class="balloon-caption"><strong>${name}</strong><span class="balloon-address">예시<span class="balloon-location-word"> 위치</span> · ${attr(location)}</span></div>
      </div>
      <button type="button" class="balloon-close" data-action="close-balloon" aria-label="사진 닫기">×</button>
      <button type="button" class="place-add balloon-add" data-action="add" data-value="${place.id}" ${added ? 'disabled' : ''} aria-label="${name} ${added ? '일정에 담김' : '일정에 담기'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h3l2.2 10.7a2 2 0 0 0 2 1.6h8a2 2 0 0 0 1.9-1.4l1.8-5.6M6 8h5"/><circle cx="9.4" cy="20" r="1.25"/><circle cx="17.1" cy="20" r="1.25"/>${cartAction}</svg>
        <span>${added ? '담음' : '담기'}</span>
      </button>
    </div>
  </article>`;
}

function renderMap() {
  const region = regionById.get(state.region);
  const matching = visibleRegions();

  const heading = region
    ? `<div><h1 id="map-title">${region.name} 지도</h1><p>${region.province} · ${travelLabels[travelStatus(region.id)]}</p></div>
      <button type="button" class="chip mobile-details" data-action="show-details" aria-controls="region-information" aria-expanded="${!$('region-information').hidden}">지역 상세</button>`
    : `<div><h1 id="map-title">반값여행 지역 지도</h1><p>예시 일정 · ${travelDateFormat.format(new Date()).replaceAll('-', '.')} 기준</p></div>`;
  $('map-header').innerHTML = heading + `<button type="button" class="chip region-list-toggle" data-action="region-list"
    aria-controls="region-list-panel" aria-expanded="${regionListVisible()}">지역 목록</button>`;

  highlightRegion(null);
  const activeBorders = [];
  for (const [id, path] of mapRegionPaths) {
    const status = travelStatus(id);
    path.setAttribute('class', `district target ${status}${id === state.region ? ' selected' : ''}`);
    if (selectableStatus(status)) activeBorders.push([id, status]);
  }
  renderDistrictHalos(activeBorders);
  setDistrictOutline($('selection-outline'), state.region);

  updatePlacePinZoom();
  renderMapMarkers(region, matching);
}

function renderDistrictHalos(borders) {
  const layer = $('district-halos');
  const signature = borders.map(([id, status]) => id + ':' + status).join(',');
  if (layer.dataset.borders === signature) return;
  layer.dataset.borders = signature;
  // All three strokes stay the same screen width, including at 40,000% zoom.
  const shapes = borders.map(([id]) =>
    `<path id="rim-${id}" d="${mapRegionPaths.get(id).getAttribute('d')}" vector-effect="non-scaling-stroke"/>`).join('');
  const strokes = ['aura', 'glow', 'edge'].map((weight) =>
    borders.map(([id, status]) => `<use class="${weight} ${status}" href="#rim-${id}"/>`).join('')).join('');
  layer.innerHTML = `<defs>${shapes}</defs>${strokes}`;
}

function renderMapMarkers(region = regionById.get(state.region), matching = visibleRegions()) {
  const lines = [];
  const labels = [];
  if (region) {
    const showPlaces = placePinsVisible();
    if (!showPlaces) {
      if (document.activeElement?.closest('.place-balloon, .map-marker.place')) mapViewport.focus({ preventScroll: true });
      closeBalloon(false);
    }
    const [centerX, centerY] = project(region.lon, region.lat);
    labels.push(`<span class="area-label" style="${mapPosition(centerX, centerY)}" aria-hidden="true">${region.shortName}</span>`);
    for (const place of showPlaces ? visiblePlaces() : []) {
      const x = centerX + place.x;
      const y = centerY + place.y;
      const preview = place.featured ? `<span class="place-preview" data-drag-place="${place.id}" draggable="true" hidden aria-hidden="true">
        <img src="assets/places/${place.photo || place.id}.jpg" alt="" draggable="false"><span>${attr(place.name)}</span></span>` : '';
      labels.push(`<button type="button" class="map-marker place ${place.category} ${state.place === place.id ? 'active' : ''}"
        data-action="place" data-value="${place.id}" aria-expanded="${state.place === place.id}" aria-label="${categories[place.category].name} ${place.name} 사진 보기"
        style="${mapPosition(x, y)}">${categoryIcon(place.category)}<span class="pin-name" aria-hidden="true">${place.name}</span>${preview}</button>`);
      if (state.place === place.id) labels.push(placeBalloon(place, x, y));
    }
  }
  if (!region || state.zoom <= 1) {
    for (const item of matching) {
      const [x, y] = project(item.lon, item.lat);
      const status = travelStatus(item.id);
      if (region && (item.id === region.id || !selectableStatus(status))) continue;
      const offsetX = status === 'unknown' ? 0 : item.offsetX;
      const offsetY = status === 'unknown' ? 0 : item.offsetY;
      if (status !== 'unknown') lines.push(`<line class="map-leader" data-leader="${item.id}" x1="${x}" y1="${y}" x2="${x}" y2="${y}"/><circle class="map-anchor" cx="${x}" cy="${y}" r="0"/>`);
      labels.push(`<button type="button" class="map-marker region-marker ${status}" data-action="region" data-value="${item.id}"
        ${selectableStatus(status) ? '' : 'aria-disabled="true" tabindex="-1"'} aria-label="${item.name} ${travelLabels[status]}" style="${mapPosition(x, y)};--offset-x:${offsetX};--offset-y:${offsetY}">
        <span class="status-dot" aria-hidden="true"></span><span class="marker-name">${item.shortName}</span></button>`);
    }
  }
  $('map-labels').innerHTML = lines.join('');
  $('map-markers').innerHTML = labels.join('');
  syncMapProjection();
  updateZoomControls();
  positionBalloon();
  if (!region && state.zoom <= 1 && mapLayout && !mapAnimation) positionRegionLabels(visibleMapBounds(), []);
}

function visibleMapBounds({ baseline = false, national = !state.region || state.zoom <= 1, avoidDrawer = false } = {}) {
  const frame = mapViewport.getBoundingClientRect();
  let left = Math.max(0, frame.left);
  let top = Math.max(0, frame.top);
  let right = Math.min(window.innerWidth, baseline ? frame.right : frame.left + mapViewport.clientWidth);
  let bottom = Math.min(window.innerHeight, baseline ? frame.bottom : frame.top + mapViewport.clientHeight);
  const nationalFrame = (baseline || national) && $('national-map-area').getBoundingClientRect();
  if (nationalFrame?.width && nationalFrame.height) {
    left = Math.max(left, nationalFrame.left);
    right = Math.min(right, nationalFrame.right);
    top = Math.max(top, nationalFrame.top);
    bottom = Math.min(bottom, nationalFrame.bottom);
  }
  if (!baseline && !national && state.region) {
    // The map keeps its framing while the region list temporarily covers the gallery.
    left = Math.max(left, frame.left + parseFloat(getComputedStyle($('region-tourism')).width) + 6);
  }
  const header = $('map-header').getBoundingClientRect();
  const regional = !baseline && !national;
  const belowHeader = (edge) => regional && header.bottom > top && header.top < bottom && header.right > left && header.left < edge
    ? header.bottom + 6 : top;
  const controlsHeight = regional ? $('map-stage').querySelector('.map-controls').offsetHeight + 14 : 0;
  if (avoidDrawer) {
    // The dock's anchor is stationary throughout the drawer's slide animation.
    const dock = $('cart-dock').getBoundingClientRect();
    const panel = $('trip-panel');
    const drawerLeft = dock.right - panel.offsetWidth;
    const drawerTop = dock.bottom - panel.offsetHeight;
    if (drawerLeft < right && drawerTop < bottom) {
      const roomAbove = Math.max(0, drawerTop - 6 - belowHeader(right) - controlsHeight) * (right - left);
      const roomBeside = Math.max(0, drawerLeft - 6 - left) * Math.max(0, bottom - belowHeader(drawerLeft - 6) - controlsHeight);
      if (roomAbove > roomBeside) {
        bottom = drawerTop - 6;
      } else {
        right = drawerLeft - 6;
      }
    }
  }
  top = belowHeader(right);
  bottom -= controlsHeight;
  return { left, top, right, bottom: Math.max(top, bottom) };
}

// Use the same regional frame with the drawer open or closed. Its button can
// overlay the map without changing the camera or its anchor for subsequent zooms.
function regionalFrame(id) {
  const full = visibleMapBounds({ national: false });
  const room = visibleMapBounds({ national: false, avoidDrawer: true });
  const bounds = mapRegionPaths.get(id).getBBox();
  const width = room.right - room.left;
  const height = room.bottom - room.top;
  const pad = Math.min(22, Math.min(width, height) * .035);
  const scale = Math.min((width - 2 * pad) / bounds.width, (height - 2 * pad) / bounds.height);
  const halfWidth = bounds.width * scale / 2 + pad;
  const middle = (full.left + full.right) / 2;
  const centerX = Math.max(room.left + halfWidth, Math.min(middle, room.right - halfWidth));
  return { ...room, centerX, scale };
}

function positionMapControls(regionFrame) {
  if (state.page !== 'map' || !mapViewport.clientWidth) return;
  const viewport = mapViewport.getBoundingClientRect();
  const controls = $('map-stage').querySelector('.map-controls');
  const room = regionFrame || (state.drawerOpen && visibleMapBounds({ national: false, avoidDrawer: true }));
  if (room) {
    const besideDrawer = room.right < viewport.left + mapViewport.clientWidth - 10;
    const right = room.right - (besideDrawer ? $('cart-toggle').offsetWidth + 8 : 0);
    const half = controls.offsetWidth / 2 + 3;
    const middle = regionFrame?.centerX ?? (room.left + room.right) / 2;
    controls.style.left = (Math.max(room.left + half, Math.min(middle, right - half)) - viewport.left) + 'px';
    controls.style.bottom = (viewport.bottom - room.bottom - controls.offsetHeight) + 'px';
  } else {
    const frame = visibleMapBounds();
    const width = frame.right - frame.left;
    controls.style.left = (frame.left - viewport.left + width / 2 + Math.min(95, width * .22)) + 'px';
    controls.style.bottom = (viewport.bottom - frame.bottom + 7) + 'px';
  }
}

function balloonFrame() {
  const normal = visibleMapBounds({ avoidDrawer: state.drawerOpen });
  if (normal.bottom - normal.top >= 190) return normal;
  // In landscape, the space beside a control may fit the whole bubble even
  // when treating that control as a full-width row leaves very little room.
  const viewport = mapViewport.getBoundingClientRect();
  let rooms = [{ left: Math.max(0, viewport.left), top: Math.max(0, viewport.top),
    right: Math.min(innerWidth, viewport.left + mapViewport.clientWidth),
    bottom: Math.min(innerHeight, viewport.top + mapViewport.clientHeight) }];
  const overlays = [...$('map-header').children, ...$('map-stage').querySelectorAll('.map-controls, .compass')];
  if (!$('region-tourism').inert) overlays.push($('region-tourism'));
  const bounds = overlays.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
  if (state.drawerOpen) {
    const anchor = $('cart-dock').getBoundingClientRect(), panel = $('trip-panel'), toggle = $('cart-toggle');
    const left = anchor.right - panel.offsetWidth;
    bounds.push({ left, top: anchor.bottom - panel.offsetHeight, right: anchor.right, bottom: anchor.bottom });
    bounds.push({ left: left - toggle.offsetWidth - 8, top: anchor.bottom - toggle.offsetHeight, right: left - 8, bottom: anchor.bottom });
  }
  for (const block of bounds) {
    rooms = rooms.flatMap((room) => {
      if (block.right <= room.left || block.left >= room.right || block.bottom <= room.top || block.top >= room.bottom) return [room];
      return [{ ...room, left: block.right + 3 }, { ...room, right: block.left - 3 },
        { ...room, top: block.bottom + 3 }, { ...room, bottom: block.top - 3 }]
        .filter((r) => r.right - r.left >= 95 && r.bottom - r.top >= 80);
    });
  }
  const available = (r) => Math.max(Math.min(r.right - r.left - 12, r.bottom - r.top - 28),
    Math.min(r.right - r.left - 28, r.bottom - r.top - 8));
  return rooms.reduce((best, room) => available(room) > available(best) ? room : best, normal);
}

function sizeBalloon(balloon, frame) {
  const aspect = parseFloat(getComputedStyle(balloon).aspectRatio) || 1.07;
  const width = frame.right - frame.left, height = frame.bottom - frame.top;
  const verticalFit = Math.min(width - 12, (height - 28) * aspect);
  const sideFit = Math.min(width - 28, (height - 8) * aspect);
  const beside = verticalFit < 190 && sideFit > verticalFit;
  balloon.classList.toggle('beside', beside);
  balloon.style.setProperty('--balloon-fit', Math.max(110, beside ? sideFit : verticalFit) + 'px');
}

function positionRegionLabels(frame, occupied) {
  if (!mapLayout) return;
  for (const label of mapScene.querySelectorAll('.region-marker:not(.unknown)')) {
    label.style.translate = '';
    const { left, top, width, height } = label.getBoundingClientRect();
    const candidates = [[left, top], ...occupied.flatMap((r) => [
      [r.left - width - 3, top], [r.right + 3, top],
      [left, r.top - height - 3], [left, r.bottom + 3],
    ])];
    const distance = ([x, y]) => Math.hypot(x - left, y - top);
    const target = candidates.sort((a, b) => distance(a) - distance(b)).find(([x, y]) =>
      x >= frame.left && x + width <= frame.right && y >= frame.top && y + height <= frame.bottom &&
      occupied.every((r) => x + width < r.left || x > r.right || y + height < r.top || y > r.bottom));
    const dx = target ? target[0] - left : 0, dy = target ? target[1] - top : 0;
    label.style.translate = `${dx}px ${dy}px`;
    const line = mapGeometry.querySelector(`[data-leader="${label.dataset.value}"]`);
    const scale = mapLayout.width / 620;
    const region = regionById.get(label.dataset.value);
    line.setAttribute('x2', Number(label.style.getPropertyValue('--map-x')) + (region.offsetX * mapLayout.labelScale + dx) / scale);
    line.setAttribute('y2', Number(label.style.getPropertyValue('--map-y')) + (region.offsetY * mapLayout.labelScale + dy) / scale);
    occupied.push(label.getBoundingClientRect());
  }
}

// Place previews beside their pins without covering another venue or moving the map.
function positionPlacePreviews() {
  const previews = mapScene.querySelectorAll('.place-preview');
  if (!previews.length) return;
  if (state.place || state.landmark) {
    for (const preview of previews) preview.hidden = true;
    return;
  }
  const frame = balloonFrame();
  const bounds = new Map([...mapScene.querySelectorAll('.map-marker.place')].map((pin) => [pin, pin.getBoundingClientRect()]));
  const occupied = [...bounds.values(), mapScene.querySelector('.area-label').getBoundingClientRect()];
  const style = getComputedStyle(previews[0]);
  const size = parseFloat(style.width);
  const gap = parseFloat(style.getPropertyValue('--preview-gap'));
  for (const preview of previews) {
    const pin = bounds.get(preview.parentElement);
    const x = pin.left + pin.width / 2, y = pin.top + pin.height / 2;
    if (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom) {
      preview.hidden = true;
      continue;
    }
    const candidates = [
      ['top', x - size / 2, pin.top - size - gap], ['bottom', x - size / 2, pin.bottom + gap],
      ['right', pin.right + gap, y - size / 2], ['left', pin.left - size - gap, y - size / 2],
    ];
    const slot = candidates.find(([, left, top]) =>
      left >= frame.left && top >= frame.top && left + size <= frame.right && top + size <= frame.bottom &&
      occupied.every((r) => left + size + 2 <= r.left || left >= r.right + 2 || top + size + 2 <= r.top || top >= r.bottom + 2));
    preview.hidden = !slot;
    if (slot) {
      const [side, left, top] = slot;
      preview.dataset.side = side;
      occupied.push({ left, top, right: left + size, bottom: top + size });
    }
  }
}

function positionBalloon() {
  positionPlacePreviews();
  const balloon = mapScene.querySelector('.place-balloon');
  const marker = mapScene.querySelector('.place.active');
  if (!balloon || !marker) return;
  const frame = balloonFrame();
  sizeBalloon(balloon, frame);
  const point = marker.getBoundingClientRect();
  const markerX = point.left + point.width / 2;
  const markerY = point.top + point.height / 2;
  const minX = frame.left + 6 + balloon.offsetWidth / 2;
  const maxX = frame.right - 6 - balloon.offsetWidth / 2;
  const adjustedX = Math.min(Math.max(markerX, minX), maxX);
  balloon.style.setProperty('--balloon-shift', (adjustedX - markerX) + 'px');
  balloon.classList.toggle('below', markerY - frame.top < balloon.offsetHeight + 22);
  let offset = adjustedX - markerX, along = balloon.offsetWidth / 2, across = balloon.offsetHeight / 2;
  if (balloon.classList.contains('beside')) {
    const half = balloon.offsetHeight / 2 + 3;
    const y = Math.max(frame.top + half, Math.min(markerY, frame.bottom - half));
    const onLeft = markerX + 22 + balloon.offsetWidth > frame.right &&
      markerX - frame.left > frame.right - markerX;
    balloon.classList.toggle('to-left', onLeft);
    balloon.style.setProperty('--balloon-rise', (y - markerY) + 'px');
    offset = y - markerY;
    along = balloon.offsetHeight / 2;
    across = balloon.offsetWidth / 2;
  }
  // The join follows the ellipse as the pin approaches a screen edge.
  const side = Math.min(0.68, Math.abs(offset) / along);
  balloon.style.setProperty('--tail-inset', (1 + across * (1 - Math.sqrt(1 - side * side))) + 'px');
  const outsideRoom = markerX < frame.left || markerX > frame.right || markerY < frame.top || markerY > frame.bottom;
  // The pin can sit just beyond its bubble's unobstructed rectangle in landscape.
  const pinVisible = !outsideRoom || mapScene.contains(document.elementFromPoint(markerX, markerY));
  balloon.style.visibility = pinVisible ? '' : 'hidden';
  if (state.zoom <= 1) positionRegionLabels(frame, [point, balloon.getBoundingClientRect()]);
}

function revealPlace() {
  const balloon = mapScene.querySelector('.place-balloon');
  const marker = mapScene.querySelector('.place.active');
  if (!balloon || !marker) return;
  if (state.zoom <= 1) {
    layoutMap();
    positionBalloon();
    return;
  }
  positionBalloon();
  const point = marker.getBoundingClientRect();
  const frame = balloonFrame();
  const x = point.left + point.width / 2;
  const y = point.top + point.height / 2;
  const beside = balloon.classList.contains('beside');
  const center = (point, min, max, extent) => Math.max(min + extent / 2 + 3, Math.min(point, max - extent / 2 - 3));
  const nearestSide = (point, min, max, extent, pin) => {
    const margin = Math.min(pin, Math.max(2, (max - min - extent - 23) / 2));
    const after = Math.max(min + extent + 23, Math.min(point, max - margin));
    const before = Math.min(max - extent - 23, Math.max(point, min + margin));
    return Math.abs(after - point) < Math.abs(before - point) ? after : before;
  };
  const targetX = beside ? nearestSide(x, frame.left, frame.right, balloon.offsetWidth, point.width / 2 + 2)
    : center(x, frame.left, frame.right, balloon.offsetWidth);
  const targetY = beside ? center(y, frame.top, frame.bottom, balloon.offsetHeight)
    : nearestSide(y, frame.top, frame.bottom, balloon.offsetHeight, point.height / 2 + 2);
  mapViewport.scrollLeft += x - targetX;
  mapViewport.scrollTop += y - targetY;
  syncMapProjection();
  positionBalloon();
}

let highlightedRegion = null;
function highlightRegion(id) {
  if (id === highlightedRegion) return;
  mapRegionPaths.get(highlightedRegion)?.classList.remove('highlighted');
  mapScene.querySelector('.region-marker.highlighted')?.classList.remove('highlighted');
  highlightedRegion = id;
  setDistrictOutline($('hover-outline'), id !== state.region ? id : null);
  if (id) {
    mapRegionPaths.get(id)?.classList.add('highlighted');
    mapScene.querySelector(`.region-marker[data-value="${id}"]`)?.classList.add('highlighted');
  }
}

function regionAt(node) {
  const target = node?.closest?.('[data-action="region"], [data-region]');
  return target?.dataset.region || target?.dataset.value || null;
}

for (const container of [$('region-pane'), mapScene]) {
  for (const [on, off] of [['pointerover', 'pointerout'], ['focusin', 'focusout']]) {
    container.addEventListener(on, (event) => {
      const next = regionAt(event.target);
      if (next !== regionAt(event.relatedTarget)) highlightRegion(next);
    });
    container.addEventListener(off, (event) => {
      const next = regionAt(event.relatedTarget);
      if (next !== regionAt(event.target)) highlightRegion(next);
    });
  }
}

mapGeometry.addEventListener('click', (event) => {
  const path = event.target.closest('[data-region]');
  if (path) selectRegion(path.dataset.region, false);
});
function updateAfterPan() {
  syncMapProjection();
  positionBalloon();
  if (!state.region && state.zoom <= 1 && !mapAnimation) positionRegionLabels(visibleMapBounds(), []);
}
mapViewport.addEventListener('scroll', updateAfterPan, { passive: true });
$('map-stage').addEventListener('wheel', (event) => {
  if (!event.ctrlKey) {
    if (state.zoom <= 1) event.preventDefault();
    if (state.zoom > 1 || pendingPhotoId) cancelMapAnimation();
    return;
  }
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? mapViewport.clientHeight : 1;
  const delta = Math.min(180, Math.max(-180, event.deltaY * unit));
  const frame = mapViewport.getBoundingClientRect();
  zoomMap(Math.exp(-delta * 0.0025), [event.clientX - frame.left, event.clientY - frame.top]);
  positionBalloon();
}, { passive: false });

let panArmed = false;
let panPointer = null;
let suppressPanClick = false;
let pointerOnMap = false;
let keyboardNavigation = true;
function releasePan() {
  if (panPointer && mapViewport.hasPointerCapture(panPointer.id)) mapViewport.releasePointerCapture(panPointer.id);
  panPointer = null;
  mapViewport.classList.remove('panning');
}

function stopPanning() {
  releasePan();
  panArmed = false;
  mapViewport.classList.remove('pan-ready');
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') keyboardNavigation = true;
  if (state.page !== 'map' || event.code !== 'Space' || !pointerOnMap || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable="true"]') ||
    (keyboardNavigation && event.target.closest?.('button, a, #region-tourism'))) return;
  event.preventDefault();
  panArmed = true;
  mapViewport.classList.add('pan-ready');
});
window.addEventListener('keyup', (event) => { if (event.code === 'Space') stopPanning(); });
window.addEventListener('pointerdown', () => { keyboardNavigation = false; });
window.addEventListener('blur', () => {
  stopPanning();
  if (pendingPhotoId) cancelMapAnimation();
});
window.addEventListener('hashchange', () => {
  stopPanning();
  if (pendingPhotoId) cancelMapAnimation();
  else completeMapAnimation?.();
});
document.addEventListener('pointerdown', () => { if (pendingPhotoId) cancelMapAnimation(); }, true);
document.addEventListener('keydown', (event) => {
  if (pendingPhotoId && event.key === 'Escape') {
    event.preventDefault();
    cancelMapAnimation();
  }
}, true);
mapViewport.addEventListener('pointerdown', (event) => {
  suppressPanClick = false;
  if (!panArmed || !event.isPrimary || event.button !== 0) return;
  cancelMapAnimation();
  event.preventDefault();
  event.stopImmediatePropagation();
  mapViewport.setPointerCapture(event.pointerId);
  panPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  suppressPanClick = true;
  mapViewport.classList.add('panning');
}, true);
document.addEventListener('click', (event) => {
  if (!suppressPanClick || !event.detail || !event.composedPath().includes(mapViewport)) return;
  suppressPanClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
mapViewport.addEventListener('pointerenter', () => { pointerOnMap = true; });
mapViewport.addEventListener('pointermove', (event) => {
  keyboardNavigation = false;
  pointerOnMap = true;
  if (!panPointer || panPointer.id !== event.pointerId) return;
  if (!(event.buttons & 1)) { releasePan(); return; }
  const dx = event.clientX - panPointer.x;
  const dy = event.clientY - panPointer.y;
  if (state.zoom <= 1) {
    // The overview has no scrollbars. Move its projected origin with the pointer.
    mapLayout.left += dx;
    mapLayout.top += dy;
    updateAfterPan();
  } else {
    mapViewport.scrollLeft -= dx;
    mapViewport.scrollTop -= dy;
  }
  panPointer.x = event.clientX;
  panPointer.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  mapViewport.addEventListener(type, (event) => { if (panPointer?.id === event.pointerId) releasePan(); });
}
mapViewport.addEventListener('pointerleave', () => { pointerOnMap = false; });
mapViewport.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.place) closeBalloon(true);
});
function refreshMapFrame() {
  if (!mapViewport.clientWidth || !mapViewport.clientHeight) return;
  const hadPlacePins = placePinsVisible();
  updatePlacePinZoom();
  if (state.region && hadPlacePins !== placePinsVisible()) renderMapMarkers();
  if (mapAnimation) return;
  layoutMap();
  revealPlace();
  if (!state.place) positionPlacePreviews();
}
const mapResize = new ResizeObserver(refreshMapFrame);
mapResize.observe(mapViewport);
if ($('national-map-area')) mapResize.observe($('national-map-area'));
// Reposition overlays without changing the visible map or its scroll position.
function refreshDrawerOverlays() {
  if (state.page !== 'map' || !mapViewport.clientWidth) return;
  positionMapControls(state.region && state.zoom > 1 ? regionalFrame(state.region) : null);
  positionBalloon();
}
new ResizeObserver(refreshDrawerOverlays).observe($('trip-panel'));
new MutationObserver(refreshDrawerOverlays).observe($('cart-dock'), { attributes: true, attributeFilter: ['class'] });

function closeBalloon(focusPin) {
  if (!state.place) return;
  const pin = mapScene.querySelector('.place.active');
  cancelPhotoDrag();
  state.place = null;
  mapScene.querySelector('.place-balloon')?.remove();
  pin?.classList.remove('active');
  pin?.setAttribute('aria-expanded', 'false');
  $('region-information').querySelector('.place-row.selected')?.classList.remove('selected');
  positionPlacePreviews();
  if (focusPin) (pin || mapViewport).focus({ preventScroll: true });
}

function regionCamera(id, fittedWidth) {
  const bounds = mapRegionPaths.get(id).getBBox();
  // A zoomed viewport reserves its scrollbar gutters, even when selection starts at 30%.
  const wasNational = mapViewport.classList.contains('national-view');
  if (wasNational) mapViewport.classList.remove('national-view');
  const { scale } = regionalFrame(id);
  if (wasNational) mapViewport.classList.add('national-view');
  return {
    center: [(bounds.x + bounds.width / 2) / 620, (bounds.y + bounds.height / 2) / 640],
    zoom: Math.max(minMapZoom, Math.min(maxMapZoom, scale * 620 / fittedWidth)),
  };
}

function updatePlacePinZoom() {
  if (!state.region || !mapViewport.clientWidth) return;
  if (!tallestRegionId) {
    let tallestHeight = 0;
    for (const [id, path] of mapRegionPaths) {
      const { height } = path.getBBox();
      if (height > tallestHeight) {
        tallestHeight = height;
        tallestRegionId = id;
      }
    }
  }
  // Share the click-to-fit calculation, including the room available on this screen.
  if (tallestRegionId) placePinZoom = regionCamera(tallestRegionId, fittedMapWidth()).zoom;
}

function placePinsVisible(zoom = state.zoom) {
  // Wheel multiplication can land a fraction of a floating-point step below the fitted zoom.
  return zoom + 1e-9 >= placePinZoom;
}

function setLandmark(photo) {
  state.landmark = photo;
  const marker = $('landmark-location');
  marker.hidden = !photo;
  if (photo) {
    marker.style.cssText = mapPosition(...project(photo.lon, photo.lat));
    marker.querySelector('.landmark-label').textContent = photo.caption;
  }
  for (const button of $('region-tourism-cards').querySelectorAll('[data-action="landmark-location"]')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === photo?.caption));
  }
  positionPlacePreviews();
}

function locateLandmark(caption) {
  const photo = regionPhotos[state.region]?.find((item) => item.caption === caption);
  if (!photo || !Number.isFinite(photo.lat) || !Number.isFinite(photo.lon)) return;
  cancelMapAnimation();
  stopPanning();
  setRegionInfo(false);
  closeBalloon(false);
  setLandmark(photo);
  const [x, y] = project(photo.lon, photo.lat);
  const width = fittedMapWidth();
  const zoom = Math.max(state.zoom, placePinZoom, regionCamera(state.region, width).zoom);
  animateMap(currentMapCamera(), [x / 620, y / 640], zoom, width);
}

function selectPlace(id, fromPin, keyboard) {
  const place = placeById.get(id);
  if (!place || place.region !== state.region) return;
  if (state.landmark) setLandmark(null);
  cancelMapAnimation();
  setRegionInfo(false);
  function showPhoto() {
    if (state.page !== 'map' || state.region !== place.region || !placePinsVisible()) return;
    state.place = id;
    renderMapMarkers();
    document.dispatchEvent(new CustomEvent('localo:place', { detail: { placeId: id } }));
    revealPlace();
    if (fromPin) mapScene.querySelector('.balloon-bubble')?.classList.add('opening');
    if (keyboard) mapScene.querySelector('.balloon-close')?.focus({ preventScroll: true });
  }
  if (placePinsVisible()) {
    showPhoto();
    return;
  }
  // A place requested in the detail list remains reachable at any zoom.
  const region = regionById.get(place.region);
  const [x, y] = project(region.lon, region.lat);
  const width = fittedMapWidth();
  const center = [(x + place.x) / 620, (y + place.y) / 640];
  pendingPhotoId = id;
  if (keyboard) mapViewport.focus({ preventScroll: true });
  animateMap(currentMapCamera(), center, placePinZoom, width, null, showPhoto);
}

// These named sample businesses illustrate the calculation; official eligibility is unverified.
const sampleRefundStatus = {
  'gc-soup': 'eligible', 'gc-coffee': 'eligible', 'gc-stay': 'excluded',
  'gch-soup': 'eligible', 'gch-cafe': 'excluded', 'hy-beef': 'eligible',
};

function tripNights() {
  const time = Date.parse($('end-date').value) - Date.parse($('start-date').value);
  return Number.isFinite(time) ? Math.max(0, Math.round(time / 86400000)) : 0;
}

function itemCost(place, quantity) {
  return place.price * quantity * (place.category === 'stay' ? tripNights() : 1);
}

function visitTimeLabel({ date, start, end }) {
  const day = date ? date.slice(5).replace('-', '.') : '';
  const time = start && end && start !== end ? `${start} – ${end < start ? '다음 날 ' : ''}${end}`
    : start || (end ? `${end}까지` : '');
  return [day, time].filter(Boolean).join(' · ') || '방문 시간 정하기';
}

function basketItem({ place, visit, number, cost, status }, open, index, count) {
  const name = attr(place.name);
  const unit = categories[place.category].unit;
  const label = { eligible: '환급 대상 · 예시', excluded: '환급 제외 · 예시', unknown: '환급 미확인', free: '무료' }[status];
  const priceDetail = `${won(place.price)} × ${place.category === 'stay' ? tripNights() + '박 × ' : ''}${visit.quantity}${unit}`;
  return `<li class="itinerary-stop" data-stop-id="${place.id}" value="${number}">
    <span class="stop-number" aria-hidden="true" ${count > 1 ? 'title="끌어서 순서 바꾸기"' : ''}>${String(number).padStart(2, '0')}</span>
    <details class="stop-editor" data-stop="${place.id}" ${open ? 'open' : ''}>
      <summary>
        <span class="stop-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 6v6l4 2"/></svg><span class="visit-time-label">${visitTimeLabel(visit)}</span><span class="stop-chevron" aria-hidden="true"></span></span>
        <span class="stop-title"><strong>${name}</strong><b>${won(cost)}</b></span>
        <span class="stop-meta"><span class="stop-category ${place.category}"><i class="place-dot"></i>${regionById.get(place.region).shortName} · ${categories[place.category].name}</span><span class="refund-status ${status}">${label}</span></span>
      </summary>
      <div class="stop-fields">
        <div class="stop-times">
          ${state.page === 'planner' ? `<label>방문 날짜<input type="date" data-visit-field="date" value="${visit.date || ''}" min="${$('start-date').value}" max="${$('end-date').value}" aria-label="${name} 방문 날짜"></label>` : ''}
          <label>시작 시각<input type="time" data-visit-field="start" value="${visit.start}" aria-label="${name} 방문 시작 시각"></label>
          <label>종료 시각<input type="time" data-visit-field="end" value="${visit.end}" aria-label="${name} 방문 종료 시각"></label>
        </div>
        <div class="stop-quantity"><small>${priceDetail}</small><div class="stepper mini">
          <button type="button" data-action="quantity" data-value="${place.id}" data-delta="-1" aria-label="${name} 수량 줄이기" ${visit.quantity <= 1 ? 'disabled' : ''}>−</button>
          <output>${visit.quantity}${unit}</output>
          <button type="button" data-action="quantity" data-value="${place.id}" data-delta="1" aria-label="${name} 수량 늘리기" ${visit.quantity >= 99 ? 'disabled' : ''}>+</button>
        </div><button type="button" class="delete-item" data-action="remove" data-value="${place.id}" aria-label="${name} 삭제">삭제</button></div>
        ${count > 1 ? `<div class="stop-order-actions" role="group" aria-label="${name} 방문 순서">
          <button type="button" data-move="-1" aria-label="${name} 한 칸 위로" ${index === 0 ? 'disabled' : ''}>↑ 위로</button>
          <button type="button" data-move="1" aria-label="${name} 한 칸 아래로" ${index === count - 1 ? 'disabled' : ''}>↓ 아래로</button>
        </div>` : ''}
      </div>
    </details>
  </li>`;
}

$('trip-items').addEventListener('input', (event) => {
  const field = event.target.dataset.visitField;
  if (!['date', 'start', 'end'].includes(field)) return;
  const editor = event.target.closest('details[data-stop]');
  const visit = state.basket.get(editor.dataset.stop);
  if (!event.target.validity.valid) return;
  visit[field] = event.target.value;
  editor.querySelector('.visit-time-label').textContent = visitTimeLabel(visit);
  myPlans.saveEdits();
});

function renderTrip() {
  const stops = Array.from(state.basket, ([id, visit], index) => {
    const place = placeById.get(id);
    const status = place.price === 0 ? 'free' : sampleRefundStatus[id] || 'unknown';
    return { place, visit, number: index + 1, cost: itemCost(place, visit.quantity), status };
  });
  const regionIds = [...new Set(stops.map(({ place }) => place.region))];
  if (!regionIds.includes(state.basketRegion)) state.basketRegion = 'all';
  const regionFilter = state.page === 'planner' ? state.basketRegion : 'all';
  const shown = stops.filter(({ place }) => regionFilter === 'all' || regionFilter === place.region);
  const total = shown.reduce((sum, { cost }) => sum + cost, 0);
  const eligibleTotal = shown.reduce((sum, { status, cost }) => sum + (status === 'eligible' ? cost : 0), 0);
  const discount = Math.floor(eligibleTotal * sampleRefundRate);
  const share = Math.round((total - discount) / state.people);
  const count = stops.length;

  $('cart-count').hidden = count === 0;
  $('cart-count').textContent = count;
  $('trip-count').textContent = count ? `${regionIds.length}개 지역 · ${count}곳` : '담은 장소 0곳';
  const destination = state.page === 'map' && regionById.get(state.region);
  $('trip-destination').hidden = !destination;
  $('trip-region').textContent = destination ? destination.name : '';
  $('cart-toggle').setAttribute('aria-label', `여행 일정표 ${state.drawerOpen ? '닫기' : '열기'}, 담은 장소 ${count}곳`);
  $('people-label').textContent = state.people + '명';
  document.querySelector('[data-action="people"][data-delta="-1"]').disabled = state.people <= 1;
  document.querySelector('[data-action="people"][data-delta="1"]').disabled = state.people >= 99;
  $('support-options').innerHTML = supportTypes.map((type) =>
    `<button type="button" data-action="support" data-value="${type}" aria-pressed="${state.support === type}">${type}</button>`,
  ).join('');

  const tripItems = $('trip-items');
  const openStops = new Set([...tripItems.querySelectorAll('.stop-editor[open]')].map((editor) => editor.dataset.stop));
  const tabs = [['all', '전체'], ...regionIds.map((id) => [id, regionById.get(id).shortName])];
  tripItems.innerHTML = stops.length ? `
    ${state.page === 'planner' && regionIds.length > 1 ? `<div class="trip-tabs" aria-label="일정과 경비를 볼 지역">${tabs.map(([key, label]) => chip(label, 'basket-region', key, regionFilter === key)).join('')}</div>` : ''}
    <ol class="itinerary-list" aria-label="방문 순서로 정리한 여행 일정">${shown.map((stop, i) => basketItem(stop, openStops.has(stop.place.id), i, shown.length)).join('')}</ol>`
    : `<div class="cart-empty">
      <span class="cart-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">${icons.bag}</svg></span>
      <strong>아직 담은 장소가 없어요</strong>
      ${state.page === 'planner' ? '<a href="#map">지도에서 장소 담기 →</a>' : '<p>지도에서 장소 사진을 여기로 끌어오세요.</p>'}
    </div>`;

  const nights = tripNights();
  const scope = regionFilter === 'all' ? '' : regionById.get(regionFilter).shortName + ' · ';
  $('trip-summary').innerHTML = `<h3>예상 여행 경비</h3><dl>
    <div><dt>여행 기간</dt><dd>${nights ? nights + '박 ' + (nights + 1) + '일' : '당일'} · ${state.people}명</dd></div>
    <div><dt>경비 합계</dt><dd>${won(total)}</dd></div>
    <div><dt>예시 환급 대상 금액</dt><dd>${won(eligibleTotal)}</dd></div>
    <div><dt>예시 환급액 (${state.support} · ${sampleRefundRate * 100}%)</dt><dd class="discount">−${won(discount)}</dd></div>
    <div><dt>예상 부담액 합계</dt><dd>${won(total - discount)}</dd></div></dl>
    <p class="fine-print">요금과 환급 조건은 시안용 예시입니다. 실제 업체별 환급 자격은 미확인입니다.</p>`;
  $('split-count').textContent = `${scope}예시 · ${state.people}명 균등 분할`;
  $('split-estimate').textContent = won(share);
  myPlans.render(regionIds);
}

function renderPage() {
  const name = location.hash.slice(1);
  const page = name === 'route' ? 'planner' : ['calendar', 'planner'].includes(name) ? name : 'map';
  const changedPage = page !== state.page;
  if (changedPage && $('plan-save-dialog').open) $('plan-save-dialog').close();
  if (changedPage && $('basket-confirm').open) $('basket-confirm').close('keep');
  if (changedPage) setRegionInfo(false);
  if (changedPage) myPlans.switchPage(state.page, page);
  state.page = page;
  document.title = { map: '지역 지도', planner: '여행 플래너', calendar: '축제 캘린더' }[page] + ' · 로컬로';
  $('workspace').hidden = page !== 'map';
  $('skip-map').hidden = page !== 'map';
  $('secondary').hidden = page !== 'calendar';
  $('planner-page').hidden = page !== 'planner';
  $('secondary').classList.toggle('calendar-page', page === 'calendar');
  const panelParent = page === 'planner' ? $('plan-content') : $('cart-dock');
  if ($('trip-panel').parentNode !== panelParent) panelParent.append($('trip-panel'));
  $('trip-calculator').open = page === 'planner';
  setCartOpen(false);
  if (changedPage && page === 'map') renderMap();
  renderTrip();
  for (const link of document.querySelectorAll('[data-page]')) {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (page === 'calendar') festivalCalendar.mount($('secondary'));
  if (changedPage) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const main = page === 'map' ? $('workspace') : page === 'planner' ? $('planner-page') : $('secondary');
    const title = main.querySelector('h1');
    if (title && !$('intro')?.open) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
  }
}

function selectRegion(regionId, focusHeading) {
  if (regionId && !selectableStatus(travelStatus(regionId))) return;
  const previousRegion = state.region;
  const repeated = regionId && regionId === previousRegion;
  const currentZoom = pendingZoom ?? state.zoom;
  cancelMapAnimation();
  stopPanning();
  const previous = currentMapCamera();
  if (!repeated) {
    if (state.landmark) setLandmark(null);
    setRegionInfo(false);
    state.region = regionId;
    state.regionListOpen = !regionId;
    state.category = 'all';
    state.place = null;
    state.drawerManuallyClosed = false;
    setCartOpen(Boolean(regionId));
    renderTrip();
    renderRegionPane();
    renderMap();
  }
  const fittedWidth = fittedMapWidth();
  const region = regionById.get(regionId);
  const { center, zoom } = region ? regionCamera(regionId, fittedWidth) : { center: overviewCenter(), zoom: 1 };
  const targetZoom = repeated && currentZoom >= zoom ? Math.min(maxMapZoom, currentZoom * 1.25) : zoom;
  pendingZoom = targetZoom;
  animateMap(previous, center, targetZoom, fittedWidth);
  if (focusHeading) {
    const visibleClass = state.filter === 'available' ? '.available' : '';
    const previousButton = $('region-pane').querySelector(`.region-row${visibleClass}[data-value="${previousRegion}"]`);
    const target = region ? $('region-tourism-scroll')
      : previousButton || $('region-pane').querySelector('.rail-filter [aria-pressed="true"]');
    (target || mapViewport).focus({ preventScroll: true });
  }
}

function updateBasket() {
  if (state.basket.size === 0) state.drawerManuallyClosed = false;
  myPlans.saveEdits();
  renderTrip();
  if (state.page === 'map' && state.region) {
    refreshRegionInfo();
    renderMap();
  }
}

function setCartOpen(open) {
  state.drawerOpen = open && state.page === 'map';
  $('cart-dock').classList.toggle('is-open', state.drawerOpen);
  $('cart-toggle').setAttribute('aria-expanded', String(state.drawerOpen));
  $('cart-toggle').setAttribute('aria-label', `여행 일정표 ${state.drawerOpen ? '닫기' : '열기'}, 담은 장소 ${state.basket.size}곳`);
  const panelHidden = state.page !== 'planner' && !state.drawerOpen;
  $('trip-panel').inert = panelHidden;
  $('trip-panel').setAttribute('aria-hidden', String(panelHidden));
}

function toggleCart() {
  state.drawerManuallyClosed = state.drawerOpen && state.basket.size > 0;
  setCartOpen(!state.drawerOpen);
}

function switchTripRegion() {
  if (!state.region) return;
  if (state.landmark) setLandmark(null);
  setRegionList(true);
  stopPanning();
  state.region = null;
  state.category = 'all';
  state.place = null;
  renderRegionPane();
  renderMap();
  renderTrip();
  setCartOpen(false);
  if (state.basket.size) {
    const confirm = $('basket-confirm');
    confirm.returnValue = 'keep';
    confirm.showModal();
  } else {
    setRegionList(true, true);
  }
}

$('basket-confirm').addEventListener('close', () => {
  if ($('basket-confirm').returnValue === 'clear') {
    state.basket.clear();
    updateBasket();
    $('cart-announcement').textContent = '담은 장소를 모두 삭제했어요.';
  }
  if (state.page === 'map') setRegionList(true, true);
});

function addPlace(id) {
  const place = placeById.get(id);
  if (!place || state.basket.has(id)) return;
  state.basket.set(id, { quantity: place.category === 'stay' ? 1 : state.people, start: '', end: '' });
  state.basketRegion = 'all';
  if (!state.drawerManuallyClosed) setCartOpen(true);
  updateBasket();
  $('cart-announcement').textContent = `${place.name} 담기 완료. 총 ${state.basket.size}곳.`;
}

document.addEventListener('localo:place', (event) => {
  if (placeById.has(event.detail?.placeId) && !state.drawerManuallyClosed) setCartOpen(true);
});

document.addEventListener('click', (event) => {
  if (state.drawerOpen && !state.region && !state.basket.size && !$('cart-dock').contains(event.target) &&
      !event.target.closest('dialog, [data-action="region-list"], #region-list-panel [data-action="filter"]')) setCartOpen(false);
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !state.drawerOpen || !$('cart-dock').contains(event.target)) return;
  toggleCart();
  $('cart-toggle').focus({ preventScroll: true });
});

const cartDock = $('cart-dock');
let photoDrag = null;
let ignoreDragClick = false;

function startPhotoDrag(event) {
  if (photoDrag || panArmed || event.button !== 0 || event.isPrimary === false) return;
  const balloon = event.target.closest('[data-drag-place]');
  const control = event.target.closest('button, a');
  // A preview sits inside its pin button. The full balloon has its own action buttons.
  if (!balloon || (control && balloon.contains(control))) return;
  photoDrag = { balloon, pointerId: event.pointerId, x: event.clientX, y: event.clientY, preview: null };
  // Keep the browser from taking over the pointer when it starts its native drag loop.
  balloon.draggable = false;
  if (!control) event.preventDefault();
}

function overCart(event) {
  return state.page === 'map' && cartDock.contains(document.elementFromPoint(event.clientX, event.clientY));
}

function isDragPointer(event) {
  return photoDrag && (event.pointerId == null || photoDrag.pointerId == null || event.pointerId === photoDrag.pointerId);
}

function movePhotoDrag(event) {
  if (!isDragPointer(event)) return;
  if (event.buttons === 0) { cancelPhotoDrag(); return; }
  if (!photoDrag.preview) {
    if (Math.hypot(event.clientX - photoDrag.x, event.clientY - photoDrag.y) < 6) return;
    const preview = photoDrag.balloon.querySelector('img').cloneNode(false);
    preview.className = 'cart-drag-preview';
    preview.setAttribute('aria-hidden', 'true');
    document.body.append(preview);
    photoDrag.preview = preview;
  }
  photoDrag.preview.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
  cartDock.classList.toggle('drop-ready', overCart(event));
}

function cancelPhotoDrag() {
  if (!photoDrag) return;
  photoDrag.balloon.draggable = true;
  photoDrag.preview?.remove();
  cartDock.classList.remove('drop-ready');
  photoDrag = null;
}

function finishPhotoDrag(event) {
  if (!isDragPointer(event)) return;
  const moved = photoDrag.preview || Math.hypot(event.clientX - photoDrag.x, event.clientY - photoDrag.y) >= 6;
  const id = photoDrag.balloon.dataset.dragPlace;
  cancelPhotoDrag();
  if (!moved) return;
  ignoreDragClick = true;
  window.setTimeout(() => { ignoreDragClick = false; }, 0);
  if (overCart(event)) addPlace(id);
}

mapScene.addEventListener('pointerdown', startPhotoDrag);
mapScene.addEventListener('mousedown', startPhotoDrag);
window.addEventListener('pointermove', movePhotoDrag);
window.addEventListener('mousemove', movePhotoDrag);
window.addEventListener('pointerup', finishPhotoDrag);
window.addEventListener('mouseup', finishPhotoDrag);
window.addEventListener('pointercancel', (event) => { if (isDragPointer(event)) cancelPhotoDrag(); });
window.addEventListener('blur', cancelPhotoDrag);
window.addEventListener('hashchange', cancelPhotoDrag);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') cancelPhotoDrag(); });
document.addEventListener('click', (event) => {
  if (!ignoreDragClick) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

mapScene.addEventListener('dragstart', (event) => {
  const balloon = event.target.closest('[data-drag-place]');
  if (!balloon) return;
  if (photoDrag) { event.preventDefault(); return; }
  event.dataTransfer.setData('text/plain', balloon.dataset.dragPlace);
  event.dataTransfer.effectAllowed = 'copy';
});
cartDock.addEventListener('dragover', (event) => {
  if (!event.dataTransfer.types.includes('text/plain')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  cartDock.classList.add('drop-ready');
});
cartDock.addEventListener('dragleave', (event) => {
  if (!cartDock.contains(event.relatedTarget)) cartDock.classList.remove('drop-ready');
});
cartDock.addEventListener('drop', (event) => {
  event.preventDefault();
  cartDock.classList.remove('drop-ready');
  addPlace(event.dataTransfer.getData('text/plain'));
});
document.addEventListener('dragend', () => cartDock.classList.remove('drop-ready'));

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const { action, value, delta } = button.dataset;
  const keyboard = event.detail === 0;
  switch (action) {
    case 'filter':
      state.filter = value;
      renderRegionPane();
      renderMap();
      break;
    case 'region': {
      if (button.getAttribute('aria-disabled') === 'true') return;
      if (value === state.region && button.closest('#region-list-panel')) {
        setRegionList(false, keyboard);
        return;
      }
      selectRegion(value, keyboard);
      return;
    }
    case 'region-list':
      setRegionList(!regionListVisible(), keyboard);
      return;
    case 'show-details':
      if (regionListVisible()) setRegionList(false);
      setRegionInfo($('region-information').hidden, keyboard);
      return;
    case 'hide-details':
      setRegionInfo(false, true);
      return;
    case 'zoom-in':
    case 'zoom-out':
      zoomMap(action === 'zoom-in' ? 1.25 : 0.8);
      positionBalloon();
      break;
    case 'category':
      state.category = value;
      state.place = null;
      refreshRegionInfo();
      renderMap();
      break;
    case 'place':
      if (button.classList.contains('tourism-locate') && state.category !== 'all' && state.category !== placeById.get(value)?.category) {
        state.category = 'all';
      }
      selectPlace(value, button.matches('.map-marker.place'), keyboard);
      return;
    case 'photo-category':
      selectPhotoCategory(value);
      return;
    case 'landmark-location':
      locateLandmark(value);
      return;
    case 'close-balloon':
      closeBalloon(keyboard);
      return;
    case 'people':
      state.people += Number(delta);
      myPlans.saveEdits();
      renderTrip();
      break;
    case 'support':
      state.support = value;
      myPlans.saveEdits();
      renderTrip();
      break;
    case 'basket-region':
      state.basketRegion = value;
      renderTrip();
      break;
    case 'toggle-cart':
      toggleCart();
      break;
    case 'switch-region':
      switchTripRegion();
      return;
    case 'add':
      addPlace(value);
      if (keyboard) $('cart-toggle').focus({ preventScroll: true });
      break;
    case 'remove':
      state.basket.delete(value);
      updateBasket();
      $('cart-announcement').textContent = `${placeById.get(value).name} 삭제 완료. 남은 장소 ${state.basket.size}곳.`;
      if (keyboard) {
        const next = $('trip-items').querySelector('.stop-editor summary, a');
        (next || $('cart-toggle')).focus({ preventScroll: true });
      }
      break;
    case 'quantity':
      state.basket.get(value).quantity += Number(delta);
      myPlans.saveEdits();
      renderTrip();
      break;
  }
  if (keyboard && !button.isConnected) {
    [...document.querySelectorAll('button[data-action]')].find((candidate) =>
      candidate.dataset.action === action && candidate.dataset.value === value && candidate.dataset.delta === delta,
    )?.focus({ preventScroll: true });
  }
});

// Let the clicked control finish its own action before dismissing a photo.
// The event path still identifies photo controls replaced when an item is added.
document.addEventListener('click', (event) => {
  if (state.page !== 'map' || (!state.place && !pendingPhotoId) || ignoreDragClick) return;
  const selectingPlace = event.composedPath().some((node) => node.matches?.('.place-balloon, [data-action="place"]'));
  if (!selectingPlace) {
    if (pendingPhotoId) cancelMapAnimation();
    closeBalloon(false);
  }
});

const tripDateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });
const today = Date.now();
$('start-date').value = tripDateFormat.format(today);
$('end-date').min = $('start-date').value;
$('end-date').value = tripDateFormat.format(today + 86400000);
for (const id of ['start-date', 'end-date']) {
  $(id).addEventListener('change', () => {
    const start = $('start-date');
    const end = $('end-date');
    if (!start.value) start.value = tripDateFormat.format(Date.now());
    if (!end.value) end.value = start.value;
    end.min = start.value;
    if (start.value && end.value && end.value < start.value) end.value = start.value;
    for (const visit of state.basket.values()) {
      if (visit.date && visit.date < start.value) visit.date = start.value;
      if (visit.date && visit.date > end.value) visit.date = end.value;
    }
    myPlans.saveEdits();
    renderTrip();
  });
}

const tourismScroll = $('region-tourism-scroll');
const photoOptions = Object.entries(photoCategories);
$('tourism-filters').innerHTML = photoOptions.map(([value, label]) =>
  `<button type="button" data-action="photo-category" data-value="${value}" aria-controls="region-tourism-cards">${label}</button>`).join('');
$('tourism-select').innerHTML = photoOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
$('tourism-select').addEventListener('change', (event) => selectPhotoCategory(event.target.value));

function updatePhotoFades() {
  const { scrollTop, scrollHeight, clientHeight } = tourismScroll;
  const edge = Math.min(42, clientHeight * .12);
  const top = Math.max(0, scrollTop);
  const bottom = Math.max(0, scrollHeight - clientHeight - top);
  tourismScroll.style.setProperty('--fade-top', Math.min(edge, top) + 'px');
  tourismScroll.style.setProperty('--fade-bottom', (bottom <= 1 ? 0 : Math.min(edge, bottom)) + 'px');
}
tourismScroll.addEventListener('scroll', updatePhotoFades, { passive: true });
const photoResize = new ResizeObserver(updatePhotoFades);
photoResize.observe(tourismScroll);
photoResize.observe($('region-tourism-cards'));

window.addEventListener('hashchange', renderPage);
myPlans.initialize();
renderRegionPane();
renderMap();
renderPage();
