/* ============================================================
   BIRTHDAY SITE — script.js
   Vanilla JS, no dependencies, no build step.

   Contents
     1. CONFIG            — the things you will want to edit
     2. Screen manager    — showScreen(name)
     3. Confetti engine   — fireConfetti()
     4. Flame helpers     — extinguishFlame() / relightFlames()
     4b. Blow-out         — mic detection + tap fallback
     4c. Collage          — vintage polaroid slideshow
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

  /* The collage slideshow, in story order. Add or reorder freely — the
     screen builds itself from this list, so dropping in "10.jpg" means
     adding one line here and nothing else. */
  var PHOTOS = [
    "assets/photos/01.jpg",
    "assets/photos/02.jpg",
    "assets/photos/03.jpg",
    "assets/photos/04.jpg",
    "assets/photos/05.jpg",
    "assets/photos/06.jpg",
    "assets/photos/07.jpg",
    "assets/photos/08.jpg",
    "assets/photos/09.jpg"
  ];

  // How long each photo holds, in ms. The Ken Burns and dot-fill timings
  // in style.css are tuned against this.
  var PHOTO_HOLD_MS = 3500;
  var PHOTO_FADE_MS = 900;

  /* ============================================================
     1b. ON-SCREEN DEBUG READOUT
     Add ?debug to the URL to pin a live readout in the top-left corner.
     Phones make the devtools console impractical, so this is how you read
     the real mic numbers while actually blowing at the thing.

     It is pointer-events:none, so it can never swallow a tap.
     ============================================================ */

  var dbg = (function () {
    var on = new URLSearchParams(window.location.search).has("debug");
    var box = null;
    var phase = "loading";
    var rows = {};
    var dirty = false;

    function ensure() {
      if (box || !on) return;
      box = document.createElement("div");
      box.className = "dbg";
      box.setAttribute("aria-hidden", "true");
      document.body.appendChild(box);
    }

    function paint() {
      if (!on || !dirty) return;
      ensure();
      var out = "phase  " + phase;
      Object.keys(rows).forEach(function (k) {
        out += "\n" + (k + "      ").slice(0, 6) + " " + rows[k];
      });
      box.textContent = out;
      dirty = false;
    }

    return {
      enabled: on,
      /** Big state transitions — always repainted immediately. */
      phase: function (p) {
        phase = p;
        dirty = true;
        paint();
      },
      /** Per-frame metrics. Call freely; painting is throttled by paint(). */
      set: function (o) {
        rows = o;
        dirty = true;
      },
      flush: paint
    };
  })();

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

  /** True once no flame is still lit. */
  function allFlamesOut() {
    return !document.querySelector(".flame:not(.is-out)");
  }

  /* ============================================================
     4b. BLOW-OUT
     Mic-driven candle extinguishing, with a tap fallback that is always
     available so the moment can never dead-end.

     Detecting a blow, rather than just "loud":
       Blowing across a phone mic is a burst of broadband noise heavily
       weighted to the low end. Speech puts most of its energy in the
       1-3kHz formant range, and a tap or bump is a single-frame spike.
       So we require all three of:
         1. low-band level clearly above the room's own noise floor
            (measured live, so a noisy room does not make it hair-trigger)
         2. low band louder than the mid band by RATIO_MIN — this is what
            rejects talking
         3. sustained for CHARGE_MS, accumulated across frames — this is
            what rejects taps and single shouted words
     ============================================================ */

  var blowout = (function () {

    /* Tuned to be forgiving without firing on room noise. Exposed on
       window.BDay.blowTuning so these can be adjusted live on a phone. */
    /* Re-tuned after real-hardware testing, where blowing failed to trigger
       but talking did — the exact opposite of what we want.

       Why that happened: a voice's fundamental is 85-255Hz, which sits
       squarely inside the 50-500Hz "blow" band. A loud low-pitched voice
       therefore beats a level-plus-ratio test, while a real breath gets
       flattened by the phone's own wind/noise suppression (Android often
       applies it in hardware even when the constraint asks it not to).

       So the level gates are now much more forgiving, and speech is
       rejected on SHAPE instead of loudness: a voice is harmonic, so its
       spectrum is spiky, while breath is noise, so its spectrum is flat.
       Spectral flatness separates them regardless of pitch or volume.

       Everything here is live-tunable: BDay.blowTuning.MIN_LEVEL = 10 etc.
       Set FLATNESS_MIN to 0 to disable the speech veto entirely. */
    var TUNING = {
      LOW_HZ:      [40, 500],    // the "blow" band
      MID_HZ:      [1200, 4000], // the "speech" band we compare against
      FLAT_HZ:     [80, 4500],   // band the flatness measure runs over
      WARMUP_MS:    350,         // ignore this much at the start — Android mics
                                 // emit silence/ramp while the stream spins up,
                                 // and calibrating on that sets the floor far
                                 // too low, which makes everything "loud"
      CALIBRATE_MS: 700,         // how long we listen to the room first
      FLOOR_ADAPT:  0.02,        // how fast the floor keeps tracking the room
      FLOOR_MARGIN: 14,          // low band must beat the room by this (0-255)
      MIN_LEVEL:    18,          // absolute floor, for very quiet rooms
      RATIO_MIN:    1.15,        // low/mid ratio required (loose now)
      /* Spectral-flatness speech veto. DISABLED BY DEFAULT (0).
         The idea is sound — a voice is harmonic and spiky, a breath is
         noise and flat — but measured over a wide band it also punishes a
         breath, because a breath is heavily tilted toward the low end and
         that reads as "not flat" too. In testing it vetoed real blows.
         Since a missed blow is the thing we least want, it ships off.
         The number is still computed and shown in the ?debug readout, so
         if talking turns out to trigger things on your phone you can watch
         the real values and switch it on:  BDay.blowTuning.FLATNESS_MIN = 0.3 */
      FLATNESS_MIN: 0,
      ATTACK_MS:    120,         // must be blowing this long before it counts
      CHARGE_MS:    420,         // sustained blow needed to finish the job
      DECAY_MS:     900,         // how fast the charge bleeds back down
      FIRST_AT:     0.45,        // charge at which the first candle goes out
      FALLBACK_MS:  8000,        // (tap button is shown immediately now; this
                                 // just re-states the offer in the copy)
      PATIENCE_MS: 14000
    };

    var ui = {};
    var started = false, finished = false, listening = false;
    var audioCtx = null, analyser = null, micStream = null, freqData = null;
    var rafId = null, lastFrame = 0;
    var noiseFloor = 0, calibSum = 0, calibCount = 0, calibDone = false, calibStart = 0;
    var charge = 0, smoothLevel = 0, outCount = 0, blowRun = 0;
    var fallbackTimer = null, patienceTimer = null, lastDbg = 0;

    var cakeEl = document.getElementById("cake");
    var candlesEl = document.querySelector(".candles");

    function $(id) { return document.getElementById(id); }

    function cacheUi() {
      ui.panel  = $("blow");
      ui.title  = $("blow-title");
      ui.note   = $("blow-note");
      ui.hint   = $("blow-hint");
      ui.meter  = $("blow-meter");
      ui.fill   = $("blow-fill");
      ui.micBtn = $("btn-mic");
      ui.tapBtn = $("btn-tap");
    }

    /* ---------- phase start ---------- */

    function begin() {
      if (started) return;
      started = true;
      cacheUi();
      if (!ui.panel) return;

      ui.panel.hidden = false;
      dbg.phase("ready: tap or allow mic");

      // The candles are a tap target from this moment on — the quiet half
      // of the fallback, live well before the tap button is offered.
      if (candlesEl) {
        candlesEl.classList.add("is-tappable");
        candlesEl.setAttribute("role", "button");
        candlesEl.setAttribute("tabindex", "0");
        candlesEl.setAttribute("aria-label", "Blow out the candles");
        candlesEl.addEventListener("click", manual);
        candlesEl.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); manual(); }
        });
      }

      ui.micBtn.addEventListener("click", requestMic);
      ui.tapBtn.addEventListener("click", manual);

      // The tap route is the guaranteed one, so it is offered from the
      // start rather than held back behind a timeout. If the mic works,
      // great; if it does not, she never has to discover that first.
      ui.tapBtn.hidden = false;

      // Safety net independent of the mic. If she never answers the
      // permission prompt, getUserMedia simply never settles and the
      // listening timer below would never start — so this one runs from
      // the moment the panel appears, no matter what.
      patienceTimer = setTimeout(function () {
        if (!finished) revealFallback();
      }, TUNING.PATIENCE_MS);

      // No mic API at all (old browser, or opened over plain file://):
      // skip straight to the fallback rather than offering a dead button.
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia ||
          !(window.AudioContext || window.webkitAudioContext)) {
        ui.micBtn.hidden = true;
        ui.note.textContent = "Tap the candles to blow them out.";
        revealFallback();
      }
    }

    /* ---------- mic ---------- */

    function requestMic() {
      ui.micBtn.disabled = true;
      ui.note.textContent = "Allow the mic when your phone asks…";
      dbg.phase("requesting mic");

      navigator.mediaDevices.getUserMedia({
        audio: {
          // These would all fight us: AGC rides the level, noise
          // suppression treats a blow as noise and removes it, and the
          // high-pass in echo cancellation eats the low end we look for.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      }).then(onMicReady).catch(onMicFail);
    }

    function onMicReady(stream) {
      micStream = stream;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();

      // Safari hands back a suspended context; this runs inside the tap
      // handler's gesture, so resuming here is allowed.
      if (audioCtx.state === "suspended" && audioCtx.resume) audioCtx.resume();

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      // Low smoothing on purpose: heavy smoothing smears a 70ms knock out
      // across several frames, which makes a transient look sustained.
      analyser.smoothingTimeConstant = 0.3;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      freqData = new Uint8Array(analyser.frequencyBinCount);

      listening = true;
      dbg.phase("calibrating");
      ui.micBtn.hidden = true;
      ui.meter.hidden = false;
      ui.title.textContent = "Make a wish… now blow!";
      ui.note.textContent = "Listening to the room…";

      calibStart = 0;
      lastFrame = 0;
      rafId = requestAnimationFrame(loop);

      // Never let a silent mic be a dead end.
      fallbackTimer = setTimeout(function () {
        if (!finished) revealFallback();
      }, TUNING.FALLBACK_MS);
    }

    function onMicFail(err) {
      // Denied, no device, or blocked by policy — all land here.
      console.warn("[blowout] mic unavailable:", err && err.name);
      dbg.phase("mic blocked: " + ((err && err.name) || "?"));
      ui.micBtn.hidden = true;
      ui.meter.hidden = true;
      ui.note.textContent = "No problem — tap the candles instead.";
      revealFallback();
    }

    /* ---------- analysis loop ---------- */

    function bandAverage(fromHz, toHz) {
      var binHz = audioCtx.sampleRate / analyser.fftSize;
      var from = Math.max(1, Math.floor(fromHz / binHz)); // bin 0 is DC, skip it
      var to = Math.min(freqData.length - 1, Math.ceil(toHz / binHz));
      var sum = 0, n = 0;
      for (var i = from; i <= to; i++) { sum += freqData[i]; n++; }
      return n ? sum / n : 0;
    }

    /* Spectral flatness: geometric mean / arithmetic mean of the bins.
       Noise (a breath) spreads energy evenly -> approaches 1.
       A voice is harmonic, all peaks and valleys -> drops toward 0.
       This is the measure that tells a breath from talking. */
    function flatness(fromHz, toHz) {
      var binHz = audioCtx.sampleRate / analyser.fftSize;
      var from = Math.max(1, Math.floor(fromHz / binHz));
      var to = Math.min(freqData.length - 1, Math.ceil(toHz / binHz));

      // getByteFrequencyData hands back dB mapped onto 0-255. Flatness is
      // only meaningful on LINEAR magnitudes — computed on the dB bytes it
      // returns ~0.97 for everything, because they all sit in a narrow
      // band of values. So map each bin back to linear first.
      var minDb = analyser.minDecibels;
      var span = analyser.maxDecibels - minDb;
      var logSum = 0, sum = 0, n = 0;
      for (var i = from; i <= to; i++) {
        var db = minDb + (freqData[i] / 255) * span;
        var lin = Math.pow(10, db / 20) + 1e-12;
        logSum += Math.log(lin);
        sum += lin;
        n++;
      }
      if (!n) return 0;
      var geo = Math.exp(logSum / n);
      var arith = sum / n;
      return arith > 0 ? Math.min(geo / arith, 1) : 0;
    }

    function loop(now) {
      if (!listening || finished) return;
      rafId = requestAnimationFrame(loop);

      if (!lastFrame) { lastFrame = now; calibStart = now; return; }
      var dt = Math.min(now - lastFrame, 100);
      lastFrame = now;

      analyser.getByteFrequencyData(freqData);
      var low = bandAverage(TUNING.LOW_HZ[0], TUNING.LOW_HZ[1]);
      var mid = bandAverage(TUNING.MID_HZ[0], TUNING.MID_HZ[1]);

      // Phase 0: let the mic stream settle before believing anything it says.
      if (now - calibStart < TUNING.WARMUP_MS) return;

      // Phase 1: learn what this room sounds like when she is not blowing.
      if (!calibDone) {
        calibSum += low; calibCount++;
        if (now - calibStart >= TUNING.WARMUP_MS + TUNING.CALIBRATE_MS) {
          noiseFloor = calibCount ? calibSum / calibCount : 0;
          calibDone = true;
          ui.note.textContent = "Blow on your mic 💨";
          dbg.phase("listening - blow!");
        }
        return;
      }

      // Phase 2: is this a blow?
      var threshold = Math.max(noiseFloor + TUNING.FLOOR_MARGIN, TUNING.MIN_LEVEL);
      var ratio = low / (mid + 1);
      var flat = flatness(TUNING.FLAT_HZ[0], TUNING.FLAT_HZ[1]);

      var loudEnough = low > threshold;
      var lowLeaning = ratio > TUNING.RATIO_MIN;
      // the speech veto — spiky spectrum means a voice, so refuse it
      var notAVoice = TUNING.FLATNESS_MIN <= 0 || flat >= TUNING.FLATNESS_MIN;
      var isBlowing = loudEnough && lowLeaning && notAVoice;

      // How hard, 0..1 — drives the live flame lean. Deliberately NOT
      // gated below, so the flames react to every gust immediately even
      // if it is too short to actually count.
      var raw = isBlowing ? Math.min((low - threshold) / 34, 1) : 0;
      smoothLevel += (raw - smoothLevel) * 0.35; // ease so it is not jittery

      // Attack gate: a blow only starts counting once it has held for
      // ATTACK_MS. This is what separates a breath from a knock or a
      // door slam, which can look spectrally identical but last ~70ms.
      // Keep the floor tracking the room while she is NOT blowing. A
      // one-shot calibration goes stale the moment anything changes (a fan,
      // a mic that ramps up slowly, someone walking in); this self-corrects,
      // and it means steady background noise gets absorbed rather than
      // read as a permanent blow.
      if (!isBlowing) {
        noiseFloor += (low - noiseFloor) * TUNING.FLOOR_ADAPT;
      }

      blowRun = isBlowing ? blowRun + dt : 0;
      var sustained = blowRun >= TUNING.ATTACK_MS;

      charge += sustained
        ? dt / TUNING.CHARGE_MS
        : -dt / TUNING.DECAY_MS;
      charge = Math.max(0, Math.min(1, charge));

      setBlow(Math.max(smoothLevel, charge * 0.55));
      ui.fill.style.width = (charge * 100).toFixed(1) + "%";

      // live numbers, throttled so the DOM write is not per-frame
      if (dbg.enabled && now - lastDbg > 110) {
        lastDbg = now;
        dbg.set({
          low:    low.toFixed(0) + (loudEnough ? " ok" : " LOW"),
          mid:    mid.toFixed(0),
          ratio:  ratio.toFixed(2) + (lowLeaning ? " ok" : " LOW"),
          flat:   flat.toFixed(2) + (notAVoice ? " ok" : " VOICE"),
          floor:  noiseFloor.toFixed(0),
          thresh: threshold.toFixed(0),
          charge: (charge * 100).toFixed(0) + "%",
          blow:   isBlowing ? "YES" : "no"
        });
        dbg.flush();
      }

      if (charge >= TUNING.FIRST_AT && outCount === 0) putOutNext();
      if (charge >= 1) { putOutNext(); finish(); }
    }

    /** Writes --blow on the cake; CSS does the rest. */
    function setBlow(v) {
      if (cakeEl) cakeEl.style.setProperty("--blow", v.toFixed(3));
    }

    /* ---------- extinguishing ---------- */

    function putOutNext() {
      var flame = document.querySelector(".flame:not(.is-out)");
      if (!flame) return;
      flame.classList.add("is-out");
      outCount++;
      puff(flame.closest(".candle"));
    }

    function puff(candle) {
      if (!candle) return;
      setTimeout(function () {
        candle.classList.add("is-smoking");
        setTimeout(function () { candle.classList.remove("is-smoking"); }, 1900);
      }, 140);
    }

    /** The fallback path: tap the candles, or the tap button. */
    function manual() {
      if (finished) return;
      var remaining = document.querySelectorAll(".flame:not(.is-out)").length;
      if (!remaining) return;

      setBlow(0);
      // put them out one after the other, same as a real breath would
      putOutNext();
      if (remaining > 1) setTimeout(putOutNext, 420);
      setTimeout(finish, remaining > 1 ? 560 : 160);
    }

    function revealFallback() {
      if (finished || !ui.tapBtn || !ui.tapBtn.hidden) return;
      ui.tapBtn.hidden = false;
    }

    /* ---------- after the flames are out ---------- */

    function finish() {
      if (finished) return;
      finished = true;
      dbg.phase("blown out");

      clearTimeout(fallbackTimer);
      clearTimeout(patienceTimer);
      // make sure nothing is left burning
      while (document.querySelector(".flame:not(.is-out)")) putOutNext();

      setBlow(0);
      stopMic();

      if (candlesEl) {
        candlesEl.classList.remove("is-tappable");
        candlesEl.removeAttribute("role");
        candlesEl.removeAttribute("tabindex");
      }

      ui.meter.hidden = true;
      ui.hint.hidden = true;
      ui.micBtn.hidden = true;
      ui.tapBtn.hidden = true;
      ui.title.textContent = "Wish made ✨";
      ui.note.textContent = "Hope it comes true.";

      // let the smoke rise before the sparkle
      setTimeout(function () {
        confetti.fire({ count: 46, power: 9, y: window.innerHeight * 0.42 });
      }, 900);

      setTimeout(goToCollage, 2100);
    }

    function stopMic() {
      listening = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (micStream) {
        micStream.getTracks().forEach(function (t) { t.stop(); });
        micStream = null;
      }
      if (audioCtx && audioCtx.close) { audioCtx.close(); audioCtx = null; }
    }

    return {
      begin: begin,
      manual: manual,
      stop: stopMic,
      tuning: TUNING,
      /** Live read of the detector, for tuning on a real phone. */
      debug: function () {
        if (!listening || !calibDone) return { listening: listening, calibrated: calibDone };
        analyser.getByteFrequencyData(freqData);
        var low = bandAverage(TUNING.LOW_HZ[0], TUNING.LOW_HZ[1]);
        var mid = bandAverage(TUNING.MID_HZ[0], TUNING.MID_HZ[1]);
        return {
          low: +low.toFixed(1), mid: +mid.toFixed(1),
          ratio: +(low / (mid + 1)).toFixed(2),
          flatness: +flatness(TUNING.FLAT_HZ[0], TUNING.FLAT_HZ[1]).toFixed(3),
          noiseFloor: +noiseFloor.toFixed(1),
          threshold: +Math.max(noiseFloor + TUNING.FLOOR_MARGIN, TUNING.MIN_LEVEL).toFixed(1),
          charge: +charge.toFixed(2)
        };
      }
    };
  })();

  /* ============================================================
     4c. COLLAGE — vintage polaroid slideshow
     Auto-advances through PHOTOS, then hands off to goToLetter().
     Tap right to advance, tap the left third or swipe right to go back,
     and there is always a visible skip. She is never stuck.
     ============================================================ */

  var collage = (function () {
    var slidesEl = document.getElementById("pola-slides");
    var dotsEl   = document.getElementById("collage-dots");
    var countEl  = document.getElementById("pola-count");
    var polaEl   = document.getElementById("pola");
    var skipBtn  = document.getElementById("collage-skip");
    var rootEl   = document.getElementById("collage");

    var slides = [];   // { figure, img, loaded }
    var dots = [];
    var index = 0;
    var timer = null;
    var running = false;
    var built = false;

    /* Slides are built once, on first entry, so the images are not
       requested at all unless the collage is actually reached. */
    function build() {
      if (built || !slidesEl) return;
      built = true;

      PHOTOS.forEach(function (src, i) {
        var fig = document.createElement("figure");
        fig.className = "slide";

        var img = document.createElement("img");
        img.alt = "";                    // decorative; the photos are the content
        img.decoding = "async";
        img.dataset.src = src;
        // A missing file must not stall the show.
        img.addEventListener("error", function () {
          console.warn("[collage] could not load " + src);
          if (running && i === index) next();
        });

        fig.appendChild(img);
        slidesEl.appendChild(fig);
        slides.push({ fig: fig, img: img, loaded: false });

        var d = document.createElement("span");
        d.className = "dot-item";
        dotsEl.appendChild(d);
        dots.push(d);
      });

      bindGestures();
      if (skipBtn) skipBtn.addEventListener("click", finish);
    }

    /** Set src only when a photo is about to be needed. */
    function load(i) {
      var s = slides[i];
      if (!s || s.loaded) return;
      s.loaded = true;
      s.img.src = s.img.dataset.src;
    }

    function show(i, immediate) {
      if (!slides.length) return;
      index = (i + slides.length) % slides.length;

      load(index);
      load(index + 1 < slides.length ? index + 1 : 0); // warm the next one

      slides.forEach(function (s, n) {
        if (n === index) {
          s.fig.classList.remove("is-leaving");
          s.fig.classList.add("is-current");
        } else if (s.fig.classList.contains("is-current")) {
          s.fig.classList.remove("is-current");
          s.fig.classList.add("is-leaving");
          // drop the leaving class once the crossfade is over, so the
          // Ken Burns animation can restart cleanly next time round
          (function (fig) {
            setTimeout(function () { fig.classList.remove("is-leaving"); },
                       immediate ? 0 : PHOTO_FADE_MS);
          })(s.fig);
        }
      });

      dots.forEach(function (d, n) {
        d.classList.toggle("is-active", n === index);
        d.classList.toggle("is-done", n < index);
      });
      // restart the dot fill animation
      var active = dots[index];
      if (active) {
        active.style.animation = "none";
        void active.offsetWidth;
        active.style.animation = "";
      }

      if (countEl) countEl.textContent = (index + 1) + " / " + slides.length;
      // gentle rock between shots
      if (polaEl) polaEl.style.setProperty("--tilt", (index % 2 ? 1.3 : -1.4) + "deg");
    }

    function schedule() {
      clearTimeout(timer);
      if (!running) return;
      timer = setTimeout(function () {
        if (index >= slides.length - 1) finish();
        else next();
      }, PHOTO_HOLD_MS);
    }

    function next() { if (running) { show(index + 1); schedule(); } }
    function prev() { if (running) { show(index - 1); schedule(); } }

    /* Tap the left third to go back, anywhere else to advance; swipe works
       in both directions. Vertical drags are ignored so scrolling still
       behaves normally. */
    function bindGestures() {
      var x0 = 0, y0 = 0, t0 = 0, moved = false;

      rootEl.addEventListener("touchstart", function (e) {
        var t = e.changedTouches[0];
        x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); moved = false;
      }, { passive: true });

      rootEl.addEventListener("touchend", function (e) {
        if (skipBtn && skipBtn.contains(e.target)) return;
        var t = e.changedTouches[0];
        var dx = t.clientX - x0, dy = t.clientY - y0;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          moved = true;
          if (dx < 0) next(); else prev();
        } else if (Date.now() - t0 < 500 && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
          moved = true;
          tapAt(t.clientX);
        }
      }, { passive: true });

      // mouse/desktop, and any tap that did not come through touch
      rootEl.addEventListener("click", function (e) {
        if (skipBtn && skipBtn.contains(e.target)) return;
        if (moved) { moved = false; return; }
        tapAt(e.clientX);
      });
    }

    function tapAt(clientX) {
      var b = rootEl.getBoundingClientRect();
      if (clientX - b.left < b.width * 0.33) prev();
      else next();
    }

    function finish() {
      if (!running) return;
      stop();
      goToLetter();
    }

    return {
      start: function () {
        build();
        if (!slides.length) { goToLetter(); return; }
        // keep the dot-fill animation in lockstep with the real hold
        if (rootEl) rootEl.style.setProperty("--hold", PHOTO_HOLD_MS + "ms");
        running = true;
        show(0, true);
        schedule();
      },
      stop: function () {
        running = false;
        clearTimeout(timer);
        timer = null;
      },
      next: next,
      prev: prev,
      /** For the console: BDay.collage.goTo(4) */
      goTo: function (i) { if (running) { show(i); schedule(); } }
    };
  })();

  /* Start the slideshow on entry, stop it on exit, using the event that
     showScreen already dispatches. */
  document.addEventListener("screenchange", function (e) {
    if (e.detail.screen === "collage") collage.start();
    else collage.stop();
  });

  /* ============================================================
     The screen handoffs.
     ============================================================ */

  /** Called once both candles are out and the smoke has cleared. */
  function goToCollage() {
    dbg.phase("→ collage");
    showScreen("collage");
  }

  /* PLACEHOLDER — the letter screen comes next.
     Called after the last photo (09, the chai cups). */
  function goToLetter() {
    dbg.phase("→ letter");
    showScreen("letter");
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
    secsPill:  document.querySelector(".pill--secs")
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

    dbg.phase("zero reached");
    confetti.celebrate();

    onBirthdayReached();
  }

  /* ============================================================
     Fires exactly once, the moment the countdown reaches zero (or
     immediately when the page is loaded with ?skip). Hands off to the
     blow-out phase after a beat, so the confetti burst lands first.
     ============================================================ */
  function onBirthdayReached() {
    setTimeout(function () { blowout.begin(); }, 1500);
  }

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

  dbg.phase(params.has("skip") ? "?skip -> zero" : "counting down");

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
    blowout: blowout,
    collage: collage,
    photos: PHOTOS,
    blowTuning: blowout.tuning,  // tweak thresholds live: BDay.blowTuning.RATIO_MIN = 1.5
    blowDebug: blowout.debug,    // BDay.blowDebug() while blowing, to read levels
    goToCollage: goToCollage,
    goToLetter: goToLetter,
    config: { name: HER_NAME, age: HER_AGE, target: TARGET_ISO }
  };
})();
