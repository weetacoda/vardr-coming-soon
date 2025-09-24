(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  const scrollCue = document.querySelector('.scroll-cue');
  const observerTargets = document.querySelectorAll('[data-observe], .glass-card, .use-case-card, .testimonial, .pricing-card, .cta-secondary-card');
  const howSteps = document.querySelector('.how-steps');
  const testimonial = document.querySelector('.testimonial');
  const logoButtons = document.querySelectorAll('.logo');
  const countTarget = document.querySelector('[data-count]');
  const waitlistForms = document.querySelectorAll('.waitlist-form');
  const radar = document.querySelector('[data-radar]');
  const navLinks = document.querySelectorAll('.nav-list a');

  const analyticsEnabled = !(navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.msDoNotTrack === '1');
  const analyticsQueue = [];

  function track(event, payload = {}) {
    if (!analyticsEnabled) return;
    const enriched = {
      event,
      timestamp: new Date().toISOString(),
      ...payload
    };
    analyticsQueue.push(enriched);
    window.dispatchEvent(new CustomEvent('analytics:queue', { detail: enriched }));
  }

  function handleScroll() {
    if (!header) return;
    const offset = window.scrollY;
    header.classList.toggle('scrolled', offset > 12);
  }

  handleScroll();
  window.addEventListener('scroll', handleScroll, { passive: true });

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('open', !expanded);
    });
  }

  if (navLinks.length) {
    navLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        track('nav_click', { label: link.dataset.nav || link.textContent, href: link.getAttribute('href') });
        if (nav.classList.contains('open')) {
          nav.classList.remove('open');
          navToggle?.setAttribute('aria-expanded', 'false');
        }
        const targetId = link.getAttribute('href')?.slice(1);
        if (targetId) {
          const target = document.getElementById(targetId);
          if (target) {
            event.preventDefault();
            target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
          }
        }
      });
    });
  }

  document.querySelectorAll('[data-analytics="cta_click"]').forEach((cta) => {
    cta.addEventListener('click', () => {
      track('cta_click', { location: cta.dataset.location || 'unknown' });
    });
  });

  if (scrollCue) {
    scrollCue.addEventListener('click', () => {
      const nextSection = document.querySelector('main section:nth-of-type(2)');
      if (nextSection) {
        nextSection.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });
  }

  if (observerTargets.length) {
    const intersection = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          if (entry.target === testimonial) {
            track('testimonial_view', { section: 'social-proof' });
          }
          if (entry.target.classList.contains('how-step')) {
            track('how_it_works_step_view', { step: entry.target.querySelector('h3')?.textContent || 'unknown' });
          }
        }
      });
    }, { threshold: 0.2 });

    observerTargets.forEach((target) => intersection.observe(target));
    if (howSteps) {
      howSteps.querySelectorAll('.how-step').forEach((step) => intersection.observe(step));
    }
  }

  logoButtons.forEach((logo) => {
    const label = logo.getAttribute('aria-label');
    const handler = () => track('logo_hover', { label });
    logo.addEventListener('mouseenter', handler);
    logo.addEventListener('focus', handler);
  });

  if (countTarget) {
    const endValue = 137;
    if (prefersReducedMotion) {
      countTarget.textContent = `Waitlist: ${endValue}+`;
    } else {
      let current = 0;
      const duration = 800;
      const start = performance.now();

      function update(now) {
        const progress = Math.min((now - start) / duration, 1);
        current = Math.floor(progress * endValue);
        countTarget.textContent = `Waitlist: ${current}+`;
        if (progress < 1) requestAnimationFrame(update);
      }

      requestAnimationFrame(update);
    }
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  waitlistForms.forEach((form) => {
    const emailInput = form.querySelector('input[type="email"]');
    const errorEl = form.querySelector('.form-error');
    const hint = form.querySelector('.form-hint');
    const defaultHint = hint?.dataset.default || hint?.innerHTML || '';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const honeypot = form.querySelector('.honeypot input');
      const email = emailInput?.value.trim();

      if (honeypot && honeypot.value) {
        return;
      }

      if (!email || !emailPattern.test(email)) {
        errorEl.textContent = 'Please enter a valid email address.';
        form.classList.remove('success');
        return;
      }

      errorEl.textContent = '';
      form.classList.add('success');
      if (hint) {
        hint.innerHTML = 'Thanks! You’re on the list.';
      }
      emailInput.setAttribute('aria-invalid', 'false');
      emailInput.value = '';
      track('form_submit_success', { form: form.dataset.form });
    });

    emailInput?.addEventListener('invalid', () => {
      emailInput.setCustomValidity('Please enter a valid email address.');
    });

    emailInput?.addEventListener('input', () => {
      emailInput.setCustomValidity('');
      if (form.classList.contains('success')) {
        form.classList.remove('success');
        if (hint) {
          hint.innerHTML = defaultHint;
        }
      }
      if (emailInput.hasAttribute('aria-invalid')) {
        emailInput.removeAttribute('aria-invalid');
      }
      const error = form.querySelector('.form-error');
      if (error) error.textContent = '';
    });
  });

  if (radar && !prefersReducedMotion) {
    let rafId = null;
    let pointer = { x: 0, y: 0 };
    const rect = () => radar.getBoundingClientRect();

    function onPointerMove(event) {
      const bounds = rect();
      pointer.x = (event.clientX - bounds.left) / bounds.width - 0.5;
      pointer.y = (event.clientY - bounds.top) / bounds.height - 0.5;
      if (!rafId) rafId = requestAnimationFrame(applyParallax);
    }

    function applyParallax() {
      rafId = null;
      const depth = 6;
      radar.style.setProperty('--parallax-x', `${pointer.x * depth}px`);
      radar.style.setProperty('--parallax-y', `${pointer.y * depth}px`);
      radar.style.transform = `translate3d(${pointer.x * 12}px, ${pointer.y * 12}px, 0)`;
    }

    radar.addEventListener('pointermove', onPointerMove);
    radar.addEventListener('pointerleave', () => {
      pointer = { x: 0, y: 0 };
      radar.style.transform = 'translate3d(0,0,0)';
    });
  }

  window.addEventListener('analytics:queue', (event) => {
    if (!analyticsEnabled) return;
    const detail = event.detail;
    try {
      window.localStorage.setItem('vardr-analytics', JSON.stringify(analyticsQueue));
    } catch (error) {
      console.warn('[Vardr Analytics] Storage disabled', error);
    }
    console.debug('[Vardr Analytics]', detail);
  });
})();
