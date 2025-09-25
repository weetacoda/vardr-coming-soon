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

const DEBUG_QUERY_KEY = 'debugHeader';
const DEBUG_STORAGE_KEY = 'vardr:debugHeader';
const DEBUG_ATTRIBUTE = 'data-debug-header';
const HEADER_STATE = {
  EXPANDED: 'expanded',
  CONDENSED: 'condensed'
};

const ENTER_ZONE_MIN = 24;
const ENTER_ZONE_FACTOR = 0.35;
const EXIT_ZONE_MIN = 48;
const EXIT_ZONE_FACTOR = 0.85;

class CondensedHeaderController {
  constructor(header, pill, options = {}) {
    this.header = header;
    this.pill = pill;
    this.mediaQuery = options.mediaQuery;
    this.onMobileExit = typeof options.onMobileExit === 'function' ? options.onMobileExit : () => {};
    this.debugEnabled = false;
    this.debugUI = null;
    this.debugStyle = null;
    this.isCondensed = false;
    this.scrollDirection = 'down';
    this.lastScrollPosition = window.scrollY + (window.visualViewport?.offsetTop || 0);
    this.lastReason = 'init';
    this.lastMetrics = {
      scrollY: window.scrollY,
      direction: this.scrollDirection,
      viewportOffsetTop: window.visualViewport?.offsetTop || 0,
      viewportWidth:
        window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth || 0,
      headerBottom: 0,
      pillTop: 0,
      delta: 0,
      distance: 0,
      enterZone: 0,
      exitZone: 0
    };
    this.currentZoneBounds = { enter: 0, exit: 0 };
    this.rafId = null;
    this.mutationObserver = null;
    this.resizeObserver = null;
    this.lastLogTime = 0;

    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleViewportChange = this.handleViewportChange.bind(this);
    this.handleMediaChange = this.handleMediaChange.bind(this);
    this.handleResizeEntries = this.handleResizeEntries.bind(this);
  }

  init() {
    this.debugEnabled = this.resolveDebugFlag();
    this.toggleDebugAttribute(this.debugEnabled);

    if (this.debugEnabled) {
      this.debugUI = this.createDebugInterface();
      this.auditMutations();
      this.logSample('init', this.lastMetrics, 'controller-initialised', HEADER_STATE.EXPANDED);
    }

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleResize, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('scroll', this.handleViewportChange, { passive: true });
      window.visualViewport.addEventListener('resize', this.handleViewportChange, { passive: true });
    }

