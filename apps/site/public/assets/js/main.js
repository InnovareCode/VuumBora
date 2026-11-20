(function () {
  'use strict';

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var cinematicQuery = window.matchMedia('(min-width: 900px)');

  function prefersReducedMotion() {
    return reduceMotionQuery.matches;
  }

  // O cartão de candidatura vive dentro do palco fixo da jornada (altura
  // da tela, overflow:hidden). Se o cartão não couber — em notebook baixo,
  // ou depois de um erro que o faz crescer —, o modo cinematográfico tem
  // que ficar DESLIGADO, senão o topo do cartão sai para y negativo e
  // rolar não traz de volta (rede de segurança da seção 1.7).
  function cinematicAllowed() {
    if (!cinematicQuery.matches || prefersReducedMotion()) return false;
    var card = document.getElementById('candidatura');
    if (card && window.innerHeight < card.offsetHeight + 76 + 32 + 16) {
      return false;
    }
    return true;
  }

  // Ponte entre initJourney (dono do modo cinematográfico) e
  // initApplicationForm: o formulário muda de altura ao mostrar/limpar
  // erro e ao chegar no sucesso, e isso precisa reavaliar o modo na hora.
  var syncJourneyMode = function () {};

  /* =========================================================
     Gatilho compartilhado por QUEM SOMOS, ONDE ESTAMOS e o grid de
     motivos: mesmo padrão do `.reveal` (estado final é o padrão do
     CSS; isto arma com `data-armed` antes de o trecho entrar na tela),
     só que com o nome de atributo que a direção de arte pediu. Sem JS
     ou com movimento reduzido, nunca arma — o estado final (já aceso)
     fica valendo direto.
     ========================================================= */
  function armOnEnter(els, options, onFire) {
    if (!els || !els.length) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;

    els.forEach(function (el) { el.setAttribute('data-armed', 'true'); });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.removeAttribute('data-armed');
          if (onFire) onFire(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, options);

    els.forEach(function (el) { observer.observe(el); });
  }

  /* =========================================================
     QUEM SOMOS: um gatilho só para o texto (sobe 18px) e a ficha
     (linhas escalonadas) — ver seção 5 da direção de 20/11/2026.
     ========================================================= */
  function initQuemSomos() {
    var section = document.querySelector('.quem-somos');
    if (!section) return;
    armOnEnter([section], { threshold: 0.4 });
  }

  /* =========================================================
     ONDE ESTAMOS: desenha o trecho percorrido da linha do tempo em
     amarelo (até o marcador HOJE) com a mesma técnica do `.route-line`
     (stroke-dasharray/offset), e deixa o trecho futuro tracejado
     aparecer só com opacidade — ele não se desenha, porque ainda não
     foi percorrido.
     ========================================================= */
  function initRoadmap() {
    var section = document.querySelector('.roadmap');
    if (!section) return;
    var progress = section.querySelector('.roadmap__line-progress');

    if (progress && window.matchMedia('(min-width: 900px)').matches) {
      var length = progress.getTotalLength();
      progress.style.strokeDasharray = String(length);
      progress.style.strokeDashoffset = String(length);
      armOnEnter([section], { threshold: 0.4 }, function () {
        // Depois de armado, o estado "destravado" é dashoffset 0 — a
        // transição de 0.9s já está na regra CSS de `.roadmap__line-progress`.
        progress.style.strokeDashoffset = '0';
      });
    } else {
      armOnEnter([section], { threshold: 0.4 });
    }
  }

  /* =========================================================
     Grid de motivos: "a rota passa e o motivo acende". Acima de
     1100px os 4 cartões disparam juntos a partir de um gatilho só na
     grade (os atrasos de 0/90/180/270ms e os de pino em 300/700/1100/
     1500ms já estão no CSS, por `nth-child`); abaixo disso cada
     cartão dispara sozinho, a 50% visível.
     ========================================================= */
  function initReasonCards() {
    var wrap = document.querySelector('.reasons__track-wrap');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.reason-card'));
    if (!wrap || !cards.length) return;

    var wideQuery = window.matchMedia('(min-width: 1100px)');
    if (wideQuery.matches) {
      armOnEnter([wrap], { threshold: 0.4 });
    } else {
      armOnEnter(cards, { threshold: 0.5 });
    }

    // Luz que segue o cursor, só com mouse de verdade (a media query no
    // CSS já esconde o efeito no toque — aqui só evita o custo do
    // listener onde ele nunca seria usado).
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      cards.forEach(function (card) {
        card.addEventListener('pointermove', function (event) {
          var rect = card.getBoundingClientRect();
          card.style.setProperty('--mx', ((event.clientX - rect.left) / rect.width) * 100 + '%');
          card.style.setProperty('--my', ((event.clientY - rect.top) / rect.height) * 100 + '%');
        });
      });
    }
  }

  /* =========================================================
     JORNADA: troca de faixa (imagem + texto) amarrada ao scroll.
     Só roda quando o modo cinematográfico está ligado. O laço
     (rAF) só é agendado em resposta a scroll/resize: descansa
     parado quando a página não rola.
     ========================================================= */
  function initJourney() {
    var journey = document.querySelector('[data-journey]');
    if (!journey) return;

    var faixas = Array.prototype.slice.call(journey.querySelectorAll('.faixa'));
    var ranges = {
      1: { start: 0, full: 0.30, fade: 0.34 },
      2: { start: 0.30, full: 0.34, fade: 0.64, fadeOutStart: 0.64, fadeOutEnd: 0.68 },
      3: { start: 0.64, full: 0.68, fade: 1.00 }
    };

    var active = false; // modo cinematográfico está de fato ligado agora
    var ticking = false;
    // -1, e nao 0: o update so age quando o indice MUDA, entao comecar em 0
    // faz a primeira passada nao disparar quando a faixa do topo tambem e 0.
    // O efeito era visivel: ao abrir a pagina sem rolar, a faixa 1 nunca era
    // marcada como assentada e o titulo ficava borrado ate o primeiro toque
    // de rolagem. Primeira impressao da pagina, justamente.
    var lastActiveIndex = -1;

    function opacityFor(index, progress) {
      if (index === 1) {
        if (progress <= 0.30) return 1;
        if (progress >= 0.34) return 0;
        return 1 - (progress - 0.30) / 0.04;
      }
      if (index === 2) {
        if (progress <= 0.30) return 0;
        if (progress < 0.34) return (progress - 0.30) / 0.04;
        if (progress <= 0.64) return 1;
        if (progress < 0.68) return 1 - (progress - 0.64) / 0.04;
        return 0;
      }
      // index === 3
      if (progress <= 0.64) return 0;
      if (progress < 0.68) return (progress - 0.64) / 0.04;
      return 1;
    }

    function activeIndexFor(progress) {
      if (progress < 0.32) return 1;
      if (progress < 0.66) return 2;
      return 3;
    }

    function update() {
      ticking = false;
      if (!active) return;

      var rect = journey.getBoundingClientRect();
      var total = journey.offsetHeight - window.innerHeight;
      var progress = 0;
      if (total > 0) {
        progress = (-rect.top) / total;
        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;
      }

      for (var i = 0; i < faixas.length; i++) {
        var el = faixas[i];
        var idx = Number(el.getAttribute('data-faixa'));
        el.style.opacity = String(opacityFor(idx, progress));
      }

      var newActive = activeIndexFor(progress);
      if (newActive !== lastActiveIndex) {
        lastActiveIndex = newActive;
        for (var j = 0; j < faixas.length; j++) {
          var faixaEl = faixas[j];
          var faixaIdx = Number(faixaEl.getAttribute('data-faixa'));
          if (faixaIdx === newActive) {
            faixaEl.setAttribute('data-active', 'true');
            // A entrada termina em `filter: blur(0)`, e um filter de valor zero
            // ainda prende o elemento numa camada de composicao: o navegador
            // rasteriza o texto e ele fica borrado de forma permanente. Medido
            // lado a lado em 1440px: com o filter, titulo ilegivel; sem ele,
            // nitido. Entao, assim que a transicao assenta, o filter sai de
            // cena por inteiro. O tempo bate com a transicao de 0.7s do CSS.
            marcarAssentada(faixaEl);
          } else {
            faixaEl.removeAttribute('data-active');
            faixaEl.removeAttribute('data-settled');
            if (faixaEl.__assentar) {
              clearTimeout(faixaEl.__assentar);
              faixaEl.__assentar = null;
            }
          }
        }
      }
    }

    function marcarAssentada(faixaEl) {
      if (faixaEl.__assentar) clearTimeout(faixaEl.__assentar);
      faixaEl.__assentar = setTimeout(function () {
        if (faixaEl.getAttribute('data-active') === 'true') {
          faixaEl.setAttribute('data-settled', 'true');
        }
        faixaEl.__assentar = null;
      }, 760);
    }

    function requestTick() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }

    function enableCinematic() {
      if (active) return;
      active = true;
      journey.classList.add('is-cinematic');
      lastActiveIndex = -1;
      requestTick();
    }

    function disableCinematic() {
      if (!active) return;
      active = false;
      journey.classList.remove('is-cinematic');
      for (var i = 0; i < faixas.length; i++) {
        faixas[i].style.opacity = '';
        faixas[i].removeAttribute('data-active');
      }
    }

    function syncMode() {
      if (cinematicAllowed()) {
        enableCinematic();
      } else {
        disableCinematic();
      }
    }
    syncJourneyMode = syncMode;

    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', function () {
      syncMode();
      requestTick();
    });
    cinematicQuery.addEventListener('change', syncMode);
    reduceMotionQuery.addEventListener('change', syncMode);

    syncMode();
  }

  /* =========================================================
     Cabeçalho sólido ao rolar e CTA do hero.
     Fecham F12 (CTA que não fazia nada no desktop) e F13 (logo por
     cima do título do cartão no celular).
     ========================================================= */
  function initHeaderScroll() {
    var header = document.querySelector('.site-header');
    var journey = document.querySelector('[data-journey]');
    if (!header) return;

    var ticking = false;
    function update() {
      ticking = false;
      var cinematic = journey && journey.classList.contains('is-cinematic');
      var scrolled = cinematic
        ? window.scrollY > journey.offsetHeight - 76
        : window.scrollY > 8;
      header.classList.toggle('is-scrolled', scrolled);
    }
    function requestTick() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', requestTick);
    requestTick();
  }

  function initHeroCta() {
    var cta = document.querySelector('.hero-grid .faixa-text .button--primary');
    var nameField = document.getElementById('field-name');
    if (!cta || !nameField) return;

    // A partir de 900px o cartão já está ao lado do texto: clicar no CTA
    // não precisa rolar, só leva o foco ao primeiro campo (o próprio
    // anel de foco amarelo já é a resposta visível ao clique). Abaixo
    // de 900px a âncora continua levando até a candidatura normalmente.
    cta.addEventListener('click', function (event) {
      if (cinematicQuery.matches) {
        event.preventDefault();
        nameField.focus({ preventScroll: true });
      }
    });
  }

  /* =========================================================
     Linha de rota (SVG lateral): acompanha o progresso da
     PÁGINA INTEIRA. Sob motion reduzido, fica no estado final
     (totalmente desenhada) e o laço nem começa a rodar.
     ========================================================= */
  function initRouteLine() {
    var path = document.querySelector('.route-line__progress');
    if (!path) return;
    if (prefersReducedMotion()) return; // CSS já deixa no estado final

    var length = path.getTotalLength();
    path.style.strokeDasharray = String(length);
    path.style.strokeDashoffset = String(length);

    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var total = doc.scrollHeight - window.innerHeight;
      var progress = total > 0 ? window.scrollY / total: 0;
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;
      path.style.strokeDashoffset = String(length * (1 - progress));
    }
    function requestTick() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }
    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', requestTick);
    requestTick();
  }

  /* =========================================================
     Entrada "própria por momento" para o conteúdo depois da
     jornada: fade + subida sutil, uma vez por elemento.
     ========================================================= */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      return; // CSS já deixa tudo visível por padrão
    }

    items.forEach(function (el) {
      el.setAttribute('data-hidden', 'true');
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-hidden', 'false');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* =========================================================
     Carrossel de artes: base é a lista com scroll-snap (funciona
     sem JS, inclusive teclado/touch). Setas, pausa e bolinhas são
     camada de cima, só reveladas aqui. Avança sozinho a cada 5,5s,
     com quatro motivos de pausa combinados (nunca um só booleano):
     reduzido, pausa manual, interação (hover/foco) e aba oculta.
     ========================================================= */
  function initCarousel() {
    var root = document.querySelector('[data-carousel]');
    if (!root) return;

    var track = root.querySelector('[data-carousel-track]');
    var slides = Array.prototype.slice.call(track.querySelectorAll('.carousel__slide'));
    if (!slides.length) return;

    var controls = root.querySelector('[data-carousel-controls]');
    var dotsWrap = root.querySelector('[data-carousel-dots]');
    var prevBtn = root.querySelector('[data-carousel-prev]');
    var nextBtn = root.querySelector('[data-carousel-next]');
    var pauseBtn = root.querySelector('[data-carousel-pause]');
    var pauseLabel = root.querySelector('[data-carousel-pause-label]');

    var INTERVAL_MS = 5500;
    var currentIndex = 0;
    var manuallyPaused = false;
    var interactionPaused = false;
    var tabHidden = document.hidden;
    var timer = null;
    var dots = [];

    // Posição de cada slide dentro do conteúdo rolável, calculada uma vez
    // (e de novo no resize). Com várias cartas visíveis ao mesmo tempo (a
    // tira mostra 3+ num desktop largo), um IntersectionObserver com
    // limiar fixo é ambíguo — várias cartas cruzam 60% ao mesmo tempo, e
    // "qual é a atual" vira loteria (medido: clique na bolinha 4 assentava
    // na 5). Em vez disso, o índice "atual" é sempre o slide cuja posição
    // está mais perto do scrollLeft real — determinístico mesmo com várias
    // cartas visíveis.
    var slideLefts = [];
    var spacer = root.querySelector('[data-carousel-spacer]');
    function measureSlideLefts() {
      var trackRect = track.getBoundingClientRect();
      slideLefts = slides.map(function (slide) {
        var slideRect = slide.getBoundingClientRect();
        return track.scrollLeft + (slideRect.left - trackRect.left);
      });
      // O espaçador existia para o último card conseguir chegar à borda
      // esquerda, quando o encaixe era pelo início. Agora o card ativo fica
      // CENTRALIZADO, e quem dá esse espaço é o padding do track (ver
      // `.carousel__viewport .carousel__track` no CSS), calculado como
      // metade da sobra entre a janela e um card.
      //
      // Mantido esticando a zero, e não removido do HTML, porque o JS pode
      // não rodar: sem ele o layout continua correto, e com ele o valor
      // antigo (que chegava a meia tela de vazio no fim) nunca volta.
      if (spacer) spacer.style.width = '0px';
    }

    // O recuo da esquerda do track. `slideLefts` mede a partir da borda do
    // track, que fica ANTES do padding; o scroll precisa descontá-lo para o
    // card parar onde o `scroll-snap-align: start` encaixa.
    function recuoInicial() {
      return parseFloat(getComputedStyle(track).paddingLeft) || 0;
    }

    function nearestIndex() {
      var pos = track.scrollLeft + recuoInicial();
      var best = 0;
      var bestDist = Infinity;
      slideLefts.forEach(function (left, i) {
        var dist = Math.abs(left - pos);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      return best;
    }

    function scrollToIndex(index) {
      var left = slideLefts[index];
      if (left === undefined) return;
      track.scrollTo({
        left: left - recuoInicial(),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }

    function setActive(index) {
      var wasCurrent = dots[index] && dots[index].getAttribute('aria-current') === 'true';
      currentIndex = index;
      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
      // A bolinha ativa reinicia a animação de preenchimento mesmo
      // quando é a MESMA (o carrossel deu a volta inteira): sem isso o
      // navegador não reaplica a keyframe, porque pra ele nada mudou.
      if (wasCurrent && dots[index]) {
        var fill = dots[index].querySelector('.carousel__dot-fill');
        if (fill) {
          fill.style.animation = 'none';
          void fill.offsetWidth;
          fill.style.animation = '';
        }
      }
      markActiveSlide(index);
    }

    function goTo(index) {
      var clamped = (index + slides.length) % slides.length;
      setActive(clamped);
      scrollToIndex(clamped);
    }

    measureSlideLefts();
    window.addEventListener('resize', measureSlideLefts);

    // Varredura orgânica (gesto de toque/trackpad, fora dos nossos botões):
    // sincroniza as bolinhas com o slide mais próximo, sem brigar com a
    // navegação programática (goTo já ajustou currentIndex antes de rolar).
    var scrollTicking = false;
    track.addEventListener('scroll', function () {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(function () {
        scrollTicking = false;
        var idx = nearestIndex();
        if (idx !== currentIndex) setActive(idx);
      });
    }, { passive: true });

    slides.forEach(function (slide, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('aria-label', 'Ir para o slide ' + (i + 1) + ' de ' + slides.length);
      dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      var track = document.createElement('span');
      track.className = 'carousel__dot-track';
      var fill = document.createElement('span');
      fill.className = 'carousel__dot-fill';
      track.appendChild(fill);
      dot.appendChild(track);
      dot.addEventListener('click', function () { goTo(i); });
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });

    // Reinicia uma animação CSS no mesmo elemento (ex.: o MESMO slide
    // voltando a ficar ativo depois de uma volta completa, ou a MESMA
    // bolinha). Remover a classe, forçar reflow e devolver é o truque
    // padrão — sem isso o navegador não reaplica a keyframe porque,
    // pra ele, nada mudou.
    function restartAnimation(el) {
      if (!el) return;
      /* eslint-disable no-unused-expressions */
      void el.offsetWidth;
    }

    // Marca o slide ativo (zoom da imagem + legenda em sequência) e
    // desmarca o anterior. `is-entering` liga por um instante (mesmo
    // ciclo de rAF) pra disparar a transição de entrada da legenda e
    // depois sai, deixando o estado final (tudo visível) no lugar.
    var activeSlideEl = null;
    function markActiveSlide(index) {
      var next = slides[index];
      if (activeSlideEl && activeSlideEl !== next) {
        activeSlideEl.classList.remove('is-active');
      }
      if (next === activeSlideEl) {
        next.classList.remove('is-active');
        restartAnimation(next);
      }
      if (!prefersReducedMotion()) {
        next.classList.add('is-entering');
        restartAnimation(next);
      }
      next.classList.add('is-active');
      activeSlideEl = next;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          next.classList.remove('is-entering');
        });
      });
    }

    prevBtn.addEventListener('click', function () { goTo(currentIndex - 1); });
    nextBtn.addEventListener('click', function () { goTo(currentIndex + 1); });

    function isPlaying() {
      return !prefersReducedMotion() && !manuallyPaused && !interactionPaused && !tabHidden;
    }

    function syncTimer() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      // Congela o zoom da imagem e a pílula de progresso junto com o
      // avanço automático: pausa manual, hover, foco ou aba escondida.
      root.classList.toggle('is-paused', !isPlaying());
      if (isPlaying()) {
        timer = setInterval(function () { goTo(currentIndex + 1); }, INTERVAL_MS);
      }
    }

    function setManuallyPaused(state) {
      manuallyPaused = state;
      pauseBtn.setAttribute('aria-pressed', state ? 'true' : 'false');
      if (pauseLabel) {
        pauseLabel.textContent = state ? 'Retomar avanço automático' : 'Pausar avanço automático';
      }
      syncTimer();
    }

    pauseBtn.addEventListener('click', function () { setManuallyPaused(!manuallyPaused); });

    root.addEventListener('pointerenter', function () { interactionPaused = true; syncTimer(); });
    root.addEventListener('pointerleave', function () { interactionPaused = false; syncTimer(); });
    root.addEventListener('focusin', function () { interactionPaused = true; syncTimer(); });
    root.addEventListener('focusout', function (event) {
      if (!root.contains(event.relatedTarget)) {
        interactionPaused = false;
        syncTimer();
      }
    });

    document.addEventListener('visibilitychange', function () {
      tabHidden = document.hidden;
      syncTimer();
    });

    function syncReducedUI() {
      pauseBtn.hidden = prefersReducedMotion();
      syncTimer();
    }
    reduceMotionQuery.addEventListener('change', syncReducedUI);

    // Acende o primeiro slide (zoom da imagem + pílula) assim que o JS
    // liga — sem isto, só o segundo slide em diante ganhava a animação.
    markActiveSlide(0);

    // Camada de cima: controles só aparecem depois que o JS liga.
    controls.hidden = false;
    dotsWrap.hidden = false;
    syncReducedUI();
  }

  /* =========================================================
     Simulação de taxa (barra que o visitante arrasta).
     Corrida de exemplo fixa em R$ 100 só para a conta ficar
     clara: a taxa real da VuumBora ainda não existe.
     ========================================================= */
  function initRateSimulator() {
    var range = document.getElementById('rate-range');
    if (!range) return;

    var valueOut = document.getElementById('rate-range-value');
    var feeOut = document.getElementById('rate-fee');
    var netOut = document.getElementById('rate-net');
    var EXAMPLE_FARE = 100;

    function formatBRL(value) {
      return 'R$ ' + value.toFixed(2).replace('.', ',');
    }

    function render() {
      var pct = Number(range.value);
      var fee = (EXAMPLE_FARE * pct) / 100;
      var net = EXAMPLE_FARE - fee;
      valueOut.textContent = pct + '%';
      feeOut.textContent = '- ' + formatBRL(fee);
      netOut.textContent = formatBRL(net);
      range.setAttribute('aria-valuetext', pct + ' por cento de taxa de exemplo');
      range.style.setProperty('--pct', (pct / Number(range.max)) * 100 + '%');
    }

    range.addEventListener('input', render);
    render();
  }

  /* =========================================================
     Formulário de candidatura: POST /v1/driver-applications.
     Sem o endereço da API configurado, mostra o aviso honesto
     em vez de fingir que enviou.
     ========================================================= */
  function initApplicationForm() {
    var form = document.getElementById('application-form');
    if (!form) return;

    var section = document.getElementById('candidatura');
    var status = document.getElementById('form-status');
    var submitButton = form.querySelector('button[type="submit"]');
    var submitLabel = submitButton.querySelector('.button__label');
    var config = window.VUUMBORA_CONFIG || { apiBaseUrl: '' };

    function errorIconSVG() {
      return '<svg class="field-error__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12 7.5v6M12 16.75h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
    }

    function clearFieldError(field) {
      if (!field) return;
      field.removeAttribute('data-invalid');
      var msg = field.querySelector('.field-error');
      if (msg) msg.remove();
      var input = field.querySelector('input, select');
      if (input) {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }

    function clearFieldErrors() {
      Array.prototype.forEach.call(form.querySelectorAll('.field, .field--choice'), clearFieldError);
    }

    function showFieldError(name, message) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      var field = input.closest('.field, .field--choice');
      if (!field) return;
      field.setAttribute('data-invalid', 'true');
      var msgId = 'err-' + name;
      var msg = document.createElement('p');
      msg.className = 'field-error';
      msg.id = msgId;
      msg.innerHTML = errorIconSVG();
      msg.appendChild(document.createTextNode(message));
      field.appendChild(msg);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', msgId);
    }

    // Correção ao vivo: assim que o campo passa a ter valor, a mensagem
    // daquele campo some — sem esperar outro envio.
    Array.prototype.forEach.call(form.querySelectorAll('input[type="text"], input[type="tel"], input[type="email"]'), function (input) {
      input.addEventListener('input', function () {
        if (input.value.trim()) clearFieldError(input.closest('.field'));
      });
    });
    var stateSelect = form.querySelector('#field-state');
    if (stateSelect) {
      stateSelect.addEventListener('change', function () {
        if (stateSelect.value) clearFieldError(stateSelect.closest('.field'));
      });
    }

    function setStatus(state, title, body) {
      if (!state) {
        status.removeAttribute('data-state');
        status.innerHTML = '';
        return;
      }
      status.setAttribute('data-state', state);
      status.innerHTML = '';
      if (title) {
        var h3 = document.createElement('h3');
        h3.textContent = title;
        status.appendChild(h3);
      }
      if (body) {
        var p = document.createElement('p');
        p.textContent = body;
        status.appendChild(p);
      }
    }

    function setLoading(isLoading) {
      submitButton.classList.toggle('is-loading', isLoading);
      submitButton.disabled = isLoading;
      submitButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      if (submitLabel) submitLabel.textContent = isLoading ? 'Enviando...' : 'Enviar candidatura';
    }

    function radioValue(name) {
      var checked = form.querySelector('[name="' + name + '"]:checked');
      if (!checked) return undefined;
      return checked.value === 'true';
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearFieldErrors();

      var data = {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        city: form.city.value.trim(),
        state: form.state.value.trim()
      };
      var alreadyDrives = radioValue('alreadyDrivesForApp');
      var hasVehicle = radioValue('hasOwnVehicle');
      if (alreadyDrives !== undefined) data.alreadyDrivesForApp = alreadyDrives;
      if (hasVehicle !== undefined) data.hasOwnVehicle = hasVehicle;

      var missing = [];
      if (!data.name) missing.push(['name', 'Informe seu nome completo.']);
      if (!data.phone) missing.push(['phone', 'Informe um WhatsApp.']);
      if (!data.email) missing.push(['email', 'Informe um e-mail válido.']);
      if (!data.city) missing.push(['city', 'Informe a cidade.']);
      if (!data.state) missing.push(['state', 'Escolha a UF.']);

      if (missing.length) {
        // Sem resumo "Revise os campos marcados" aqui: ele duplicava as
        // mensagens de cada campo e, com 106px, era a principal razão do
        // cartão crescer e sair da tela (ver seção 1.1/1.7 da especificação).
        setStatus(null);
        missing.forEach(function (pair) {
          showFieldError(pair[0], pair[1]);
        });
        var firstInvalid = form.querySelector('[name="' + missing[0][0] + '"]');
        if (firstInvalid) firstInvalid.focus();
        syncJourneyMode();
        return;
      }

      if (!config.apiBaseUrl) {
        setStatus(
          'info',
          'Ainda não dá para enviar por aqui.',
          'O formulário está fora do ar agora. Fale com a gente pelo WhatsApp (84) 3113-2584.'
        );
        syncJourneyMode();
        return;
      }

      setStatus(null);
      setLoading(true);

      fetch(config.apiBaseUrl.replace(/\/$/, '') + '/v1/driver-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return undefined;
            })
            .then(function (json) {
              return { ok: response.ok, status: response.status, body: json };
            });
        })
        .then(function (result) {
          setLoading(false);

          if (result.ok) {
            setStatus(
              'success',
              'Candidatura recebida.',
              'A gente avalia e responde no WhatsApp que você informou.'
            );
            if (section) section.setAttribute('data-submitted', 'true');
            syncJourneyMode();
            status.focus();
            return;
          }

          if (result.status === 400) {
            var fields = result.body && result.body.error && result.body.error.fields;
            if (fields && Object.keys(fields).length) {
              Object.keys(fields).forEach(function (fieldName) {
                showFieldError(fieldName, fields[fieldName]);
              });
              // Aqui o resumo continua: o erro vem do servidor, depois que
              // o cartão já está no tamanho final, e avisa que a causa não
              // foi a validação do navegador.
              setStatus('error', 'Revise os campos marcados.', '');
              syncJourneyMode();
              return;
            }
            setStatus('error', 'Não foi possível enviar.', 'Confira os dados e tente de novo.');
            syncJourneyMode();
            return;
          }

          if (result.status === 429) {
            setStatus('error', 'Muitas tentativas.', 'Aguarde um momento e tente enviar de novo.');
            syncJourneyMode();
            return;
          }

          setStatus(
            'error',
            'Não conseguimos enviar agora.',
            'Tente de novo em alguns minutos ou fale pelo WhatsApp (84) 3113-2584.'
          );
          syncJourneyMode();
        })
        .catch(function () {
          setLoading(false);
          setStatus(
            'error',
            'Falha de conexão.',
            'Não foi possível falar com o servidor agora. Verifique sua internet e tente de novo.'
          );
          syncJourneyMode();
        });
    });
  }

  /**
   * Assinatura do rodapé: a versão que está no ar.
   *
   * O número vem de `version.js`, gerado no build a partir do
   * `package.json` da raiz (ver scripts/gerar-versao.mjs). Se esse arquivo
   * não tiver carregado, o trecho continua escondido: um rodapé sem versão
   * é honesto, um rodapé com versão errada manda o suporte caçar um bug no
   * build errado.
   *
   * A data da compilação entra no `title` e num texto para leitor de tela,
   * respondendo "v1.0.0 de quando?" sem poluir a linha.
   */
  function initAppVersion() {
    var alvo = document.querySelector('[data-app-version]');
    if (!alvo) return;

    var info = window.VUUMBORA_VERSION;
    if (!info || !info.versao) return;

    alvo.textContent = 'v' + info.versao;
    if (info.compiladoEm) {
      alvo.setAttribute('title', 'Compilado em ' + info.compiladoEm);
      alvo.setAttribute('aria-label', 'Versão ' + info.versao + ', compilada em ' + info.compiladoEm);
    }
    alvo.hidden = false;
  }

  function boot() {
    initJourney();
    initHeaderScroll();
    initHeroCta();
    initRouteLine();
    initReveal();
    initQuemSomos();
    initRoadmap();
    initReasonCards();
    initCarousel();
    initRateSimulator();
    initApplicationForm();
    initAppVersion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
