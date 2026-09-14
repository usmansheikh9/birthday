/* ============================================================
   BIRTHDAY SITE — script.js
   Vanilla JS, no dependencies, no build step.

   Contents
     1. CONFIG            — the things you will want to edit
     2. Screen manager    — showScreen(name)
     3. Confetti engine   — fireConfetti()
     4. Flame helpers     — extinguishFlame() / relightFlames()
     5. Countdown         — fixed Karachi (+05:00) target instant
     6. Boot              — URL params (?skip, ?screen=)
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     1. CONFIG
     ============================================================ */

  // [HER NAME] — swap this one string and it updates everywhere.
  var HER_NAME = "Alishba";
  var HER_AGE  = 22;

  // The exact instant we count down to, pinned to Karachi time (UTC+5).
  // The "+05:00" offset is part of the string, so this resolves to the same
  // absolute moment no matter what timezone the phone is set to.
  var TARGET_ISO = "2026-09-16T00:00:00+05:00";
  var TARGET_MS  = new Date(TARGET_ISO).getTime();

  /* ============================================================
     2. SCREEN MANAGER
     Every <section class="screen" data-screen="name"> is a page.
     Only one carries .is-active at a time.
     ============================================================ */

  var screens = {};
  var currentScreen = null;

  Array.prototype.forEach.call(
    document.querySelectorAll("#app .screen"),
    function (el) { screens[el.dataset.screen] = el; }
  );

  /**
   * Swap to a screen by its data-screen name.
   * @param {string} name  e.g. "cake", "blow", "collage", "letter", "game"
   */
  function showScreen(name) {
    var next = screens[name];
    if (!next) {
      console.warn('[screens] no screen named "' + name + '"');
      return;
    }
    if (currentScreen === name) return;

    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("is-active", key === name);
    });

    currentScreen = name;
    window.scrollTo(0, 0);

    // HOOK: per-screen setup/teardown goes here. For example, start the game
    // loop when entering "game" and pause it when leaving so it does not
    // keep burning battery in the background.
    //
    //   if (name === "game")  Game.start();  else Game.pause();
    //   if (name === "blow")  Mic.listen();  else Mic.stop();

    document.dispatchEvent(
      new CustomEvent("screenchange", { detail: { screen: name } })
    );
  }

  /* ============================================================
     3. CONFETTI — tiny canvas particle burst, no library
     ============================================================ */

  var confetti = (function () {
    var canvas = document.getElementById("confetti-canvas");
    var ctx = canvas.getContext("2d");
    var particles = [];
    var rafId = null;
    var lastTime = 0;

    var COLORS = ["#FF8FB1", "#FF5E8A", "#FFC2A0", "#FFD166", "#A8E6CF", "#C9B6F5", "#FFFFFF"];

    function resize() {
      // Cap DPR at 2 — a 3x buffer on a 1440p phone costs a lot for confetti.
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.floor(window.innerWidth  * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    function spawn(originX, originY, count, power) {
      for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = (0.35 + Math.random() * 0.65) * power;
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 3,
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.28,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          round: Math.random() < 0.3,
          life: 0,
          ttl: 2600 + Math.random() * 1800
        });
      }
    }

    function frame(now) {
      if (!lastTime) lastTime = now;
      // Clamp dt so a backgrounded tab does not teleport every particle.
      var dt = Math.min(now - lastTime, 48);
      lastTime = now;
      var step = dt / 16.667; // normalise to 60fps units

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.life += dt;

        p.vy += 0.16 * step;   // gravity
        p.vx *= 0.995;         // drag
        p.x  += p.vx * step;
        p.y  += p.vy * step;
        p.rot += p.vrot * step;

        // fade out over the last 600ms of life
        var remaining = p.ttl - p.life;
        var alpha = remaining < 600 ? Math.max(remaining / 600, 0) : 1;

        if (p.life >= p.ttl || p.y - 40 > window.innerHeight) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // squash horizontally as it spins, so it reads as a paper flake
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 0.7)));
        }
        ctx.restore();
      }

      if (particles.length) {
        rafId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rafId = null;
        lastTime = 0;
      }
    }

    function start() {
      if (rafId === null) {
        lastTime = 0;
        rafId = requestAnimationFrame(frame);
      }
    }

    /* The layout is a centred, phone-width column that stops growing at
       --col-max. On a wide screen the window centre is still the column
       centre, but the window EDGES are far out in the empty margins — so
       bursts are anchored to the column, not to the window. */
    function column() {
      var app = document.getElementById("app");
      var r = app ? app.getBoundingClientRect() : null;
      if (!r || !r.width) return { left: 0, width: window.innerWidth };
      return { left: r.left, width: r.width };
    }

    return {
      /**
       * Fire a burst.
       * @param {object} [opts]
       * @param {number} [opts.count=90]   particles
       * @param {number} [opts.x]          origin px (default: column centre)
       * @param {number} [opts.y]          origin px (default: 45% height)
       * @param {number} [opts.power=13]   initial speed multiplier
       */
      fire: function (opts) {
        opts = opts || {};
        var col = column(), h = window.innerHeight;
        spawn(
          opts.x != null ? opts.x : col.left + col.width / 2,
          opts.y != null ? opts.y : h * 0.45,
          opts.count || 90,
          opts.power || 13
        );
        start();
      },

      /** The full celebration: four staggered bursts across the column. */
      celebrate: function () {
        var col = column(), h = window.innerHeight;
        var at = function (f) { return col.left + col.width * f; };
        var self = this;
        this.fire({ x: at(0.5),  y: h * 0.42, count: 110, power: 15 });
        setTimeout(function () { self.fire({ x: at(0.15), y: h * 0.55, count: 60, power: 12 }); }, 180);
        setTimeout(function () { self.fire({ x: at(0.85), y: h * 0.55, count: 60, power: 12 }); }, 340);
        setTimeout(function () { self.fire({ x: at(0.5),  y: h * 0.30, count: 70, power: 14 }); }, 620);
      }
    };
  })();

  /* ============================================================
     4. FLAME HELPERS
     Every candle flame is its own element with class "flame" and a
     data-flame index, so the mic screen can put them out one at a time.
     ============================================================ */

  var flames = document.querySelectorAll(".flame");

  /** Extinguish a single flame by index (0-based). */
  function extinguishFlame(index) {
    var flame = document.querySelector('.flame[data-flame="' + index + '"]');
    if (flame) flame.classList.add("is-out");
  }

  /** Extinguish them all, optionally staggered by `stagger` ms. */
  function extinguishAll(stagger) {
    Array.prototype.forEach.call(flames, function (flame, i) {
      setTimeout(function () { flame.classList.add("is-out"); }, i * (stagger || 0));
    });
  }

  /** Relight everything (handy while developing). */
  function relightFlames() {
    Array.prototype.forEach.call(flames, function (flame) {
      flame.classList.remove("is-out");
    });
  }

  /** True once no flame is still lit — the mic screen can poll this. */
  function allFlamesOut() {
    return !document.querySelector(".flame:not(.is-out)");
  }

  /* ============================================================
     5. COUNTDOWN
     ============================================================ */

  var el = {
    label:     document.getElementById("countdown-label"),
    kicker:    document.querySelector(".intro__kicker"),
    name:      document.getElementById("her-name"),
    age:       document.getElementById("her-age"),
    countdown: document.getElementById("countdown"),
    days:      document.getElementById("cd-days"),
    hours:     document.getElementById("cd-hours"),
    mins:      document.getElementById("cd-mins"),
    secs:      document.getElementById("cd-secs"),
    secsPill:  document.querySelector(".pill--secs"),
    celebrate: document.getElementById("celebrate"),
    continueBtn: document.getElementById("btn-continue")
  };

  el.name.textContent = HER_NAME;
  el.age.textContent  = HER_AGE;

  var timerId = null;
  var finished = false;
  var lastSeconds = -1;

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function render() {
    var remaining = TARGET_MS - Date.now();

    if (remaining <= 0) {
      reachBirthday();
      return;
    }

    var totalSeconds = Math.floor(remaining / 1000);
    var days    = Math.floor(totalSeconds / 86400);
    var hours   = Math.floor(totalSeconds / 3600) % 24;
    var minutes = Math.floor(totalSeconds / 60) % 60;
    var seconds = totalSeconds % 60;

    el.days.textContent  = pad(days);
    el.hours.textContent = pad(hours);
    el.mins.textContent  = pad(minutes);
    el.secs.textContent  = pad(seconds);

    // Pulse the seconds pill, but only when the value actually changed
    // (avoids a double-pulse when we re-render on tab focus).
    if (seconds !== lastSeconds) {
      lastSeconds = seconds;
      el.secsPill.classList.remove("is-tick");
      void el.secsPill.offsetWidth; // force reflow so the animation restarts
      el.secsPill.classList.add("is-tick");
    }
  }

  /* Self-correcting timer: instead of setInterval(1000) — which drifts and
     gets throttled — we schedule the next tick for the exact moment the
     displayed seconds value is due to change. */
  function scheduleTick() {
    if (finished) return;
    var remaining = TARGET_MS - Date.now();
    var delay = remaining <= 0 ? 0 : (remaining % 1000) || 1000;
    timerId = setTimeout(function () {
      render();
      scheduleTick();
    }, delay);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  /**
   * The zero state. Stops the clock, swaps the label, fires confetti and
   * hands off to onBirthdayReached().
   */
  function reachBirthday() {
    if (finished) return;
    finished = true;
    stopTimer();

    el.days.textContent = el.hours.textContent = el.mins.textContent = el.secs.textContent = "00";

    el.countdown.classList.add("is-done");
    el.label.textContent = "Happy Birthday, " + HER_NAME + "!";
    el.label.classList.add("is-birthday");

    // "almost time" is no longer true once we are at zero.
    if (el.kicker) el.kicker.hidden = true;

    el.celebrate.hidden = false;

    confetti.celebrate();

    onBirthdayReached();
  }

  /* ============================================================
     PLACEHOLDER — wire this up to the next screen later.
     Fires exactly once, the moment the countdown reaches zero
     (or immediately when the page is loaded with ?skip).
     ============================================================ */
  function onBirthdayReached() {
    console.log("[birthday] reached — wire the next screen up here.");

    // TODO: e.g. auto-advance to the candle blow-out after a beat:
    //   setTimeout(function () { showScreen("blow"); }, 2500);
  }

  // The "Let's go" button that appears at zero.
  el.continueBtn.addEventListener("click", function () {
    confetti.fire({ count: 60, y: window.innerHeight * 0.62 });

    // TODO: point this at whichever screen should come next.
    //   showScreen("blow");
  });

  // Mobile browsers throttle timers in background tabs, so re-sync the
  // moment we come back into view.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !finished) {
      render();
      stopTimer();
      scheduleTick();
    }
  });

  /* ============================================================
     6. BOOT
     ============================================================ */

  var params = new URLSearchParams(window.location.search);

  // ?screen=collage — jump straight to any screen while developing.
  var forcedScreen = params.get("screen");

  showScreen(forcedScreen && screens[forcedScreen] ? forcedScreen : "cake");

  if (params.has("skip")) {
    // ?skip — test the zero state without waiting for the real date.
    // Slight delay so the cake finishes bouncing in first.
    setTimeout(reachBirthday, 700);
  } else {
    render();
    scheduleTick();
  }

  /* ============================================================
     Exposed for the console and for later screens to call.
     ============================================================ */
  window.BDay = {
    showScreen: showScreen,
    confetti: confetti,
    extinguishFlame: extinguishFlame,
    extinguishAll: extinguishAll,
    relightFlames: relightFlames,
    allFlamesOut: allFlamesOut,
    reachBirthday: reachBirthday,
    config: { name: HER_NAME, age: HER_AGE, target: TARGET_ISO }
  };
})();
