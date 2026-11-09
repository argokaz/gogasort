/* FotoSort · web: portada, demo interactiva, descargas y detalles. */
(function () {
  "use strict";
  if (window.lucide) lucide.createIcons();
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FOTOS = window.FOTOS || [];
  var BASE = "/img/demo/";
  /* orden en el anillo: la primera queda al frente */
  var RING = ["Paisajes", "Animales", "Documentos", "Vídeos", "Otros", "Personas", "Comida", "Capturas", "Arte y fondos", "Duplicados"];

  function shuffle(a, seed) {
    var r = seed || 1, b = a.slice();
    for (var i = b.length - 1; i > 0; i--) { r = (r * 9301 + 49297) % 233280; var j = Math.floor(r / 233280 * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; }
    return b;
  }
  var narrow = function (w) { return w < 820; };

  /* ── barra y entradas ─────────────────────── */
  var nav = $("#nav");
  var hero = $(".hero");
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { nav.classList.toggle("solid", !es[0].isIntersecting); }, { rootMargin: "-80px 0px 0px 0px" }).observe($("#heroCopy"));
    var rvo = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); rvo.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    $$(".rv").forEach(function (el) { rvo.observe(el); });
  } else {
    $$(".rv").forEach(function (el) { el.classList.add("in"); });
  }

  /* ── portada: la esfera en bucle ──────────── */
  var heroCv = $("#heroCanvas");
  var heroCopy = $("#heroCopy");
  var heroE = new Esfera(heroCv, {
    mode: "stream", slots: 110, rate: 5, seed: 11,
    cx: function (w) { return narrow(w) ? 0.5 : 0.69; },
    cy: function () { return 0.5; },
    avoidLeft: function () {
      if (narrow(window.innerWidth)) return 0;
      var r = heroCopy.getBoundingClientRect(), h = heroCv.getBoundingClientRect();
      return Math.min(r.right - h.left + 56, h.width * 0.5);
    },
    size: 1.15, dock: 42, ringSpeed: 0.03
  });
  heroE.setCats(RING);
  heroE.load(FOTOS, BASE);

  /* ── demo interactiva ─────────────────────── */
  var demoCv = $("#demoCanvas");
  var lupa = $("#lupa"), lupaImg = $("#lupaImg"), cap = $("#cap"), verdict = $("#verdict");
  var instr = $("#instr"), goBtn = $("#goBtn"), moveBtn = $("#moveBtn"), undoBtn = $("#undoBtn"), sheet = $("#sheet");
  var sDone = $("#sDone"), sFolders = $("#sFolders"), sDupes = $("#sDupes"), tUse = $("#tUse"), tRate = $("#tRate");
  var state = "idle", started = 0, done = 0, typing = null, teleTimer = null, plan = null;

  function normal(s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function makePlan(text) {
    var t = normal(text || ""), cats = RING.slice(), rules = [], known = !t.trim();
    if (/paris/.test(t)) {
      cats.splice(1, 0, "París");
      rules.push(function (f) { return f.d.id === "paris" ? "París" : null; });
      known = true;
    }
    if (/papeles/.test(t) || (/captura/.test(t) && /document/.test(t))) {
      cats = cats.filter(function (c) { return c !== "Capturas" && c !== "Documentos"; });
      cats.splice(2, 0, "Papeles");
      rules.push(function (f) { return f.d.f === "Capturas" || f.d.f === "Documentos" ? "Papeles" : null; });
      known = true;
    }
    return {
      cats: cats, known: known,
      assign: function (f) { for (var i = 0; i < rules.length; i++) { var v = rules[i](f); if (v) return v; } return f.d.f; }
    };
  }

  var demoE = new Esfera(demoCv, {
    mode: "batch", cx: 0.5, cy: 0.46, size: 1.25, dock: 44, ringSpeed: 0.018, rotSpeed: 0.3, seed: 5,
    dwell: function (f) { return f.d.e === "qwen" ? 0.8 : 0.24; },
    onInside: function (f, instant) { showLupa(f, instant); },
    onDock: function () { stats(); },
    onDone: function () { if (state === "sorting") finishSort(); },
    onNode: function (c) { if (state === "review" || state === "moved") openGallery(c); }
  });
  demoE.setCats(RING);
  var demoReady = demoE.load(FOTOS, BASE);

  function stats() {
    done = demoE.fotos.filter(function (f) { return f.st === "dock"; }).length;
    sDone.textContent = done;
    sFolders.textContent = demoE.cats.filter(function (c) { return c.n > 0; }).length;
    var d = demoE.cat("Duplicados");
    sDupes.textContent = d ? d.n : 0;
  }

  function showLupa(f, instant) {
    clearInterval(typing);
    lupaImg.innerHTML = '<img alt="" src="' + BASE + f.d.id + '.webp">';
    lupa.classList.remove("scan"); void lupa.offsetWidth; lupa.classList.add("scan");
    var target = f.target;
    var chips = '<span class="chip folder"><i data-lucide="folder"></i>' + target + "</span>";
    if (f.d.e === "qwen") {
      chips += '<span class="chip qwen"><i data-lucide="eye"></i>Qwen3.5</span>';
      if (instant) { cap.textContent = f.d.c; }
      else {
        var s = f.d.c, i = 0;
        cap.textContent = "";
        typing = setInterval(function () { i++; cap.textContent = s.slice(0, i); if (i >= s.length) clearInterval(typing); }, 26);
      }
    } else {
      chips += '<span class="chip"><i data-lucide="zap"></i>CLIP · ' + Math.round(f.d.p * 100) + " %</span>";
      cap.textContent = target === "Duplicados" ? "Copia exacta de otra foto." : target === "Vídeos" ? "Es un vídeo: va aparte." : "Evidente. CLIP la resolvió en milisegundos.";
    }
    verdict.innerHTML = chips;
    if (window.lucide) lucide.createIcons({ nameAttr: "data-lucide", root: verdict });
  }

  function startSort() {
    if (state === "sorting") return;
    var p = makePlan(instr.value);
    plan = p;
    closeSheet();
    if (demoE.busy() || demoE.fotos.some(function (f) { return f.st !== "slot"; })) {
      demoE.release();
    }
    demoE.setCats(p.cats);
    stats();
    state = "sorting";
    goBtn.disabled = true; moveBtn.hidden = true; undoBtn.hidden = true;
    $("#hint").textContent = p.known ? "Ordenando…" : "La demo reconoce algunas instrucciones. En la app, Qwen3.5 entiende las tuyas.";
    started = performance.now();
    clearInterval(teleTimer);
    var k = 0;
    teleTimer = setInterval(function () {
      k++;
      tUse.textContent = Math.round(71 + Math.abs(Math.sin(k * 0.7)) * 21) + "%";
      var secs = (performance.now() - started) / 1000;
      tRate.textContent = (done / Math.max(secs, 0.5)).toFixed(1) + "/s";
    }, 400);
    demoReady.then(function () { demoE.sort(p.assign); });
  }

  function finishSort() {
    state = "review";
    clearInterval(teleTimer);
    tUse.textContent = "4%";
    goBtn.disabled = false;
    moveBtn.hidden = false;
    $("#hint").textContent = "Toca una carpeta para ver sus fotos y cambiar las que quieras";
    cap.textContent = "Listo. Revisa las carpetas antes de mover.";
    verdict.innerHTML = "";
  }

  function closeSheet() { sheet.hidden = true; sheet.innerHTML = ""; sheet.className = ""; }
  function openSheet(html) {
    sheet.className = "sheet";
    sheet.innerHTML = '<div class="sheet-card" role="dialog" aria-modal="true">' + html + "</div>";
    sheet.hidden = false;
    if (window.lucide) lucide.createIcons({ root: sheet });
    var x = $(".x", sheet); if (x) x.addEventListener("click", closeSheet);
    var first = $("button, select", sheet); if (first) first.focus();
  }
  sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

  function openGallery(c) {
    var items = c.items.filter(function (f) { return f.st === "dock"; });
    var opts = demoE.cats.map(function (k) { return k.name; });
    var html = '<div class="sheet-head"><i data-lucide="folder-open" class="hi"></i><h3>' + c.name + ' <span class="mono hi">' + items.length + '</span></h3><button class="x" type="button" aria-label="Cerrar"><i data-lucide="x"></i></button></div><div class="gal">';
    items.forEach(function (f) {
      var label = f.d.e === "qwen" ? f.d.c : "CLIP · " + Math.round(f.d.p * 100) + " %";
      html += '<figure><img alt="" src="' + BASE + f.d.id + '.webp"><figcaption>' + label + '</figcaption><label class="sr-only" for="mv-' + f.i + '">Mover a</label><select id="mv-' + f.i + '" data-i="' + f.i + '">' +
        opts.map(function (o) { return '<option' + (o === c.name ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></figure>";
    });
    html += "</div>";
    openSheet(html);
    $$("select", sheet).forEach(function (s) {
      s.addEventListener("change", function () {
        var f = demoE.fotos[+s.dataset.i];
        demoE.move(f, s.value);
        closeSheet();
        setTimeout(stats, 1000);
      });
    });
  }

  $("#cmd").addEventListener("submit", function (e) { e.preventDefault(); startSort(); });
  $$(".preset").forEach(function (b) {
    b.addEventListener("click", function () {
      $$(".preset").forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
      instr.value = b.dataset.p;
      startSort();
    });
  });
  instr.addEventListener("input", function () { $$(".preset").forEach(function (o) { o.setAttribute("aria-pressed", o.dataset.p === instr.value ? "true" : "false"); }); });

  moveBtn.addEventListener("click", function () {
    var n = demoE.fotos.filter(function (f) { return f.st === "dock"; }).length;
    var folders = demoE.cats.filter(function (c) { return c.n > 0; }).length;
    openSheet('<div class="sheet-head"><i data-lucide="folder-input" class="hot"></i><h3>¿Mover ' + n + " fotos a " + folders + ' carpetas?</h3><button class="x" type="button" aria-label="Cerrar"><i data-lucide="x"></i></button></div>' +
      '<p class="lead">No se borra nada. Los duplicados van a su propia carpeta y puedes deshacerlo cuando quieras.</p>' +
      '<div class="sheet-actions"><button class="btn btn-hot" type="button" id="okMove"><i data-lucide="check"></i>Mover</button><button class="btn btn-ghost" type="button" id="noMove">Cancelar</button></div>');
    $("#noMove").addEventListener("click", closeSheet);
    $("#okMove").addEventListener("click", function () {
      state = "moved";
      openSheet('<div class="sheet-head"><i data-lucide="circle-check" class="hi"></i><h3>Listo. ' + n + ' fotos en su sitio.</h3><button class="x" type="button" aria-label="Cerrar"><i data-lucide="x"></i></button></div>' +
        '<p class="lead">0 archivos borrados. «Deshacer y repetir» devuelve cada foto a donde estaba, también días después.</p>' +
        '<div class="sheet-actions"><a class="btn btn-primary" href="#descargar"><i data-lucide="download"></i>Descargar gratis</a></div>');
      moveBtn.hidden = true; undoBtn.hidden = false;
      $("#hint").textContent = "Fotos movidas. Puedes deshacerlo.";
    });
  });

  undoBtn.addEventListener("click", function () {
    closeSheet();
    demoE.release();
    state = "idle"; stats();
    undoBtn.hidden = true; moveBtn.hidden = true; goBtn.disabled = false;
    cap.textContent = "Todo volvió a su sitio. Prueba otra instrucción.";
    verdict.innerHTML = "";
    $("#hint").textContent = "Toca una carpeta para ver sus fotos";
  });

  /* arranca solo la primera vez que la demo se ve */
  if (window.IntersectionObserver) {
    var auto = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting && state === "idle" && done === 0) { auto.disconnect(); setTimeout(startSort, 500); }
    }, { threshold: 0.45 });
    auto.observe(demoCv);
  }

  /* ── descargas: recomendar la edición correcta ─ */
  var hint = $("#archHint");
  function recommend(arch) {
    var card = $(arch === "arm64" ? "#dl-arm64" : "#dl-x64");
    card.classList.add("rec");
    var b = document.createElement("span");
    b.className = "rec-badge";
    b.innerHTML = '<i data-lucide="check"></i>Para tu PC';
    card.prepend(b);
    if (window.lucide) lucide.createIcons({ root: card });
    hint.textContent = arch === "arm64" ? "Tu PC parece ARM64 (Snapdragon o RTX Spark)." : "Tu PC parece x64 (Intel o AMD).";
  }
  var ua = navigator.userAgent;
  if (!/Windows/i.test(ua)) {
    hint.textContent = "GOGASORT es para Windows: descárgalo desde tu PC.";
  } else if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    navigator.userAgentData.getHighEntropyValues(["architecture", "bitness"]).then(function (v) {
      if (v.architecture === "arm") recommend("arm64");
      else if (v.architecture === "x86" && v.bitness === "64") recommend("x64");
    }).catch(function () {});
  }

  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var txt = b.dataset.copy;
      var ok = function () { var o = b.innerHTML; b.textContent = "Copiado"; setTimeout(function () { b.innerHTML = o; }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, function () {});
    });
  });
})();

/* luz que sigue al cursor en las tarjetas */
document.querySelectorAll(".spot").forEach(function (el) {
  var l = document.createElement("span"); l.className = "spot-l"; l.setAttribute("aria-hidden", "true"); el.appendChild(l);
  el.addEventListener("pointermove", function (e) {
    var r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (e.clientX - r.left) + "px"); el.style.setProperty("--my", (e.clientY - r.top) + "px");
  });
});
