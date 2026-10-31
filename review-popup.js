/* Free business review pop-up — Gilly Digital
 *
 * When it opens on its own (never twice on the same visit, never again for a
 * while after the visitor closes or submits it) — whichever happens first:
 *   - ~12 s on the page (tab visible), or
 *   - the visitor scrolls past the first screen and a bit (after >= 4 s), or
 *   - exit intent: desktop cursor leaves through the top edge (after >= 3 s);
 *     on touch screens, a fast scroll back up toward the top after scrolling down.
 * It stays closed if the visitor already reached the contact section, is typing
 * in the contact form, or has the mobile menu open.
 *
 * Manual opening: any element with [data-open-review], or the URL hash #free-review.
 * API: window.GillyReview.open() / .close()
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://formspree.io/f/xnpajqdy';   // same Formspree form as the contact section
  var MAIL = 'guilhermemarques.mktdigital@gmail.com';
  var PHONE = '(470) 557-7266';
  var AUTO_DELAY_MS = 12000;   // time trigger
  var EXIT_MIN_MS = 3000;      // earliest an exit-intent can fire
  var SCROLL_MIN_MS = 4000;    // earliest a scroll trigger can fire
  var SCROLL_SCREENS = 1.2;    // scroll depth, in viewport heights
  var DISMISS_DAYS = 7;
  var DONE_DAYS = 60;
  var KEY_DISMISS = 'gd_review_dismissed';
  var KEY_DONE = 'gd_review_done';

  var lang = (document.documentElement.lang || 'en').toLowerCase().indexOf('pt') === 0 ? 'pt' : 'en';
  var TXT = {
    en: {
      eyebrow: 'Free business review',
      title: 'Want a free <span>business review?</span>',
      sub: 'Leave your contact and I’ll take a simple look at your business online — website, Instagram and Google. You’ll get clear next steps within one business day.',
      name: 'Name', email: 'Email', phone: 'Phone (optional)', site: 'Website or Instagram (optional)',
      namePh: 'Your name', emailPh: 'you@company.com', phonePh: '(optional) Phone number', sitePh: 'yourbusiness.com or @yourbusiness',
      btn: 'Request my free review', sending: 'Sending…',
      wa: 'Or message me on WhatsApp', waText: 'Hi Guilherme, I’d like a free business review.',
      skip: 'Not now', close: 'Close', note: 'No spam. I only use your details to reply.',
      okTitle: 'Thanks!', okText: 'Got it. I’ll reply within one business day with next steps.',
      err: 'Something went wrong and your request wasn’t sent. ', errMail: 'Email me directly', errOr: ' or call ',
      mailSubject: 'Free business review request', mailHi: 'Hi Guilherme,\n\nI’d like a free business review.'
    },
    pt: {
      eyebrow: 'Análise gratuita',
      title: 'Quer uma <span>análise gratuita</span> do seu negócio?',
      sub: 'Deixe seu contato e eu faço uma análise simples da sua presença online — site, Instagram e Google. Você recebe os próximos passos em até um dia útil.',
      name: 'Nome', email: 'E-mail', phone: 'Telefone (opcional)', site: 'Site ou Instagram (opcional)',
      namePh: 'Seu nome', emailPh: 'voce@empresa.com', phonePh: '(opcional) Telefone', sitePh: 'seusite.com ou @seunegocio',
      btn: 'Quero minha análise gratuita', sending: 'Enviando…',
      wa: 'Ou me chame no WhatsApp', waText: 'Oi Guilherme, quero uma análise gratuita do meu negócio.',
      skip: 'Agora não', close: 'Fechar', note: 'Sem spam. Uso seus dados só para responder.',
      okTitle: 'Obrigado!', okText: 'Recebi. Respondo em até um dia útil com os próximos passos.',
      err: 'Algo deu errado e seu pedido não foi enviado. ', errMail: 'Me envie um e-mail', errOr: ' ou ligue ',
      mailSubject: 'Pedido de análise gratuita', mailHi: 'Oi Guilherme,\n\nQuero uma análise gratuita do meu negócio.'
    }
  }[lang];

  /* ---------- storage (can throw in private mode / blocked storage) ---------- */
  function now() { return Date.now(); }
  function getTs(k) { try { return parseInt(localStorage.getItem(k), 10) || 0; } catch (e) { return 0; } }
  function setTs(k) { try { localStorage.setItem(k, String(now())); } catch (e) {} }
  function recent(k, days) { var t = getTs(k); return t && (now() - t) < days * 864e5; }

  /* ---------- state ---------- */
  var overlay, dialog, form, errBox, okBox, lastFocus, inerted = [];
  var isOpen = false, shownThisVisit = false, contactSeen = false, startedAt = now(), autoTimer = null;
  var fineCursor = window.matchMedia && window.matchMedia('(pointer:fine)').matches;

  /* ---------- build ---------- */
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function field(id, label, type, ph, extra) {
    var w = el('div', 'gd-rv-field');
    var l = el('label', null, label); l.setAttribute('for', id);
    var i = el('input'); i.id = id; i.name = extra.name; i.type = type; i.placeholder = ph;
    if (extra.required) i.required = true;
    if (extra.autocomplete) i.autocomplete = extra.autocomplete;
    if (extra.inputmode) i.inputMode = extra.inputmode;
    w.appendChild(l); w.appendChild(i); return w;
  }

  function build() {
    overlay = el('div', 'gd-rv-overlay');
    overlay.setAttribute('aria-hidden', 'true');
    dialog = el('div', 'gd-rv-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'gd-rv-title');
    dialog.setAttribute('aria-describedby', 'gd-rv-sub');
    dialog.tabIndex = -1;

    var x = el('button', 'gd-rv-close', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    x.type = 'button'; x.setAttribute('aria-label', TXT.close);
    x.addEventListener('click', function () { close(true); });

    var eyebrow = el('p', 'gd-rv-eyebrow', TXT.eyebrow);
    var title = el('h2', 'gd-rv-title', TXT.title); title.id = 'gd-rv-title';
    var sub = el('p', 'gd-rv-sub', TXT.sub); sub.id = 'gd-rv-sub';

    form = el('form', 'gd-rv-form'); form.setAttribute('novalidate', ''); form.noValidate = false;
    form.setAttribute('action', ENDPOINT); form.setAttribute('method', 'POST');
    form.appendChild(field('gd-rv-name', TXT.name, 'text', TXT.namePh, { name: 'name', required: true, autocomplete: 'name' }));
    form.appendChild(field('gd-rv-email', TXT.email, 'email', TXT.emailPh, { name: 'email', required: true, autocomplete: 'email' }));
    form.appendChild(field('gd-rv-phone', TXT.phone, 'tel', TXT.phonePh, { name: 'phone', autocomplete: 'tel' }));
    form.appendChild(field('gd-rv-site', TXT.site, 'text', TXT.sitePh, { name: 'website', autocomplete: 'url', inputmode: 'url' }));
    // honeypot: humans never see it, bots fill it
    var hp = el('div', 'gd-rv-hp'); hp.setAttribute('aria-hidden', 'true');
    var hpi = el('input'); hpi.type = 'text'; hpi.name = '_gotcha'; hpi.tabIndex = -1; hpi.autocomplete = 'off';
    hp.appendChild(hpi); form.appendChild(hp);

    errBox = el('div', 'gd-rv-error'); errBox.setAttribute('role', 'alert'); form.appendChild(errBox);
    var btn = el('button', 'gd-rv-btn', '<span>' + TXT.btn + '</span><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>');
    btn.type = 'submit'; form.appendChild(btn);
    form.addEventListener('submit', onSubmit);

    var alt = el('div', 'gd-rv-alt');
    var wa = el('a', 'gd-rv-wa', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.35L3 21z"/></svg>' + TXT.wa);
    wa.href = 'https://wa.me/14705577266?text=' + encodeURIComponent(TXT.waText); wa.target = '_blank'; wa.rel = 'noopener';
    var skip = el('button', 'gd-rv-skip', TXT.skip); skip.type = 'button';
    skip.addEventListener('click', function () { close(true); });
    alt.appendChild(wa); alt.appendChild(skip);

    var note = el('p', 'gd-rv-note', TXT.note);

    okBox = el('div', 'gd-rv-success'); okBox.setAttribute('role', 'status'); okBox.setAttribute('aria-live', 'polite');
    okBox.innerHTML = '<svg width="44" height="44" fill="none" stroke="#FFD700" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>'
      + '<h3>' + TXT.okTitle + '</h3><p>' + TXT.okText + '</p>';
    var okClose = el('button', 'gd-rv-btn', '<span>' + TXT.close + '</span>'); okClose.type = 'button';
    okClose.addEventListener('click', function () { close(false); });
    okBox.appendChild(okClose);

    [x, eyebrow, title, sub, form, alt, note, okBox].forEach(function (n) { dialog.appendChild(n); });
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(true); });
    // page behind must not scroll while the dialog is open (no body overflow tricks: the site pins sections with GSAP)
    function block(e) { if (!dialog.contains(e.target)) e.preventDefault(); }
    overlay.addEventListener('wheel', block, { passive: false });
    overlay.addEventListener('touchmove', block, { passive: false });
    dialog.style.overscrollBehavior = 'contain';
  }

  /* ---------- open / close ---------- */
  function setInert(on) {
    if (on) {
      inerted = [];
      Array.prototype.forEach.call(document.body.children, function (n) {
        if (n === overlay || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.hasAttribute('inert')) return;
        n.setAttribute('inert', ''); inerted.push(n);
      });
    } else {
      inerted.forEach(function (n) { n.removeAttribute('inert'); }); inerted = [];
    }
  }

  function open() {
    if (isOpen) return;
    if (!overlay) build();
    isOpen = true; shownThisVisit = true;
    lastFocus = document.activeElement;
    dialog.classList.remove('is-done'); okBox.classList.remove('show'); errBox.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'false');
    setInert(true);
    // reflow so the transition runs
    void overlay.offsetWidth;
    overlay.classList.add('is-open');
    setTimeout(function () {
      // on touch devices don't pop the keyboard open — focus the dialog itself
      var first = fineCursor ? dialog.querySelector('input[name="name"]') : null;
      (first || dialog).focus({ preventScroll: true });
    }, 60);
    document.addEventListener('keydown', onKey, true);
    document.dispatchEvent(new CustomEvent('gd:review-open'));
  }

  function close(remember) {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    setInert(false);
    document.removeEventListener('keydown', onKey, true);
    if (remember) setTs(KEY_DISMISS);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(
      dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"])'),
      function (n) { return n.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- submit ---------- */
  function onSubmit(e) {
    e.preventDefault();
    if (form.elements._gotcha && form.elements._gotcha.value) return;   // bot
    var btn = form.querySelector('.gd-rv-btn'), original = btn.innerHTML;
    var site = (form.elements.website.value || '').trim();
    var fd = new FormData(form);
    fd.append('_subject', 'Free business review request (website pop-up)');
    fd.append('subject', 'Free business review');
    fd.append('message', 'Free business review request from the website pop-up.' + (site ? ' Website/Instagram: ' + site : ''));
    fd.append('source', 'popup:' + location.pathname);
    errBox.classList.remove('show');
    btn.disabled = true; btn.innerHTML = '<span>' + TXT.sending + '</span>';

    fetch(ENDPOINT, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        setTs(KEY_DONE); form.reset();
        dialog.classList.add('is-done'); okBox.classList.add('show');
        document.dispatchEvent(new CustomEvent('gd:review-sent'));
        okBox.querySelector('button').focus({ preventScroll: true });
      })
      .catch(function () {
        var name = (form.elements.name.value || '').trim();
        var body = TXT.mailHi + (site ? '\n\n' + site : '') + '\n\n— ' + name;
        var mailto = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(TXT.mailSubject) + '&body=' + encodeURIComponent(body);
        errBox.innerHTML = TXT.err + '<a href="' + mailto + '">' + TXT.errMail + '</a>' + TXT.errOr + PHONE + '.';
        errBox.classList.add('show');
      })
      .then(function () { btn.disabled = false; btn.innerHTML = original; });
  }

  /* ---------- automatic triggers ---------- */
  function blocked() {
    if (isOpen || shownThisVisit) return true;
    if (recent(KEY_DISMISS, DISMISS_DAYS) || recent(KEY_DONE, DONE_DAYS)) return true;
    if (contactSeen) return true;                                            // already saw the form
    var ae = document.activeElement;
    if (ae && ae.closest && ae.closest('#contactForm')) return true;         // typing in the contact form
    return false;
  }
  function tryAuto(retries) {
    if (blocked()) return;
    if (document.hidden || document.body.style.overflow === 'hidden') {      // background tab or mobile menu open
      if ((retries || 0) < 8) setTimeout(function () { tryAuto((retries || 0) + 1); }, 5000);
      return;
    }
    open();
  }

  function init() {
    // remember if the visitor reached the contact section
    var contact = document.getElementById('contact');
    if (contact && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting) contactSeen = true; });
      }, { threshold: 0.25 }).observe(contact);
    }
    if (!recent(KEY_DISMISS, DISMISS_DAYS) && !recent(KEY_DONE, DONE_DAYS)) {
      autoTimer = setTimeout(function () { tryAuto(0); }, AUTO_DELAY_MS);
      // exit intent (desktop): cursor leaves through the top edge
      if (fineCursor) {
        document.addEventListener('mouseout', function (e) {
          if (!e.relatedTarget && e.clientY <= 0 && (now() - startedAt) > EXIT_MIN_MS) tryAuto(8);
        });
      }
      // scroll trigger + touch exit intent (fast scroll back up)
      var maxY = 0, lastY = window.pageYOffset || 0, lastT = now(), ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return; ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var y = window.pageYOffset || 0, t = now(), el = t - startedAt;
          if (y > maxY) maxY = y;
          if (maxY > window.innerHeight * SCROLL_SCREENS && el > SCROLL_MIN_MS) tryAuto(8);
          if (!fineCursor && maxY > window.innerHeight && (lastY - y) > 260 && (t - lastT) < 500 && el > EXIT_MIN_MS) tryAuto(8);
          lastY = y; lastT = t;
        });
      }, { passive: true });
    }
    // manual triggers
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-open-review]');
      if (t) { e.preventDefault(); open(); }
    });
    if (location.hash === '#free-review') setTimeout(open, 400);
    window.addEventListener('hashchange', function () { if (location.hash === '#free-review') open(); });
  }

  window.GillyReview = { open: open, close: function () { close(false); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
