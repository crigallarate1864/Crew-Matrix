const PIN_KEY = 'atlas-sidebar-pinned-v1';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function isCompactViewport() {
  return window.matchMedia('(max-width: 860px)').matches;
}

function updateControls() {
  const pinned = document.body.classList.contains('sidebar-pinned');
  const open = document.body.classList.contains('sidebar-open');
  const menuButton = $('#sidebarMenuBtn');
  const pinButton = $('#sidebarPinBtn');

  if (menuButton) {
    menuButton.setAttribute('aria-expanded', String(open || pinned));
    menuButton.title = pinned
      ? 'Barra laterale fissata'
      : open
        ? 'Chiudi menu laterale'
        : 'Apri menu laterale';
  }

  if (pinButton) {
    pinButton.setAttribute('aria-pressed', String(pinned));
    pinButton.title = pinned
      ? 'Sblocca la barra laterale'
      : 'Fissa la barra laterale';
    pinButton.textContent = pinned ? '●' : '⌖';
  }
}

function setOpen(open) {
  document.body.classList.toggle('sidebar-open', Boolean(open));
  updateControls();
}

function setPinned(pinned) {
  const allowed = !isCompactViewport();
  const finalValue = allowed && Boolean(pinned);

  document.body.classList.toggle('sidebar-pinned', finalValue);
  document.body.classList.toggle('sidebar-open', finalValue);

  try {
    localStorage.setItem(PIN_KEY, finalValue ? '1' : '0');
  } catch (_) {}

  updateControls();
}

function restorePinnedState() {
  let pinned = false;
  try {
    pinned = localStorage.getItem(PIN_KEY) === '1';
  } catch (_) {}

  setPinned(pinned);
  if (!pinned) setOpen(false);
}

function handleViewportChange() {
  if (isCompactViewport()) {
    document.body.classList.remove('sidebar-pinned');
    setOpen(false);
  } else {
    restorePinnedState();
  }
}

export function initSidebarLayout() {
  restorePinnedState();

  $('#sidebarMenuBtn')?.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-pinned')) {
      setPinned(false);
      setOpen(false);
      return;
    }
    setOpen(!document.body.classList.contains('sidebar-open'));
  });

  $('#sidebarPinBtn')?.addEventListener('click', () => {
    setPinned(!document.body.classList.contains('sidebar-pinned'));
  });

  $('#sidebarCloseBtn')?.addEventListener('click', () => setOpen(false));
  $('#sidebarBackdrop')?.addEventListener('click', () => setOpen(false));

  $$('.nav-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (!document.body.classList.contains('sidebar-pinned')) {
        setOpen(false);
      }
    });
  });

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      document.body.classList.contains('sidebar-open') &&
      !document.body.classList.contains('sidebar-pinned')
    ) {
      setOpen(false);
    }
  });

  const media = window.matchMedia('(max-width: 860px)');
  media.addEventListener?.('change', handleViewportChange);

  updateControls();
}
