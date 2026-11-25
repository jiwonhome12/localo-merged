(() => {
  const intro = document.getElementById('intro');
  const start = document.getElementById('start-travel');
  const replay = document.getElementById('replay-intro');
  let fromHeader = false;

  function openIntro() {
    if (intro.open) return;
    intro.classList.remove('departing');
    intro.showModal();
    document.documentElement.classList.add('intro-open');
    start.focus({ preventScroll: true });
  }

  async function startTravel() {
    if (intro.classList.contains('departing')) return;
    intro.classList.add('departing');
    const motion = intro.getAnimations?.({ subtree: true }) || [];
    await Promise.allSettled(motion.map(animation => animation.finished));
    intro.close();
    document.documentElement.classList.remove('intro-open');
    if (fromHeader) location.hash = 'map';
    const page = fromHeader ? 'map' : location.hash.slice(1);
    const current = ['calendar', 'planner'].includes(page) ? page : page === 'route' ? 'planner' : 'map';
    document.querySelector(`[data-page="${current}"]`).focus({ preventScroll: true });
  }

  replay.addEventListener('click', () => {
    fromHeader = true;
    openIntro();
  });
  start.addEventListener('click', startTravel);
  intro.addEventListener('cancel', event => {
    event.preventDefault();
    startTravel();
  });
  openIntro();
})();
