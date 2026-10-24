/* KONFÍO ZINC · KZ-TECH-001 · interacción progresiva sin dependencias */
(function () {
  'use strict';

  document.documentElement.classList.remove('no-js');
  document.documentElement.classList.add('js');

  function initNavigation(root) {
    var toggle = root.querySelector('[data-kz-tech-nav-toggle]');
    var menu = root.querySelector('[data-kz-tech-nav-menu]');
    if (!toggle || !menu) return;

    function setOpen(open, returnFocus) {
      root.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      setOpen(root.dataset.open !== 'true', false);
    });
    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false, false);
    });
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && root.dataset.open === 'true') setOpen(false, true);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 768 && root.dataset.open === 'true') setOpen(false, false);
    }, { passive: true });
  }

  function initAccordion(button) {
    var panelId = button.getAttribute('aria-controls');
    var panel = panelId ? document.getElementById(panelId) : null;
    if (!panel) return;
    button.addEventListener('click', function () {
      var expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });
  }

  function initModalTrigger(trigger) {
    var selector = trigger.getAttribute('data-kz-tech-open-modal');
    var dialog = selector ? document.querySelector(selector) : null;
    if (!dialog || typeof dialog.showModal !== 'function') return;
    trigger.addEventListener('click', function () { dialog.showModal(); });
  }

  function initModal(dialog) {
    dialog.querySelectorAll('[data-kz-tech-close-modal]').forEach(function (button) {
      button.addEventListener('click', function () { dialog.close(); });
    });
    dialog.addEventListener('click', function (event) {
      if (event.target !== dialog) return;
      var rect = dialog.getBoundingClientRect();
      var inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });
  }

  function initDemoForm(form) {
    var status = form.querySelector('[data-kz-tech-form-status]');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var invalid = null;
      form.querySelectorAll('[required]').forEach(function (field) {
        var error = document.getElementById(field.getAttribute('aria-describedby') || '');
        var valid = field.checkValidity();
        field.setAttribute('aria-invalid', String(!valid));
        if (error) {
          error.hidden = valid;
          error.textContent = valid ? '' : 'Completa este campo para continuar.';
        }
        if (!valid && !invalid) invalid = field;
      });
      if (invalid) {
        if (status) {
          status.hidden = false;
          status.className = 'kz-tech-alert kz-tech-alert--error';
          status.querySelector('p').textContent = 'Revisa los campos señalados. Esta demostración no envía información.';
        }
        invalid.focus();
        return;
      }
      if (status) {
        status.hidden = false;
        status.className = 'kz-tech-alert kz-tech-alert--success';
        status.querySelector('p').textContent = 'Validación visual completada. No se envió ni almacenó información.';
      }
      form.reset();
      form.querySelectorAll('[aria-invalid]').forEach(function (field) { field.removeAttribute('aria-invalid'); });
    });
  }

  function initReveals() {
    var nodes = Array.from(document.querySelectorAll('.kz-tech-reveal'));
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      nodes.forEach(function (node) { node.dataset.visible = 'true'; });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.dataset.visible = 'true';
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    nodes.forEach(function (node) { observer.observe(node); });
  }

  document.querySelectorAll('[data-kz-tech-nav]').forEach(initNavigation);
  document.querySelectorAll('[data-kz-tech-accordion]').forEach(initAccordion);
  document.querySelectorAll('[data-kz-tech-open-modal]').forEach(initModalTrigger);
  document.querySelectorAll('dialog.kz-tech-modal').forEach(initModal);
  document.querySelectorAll('[data-kz-tech-demo-form]').forEach(initDemoForm);
  initReveals();
}());

