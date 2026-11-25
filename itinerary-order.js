(() => {
  const items = document.getElementById('trip-items');
  let drag = null;
  let ignoreClick = false;

  function moveStop(list, id, to) {
    const visible = Array.from(list.children, row => row.dataset.stopId);
    const from = visible.indexOf(id);
    if (from < 0 || to < 0 || to >= visible.length || from === to) return;
    visible.splice(from, 1);
    visible.splice(to, 0, id);

    // In a filtered plan, reorder only the slots occupied by visible stops.
    const visibleIds = new Set(visible);
    const visits = new Map(state.basket);
    let index = 0;
    state.basket.clear();
    for (const original of visits.keys()) {
      const next = visibleIds.has(original) ? visible[index++] : original;
      state.basket.set(next, visits.get(next));
    }
    updateBasket();
    const position = Array.from(state.basket.keys()).indexOf(id) + 1;
    $('cart-announcement').textContent = `${placeById.get(id).name}, ${position}번째로 이동했어요.`;
  }

  function setMarker(row, side) {
    if (drag.marker === row && drag.side === side) return;
    drag.marker?.classList.remove(drag.side);
    drag.marker = row;
    drag.side = side;
    row?.classList.add(side);
  }

  function updateDropTarget() {
    const { list, row, scroll, x, y } = drag;
    const box = list.getBoundingClientRect();
    const frame = scroll === document.scrollingElement
      ? { top: 0, bottom: innerHeight } : scroll.getBoundingClientRect();
    const top = Math.max(0, frame.top, box.top);
    const bottom = Math.min(innerHeight, frame.bottom, box.bottom);
    if (x < box.left || x > box.right || y < top || y > bottom) {
      setMarker(null, '');
      return -1;
    }

    const edge = Math.min(42, (bottom - top) / 3);
    if (box.top < top && y < top + edge) scroll.scrollTop -= Math.ceil((top + edge - y) / 3);
    else if (box.bottom > bottom && y > bottom - edge) scroll.scrollTop += Math.ceil((y - bottom + edge) / 3);

    const others = Array.from(list.children).filter(stop => stop !== row);
    const before = others.findIndex(stop => {
      const rect = stop.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    setMarker(before < 0 ? others.at(-1) : others[before], before < 0 ? 'insert-after' : 'insert-before');
    return before < 0 ? others.length : before;
  }

  function finish() {
    if (!drag) return;
    cancelAnimationFrame(drag.frame);
    setMarker(null, '');
    drag.list.classList.remove('is-reordering');
    drag.row.classList.remove('is-moving');
    const pointerId = drag.pointerId;
    drag = null;
    if (items.hasPointerCapture(pointerId)) items.releasePointerCapture(pointerId);
  }

  function preview() {
    if (!drag.list.isConnected || !drag.list.getClientRects().length) {
      finish();
      return;
    }
    updateDropTarget();
    drag.frame = requestAnimationFrame(preview);
  }

  items.addEventListener('pointerdown', event => {
    ignoreClick = false;
    if (drag || !event.isPrimary || event.button !== 0) return;
    const row = event.target.closest('.itinerary-stop');
    if (!row || row.parentElement.children.length < 2 || event.target.closest('.stop-fields, button, input, a')) return;
    // Touching the card body scrolls normally. The dotted handle also works on touch screens.
    if (event.pointerType !== 'mouse' && !event.target.closest('.stop-number')) return;
    const scroll = row.closest('.cart-dock') ? row.closest('.trip-layout') : document.scrollingElement;
    drag = { row, list: row.parentElement, scroll, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!event.buttons) {
      finish();
      return;
    }
    if (!drag.frame) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      items.setPointerCapture(event.pointerId);
      drag.row.classList.add('is-moving');
      drag.list.classList.add('is-reordering');
      ignoreClick = true;
      drag.frame = requestAnimationFrame(preview);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  window.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { row, list } = drag;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const to = drag.frame && list.isConnected ? updateDropTarget() : -1;
    finish();
    if (to >= 0) moveStop(list, row.dataset.stopId, to);
  });
  function cancelPointer(event) {
    if (event.pointerId === drag?.pointerId) finish();
  }
  window.addEventListener('pointercancel', cancelPointer);
  items.addEventListener('lostpointercapture', event => {
    // A touch handle releases its implicit capture when the container takes over.
    if (event.target === items) cancelPointer(event);
  });
  window.addEventListener('blur', finish);
  window.addEventListener('hashchange', finish);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !drag?.frame) return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  }, true);

  items.addEventListener('click', event => {
    if (ignoreClick && event.detail) {
      event.preventDefault();
      ignoreClick = false;
      return;
    }
    const button = event.target.closest('button[data-move]');
    if (!button || button.disabled) return;
    const row = button.closest('.itinerary-stop');
    const list = row.parentElement;
    const id = row.dataset.stopId;
    const from = Array.from(list.children).indexOf(row);
    moveStop(list, id, from + Number(button.dataset.move));
    const moved = items.querySelector(`[data-stop-id="${id}"]`);
    const nextButton = moved.querySelector(`[data-move="${button.dataset.move}"]:enabled`) || moved.querySelector('[data-move]:enabled');
    nextButton?.focus({ preventScroll: true });
    nextButton?.scrollIntoView({ block: 'nearest' });
  });
})();