    if (this.mediaQuery) {
      if (typeof this.mediaQuery.addEventListener === 'function') {
        this.mediaQuery.addEventListener('change', this.handleMediaChange);
      } else if (typeof this.mediaQuery.addListener === 'function') {
        this.mediaQuery.addListener(this.handleMediaChange);
      }
      this.handleMediaChange(this.mediaQuery);
    }

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.handleResizeEntries);
      this.resizeObserver.observe(this.header);
      this.resizeObserver.observe(this.pill);
    }

    this.scheduleMeasure();
  }

  resolveDebugFlag() {
    let fromStorage = false;
    try {
      fromStorage = window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
    } catch (error) {
      fromStorage = false;
    }

    let resolved = fromStorage;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has(DEBUG_QUERY_KEY)) {
        const value = params.get(DEBUG_QUERY_KEY);
        const enable = value === '1' || value === 'true';
        resolved = enable;
        try {
          if (enable) {
            window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
          } else {
            window.localStorage.removeItem(DEBUG_STORAGE_KEY);
          }
        } catch (storageError) {
          // Ignore storage errors (private mode, etc.)
        }
      }
    } catch (error) {
      // Ignore URL parsing issues
    }

    return resolved;
  }

  toggleDebugAttribute(active) {
    if (!document.documentElement) {
      return;
    }

    if (active) {
      document.documentElement.setAttribute(DEBUG_ATTRIBUTE, 'true');
    } else {
      document.documentElement.removeAttribute(DEBUG_ATTRIBUTE);
    }
  }

  createDebugInterface() {
    const style = document.createElement('style');
    style.textContent = `
      [${DEBUG_ATTRIBUTE}="true"] .header-debug-overlay {
        position: fixed;
        inset: 16px 16px auto auto;
        min-width: 220px;
        font-family: ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.4;
        color: #0b1f33;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(11, 31, 51, 0.18);
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 12px 24px rgba(7, 30, 63, 0.18);
        z-index: 9999;
        pointer-events: none;
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-overlay h2 {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-overlay dl {
        margin: 0;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-overlay dt {
        font-weight: 600;
        color: rgba(11, 31, 51, 0.7);
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-overlay dd {
        margin: 0;
        text-align: right;
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-sentinel {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        pointer-events: none;
        z-index: 9998;
        will-change: transform;
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-sentinel::before {
        content: '';
        position: absolute;
        inset: 0;
        border-top: 1px dashed rgba(111, 66, 193, 0.75);
      }

      [${DEBUG_ATTRIBUTE}="true"] .header-debug-sentinel--pill::before {
        border-color: rgba(33, 193, 214, 0.8);
      }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'header-debug-overlay';
    overlay.innerHTML = `
      <h2>Header Debug</h2>
      <dl>
        <dt>scrollY</dt><dd data-debug-field="scrollY">0</dd>
        <dt>Direction</dt><dd data-debug-field="direction">down</dd>
        <dt>ViewportY</dt><dd data-debug-field="viewportOffset">0</dd>
        <dt>ViewportW</dt><dd data-debug-field="viewportWidth">0</dd>
        <dt>Header ⬇︎</dt><dd data-debug-field="headerBottom">0</dd>
        <dt>Pill ⬆︎</dt><dd data-debug-field="pillTop">0</dd>
        <dt>Δ (pill-header)</dt><dd data-debug-field="delta">0</dd>
        <dt>|Δ| Distance</dt><dd data-debug-field="distance">0</dd>
        <dt>Zone (enter/exit)</dt><dd data-debug-field="zones">0 / 0</dd>
        <dt>State</dt><dd data-debug-field="state">expanded</dd>
        <dt>Reason</dt><dd data-debug-field="reason">init</dd>
      </dl>
    `;

    const fields = overlay.querySelectorAll('[data-debug-field]');
    const fieldMap = {};
    fields.forEach((field) => {
      const key = field.getAttribute('data-debug-field');
      if (key) {
        fieldMap[key] = field;
      }
    });

    const headerSentinel = document.createElement('div');
    headerSentinel.className = 'header-debug-sentinel header-debug-sentinel--header';

    const pillSentinel = document.createElement('div');
    pillSentinel.className = 'header-debug-sentinel header-debug-sentinel--pill';

    document.body.appendChild(overlay);
    document.body.appendChild(headerSentinel);
    document.body.appendChild(pillSentinel);

    this.debugStyle = style;

    return {
      overlay,
      fields: fieldMap,
      headerSentinel,
      pillSentinel
    };
  }

  auditMutations() {
    if (!('MutationObserver' in window) || !this.debugEnabled) {
      return;
    }

    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const condensed = this.header.classList.contains('is-condensed');
          this.logSample(
            'mutation',
            this.lastMetrics,
            condensed ? 'class-added-is-condensed' : 'class-removed-is-condensed',
            condensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED
          );
        }
      });
    });

    this.mutationObserver.observe(this.header, { attributes: true, attributeFilter: ['class'] });
  }

  handleResizeEntries(entries) {
    if (!entries?.length) {
      return;
    }

    if (this.debugEnabled) {
      this.logSample(
        'resize-observer',
        this.lastMetrics,
        'resize-observer-notified',
        this.isCondensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED
      );
    }

    this.scheduleMeasure();
  }

  handleScroll() {
    this.updateScrollDirection();
    this.scheduleMeasure();
  }

  handleResize() {
    this.scheduleMeasure();
  }

  handleViewportChange() {
    this.updateScrollDirection();
    this.scheduleMeasure();
  }

  handleMediaChange(event) {
    const matches = typeof event?.matches === 'boolean' ? event.matches : this.mediaQuery?.matches;
    if (!matches) {
      if (this.isCondensed) {
        this.setCondensed(false, 'media-query-exit', this.lastMetrics);
      }
      this.onMobileExit();
    }

    if (this.debugEnabled) {
      this.logSample(
        'media-change',
        this.lastMetrics,
        matches ? 'media-query-enter' : 'media-query-exit',
        this.isCondensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED
      );
    }

    this.scheduleMeasure();
  }

  updateScrollDirection() {
    const viewportOffset = window.visualViewport?.offsetTop || 0;
    const position = window.scrollY + viewportOffset;
    const delta = position - this.lastScrollPosition;
    const epsilon = 0.5;

    if (Math.abs(delta) > epsilon) {
      const nextDirection = delta < 0 ? 'up' : 'down';
      if (nextDirection !== this.scrollDirection) {
        this.scrollDirection = nextDirection;
        if (this.debugEnabled) {
          this.logSample(
            'direction',
            this.lastMetrics,
            `direction-${nextDirection}`,
            this.isCondensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED
          );
        }
      }
    }

    this.lastScrollPosition = position;
  }

  getEnterZoneDistance(headerHeight) {
    return Math.max(ENTER_ZONE_MIN, headerHeight * ENTER_ZONE_FACTOR);
  }

  getExitZoneDistance(headerHeight) {
    return Math.max(EXIT_ZONE_MIN, headerHeight * EXIT_ZONE_FACTOR);
  }

  scheduleMeasure() {
    if (this.rafId !== null) {
      return;
    }

    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.measure();
    });
  }

  measure() {
    const viewportOffset = window.visualViewport?.offsetTop || 0;
    const viewportWidth =
      window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth || 0;
    const headerRect = this.header.getBoundingClientRect();
    const pillRect = this.pill.getBoundingClientRect();

    const headerBottom = headerRect.bottom;
    const pillTop = pillRect.top;
    const delta = pillTop - headerBottom;
    const distance = Math.abs(delta);
    const enterZone = this.getEnterZoneDistance(headerRect.height || 0);
    const exitZone = this.getExitZoneDistance(headerRect.height || 0);

    const metrics = {
      scrollY: window.scrollY,
      direction: this.scrollDirection,
      viewportOffsetTop: viewportOffset,
      viewportWidth,
      headerBottom,
      pillTop,
      delta,
      distance,
      enterZone,
      exitZone
    };

    this.currentZoneBounds = { enter: enterZone, exit: exitZone };

    const mediaMatches = this.mediaQuery ? this.mediaQuery.matches : true;
    let reason = '';

    if (!mediaMatches) {
      if (this.isCondensed) {
        reason = 'media-query-gate';
        this.setCondensed(false, reason, metrics);
      }
      this.updateDebugOverlay(metrics, reason || this.lastReason);
      this.logSample('measure', metrics, reason || this.lastReason, this.isCondensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED);
      return;
    }

    if (window.scrollY <= 0) {
      if (this.isCondensed) {
        reason = 'returned-to-top';
        this.setCondensed(false, reason, metrics);
      }
      this.updateDebugOverlay(metrics, reason || this.lastReason);
      this.logSample('measure', metrics, reason || this.lastReason, HEADER_STATE.EXPANDED);
      return;
    }

    if (!this.isCondensed) {
      if (distance <= enterZone) {
        reason = `enter (|Δ| ${Math.round(distance)} <= ${Math.round(enterZone)})`;
        this.setCondensed(true, reason, metrics);
      }
    } else if (distance > exitZone) {
      reason = `exit (|Δ| ${Math.round(distance)} > ${Math.round(exitZone)})`;
      this.setCondensed(false, reason, metrics);
    }

    this.updateDebugOverlay(metrics, reason || this.lastReason);
    this.logSample('measure', metrics, reason || this.lastReason, this.isCondensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED);
  }

  setCondensed(shouldCondense, reason, metrics) {
    const target = Boolean(shouldCondense);
    if (target === this.isCondensed) {
      this.lastReason = reason || this.lastReason;
      return;
    }

    this.isCondensed = target;
    this.header.classList.toggle('is-condensed', target);
    this.lastReason = reason || (target ? 'condensed' : 'expanded');

    if (this.debugEnabled) {
      const state = target ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED;
      this.logSample('state-change', metrics || this.lastMetrics, this.lastReason, state);
    }

    this.scheduleMeasure();
  }

  updateDebugOverlay(metrics, reason) {
    this.lastMetrics = metrics;

    if (!this.debugEnabled || !this.debugUI) {
      return;
    }

    const state = this.isCondensed ? HEADER_STATE.CONDENSED : HEADER_STATE.EXPANDED;
    const fields = this.debugUI.fields;

    if (fields.scrollY) {
      fields.scrollY.textContent = `${Math.round(metrics.scrollY)}`;
    }
    if (fields.direction) {
      fields.direction.textContent = metrics.direction;
    }
    if (fields.viewportOffset) {
      fields.viewportOffset.textContent = `${Math.round(metrics.viewportOffsetTop)}`;
    }
    if (fields.viewportWidth) {
      fields.viewportWidth.textContent = `${Math.round(metrics.viewportWidth)}`;
    }
    if (fields.headerBottom) {
      fields.headerBottom.textContent = `${Math.round(metrics.headerBottom)}`;
    }
    if (fields.pillTop) {
      fields.pillTop.textContent = `${Math.round(metrics.pillTop)}`;
    }
    if (fields.delta) {
      fields.delta.textContent = `${Math.round(metrics.delta)}`;
    }
    if (fields.distance) {
      fields.distance.textContent = `${Math.round(metrics.distance)}`;
    }
    if (fields.zones) {
      fields.zones.textContent = `${Math.round(metrics.enterZone)} / ${Math.round(metrics.exitZone)}`;
    }
    if (fields.state) {
      fields.state.textContent = state;
    }
    if (fields.reason) {
      fields.reason.textContent = reason;
    }

    const offset = metrics.viewportOffsetTop || 0;
    const headerY = Math.round(metrics.headerBottom + offset);
    const pillY = Math.round(metrics.pillTop + offset);

    if (this.debugUI.headerSentinel) {
      this.debugUI.headerSentinel.style.transform = `translate3d(0, ${headerY}px, 0)`;
    }
    if (this.debugUI.pillSentinel) {
      this.debugUI.pillSentinel.style.transform = `translate3d(0, ${pillY}px, 0)`;
    }
  }

  logSample(phase, metrics, reason, state) {
    if (!this.debugEnabled) {
      return;
    }

    const now = performance.now();
    const throttle = phase === 'measure';
    if (throttle && now - this.lastLogTime < 120) {
      return;
    }

    if (throttle) {
      this.lastLogTime = now;
    }

    const timestamp = new Date().toISOString();
    console.groupCollapsed(`[header-debug] ${phase} @ ${timestamp}`);
    console.log('state', {
      state,
      reason,
      direction: this.scrollDirection,
      condensed: this.isCondensed
    });
    if (metrics) {
      console.log('metrics', {
        scrollY: Math.round(metrics.scrollY),
        direction: metrics.direction,
        viewportOffsetTop: Math.round(metrics.viewportOffsetTop),
        viewportWidth: Math.round(metrics.viewportWidth),
        headerBottom: Math.round(metrics.headerBottom),
        pillTop: Math.round(metrics.pillTop),
        delta: Math.round(metrics.delta),
        distance: Math.round(metrics.distance),
        enterZone: Math.round(metrics.enterZone),
        exitZone: Math.round(metrics.exitZone)
      });
    }
    if (this.currentZoneBounds) {
      console.log('zones', this.currentZoneBounds);
    }
    console.groupEnd();
  }
}

let drawerOpen = false;
let lastFocusedElement = null;

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
  const headerController = new CondensedHeaderController(siteHeader, pillSection, {
    mediaQuery: condenseMedia,
    onMobileExit: closeDrawer
  });
  headerController.init();
}
