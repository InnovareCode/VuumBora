(function () {
  'use strict';

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var cinematicQuery = window.matchMedia('(min-width: 900px)');

  function prefersReducedMotion() {
    return reduceMotionQuery.matches;
  }

  function cinematicAllowed() {
    return cinematicQuery.matches && !prefersReducedMotion();
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
      // Dá ao último slide a mesma chance de virar "o da esquerda" que
      // os outros têm: o espaçador vira a sobra exata (largura visível
      // menos a largura de um card), senão o scroll trava antes de lá.
      if (spacer) {
        var lastWidth = slides[slides.length - 1].getBoundingClientRect().width;
        var need = track.clientWidth - lastWidth;
        spacer.style.width = Math.max(0, need) + 'px';
      }
    }

    function nearestIndex() {
      var pos = track.scrollLeft;
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
      track.scrollTo({ left: left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }

    function setActive(index) {
      currentIndex = index;
      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', i === index ? 'true' : 'false');
      });
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
      dot.addEventListener('click', function () { goTo(i); });
      dotsWrap.appendChild(dot);
      dots.push(dot);
    });

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
      feeOut.textContent = formatBRL(fee);
      netOut.textContent = formatBRL(net);
      range.setAttribute('aria-valuetext', pct + ' por cento de taxa de exemplo');
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
    var config = window.VUUMBORA_CONFIG || { apiBaseUrl: '' };

    function clearFieldErrors() {
      Array.prototype.forEach.call(form.querySelectorAll('.field, .field--choice'), function (field) {
        field.removeAttribute('data-invalid');
        var msg = field.querySelector('.field--error');
        if (msg) msg.remove();
      });
    }

    function showFieldError(name, message) {
      var input = form.querySelector('[name="' + name + '"]');
      if (!input) return;
      var field = input.closest('.field, .field--choice');
      if (!field) return;
      field.setAttribute('data-invalid', 'true');
      var msg = document.createElement('p');
      msg.className = 'field--error';
      msg.textContent = message;
      field.appendChild(msg);
    }

    function setStatus(state, title, body) {
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
      if (!data.name) missing.push(['name', 'Preencha seu nome completo.']);
      if (!data.phone) missing.push(['phone', 'Preencha um telefone com WhatsApp.']);
      if (!data.email) missing.push(['email', 'Preencha um e-mail válido.']);
      if (!data.city) missing.push(['city', 'Preencha a cidade onde você dirige.']);
      if (!data.state) missing.push(['state', 'Selecione a UF.']);

      if (missing.length) {
        missing.forEach(function (pair) {
          showFieldError(pair[0], pair[1]);
        });
        setStatus('error', 'Revise os campos marcados.', 'Faltou preencher alguma informação obrigatória.');
        return;
      }

      if (!config.apiBaseUrl) {
        setStatus(
          'info',
          'Ainda não dá para enviar por aqui.',
          'O endereço do servidor não foi configurado nesta publicação da página. Fale pelo WhatsApp (84) 3113-2584 ou tente novamente mais tarde.'
        );
        return;
      }

      submitButton.disabled = true;
      setStatus('info', 'Enviando...', '');

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
          submitButton.disabled = false;

          if (result.ok) {
            setStatus(
              'success',
              'Candidatura recebida.',
              'A gente avalia e responde no WhatsApp que você informou.'
            );
            if (section) section.setAttribute('data-submitted', 'true');
            return;
          }

          if (result.status === 400) {
            var fields = result.body && result.body.error && result.body.error.fields;
            if (fields && Object.keys(fields).length) {
              Object.keys(fields).forEach(function (fieldName) {
                showFieldError(fieldName, fields[fieldName]);
              });
              setStatus('error', 'Revise os campos marcados.', '');
              return;
            }
            setStatus('error', 'Não foi possível enviar.', 'Os dados enviados não foram aceitos pelo servidor.');
            return;
          }

          if (result.status === 429) {
            setStatus('error', 'Muitas tentativas.', 'Aguarde um momento e tente enviar de novo.');
            return;
          }

          setStatus(
            'error',
            'Não conseguimos enviar agora.',
            'O servidor não respondeu corretamente. Tente novamente em instantes ou fale pelo WhatsApp (84) 3113-2584.'
          );
        })
        .catch(function () {
          submitButton.disabled = false;
          setStatus(
            'error',
            'Falha de conexão.',
            'Não foi possível falar com o servidor agora. Verifique sua internet e tente de novo.'
          );
        });
    });
  }

  function boot() {
    initJourney();
    initRouteLine();
    initReveal();
    initCarousel();
    initRateSimulator();
    initApplicationForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
