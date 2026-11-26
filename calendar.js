/* 축제 캘린더 — kangbj70-cell/Loc 에서 가져온 화면.
   지역·신청/여행 기간·저장한 여행은 localo(app.js)가 mount(root, deps)로 넘긴다.
   deps = { regions:[{id,name,shortName,province}], provinces:[...], periods:[{region,type,start,end}],
            plans():[{id,name,startDate,endDate,color,stops:[[placeId,{date}]]}], placeName(id), openPlan(id) } */
const festivalCalendar = (() => {
  const types = {
    application: { label: '신청 기간', short: '신청', verb: '개시' },
    travel: { label: '여행 가능 기간', short: '여행', verb: '개시' },
    event: { label: '행사 기간', short: '행사', verb: '시작' },
  };
  const detailOrder = ['event', 'application', 'travel'];
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  let regions = [], provinces = [], periods = [];
  let regionById = new Map();
  let placeName = (id) => id;
  let myPlans = { calendarPlans: () => [], openInPlanner() {} };
  const openingIcons = {
    application: '<path d="M9 5H6a1 1 0 0 0-1 1v15h14V6a1 1 0 0 0-1-1h-3"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m8.5 14 2.2 2.2 4.8-5"/>',
    travel: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V4h6v3M7 8v11m10-11v11"/>',
    event: '<path d="m3 21 4.3-13 8.7 8.7-13 4.3ZM12 7l1-4m3 6 3-4m-1 8 4-1M5.7 13l5.3 5.3"/><circle cx="18.5" cy="2.5" r=".65"/><circle cx="21" cy="8" r=".65"/>',
  };

  // 행사는 Loc 시안의 예시 일정이다(실제 축제 아님). 신청·여행 기간은 수집 시트(data/regions.json)에서 온다.
  const exampleEvents = [
    { region: 'andong', type: 'event', start: '2026-11-19', end: '2026-11-22',
      name: '하회마을 가을 문화제', hours: '11:00–18:00', image: 'assets/calendar-andong.png',
      imageAlt: '한옥 마당에서 전통 공연을 보는 관객들',
      description: '하회마을 한옥 마당에서 전통 공연을 즐기는 가을 행사예요.' },
    { region: 'gochang', type: 'event', start: '2026-11-21', end: '2026-11-22', name: '고창 단풍 산책', hours: '10:00–16:00',
      image: 'assets/places/gc-trail.jpg', imageAlt: '숲 사이로 이어지는 산책길 예시',
      description: '울긋불긋 물든 숲길을 따라 고창의 늦가을 풍경을 만나는 산책이에요.' },
    { region: 'geochang', type: 'event', start: '2026-11-28', end: '2026-11-29', name: '거창 로컬마켓', hours: '11:00–17:00',
      image: 'assets/events/geochang-market.jpg', imageAlt: '지역 장터의 판매대 예시',
      description: '거창에서 만든 먹거리와 수공예품을 한자리에서 둘러보는 장터예요.' },
    { region: 'hamyang', type: 'event', start: '2026-12-05', end: '2026-12-06', name: '함양 겨울 장터',
      image: 'assets/events/hamyang-market.jpg', imageAlt: '겨울 장터의 풍경 예시',
      description: '함양의 농산물과 따뜻한 겨울 먹거리를 만나는 계절 장터예요.' },
  ].map((item) => ({ ...item, example: true }));
  let schedules = [];

  let showEvents = false;
  let selectedRegion = 'all';
  const parseDate = (date) => new Date(date + 'T00:00:00Z');
  const isoDate = (date) => date.toISOString().slice(0, 10);
  const dateLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const koreaDateFormat = new Intl.DateTimeFormat('en', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  });
  let selectedDate = todayInKorea();
  let month = parseDate(selectedDate.slice(0, 7) + '-01');
  const favoriteKey = 'localo.favoriteDates.v1';
  const favorites = loadFavorites();
  const bookmarkIcon = '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M2 2h12v15l-6-4-6 4z"/></svg>';
  let refreshMountedPlans;
  window.addEventListener('localo:plans-changed', () => refreshMountedPlans?.());

  function escapeText(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value).replace(/[&<>"']/g, (char) => entities[char]);
  }

  function openingIcon(type) {
    return `<svg class="calendar-start-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${openingIcons[type]}</svg>`;
  }

  function planColors(plan) {
    const color = /^#[\da-f]{6}$/i.test(plan.color) ? plan.color : '#ccb8dd';
    const [r, g, b] = color.slice(1).match(/../g).map((hex) => {
      const c = parseInt(hex, 16) / 255;
      return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    });
    const lightness = r * .2126 + g * .7152 + b * .0722;
    return `--plan-color:${color};--plan-ink:${lightness > .179 ? '#160e18' : '#fff'}`;
  }

  function planDetails(plan, date) {
    const visits = plan.stops.filter(([, visit]) => !visit.date || visit.date === date);
    const stops = visits.map(([id, visit]) => {
      const times = [visit.start, visit.end].filter(Boolean).join('–');
      return `<li>${times ? `<span>${escapeText(times)}</span> ` : ''}${escapeText(placeName(id))}</li>`;
    }).join('');
    return `<li class="calendar-detail-item calendar-plan-card" style="${planColors(plan)}">
      <div class="calendar-detail-row"><h4>${escapeText(plan.name)}</h4></div>
      <p class="calendar-period">${formatPeriod({ start: plan.startDate, end: plan.endDate })}</p>
      ${stops ? `<ol class="calendar-plan-stops">${stops}</ol>` : ''}
      <button type="button" class="calendar-plan-edit" data-edit-plan="${escapeText(plan.id)}">장바구니로 불러오기 <span aria-hidden="true">↗</span></button>
    </li>`;
  }

  function renderWeek(cells, renderCell) {
    // A continuing plan keeps its lane as others start or finish. The notebook lists every overlap.
    const lanes = [null, null];
    const ribbons = [];
    const buttons = cells.map((cell, column) => {
      for (let row = 0; row < lanes.length; row++) {
        if (!cell.plans.includes(lanes[row]?.plan)) lanes[row] = null;
      }
      for (const plan of cell.plans) {
        if (lanes.some((ribbon) => ribbon?.plan === plan)) continue;
        const row = lanes.indexOf(null);
        if (row < 0) break;
        lanes[row] = { plan, row, start: column, end: column };
        ribbons.push(lanes[row]);
      }
      for (const ribbon of lanes) if (ribbon) ribbon.end = column;
      return renderCell(cell, lanes[1] ? 2 : lanes[0] ? 1 : 0, Math.max(0, cell.plans.length - lanes.length));
    }).join('');
    const bands = ribbons.map(({ plan, row, start, end }) => {
      const outside = cells.slice(start, end + 1).every((cell) => cell.outside);
      return `<span class="calendar-plan-band${outside ? ' is-spillover' : ''}"
        style="${planColors(plan)};grid-column:${start + 1} / ${end + 2};grid-row:${2 - row}">${escapeText(plan.name)}</span>`;
    }).join('');
    return `<div class="calendar-week">${buttons}${bands ? `<div class="calendar-plan-bands" aria-hidden="true">${bands}</div>` : ''}</div>`;
  }

  function loadFavorites() {
    try {
      const saved = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
      return new Set(Array.isArray(saved) ? saved.filter((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) : []);
    } catch {
      return new Set();
    }
  }

  function matchesRegion(item) {
    return selectedRegion === 'all' || selectedRegion === item.region ||
      selectedRegion === 'province:' + regionById.get(item.region)?.province;
  }

  function todayInKorea() {
    const parts = Object.fromEntries(koreaDateFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
    return [parts.year, parts.month, parts.day].join('-');
  }

  function formatPeriod(item) {
    const start = shortDate.format(parseDate(item.start));
    const end = shortDate.format(parseDate(item.end));
    const range = item.start === item.end ? start : `${start}~${end}`;
    return range + (item.closingTime ? ' ' + item.closingTime + ' 마감' : '');
  }

  function dayNote(item, date) {
    if (item.type === 'application' && item.end === date) return item.closingTime ? item.closingTime + ' 마감' : '신청 마감';
    if (item.start === date) return item.type === 'event' ? '행사 첫날' : '기간 시작';
    if (item.end === date) return '마지막 날';
    return '';
  }

  function regionOptions() {
    return '<option value="all">전체 지역</option>' + provinces.map((province) =>
      `<optgroup label="${province}"><option value="province:${province}">${province} 전체</option>
        ${regions.filter((region) => region.province === province).map((region) =>
          `<option value="${region.id}">${region.name}</option>`,
        ).join('')}</optgroup>`,
    ).join('');
  }

  function detailItem(item, date) {
    const region = regionById.get(item.region);
    const note = dayNote(item, date);
    return `<li class="calendar-detail-item ${item.type}${item.image ? ' with-photo' : ''}">
      ${item.image ? `<figure class="calendar-photo">
        <img src="${item.image}" alt="${item.imageAlt}" width="640" height="360" decoding="async">
        <figcaption>예시 이미지</figcaption></figure>` : ''}
      <div class="calendar-detail-copy">
        <div class="calendar-detail-row"><h4>${item.name || region.name}</h4>${note ? `<span class="calendar-phase">${note}</span>` : ''}</div>
        ${item.name ? `<p class="calendar-location">${region.province} ${region.name}${item.example ? ' · 예시 행사' : ''}</p>` : ''}
        ${item.description ? `<p class="calendar-description">${item.description}</p>` : ''}
        <p class="calendar-period"><span>${formatPeriod(item)}</span>${item.hours ? `<span>${item.hours}</span>` : ''}</p>
      </div>
    </li>`;
  }

  function mount(root, deps) {
    ({ regions, provinces, periods, placeName } = deps);
    myPlans = { calendarPlans: deps.plans, openInPlanner: deps.openPlan };
    regionById = new Map(regions.map((region) => [region.id, region]));
    schedules = [...periods, ...exampleEvents.filter((item) => regionById.has(item.region))];
    if (selectedRegion !== 'all' && !selectedRegion.startsWith('province:') && !regionById.has(selectedRegion)) selectedRegion = 'all';
    root.innerHTML = `<header class="calendar-intro">
      <h1>축제 캘린더</h1>
      <p class="calendar-demo">신청·여행 기간: 수집 시트 기준 · 행사: 예시</p>
    </header>
    <div class="calendar-layout">
      <section class="calendar-board" aria-labelledby="calendar-year calendar-month-name">
        <div class="calendar-binding" aria-hidden="true">${'<i></i>'.repeat(35)}</div>
        <header class="calendar-header">
          <div class="calendar-toolbar">
            <span class="calendar-year" id="calendar-year"></span>
            <div class="calendar-month">
              <button type="button" data-calendar-action="previous" aria-label="이전 달"><span class="calendar-chevron" aria-hidden="true"></span></button>
              <h2 id="calendar-month-name" aria-live="polite" aria-atomic="true"></h2>
              <button type="button" data-calendar-action="next" aria-label="다음 달"><span class="calendar-chevron next" aria-hidden="true"></span></button>
            </div>
            <button type="button" class="chip calendar-today" data-calendar-action="today">오늘</button>
          </div>
          <div class="calendar-filters">
            <label class="calendar-region">지역 <select id="calendar-region">${regionOptions()}</select></label>
            <button type="button" class="calendar-event-switch" role="switch" aria-checked="${showEvents}">
              이벤트<span class="calendar-switch-track" aria-hidden="true"></span>
            </button>
          </div>
        </header>
        <div class="calendar-paper">
          <div class="calendar-page-stack"><div class="calendar-sheet">
            <div class="calendar-weekdays" aria-hidden="true">${weekdays.map((label) => `<span>${label}</span>`).join('')}</div>
            <div class="calendar-grid" role="group" aria-label="날짜 선택"></div>
          </div></div>
        </div>
        <div class="calendar-key" aria-label="날짜 표시">
          <span><i class="calendar-key-today"></i>오늘</span>
          <span><i class="calendar-key-travel"></i>신청·여행 가능일</span>
          <span class="calendar-event-key" ${showEvents ? '' : 'hidden'}><i class="calendar-event-dot"></i>행사일</span>
          <span><i class="calendar-key-favorite">${bookmarkIcon}</i>찜한 날</span>
          ${Object.entries(types).map(([type, category]) => `<span class="calendar-opening-key ${type}" ${type === 'event' && !showEvents ? 'hidden' : ''}>${openingIcon(type)}${category.short} ${category.verb}</span>`).join('')}
        </div>
      </section>
      <aside class="calendar-details" aria-labelledby="calendar-detail-title" aria-live="polite"></aside>
    </div>
    <div class="calendar-tooltip" id="calendar-day-tooltip" role="tooltip" hidden></div>`;

    const grid = root.querySelector('.calendar-grid');
    const sheet = root.querySelector('.calendar-sheet');
    const stack = root.querySelector('.calendar-page-stack');
    const eventSwitch = root.querySelector('.calendar-event-switch');
    const eventKey = root.querySelector('.calendar-event-key');
    const sidebar = root.querySelector('.calendar-details');
    const tooltip = root.querySelector('.calendar-tooltip');
    const regionSelect = root.querySelector('#calendar-region');
    regionSelect.value = selectedRegion;
    let days = new Map();
    let savedPlans = [];
    let hoveredDay = null;
    let showTimer;
    let hideTimer;
    let turnAnimation;
    let oldSheet;
    function hideTooltip() {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      hoveredDay?.removeAttribute('aria-describedby');
      hoveredDay = null;
      tooltip.hidden = true;
    }

    function showTooltip(button) {
      hideTooltip();
      const date = button.dataset.day;
      const list = days.get(date);
      if (!list.length) return;
      tooltip.innerHTML = `<strong>${dateLabel.format(parseDate(date))}</strong>
        <ul>${list.slice(0, 4).map((item) => `<li class="${item.type}">
          <span class="calendar-swatch" aria-hidden="true"></span>
          <div><b>${item.name || regionById.get(item.region).name + ' ' + types[item.type].short}</b>
            <span>${formatPeriod(item)}${item.hours ? ' · ' + item.hours : ''}</span></div>
        </li>`).join('')}</ul>${list.length > 4 ? `<p>외 ${list.length - 4}개 · 날짜를 선택해 모두 보기</p>` : ''}`;
      tooltip.hidden = false;
      const anchor = button.getBoundingClientRect();
      const size = tooltip.getBoundingClientRect();
      const x = Math.max(8, Math.min(anchor.left, document.documentElement.clientWidth - size.width - 8));
      const y = anchor.bottom + size.height + 8 < window.innerHeight ? anchor.bottom + 3 : Math.max(8, anchor.top - size.height - 3);
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
      button.setAttribute('aria-describedby', tooltip.id);
      hoveredDay = button;
    }

    function renderDetails() {
      const list = days.get(selectedDate) || [];
      const plans = savedPlans.filter((plan) => plan.startDate <= selectedDate && selectedDate <= plan.endDate);
      const personalSection = plans.length ? `<section class="calendar-detail-group calendar-my-plans"><h3>저장한 여행</h3>
        <ul>${plans.map((plan) => planDetails(plan, selectedDate)).join('')}</ul></section>` : '';
      const sections = detailOrder.map((type) => {
        const items = list.filter((item) => item.type === type);
        if (!items.length) return '';
        return `<section class="calendar-detail-group ${type}"><h3><span class="calendar-swatch"></span>${types[type].label}</h3>
          <ul>${items.map((item) => detailItem(item, selectedDate)).join('')}</ul></section>`;
      }).join('');
      const date = parseDate(selectedDate);
      sidebar.innerHTML = `<header class="calendar-detail-header">
        <div><h2 id="calendar-detail-title">${shortDate.format(date)}</h2>
          <p>${weekdays[date.getUTCDay()]}요일${plans.length ? ' · 저장한 여행 ' + plans.length + '개' : ''} · 일정 ${list.length}개</p></div>
        <button type="button" class="calendar-favorite" aria-label="${shortDate.format(date)} 찜하기"
          aria-pressed="${favorites.has(selectedDate)}" title="${favorites.has(selectedDate) ? '찜 해제' : '이 날짜 찜하기'}">${bookmarkIcon}</button>
      </header><div class="calendar-detail-content">${personalSection + sections || '<p class="calendar-empty">선택한 날짜와 조건에 맞는 일정이 없어요.</p>'}</div>
        <button class="calendar-return" type="button">달력으로 돌아가기 <span aria-hidden="true">↑</span></button>`;
      if (sidebar.dataset.date !== selectedDate) sidebar.scrollTop = 0;
      sidebar.dataset.date = selectedDate;
    }

    function renderMonth(turn = 0) {
      hideTooltip();
      turnAnimation?.cancel();
      oldSheet?.remove();
      if (turn && typeof sheet.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        oldSheet = sheet.cloneNode(true);
        oldSheet.classList.add('calendar-turn-sheet');
        oldSheet.setAttribute('aria-hidden', 'true');
        oldSheet.inert = true;
        stack.append(oldSheet);
      } else {
        oldSheet = null;
      }
      const year = month.getUTCFullYear();
      const monthIndex = month.getUTCMonth();
      const firstDay = month.getUTCDay();
      const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const today = todayInKorea();
      const regionSchedules = schedules.filter((item) => matchesRegion(item) && (item.type !== 'event' || showEvents));
      savedPlans = myPlans.calendarPlans().slice().sort((a, b) =>
        a.startDate.localeCompare(b.startDate) || b.endDate.localeCompare(a.endDate) || a.id.localeCompare(b.id));
      days = new Map();
      const cellCount = Math.ceil((firstDay + dayCount) / 7) * 7;
      const cells = Array.from({ length: cellCount }, (_, index) => {
        const day = new Date(Date.UTC(year, monthIndex, index + 1 - firstDay));
        const date = isoDate(day);
        const list = regionSchedules.filter((item) => item.start <= date && date <= item.end);
        days.set(date, list);
        return { day: day.getUTCDate(), date, outside: day.getUTCMonth() !== monthIndex, items: list,
          plans: savedPlans.filter((plan) => plan.startDate <= date && date <= plan.endDate) };
      });
      const renderCell = (cell, laneCount, hiddenPlans) => {
        const { day, date, items, outside, plans } = cell;
        const canTravel = items.some((item) => item.type === 'travel');
        const canApply = items.some((item) => item.type === 'application');
        const starts = items.filter((item) => item.start === date);
        const startLabels = starts.map((item) => ({
          region: regionById.get(item.region).shortName, category: types[item.type].short,
          verb: types[item.type].verb, type: item.type, name: item.name,
        }));
        const startingNames = startLabels.map(({ region, category, verb, name }) => `${region} ${category} ${verb}${name ? ' · ' + name : ''}`);
        const events = showEvents ? items.filter((item) => item.type === 'event') : [];
        const continuingNames = events.filter((item) => item.start !== date).map((item) => item.name + ' 진행 중');
        const favorite = favorites.has(date);
        const labels = [dateLabel.format(parseDate(date)), ...startingNames, ...continuingNames];
        if (canTravel) labels.push('여행 가능');
        if (canApply) labels.push('신청 가능');
        if (plans.length) labels.push('저장한 여행 ' + plans.map((plan) => plan.name).join(', '));
        if (favorite) labels.push('찜한 날');
        const classes = ['calendar-day', outside && 'is-outside', (canApply || canTravel) && 'is-available', canTravel && 'can-travel', events.length && 'has-event'];
        return `<button type="button" class="${classes.filter(Boolean).join(' ')}" data-day="${date}" data-plan-lanes="${laneCount}" tabindex="${date === selectedDate ? 0 : -1}"
          aria-label="${escapeText(labels.join(', '))}"
          aria-pressed="${date === selectedDate}" ${date === today ? 'aria-current="date"' : ''}>
          <span class="calendar-date-line" aria-hidden="true"><span class="calendar-day-number">${day}</span>
            ${events.length ? '<span class="calendar-event-dot"></span>' : ''}${hiddenPlans ? `<span class="calendar-plan-more">+${hiddenPlans}</span>` : ''}</span>
          ${date === today ? '<span class="calendar-today-mark" aria-hidden="true" lang="en">Today</span>' : ''}
          ${favorite ? `<span class="calendar-saved" aria-hidden="true">${bookmarkIcon}</span>` : ''}
          ${startLabels.length ? `<span class="calendar-starts" aria-hidden="true">${startLabels.map(({ region, category, verb, type }) =>
            `<span class="calendar-start ${type}">${openingIcon(type)}<span class="calendar-start-text">${region}<span class="calendar-start-category"> ${category}<span class="calendar-start-verb"> ${verb}</span></span></span></span>`).join('')}</span>` : ''}
        </button>`;
      };
      root.querySelector('#calendar-year').textContent = year + '년';
      root.querySelector('#calendar-month-name').innerHTML = `${monthIndex + 1}<span>월</span>`;
      const weeks = [];
      for (let i = 0; i < cellCount; i += 7) weeks.push(renderWeek(cells.slice(i, i + 7), renderCell));
      grid.innerHTML = weeks.join('');
      renderDetails();
      if (oldSheet) {
        const leaving = oldSheet;
        const flat = { transform: 'perspective(1000px) rotateX(0deg)', opacity: 1 };
        const lifted = { transform: 'perspective(1000px) rotateX(72deg)', opacity: 0.1 };
        if (turn < 0) leaving.classList.add('behind');
        turnAnimation = (turn < 0 ? sheet : leaving).animate(
          turn < 0 ? [lifted, flat] : [flat, lifted], { duration: 330, easing: 'ease-out' },
        );
        turnAnimation.onfinish = () => leaving.remove();
      }
    }

    sidebar.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-plan]');
      if (edit) {
        myPlans.openInPlanner(edit.dataset.editPlan);
        return;
      }
      if (event.target.closest('.calendar-return')) {
        const day = grid.querySelector('[aria-pressed="true"]');
        day.focus({ preventScroll: true });
        day.scrollIntoView({ block: 'center' });
        return;
      }
      if (!event.target.closest('.calendar-favorite')) return;
      if (favorites.has(selectedDate)) favorites.delete(selectedDate);
      else favorites.add(selectedDate);
      try { localStorage.setItem(favoriteKey, JSON.stringify([...favorites])); } catch { /* The choice still applies to this visit. */ }
      renderMonth();
      sidebar.querySelector('.calendar-favorite').focus({ preventScroll: true });
    });

    root.querySelector('.calendar-toolbar').addEventListener('click', (event) => {
      const action = event.target.closest('[data-calendar-action]')?.dataset.calendarAction;
      if (!action) return;
      const previousMonth = month.getTime();
      if (action === 'today') {
        selectedDate = todayInKorea();
        month = parseDate(selectedDate.slice(0, 7) + '-01');
      } else {
        const offset = action === 'previous' ? -1 : 1;
        month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1));
        selectedDate = isoDate(month);
      }
      renderMonth(Math.sign(month.getTime() - previousMonth));
    });

    regionSelect.addEventListener('change', () => {
      selectedRegion = regionSelect.value;
      renderMonth();
    });
    eventSwitch.addEventListener('click', () => {
      showEvents = !showEvents;
      eventSwitch.setAttribute('aria-checked', String(showEvents));
      eventKey.hidden = !showEvents;
      root.querySelector('.calendar-opening-key.event').hidden = !showEvents;
      renderMonth();
    });

    grid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-day]');
      if (!button) return;
      hideTooltip();
      const previous = grid.querySelector('[aria-pressed="true"]');
      previous?.setAttribute('aria-pressed', 'false');
      const tabStop = grid.querySelector('[tabindex="0"]');
      if (tabStop) tabStop.tabIndex = -1;
      button.setAttribute('aria-pressed', 'true');
      button.tabIndex = 0;
      selectedDate = button.dataset.day;
      if (button.classList.contains('is-outside')) {
        const next = parseDate(selectedDate.slice(0, 7) + '-01');
        const direction = Math.sign(next - month);
        month = next;
        renderMonth(direction);
        grid.querySelector(`[data-day="${selectedDate}"]`).focus({ preventScroll: true });
      } else {
        renderDetails();
      }
      if (event.detail > 0 && getComputedStyle(sidebar).position !== 'sticky') {
        sidebar.scrollIntoView({ block: 'start' });
      }
    });

    grid.addEventListener('pointerover', (event) => {
      const button = event.target.closest('[data-day]');
      if (event.pointerType !== 'mouse' || !button || button.contains(event.relatedTarget)) return;
      hideTooltip();
      showTimer = setTimeout(() => showTooltip(button), 180);
    });
    grid.addEventListener('pointerout', (event) => {
      const button = event.target.closest('[data-day]');
      if (!button || button.contains(event.relatedTarget)) return;
      clearTimeout(showTimer);
      if (hoveredDay === button) hideTimer = setTimeout(hideTooltip, 120);
    });
    tooltip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    tooltip.addEventListener('pointerleave', hideTooltip);
    grid.addEventListener('focusin', (event) => {
      if (event.target.matches('[data-day]:focus-visible')) showTooltip(event.target);
    });
    grid.addEventListener('focusout', hideTooltip);
    grid.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideTooltip();
        return;
      }
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      if (!offset || !event.target.dataset.day) return;
      event.preventDefault();
      const next = parseDate(event.target.dataset.day);
      next.setUTCDate(next.getUTCDate() + offset);
      const nextDate = isoDate(next);
      if (next.getUTCMonth() !== month.getUTCMonth()) {
        selectedDate = nextDate;
        month = parseDate(nextDate.slice(0, 7) + '-01');
        renderMonth(Math.sign(offset));
      }
      const button = grid.querySelector(`[data-day="${nextDate}"]`);
      event.target.tabIndex = -1;
      button.tabIndex = 0;
      button.focus();
    });
    grid.addEventListener('wheel', hideTooltip, { passive: true });

    refreshMountedPlans = () => {
      if (!root.hidden && grid.isConnected) renderMonth();
    };
    renderMonth();
  }

  return { mount, refresh: () => refreshMountedPlans?.() };
})();

window.festivalCalendar = festivalCalendar;
