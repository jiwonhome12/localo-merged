const myPlans = (() => {
  const planPrefix = 'localo.plan.v1.';
  const basketPrefix = 'localo.basket.v1.';
  const selectionKey = 'localo.planner.selection.v1';
  const basketKey = 'localo.active-basket.v1';
  const defaultColor = '#cbb6df';
  const plans = new Map();
  const baskets = new Map();
  let activeBasket = '';
  let selected = ''; // The saved plan last chosen in the planner; empty means the current basket.
  let editing = ''; // Set only while the shared itinerary panel is displaying a saved plan.
  let defaults;
  let nameTarget;
  let deleteTarget;

  function snapshot() {
    return {
      startDate: $('start-date').value, endDate: $('end-date').value,
      people: state.people, support: state.support,
      stops: Array.from(state.basket, ([id, visit]) => [id, { ...visit }]),
    };
  }

  function restore(trip) {
    state.basket = new Map(trip.stops.map(([id, visit]) => [id, { ...visit }]));
    state.people = trip.people;
    state.support = trip.support;
    state.basketRegion = 'all';
    $('start-date').value = trip.startDate;
    $('end-date').min = trip.startDate;
    $('end-date').value = trip.endDate;
    $('trip-items').replaceChildren();
  }

  function readRecord(prefix, key, raw) {
    const trip = JSON.parse(raw);
    const date = /^\d{4}-\d{2}-\d{2}$/;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!trip || typeof trip.id !== 'string' || !trip.id || key !== prefix + trip.id ||
        typeof trip.name !== 'string' || !Array.isArray(trip.stops) ||
        !date.test(trip.startDate) || !date.test(trip.endDate) || trip.endDate < trip.startDate) return null;
    trip.people = Math.max(1, Math.min(99, Number.parseInt(trip.people, 10) || 1));
    if (!supportTypes.includes(trip.support)) trip.support = supportTypes[0];
    if (!/^#[0-9a-f]{6}$/i.test(trip.color)) trip.color = defaultColor;
    if (!Number.isFinite(trip.created)) trip.created = 0;
    trip.stops = trip.stops.filter((entry) => Array.isArray(entry) && placeById.has(entry[0]) && entry[1])
      .map(([id, visit]) => [id, {
        quantity: Math.max(1, Math.min(99, Number.parseInt(visit.quantity, 10) || 1)),
        date: date.test(visit.date) && visit.date >= trip.startDate && visit.date <= trip.endDate ? visit.date : '',
        start: time.test(visit.start) ? visit.start : '', end: time.test(visit.end) ? visit.end : '',
      }]);
    return trip;
  }

  function remember(planId, basketId = activeBasket) {
    selected = planId;
    activeBasket = basketId;
    try {
      sessionStorage.setItem(selectionKey, planId);
      sessionStorage.setItem(basketKey, basketId);
    } catch { /* The selection is also kept in memory. */ }
  }

  function storageError() {
    $('plan-storage-note').textContent = '브라우저에 변경 사항을 저장할 수 없어요. 저장 공간과 사이트 설정을 확인해 주세요.';
    $('plan-storage-note').hidden = false;
  }

  function write(prefix, record) {
    try {
      localStorage.setItem(prefix + record.id, JSON.stringify(record));
      $('plan-storage-note').hidden = true;
      return true;
    } catch {
      storageError();
      return false;
    }
  }

  function plansChanged() {
    window.dispatchEvent(new CustomEvent('localo:plans-changed'));
  }

  function calendarPlans() {
    return [...plans.values()].map(({ id, name, color, startDate, endDate, stops }) => ({
      id, name, color, startDate, endDate, stops: stops.map(([place, visit]) => [place, { ...visit }]),
    }));
  }

  function newId() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
  }

  function emptyBasket(id, number) {
    return { ...defaults, id, number, name: String(number), created: Date.now(), stops: [] };
  }

  function orderedBaskets() {
    return [...baskets.values()].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  }

  function firstBasket() {
    if (!baskets.size) {
      const first = emptyBasket('first', 1);
      baskets.set(first.id, first);
      write(basketPrefix, first);
    }
    return orderedBaskets()[0];
  }

  function refresh() {
    renderTrip();
    if (state.page === 'map' && state.region) {
      refreshRegionInfo();
      renderMap();
    }
  }

  function selectBasket(id) {
    const basket = baskets.get(id);
    if (!basket) return;
    remember('', id);
    editing = '';
    restore(basket);
    refresh();
  }

  function addBasket() {
    const number = Math.max(0, ...Array.from(baskets.values(), (item) => item.number || 0)) + 1;
    const basket = emptyBasket(newId(), number);
    baskets.set(basket.id, basket);
    write(basketPrefix, basket);
    selectBasket(basket.id);
    const list = $(state.page === 'map' ? 'map-basket-list' : 'planner-basket-list');
    list.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
  }

  function openInPlanner(id) {
    if (!plans.has(id)) return;
    remember(id);
    if (state.page === 'planner') {
      editing = id;
      restore(plans.get(id));
      renderTrip();
    } else location.hash = 'planner';
  }

  function switchPage(from, to) {
    if (from === 'planner' && editing) {
      editing = '';
      restore(baskets.get(activeBasket));
    }
    if (to === 'planner' && plans.has(selected)) {
      editing = selected;
      restore(plans.get(editing));
    }
    if ($('trip-delete-dialog').open) $('trip-delete-dialog').close('cancel');
  }

  function saveEdits() {
    const collection = editing ? plans : baskets;
    const id = editing || activeBasket;
    const record = { ...collection.get(id), ...snapshot() };
    collection.set(id, record);
    write(editing ? planPrefix : basketPrefix, record);
    if (editing) plansChanged();
  }

  function renderList(list, records, isPlan = false, compact = false) {
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset : null;
    const scroll = list.scrollLeft;
    list.replaceChildren();
    for (const record of records) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset[isPlan ? 'plan' : 'basket'] = record.id;
      const active = isPlan ? editing === record.id : !editing && activeBasket === record.id;
      if (active) button.setAttribute('aria-current', 'true');
      if (compact) {
        button.textContent = record.name;
        button.title = record.name;
        button.setAttribute('aria-label', '장바구니 ' + record.name);
      } else {
        const name = document.createElement('strong');
        name.textContent = record.name;
        const detail = document.createElement('small');
        detail.textContent = (isPlan ? record.startDate.slice(5).replace('-', '.') + ' – ' + record.endDate.slice(5).replace('-', '.') + ' · ' : '') + record.stops.length + '곳';
        button.append(name, detail);
        if (isPlan) button.style.setProperty('--plan-swatch', record.color);
      }
      list.append(button);
      if (focused && (focused.plan === record.id || focused.basket === record.id)) button.focus({ preventScroll: true });
    }
    list.scrollLeft = scroll;
    if (isPlan && !records.length) list.textContent = '일정표에서 찜한 플랜이 여기에 모여요.';
    if (compact) {
      const current = list.querySelector('[aria-current]');
      if (current) {
        const rect = current.getBoundingClientRect(), bounds = list.getBoundingClientRect();
        if (rect.right > bounds.right) list.scrollLeft += rect.right - bounds.right;
        else if (rect.left < bounds.left) list.scrollLeft += rect.left - bounds.left;
      }
    }
  }

  function renderLists() {
    const carts = orderedBaskets();
    if (state.page === 'map') renderList($('map-basket-list'), carts, false, true);
    if (state.page === 'planner') {
      renderList($('planner-basket-list'), carts);
      renderList($('my-plans-list'), [...plans.values()].sort((a, b) => b.created - a.created), true);
    }
  }

  function render(regionIds) {
    const inPlanner = state.page === 'planner';
    const record = editing ? plans.get(editing) : baskets.get(activeBasket);
    const save = $('save-trip');
    const saveSlot = inPlanner ? $('planner-save-slot') : document.querySelector('.trip-person-total');
    if (save.parentElement !== saveSlot) saveSlot.append(save);
    save.hidden = Boolean(editing);
    save.disabled = !state.basket.size;
    const numberedBasket = record.name === String(record.number);
    $('trip-title').textContent = editing ? record.name : numberedBasket ? record.number + '번 일정표' : record.name + ' 일정표';
    $('rename-basket').hidden = Boolean(editing);
    $('delete-trip').hidden = !inPlanner;
    $('plan-color-field').hidden = !editing;
    if (editing) $('plan-color').value = record.color;
    renderLists();
    if (!inPlanner) return;
    const links = regionIds.filter((id) => state.basketRegion === 'all' || state.basketRegion === id)
      .map((id) => {
        const site = reservationSites[id];
        return site ? `<a href="${attr(site.url)}" target="_blank" rel="noopener noreferrer">${attr(regionById.get(id).name)} ${attr(site.label || '사전 신청')} <span aria-hidden="true">↗</span></a>` : '';
      }).join('');
    $('plan-booking').innerHTML = links;
    $('plan-booking').hidden = !links;
  }

  function nameDialog(rename) {
    const basket = baskets.get(activeBasket);
    if (editing || (!rename && !state.basket.size)) return;
    nameTarget = { id: activeBasket, rename };
    const name = $('plan-name');
    $('plan-save-title').textContent = rename ? '장바구니 이름 바꾸기' : '마이 플랜에 찜하기';
    $('plan-name-label').textContent = rename ? '장바구니 이름' : '플랜 이름';
    $('submit-plan-name').textContent = rename ? '이름 저장' : '저장하고 플래너 열기';
    name.value = basket.name;
    if (!rename && basket.name === String(basket.number)) {
      const first = placeById.get(state.basket.keys().next().value);
      const nights = tripNights();
      name.value = regionById.get(first.region).shortName + (nights ? ` ${nights}박 ${nights + 1}일` : ' 당일 여행');
    }
    name.setCustomValidity('');
    $('plan-save-error').hidden = true;
    $('plan-save-dialog').showModal();
    name.focus();
    name.select();
  }

  function submitName(event) {
    event.preventDefault();
    const { id, rename } = nameTarget;
    const name = $('plan-name').value.trim();
    if (!name) {
      $('plan-name').setCustomValidity('이름을 입력해 주세요.');
      $('plan-name').reportValidity();
      return;
    }
    const source = baskets.get(id);
    if (!source) { $('plan-save-dialog').close(); return; }
    const record = rename ? { ...source, name } : {
      ...snapshot(), id: newId(), name, color: defaultColor, created: Date.now(),
    };
    if (!write(rename ? basketPrefix : planPrefix, record)) {
      $('plan-save-error').textContent = '저장하지 못했어요. 브라우저 저장 공간과 사이트 설정을 확인해 주세요.';
      $('plan-save-error').hidden = false;
      return;
    }
    $('plan-save-dialog').close();
    if (rename) {
      baskets.set(id, record);
      renderTrip();
    } else {
      plans.set(record.id, record);
      plansChanged();
      openInPlanner(record.id);
    }
  }

  function confirmDelete() {
    deleteTarget = { id: editing || activeBasket, isPlan: Boolean(editing) };
    const record = editing ? plans.get(editing) : baskets.get(activeBasket);
    $('trip-delete-title').textContent = '‘' + record.name + (editing ? '’ 플랜을' : '’ 장바구니를') + ' 삭제할까요?';
    $('trip-delete-message').textContent = editing ? '이 플랜의 일정이 캘린더에서도 사라져요.' : '이 장바구니에 담은 장소와 여행 설정이 함께 삭제돼요.';
    $('trip-delete-dialog').returnValue = 'cancel';
    $('trip-delete-dialog').showModal();
  }

  function deleteTrip() {
    if ($('trip-delete-dialog').returnValue !== 'clear' || !deleteTarget) return;
    const { id, isPlan } = deleteTarget;
    const collection = isPlan ? plans : baskets;
    if (!collection.has(id)) return;
    if (!isPlan && baskets.size === 1) {
      const fresh = emptyBasket(id, 1);
      if (!write(basketPrefix, fresh)) return;
      baskets.set(id, fresh);
    } else {
      try { localStorage.removeItem((isPlan ? planPrefix : basketPrefix) + id); }
      catch { storageError(); return; }
      collection.delete(id);
    }
    selectBasket(baskets.has(activeBasket) ? activeBasket : firstBasket().id);
    if (isPlan) plansChanged();
    $('delete-trip').focus({ preventScroll: true });
  }

  function loadRecord(key) {
    const prefix = key?.startsWith(planPrefix) ? planPrefix : basketPrefix;
    if (!key?.startsWith(prefix)) return;
    const collection = prefix === planPrefix ? plans : baskets;
    const raw = localStorage.getItem(key);
    if (raw === null) collection.delete(key.slice(prefix.length));
    else {
      try {
        const record = readRecord(prefix, key, raw);
        if (record) collection.set(record.id, record);
      } catch { /* Other records can still be loaded. */ }
    }
  }

  function loadStoredTrips() {
    baskets.clear();
    plans.clear();
    for (let i = 0; i < localStorage.length; i++) loadRecord(localStorage.key(i));
  }

  function onStorage(event) {
    if (event.storageArea !== localStorage) return;
    const key = event.key;
    const isPlan = key?.startsWith(planPrefix);
    if (key !== null && !isPlan && !key.startsWith(basketPrefix)) return;
    const previousKey = editing ? planPrefix + editing : basketPrefix + activeBasket;
    // Read the current value in case another update followed the queued storage event.
    if (key === null) loadStoredTrips();
    else loadRecord(key);
    remember(plans.has(selected) ? selected : '', baskets.has(activeBasket) ? activeBasket : firstBasket().id);
    if (editing && !plans.has(editing)) editing = '';
    if ($('plan-save-dialog').open && nameTarget.id !== activeBasket) $('plan-save-dialog').close();
    if ($('trip-delete-dialog').open && !(deleteTarget.isPlan ? plans : baskets).has(deleteTarget.id)) $('trip-delete-dialog').close('cancel');
    if (key === null || key === previousKey) {
      restore(editing ? plans.get(editing) : baskets.get(activeBasket));
      refresh();
    } else renderLists();
    if (isPlan || key === null) plansChanged();
  }

  function initialize() {
    defaults = snapshot();
    let lastPlan, lastBasket;
    try {
      loadStoredTrips();
      lastPlan = sessionStorage.getItem(selectionKey);
      lastBasket = sessionStorage.getItem(basketKey);
    } catch { storageError(); }
    remember(plans.has(lastPlan) ? lastPlan : '', baskets.has(lastBasket) ? lastBasket : firstBasket().id);
    restore(baskets.get(activeBasket));

    for (const list of [$('planner-basket-list'), $('map-basket-list')]) {
      list.addEventListener('click', (event) => {
        const id = event.target.closest('[data-basket]')?.dataset.basket;
        if (id) selectBasket(id);
      });
    }
    for (const add of document.querySelectorAll('[data-new-basket]')) add.addEventListener('click', addBasket);
    $('my-plans-list').addEventListener('click', (event) => {
      const id = event.target.closest('[data-plan]')?.dataset.plan;
      if (id) openInPlanner(id);
    });
    document.querySelector('.planner-link').addEventListener('click', () => remember(''));
    $('plan-color').addEventListener('change', () => {
      if (!editing) return;
      plans.get(editing).color = $('plan-color').value;
      saveEdits();
      renderTrip();
    });
    $('delete-trip').addEventListener('click', confirmDelete);
    $('trip-delete-dialog').addEventListener('close', deleteTrip);
    $('save-trip').addEventListener('click', () => nameDialog(false));
    $('rename-basket').addEventListener('click', () => nameDialog(true));
    $('plan-name').addEventListener('input', () => $('plan-name').setCustomValidity(''));
    $('cancel-plan-save').addEventListener('click', () => $('plan-save-dialog').close());
    $('plan-save-form').addEventListener('submit', submitName);
    window.addEventListener('storage', onStorage);
  }

  return { initialize, switchPage, render, saveEdits, calendarPlans, openInPlanner };
})();
