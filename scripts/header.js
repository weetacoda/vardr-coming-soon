const siteHeader = document.getElementById('site-header');
const pillSection = document.getElementById('audience-pill');
const menuToggle = siteHeader?.querySelector('.header-menu-toggle');
const menuToggleLabel = menuToggle?.querySelector('.header-menu-toggle__label');
const mobileDrawer = document.getElementById('mobile-drawer');
const drawerPanel = mobileDrawer?.querySelector('.mobile-drawer__panel');
const drawerClose = mobileDrawer?.querySelector('[data-drawer-close]');
const drawerOverlay = mobileDrawer?.querySelector('[data-drawer-dismiss]');
const drawerLinks = mobileDrawer?.querySelectorAll('a');

const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const condenseMedia = window.matchMedia('(max-width: 768px)');
let headerMetrics = { height: 0, bottom: 0 };
let isHeaderCondensed = false;
let lastScrollY = window.scrollY;
let scrollDirection = 'down';
let drawerOpen = false;
let lastFocusedElement = null;

const refreshObserver = () => {
  if (!siteHeader) {
    headerMetrics = { height: 0, bottom: 0 };
    return;
  }

  const rect = siteHeader.getBoundingClientRect();
  headerMetrics = {
    height: rect.height,
    bottom: rect.bottom
  };
};

const setCondensed = (shouldCondense) => {
  if (!siteHeader) {
    return;
  }

  const targetState = Boolean(shouldCondense) && condenseMedia.matches;
  if (targetState === isHeaderCondensed) {
    return;
  }

  isHeaderCondensed = targetState;
  siteHeader.classList.toggle('is-condensed', targetState);
  refreshObserver();
  window.requestAnimationFrame(refreshObserver);
};

const evaluateCondensedState = () => {
  if (!siteHeader || !pillSection) {
    return;
  }

  if (!condenseMedia.matches) {
    setCondensed(false);
    return;
  }

  if (window.scrollY <= 0) {
    setCondensed(false);
    return;
  }

  if (!headerMetrics.height) {
    refreshObserver();
  }

  const pillRect = pillSection.getBoundingClientRect();
  const { bottom: headerBottom, height: headerHeight } = headerMetrics;
  const enterBuffer = Math.max(12, headerHeight * 0.2);
  const exitBuffer = Math.max(headerHeight, 32);

  if (!isHeaderCondensed) {
    if (scrollDirection === 'up' && pillRect.bottom >= headerBottom + enterBuffer) {
      setCondensed(true);
    }
    return;
  }

  if (scrollDirection === 'down' && pillRect.bottom <= headerBottom - exitBuffer) {
    setCondensed(false);
  }
};

const updateScrollDirection = () => {
  const currentY = window.scrollY;
  const nextDirection = currentY < lastScrollY ? 'up' : 'down';

  if (nextDirection !== scrollDirection) {
    scrollDirection = nextDirection;
  }

  lastScrollY = currentY;
};

const updateMenuToggleState = (open) => {
  if (!menuToggle) {
    return;
  }

  menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  if (menuToggleLabel) {
    menuToggleLabel.textContent = open ? 'Close navigation' : 'Open navigation';
  }
};

const getDrawerFocusables = () => {
  if (!drawerPanel) {
    return [];
  }

  return Array.from(drawerPanel.querySelectorAll(focusableSelector)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
};

const openDrawer = () => {
  if (!mobileDrawer || !drawerPanel || drawerOpen) {
    return;
  }

  lastFocusedElement = document.activeElement;
  drawerOpen = true;
  mobileDrawer.setAttribute('data-open', 'true');
  mobileDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  updateMenuToggleState(true);

  window.requestAnimationFrame(() => {
    drawerPanel.focus({ preventScroll: true });
    const focusables = getDrawerFocusables();
    if (focusables.length) {
      focusables[0].focus({ preventScroll: true });
    }
  });
};

const closeDrawer = () => {
  if (!mobileDrawer || !drawerPanel || !drawerOpen) {
    return;
  }

  drawerOpen = false;
  mobileDrawer.setAttribute('data-open', 'false');
  mobileDrawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  updateMenuToggleState(false);

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus({ preventScroll: true });
  } else if (menuToggle) {
    menuToggle.focus({ preventScroll: true });
  }
};

const handleDrawerKeydown = (event) => {
  if (!drawerOpen) {
    return;
  }

  if (event.key === 'Escape') {
    event.stopPropagation();
    closeDrawer();
    return;
  }

  if (event.key !== 'Tab') {
    return;
  }

  const focusables = getDrawerFocusables();
  if (!focusables.length) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || active === drawerPanel) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (active === drawerPanel) {
    event.preventDefault();
    first.focus();
  }
};

const bindDrawerEvents = () => {
  if (!menuToggle || !mobileDrawer || !drawerPanel) {
    return;
  }

  updateMenuToggleState(false);
  mobileDrawer.setAttribute('data-open', 'false');
  mobileDrawer.setAttribute('aria-hidden', 'true');

  menuToggle.addEventListener('click', () => {
    if (drawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (drawerClose) {
    drawerClose.addEventListener('click', () => {
      closeDrawer();
    });
  }

  if (drawerOverlay) {
    drawerOverlay.addEventListener('click', () => {
      closeDrawer();
    });
  }

  if (drawerLinks?.length) {
    drawerLinks.forEach((link) => {
      link.addEventListener('click', () => {
        closeDrawer();
      });
    });
  }

  mobileDrawer.addEventListener('keydown', handleDrawerKeydown);
};

if (siteHeader && pillSection) {
  bindDrawerEvents();
  refreshObserver();
  evaluateCondensedState();

  window.addEventListener(
    'scroll',
    () => {
      updateScrollDirection();
      evaluateCondensedState();
    },
    { passive: true }
  );

  const handleMediaChange = (event) => {
    if (!event.matches) {
      setCondensed(false);
      closeDrawer();
    }

    refreshObserver();
    evaluateCondensedState();
  };

  if (typeof condenseMedia.addEventListener === 'function') {
    condenseMedia.addEventListener('change', handleMediaChange);
  } else if (typeof condenseMedia.addListener === 'function') {
    condenseMedia.addListener(handleMediaChange);
  }

  window.addEventListener(
    'resize',
    () => {
      refreshObserver();
      evaluateCondensedState();
    },
    { passive: true }
  );
}
