const festivalCalendar = (() => {
  const types = {
    application: { label: '신청 기간', short: '신청' },
    travel: { label: '여행 가능 기간', short: '여행 가능' },
    event: { label: '행사 기간', short: '행사' },
  };
  const typeOrder = Object.keys(types);
  const detailOrder = ['event', 'application', 'travel'];
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const regionById = new Map(regions.map((region) => [region.id, region]));

  // Fictional schedules demonstrate overlap, opening and closing days, and month boundaries.
  const schedules = [
    { region: 'andong', type: 'application', start: '2026-11-02', end: '2026-11-08' },
    { region: 'andong', type: 'travel', start: '2026-11-13', end: '2026-11-22' },
    { region: 'andong', type: 'event', start: '2026-11-19', end: '2026-11-22',
      name: '하회마을 가을 문화제', hours: '11:00–18:00', image: 'assets/calendar-andong.png',
      imageAlt: '한옥 마당에서 전통 공연을 보는 관객들' },
    { region: 'gochang', type: 'application', start: '2026-11-12', end: '2026-11-19', closingTime: '18:00' },
    { region: 'gochang', type: 'travel', start: '2026-11-20', end: '2026-11-30' },
    { region: 'gochang', type: 'event', start: '2026-11-21', end: '2026-11-22', name: '고창 단풍 산책', hours: '10:00–16:00' },
    { region: 'geochang', type: 'application', start: '2026-11-16', end: '2026-11-22', closingTime: '17:00' },
    { region: 'geochang', type: 'travel', start: '2026-11-21', end: '2026-12-06' },
    { region: 'geochang', type: 'event', start: '2026-11-28', end: '2026-11-29', name: '거창 로컬마켓', hours: '11:00–17:00' },
    { region: 'hamyang', type: 'application', start: '2026-11-23', end: '2026-11-28' },
    { region: 'hamyang', type: 'travel', start: '2026-11-29', end: '2026-12-13' },
    { region: 'hamyang', type: 'event', start: '2026-12-05', end: '2026-12-06', name: '함양 겨울 장터' },
  ];

  const selectedTypes = new Set(typeOrder);
  let selectedRegion = 'all';
  let selectedDate = '2026-11-19';
  let month = new Date(Date.UTC(2026, 10, 1));
  const parseDate = (date) => new Date(date + 'T00:00:00Z');
  const isoDate = (date) => date.toISOString().slice(0, 10);
  const dateLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC' });
  const shortDate = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const koreaDateFormat = new Intl.DateTimeFormat('en', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  });

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
    return '<option value="all">전체 지역</option>' + Object.keys(regionGroups).map((province) =>
      `<optgroup label="${province}"><option value="province:${province}">${province} 전체</option>
        ${regions.filter((region) => region.province === province).map((region) =>
          `<option value="${region.id}">${region.name}</option>`,
        ).join('')}</optgroup>`,
    ).join('');
  }

  function renderWeekBars(week) {
    const items = new Set(week.flatMap((day) => day?.items ?? []));
    if (!items.size) return '';

    const spans = [...items].map((item) => ({
      item,
      first: week.findIndex((day) => day?.items.includes(item)),
      last: week.findLastIndex((day) => day?.items.includes(item)),
    }));
    spans.sort((a, b) => a.first - b.first || b.last - a.last);

    // Keep each period on one row for the whole week. Reuse the first row
    // whose prior period ended before this one starts.
    const rowEnds = [];
    const bars = spans.map(({ item, first, last }) => {
      let row = rowEnds.findIndex((end) => end < first);
      if (row < 0) row = rowEnds.length;
      rowEnds[row] = last;
      const label = week[first].date === item.start
        ? item.name || `${regionById.get(item.region).shortName} ${types[item.type].short}`
        : '';
      return `<span class="calendar-band ${item.type}" style="grid-column:${first + 1} / ${last + 2};grid-row:${row + 1}">
        ${label ? `<span class="calendar-band-label">${label}</span>` : ''}
      </span>`;
    }).join('');

    return `<div class="calendar-week-bars" aria-hidden="true" style="--calendar-band-count:${rowEnds.length}">${bars}</div>`;
  }

  function detailItem(item, date) {
    const region = regionById.get(item.region);
    const note = dayNote(item, date);
    return `<li class="calendar-detail-item ${item.type}">
      ${item.image ? `<figure class="calendar-photo">
        <img src="${item.image}" alt="${item.imageAlt}" width="1672" height="941">
        <figcaption>시안용 이미지</figcaption></figure>` : ''}
      <div class="calendar-detail-row"><h4>${item.name || region.name}</h4>${note ? `<span class="calendar-phase">${note}</span>` : ''}</div>
      ${item.name ? `<p class="calendar-location">${region.province} ${region.name}</p>` : ''}
      <p class="calendar-period">${formatPeriod(item)}${item.hours ? ' · ' + item.hours : ''}</p>
    </li>`;
  }

  function mount(root) {
    root.innerHTML = `<header class="calendar-intro">
      <h1>축제 캘린더</h1>
      <p class="calendar-demo">예시 일정</p>
    </header>
    <div class="calendar-layout">
      <section class="calendar-board" aria-labelledby="calendar-month-name">
        <header class="calendar-header">
          <div class="calendar-toolbar">
            <div class="calendar-month"><h2 id="calendar-month-name" aria-live="polite"></h2>
              <div class="calendar-month-buttons">
                <button type="button" data-calendar-action="previous" aria-label="이전 달"><span class="calendar-chevron" aria-hidden="true"></span></button>
                <button type="button" data-calendar-action="next" aria-label="다음 달"><span class="calendar-chevron next" aria-hidden="true"></span></button>
              </div>
            </div>
            <button type="button" class="chip calendar-today" data-calendar-action="today">오늘</button>
          </div>
          <div class="calendar-filters">
            <label class="calendar-region">지역 <select id="calendar-region">${regionOptions()}</select></label>
            <div class="calendar-types" role="group" aria-label="일정 유형 필터">
              ${typeOrder.map((type) => `<label class="calendar-type ${type}">
                <input type="checkbox" value="${type}" aria-label="${types[type].label}" ${selectedTypes.has(type) ? 'checked' : ''}>
                <span>${types[type].short}</span>
              </label>`).join('')}
            </div>
          </div>
        </header>
        <div class="calendar-body">
          <div class="calendar-weekdays" aria-hidden="true">${weekdays.map((label) => `<span>${label}</span>`).join('')}</div>
          <div class="calendar-grid" role="group" aria-label="날짜 선택"></div>
        </div>
      </section>
      <aside class="calendar-details" aria-labelledby="calendar-detail-title" aria-live="polite"></aside>
    </div>
    <div class="calendar-tooltip" id="calendar-day-tooltip" role="tooltip" hidden></div>`;

    const grid = root.querySelector('.calendar-grid');
    const sidebar = root.querySelector('.calendar-details');
    const tooltip = root.querySelector('.calendar-tooltip');
    const regionSelect = root.querySelector('#calendar-region');
    regionSelect.value = selectedRegion;
    let days = new Map();
    let hoveredDay = null;
    let showTimer;
    let hideTimer;

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
      const sections = detailOrder.map((type) => {
        const items = list.filter((item) => item.type === type);
        if (!items.length) return '';
        return `<section class="calendar-detail-group ${type}"><h3><span class="calendar-swatch"></span>${types[type].label}</h3>
          <ul>${items.map((item) => detailItem(item, selectedDate)).join('')}</ul></section>`;
      }).join('');
      sidebar.innerHTML = `<header class="calendar-detail-header">
        <h2 id="calendar-detail-title">${dateLabel.format(parseDate(selectedDate))}</h2>
        <span>일정 ${list.length}개</span>
      </header><div class="calendar-detail-content">${sections || '<p class="calendar-empty">선택한 날짜와 조건에 맞는 일정이 없어요.</p>'}</div>`;
    }

    function renderMonth() {
      hideTooltip();
      const year = month.getUTCFullYear();
      const monthIndex = month.getUTCMonth();
      const firstDay = month.getUTCDay();
      const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const today = todayInKorea();
      const visibleSchedules = schedules.filter((item) => selectedTypes.has(item.type) &&
        (selectedRegion === 'all' || selectedRegion === item.region ||
          selectedRegion === 'province:' + regionById.get(item.region).province));
      days = new Map();
      const dates = Array.from({ length: dayCount }, (_, index) => {
        const day = index + 1;
        const date = isoDate(new Date(Date.UTC(year, monthIndex, day)));
        const list = visibleSchedules.filter((item) => item.start <= date && date <= item.end);
        days.set(date, list);
        return { day, date, items: list };
      });
      const cells = Array(firstDay).fill(null).concat(dates);
      const lastBlanks = (7 - cells.length % 7) % 7;
      cells.push(...Array(lastBlanks).fill(null));
      const blank = '<span class="calendar-blank" aria-hidden="true"></span>';
      const renderCell = (cell) => {
        if (!cell) return blank;
        const { day, date, items } = cell;
        const eventStarts = items.some((item) => item.type === 'event' && item.start === date);
        const countLabel = items.length ? `일정 ${items.length}개` : '일정 없음';
        return `<button type="button" class="calendar-day" data-day="${date}" tabindex="${date === selectedDate ? 0 : -1}"
          aria-label="${dateLabel.format(parseDate(date))}, ${countLabel}${eventStarts ? ', 행사 시작' : ''}"
          aria-pressed="${date === selectedDate}" ${date === today ? 'aria-current="date"' : ''}>
          <span class="calendar-day-top" aria-hidden="true"><span class="calendar-day-number">${day}</span>
          ${eventStarts ? '<span class="calendar-event-start event"></span>' : ''}</span>
        </button>`;
      };
      const weeks = [];
      for (let index = 0; index < cells.length; index += 7) {
        const week = cells.slice(index, index + 7);
        weeks.push(`<div class="calendar-week">${week.map(renderCell).join('')}${renderWeekBars(week)}</div>`);
      }
      root.querySelector('#calendar-month-name').textContent = `${year}년 ${monthIndex + 1}월`;
      grid.innerHTML = weeks.join('');
      renderDetails();
    }

    root.querySelector('.calendar-toolbar').addEventListener('click', (event) => {
      const action = event.target.closest('[data-calendar-action]')?.dataset.calendarAction;
      if (!action) return;
      if (action === 'today') {
        selectedDate = todayInKorea();
        month = parseDate(selectedDate.slice(0, 7) + '-01');
      } else {
        const offset = action === 'previous' ? -1 : 1;
        month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1));
        selectedDate = isoDate(month);
      }
      renderMonth();
    });

    regionSelect.addEventListener('change', () => {
      selectedRegion = regionSelect.value;
      renderMonth();
    });
    root.querySelector('.calendar-types').addEventListener('change', ({ target }) => {
      if (target.checked) selectedTypes.add(target.value);
      else selectedTypes.delete(target.value);
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
      renderDetails();
      if (event.detail > 0 && window.matchMedia('(max-width: 760px)').matches) {
        sidebar.scrollIntoView({ block: 'nearest' });
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
      const button = grid.querySelector(`[data-day="${isoDate(next)}"]`);
      if (!button) return;
      event.target.tabIndex = -1;
      button.tabIndex = 0;
      button.focus();
    });
    grid.addEventListener('wheel', hideTooltip, { passive: true });

    renderMonth();
  }

  return { mount };
})();
