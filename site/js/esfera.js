/* Esfera de fotos: el corazón visual de FotoSort.
   Un globo hecho de miniaturas gira en 3D con un núcleo de luz dentro. Las fotos se
   desprenden del globo y salen disparadas, con una estela, hacia su carpeta: paneles
   holográficos que orbitan alrededor.
   · modo "stream" (portada): flujo constante; llegan fotos nuevas que rellenan el globo.
   · modo "batch" (demo): el globo son las fotos del visitante; al ordenar se vacía y
     «Deshacer» lo vuelve a armar.
   Canvas 2D, sin dependencias. */
(function () {
  "use strict";
  var TAU = Math.PI * 2;
  var CYAN = "52,132,255", ICE = "150,205,255", DEEP = "22,80,232", AMBER = "255,179,92";
  var E = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back: function (t) { var c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function bez(p0, p1, p2, t) { var u = 1 - t; return u * u * p0 + 2 * u * t * p1 + t * t * p2; }
  function prng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
  function val(v, a) { return typeof v === "function" ? v(a) : v; }

  function Esfera(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.o = Object.assign({
      cx: 0.5, cy: 0.5, size: 1, avoidLeft: 0, mode: "batch", slots: 0, dock: 44, ringSpeed: 0.03, rotSpeed: 0.22,
      rate: 4.5, dwell: function () { return 0.4; }, onInside: null, onDock: null, onDone: null, onNode: null, seed: 7
    }, opts || {});
    this.rnd = prng(this.o.seed);
    this.fotos = [];
    this.pool = [];
    this.slots = [];
    this.cats = [];
    this.pulses = [];
    this.dust = [];
    this.time = 0; this.ring = 0; this.rot = 0; this.energy = 0; this.acc = 0;
    this.sorting = false; this.nextPull = 0; this.inspecting = null; this.doneFired = true;
    this.visible = true; this.hoverNode = null; this.running = false;
    this.reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (var i = 0; i < 80; i++) this.dust.push({ x: this.rnd(), y: this.rnd(), z: this.rnd(), s: 0.4 + this.rnd() * 1.1, v: 0.004 + this.rnd() * 0.01 });
    this._loop = this._loop.bind(this);
    var self = this;
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(canvas);
    else window.addEventListener("resize", function () { self.resize(); });
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; if (self.visible) self.start(); }, { threshold: 0.01 }).observe(canvas);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) self.start(); });
    if (this.o.onNode) {
      canvas.addEventListener("click", function (ev) { var c = self._hit(ev); if (c) self.o.onNode(c); });
      canvas.addEventListener("mousemove", function (ev) { var c = self._hit(ev); self.hoverNode = c; canvas.style.cursor = c ? "pointer" : "default"; });
      canvas.addEventListener("mouseleave", function () { self.hoverNode = null; });
    }
  }

  /* ── tamaño y geometría ──────────────────── */
  Esfera.prototype.resize = function () {
    var rect = this.cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, rect.width); this.H = Math.max(1, rect.height);
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cx = this.W * val(this.o.cx, this.W), cy = this.H * val(this.o.cy, this.W);
    var avoid = val(this.o.avoidLeft) || 0;
    var R = Math.min(this.W, this.H) * 0.17 * this.o.size;
    var room = Math.min(this.W - cx - 70, cx - avoid - 24);
    var Rx = Math.min(room, R * 2.75);
    if (Rx < R * 2.05) R = Rx / 2.05;
    var Ry = Math.min(R * 1.42, this.H - cy - R * 0.2 - 64, cy - 70);
    this.cx = cx; this.cy = cy; this.avoid = avoid;
    this.R = Math.max(30, R); this.Rx = Math.max(this.R * 1.9, Rx); this.Ry = Math.max(this.R * 1.15, Ry);
    this.k = clamp(this.R / 130, 0.55, 1.2);
    this._tileSize();
    if (!this.running) this._draw();
  };

  Esfera.prototype._tileSize = function () {
    var n = Math.max(1, this.slots.length);
    this.ts = Math.sqrt(4 * Math.PI / n) * this.R * 0.9;
  };

  Esfera.prototype._makeSlots = function (n) {
    var ga = Math.PI * (3 - Math.sqrt(5));
    this.slots = [];
    for (var k = 0; k < n; k++) {
      var y = 1 - ((k + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), th = ga * k;
      this.slots.push({ v: [Math.cos(th) * r, y, Math.sin(th) * r], f: null, free: -9, res: false });
    }
    this._tileSize();
  };

  /* posición en pantalla (relativa al centro) de un punto del globo que gira */
  Esfera.prototype._sp = function (v) {
    var cr = Math.cos(this.rot), sr = Math.sin(this.rot), t = 0.32, ct = Math.cos(t), st = Math.sin(t);
    var x = v[0] * cr + v[2] * sr, z = -v[0] * sr + v[2] * cr;
    var y = v[1] * ct - z * st; z = v[1] * st + z * ct;
    var p = 1 + z * 0.1;
    return { x: x * this.R * p, y: y * this.R * p, z: z, nx: x, ny: y };
  };

  Esfera.prototype._nodePos = function (c) {
    var a = c.base + this.ring, d = Math.sin(a);
    return { x: Math.cos(a) * this.Rx, y: Math.sin(a) * this.Ry + this.R * 0.12, z: d, s: 0.74 + 0.26 * (d + 1) / 2 };
  };

  Esfera.prototype._dockPos = function (f) {
    var c = f.cat, np = this._nodePos(c), k = this.k * np.s;
    var vis = c.items.slice(-6), j = vis.indexOf(f); if (j < 0) j = 0;
    var big = this.o.dock * k;
    return { x: np.x + (j - (vis.length - 1) / 2) * big * 0.3, y: np.y - big * 0.62 - j * 1.4, z: np.z, size: big };
  };

  /* ── datos ────────────────────────────────── */
  Esfera.prototype.load = function (list, base) {
    var self = this;
    this.pool = list.map(function (d) {
      var img = new Image(); img.decoding = "async"; img.src = base + d.id + ".webp";
      return { d: d, img: img, im: null };
    });
    return Promise.all(this.pool.map(function (p) {
      return (p.img.decode ? p.img.decode() : new Promise(function (r) { p.img.onload = r; })).then(function () {
        var c = document.createElement("canvas"); c.width = c.height = 128;
        c.getContext("2d").drawImage(p.img, 0, 0, 128, 128);
        p.im = c;
      }).catch(function () {});
    })).then(function () {
      var n = self.o.mode === "stream" ? (self.o.slots || 90) : self.pool.length;
      self._makeSlots(n);
      self.fotos = [];
      for (var s = 0; s < n; s++) {
        var src = self.o.mode === "stream" ? self.pool[Math.floor(self.rnd() * self.pool.length)] : self.pool[s];
        var f = self._inst(src, s);
        self.slots[s].f = f;
        if (self.o.mode === "batch") self.fotos.push(f);
      }
      self.start();
      if (!self.running) self._draw();
    });
  };

  Esfera.prototype._inst = function (src, slot) {
    return { d: src.d, im: src.im, i: this.fotos.length, home: slot, slot: slot, st: "slot", x: 0, y: 0, z: 0, size: 0, trail: [], cat: null, target: src.d.f };
  };

  Esfera.prototype.setCats = function (names) {
    var old = {};
    this.cats.forEach(function (c) { old[c.name] = c; });
    var n = names.length;
    this.cats = names.map(function (name, i) {
      var c = old[name] || { name: name, flash: 0, n: 0, items: [] };
      c.base = (i / n) * TAU + Math.PI / 2;
      return c;
    });
    if (!this.running) this._draw();
  };

  Esfera.prototype.cat = function (name) {
    for (var i = 0; i < this.cats.length; i++) if (this.cats[i].name === name) return this.cats[i];
    return null;
  };

  /* ── control (demo) ──────────────────────── */
  Esfera.prototype.sort = function (assign) {
    this.assign = assign;
    this.fotos.forEach(function (f) { f.target = assign(f); });
    this.sorting = true; this.doneFired = false; this.nextPull = this.time + 0.2;
    this.start();
  };

  Esfera.prototype.release = function () {
    var self = this;
    this.sorting = false; this.inspecting = null;
    this.cats.forEach(function (c) { c.items = []; c.n = 0; });
    this.fotos.forEach(function (f) {
      if (f.st === "slot") return;
      f.cat = null; f.trail = [];
      self._join(f, f.home, f.x, f.y, f.z, f.size || self.ts, 0.9 + self.rnd() * 0.5);
    });
    this.energy = 1; this.pulses.push({ t: this.time, big: true });
    this.start();
  };

  Esfera.prototype.move = function (f, name) {
    var c = this.cat(name);
    if (!c || f.cat === c) return;
    this._undock(f);
    f.st = "hop"; f.t0 = this.time; f.dur = 0.9; f.sx = f.x; f.sy = f.y; f.sz = f.z; f.ss = f.size;
    f.cat = c; c.items.push(f); c.n = c.items.length; f.target = name; f.trail = [];
    this.start();
  };

  Esfera.prototype._undock = function (f) {
    if (!f.cat) return;
    var c = f.cat, i = c.items.indexOf(f);
    if (i >= 0) c.items.splice(i, 1);
    if (this.o.mode === "batch") c.n = c.items.length;
    f.cat = null;
  };

  Esfera.prototype.busy = function () {
    if (this.sorting) return true;
    for (var i = 0; i < this.fotos.length; i++) { var s = this.fotos[i].st; if (s !== "slot" && s !== "dock") return true; }
    return false;
  };

  Esfera.prototype.start = function () {
    if (this.running || !this.visible || document.hidden || !this.slots.length) return;
    if (this.reduce) { this._settle(); this._draw(); return; }
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  };

  /* movimiento reducido: estado final directo, sin animar */
  Esfera.prototype._settle = function () {
    var self = this;
    if (this.o.mode === "stream") {
      this.cats.forEach(function (c) {
        if (c.items.length) return;
        var from = self.pool.filter(function (p) { return p.d.f === c.name; }).slice(0, 4);
        from.forEach(function (p) { var f = self._inst(p, 0); f.st = "dock"; f.cat = c; c.items.push(f); });
        c.n = c.items.length;
      });
      return;
    }
    this.fotos.forEach(function (f) {
      if (self.sorting && f.st === "slot") {
        var c = self.cat(f.target); self.slots[f.slot].f = null;
        f.st = "dock"; f.cat = c; c.items.push(f); c.n = c.items.length;
        if (self.o.onInside) self.o.onInside(f, true);
        if (self.o.onDock) self.o.onDock(f, c);
      } else if (f.st === "join") { f.st = "slot"; self.slots[f.slot].f = f; }
      else if (f.st === "hop") { f.st = "dock"; }
    });
    if (this.sorting) { this.sorting = false; if (this.o.onDone) this.o.onDone(); }
  };

  Esfera.prototype._loop = function (now) {
    var dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible || document.hidden) { this.running = false; return; }
    this._step(dt);
    this._draw();
    requestAnimationFrame(this._loop);
  };

  /* ── movimientos ─────────────────────────── */
  Esfera.prototype._join = function (f, slot, x, y, z, size, dur) {
    f.st = "join"; f.slot = slot; f.t0 = this.time; f.dur = dur; f.sx = x; f.sy = y; f.sz = z; f.ss = size;
    var a = Math.atan2(y, x) + (this.rnd() - 0.5);
    f.c1x = x * 0.35 + Math.cos(a + 1.2) * this.R * 0.8; f.c1y = y * 0.35 + Math.sin(a + 1.2) * this.R * 0.8;
    this.slots[slot].res = true;
  };

  Esfera.prototype._launch = function (f, fromX, fromY, fromZ, fromSize) {
    var c = this.cat(f.target) || this.cats[this.cats.length - 1];
    f.st = "out"; f.t0 = this.time; f.dur = 0.95; f.cat = c; c.items.push(f);
    if (this.o.mode === "stream" && c.items.length > 8) c.items.shift();
    f.sx = fromX; f.sy = fromY; f.sz = fromZ; f.ss = fromSize; f.trail = [];
    var np = this._nodePos(c), len = Math.hypot(np.x - fromX, np.y - fromY) || 1;
    var dx = (np.x - fromX) / len, dy = (np.y - fromY) / len;
    var side = this.rnd() > 0.5 ? 1 : -1;
    f.c1x = (fromX + np.x) / 2 - dy * len * 0.32 * side + fromX * 0.35;
    f.c1y = (fromY + np.y) / 2 + dx * len * 0.32 * side + fromY * 0.35;
    this.pulses.push({ t: this.time, ray: Math.atan2(fromY, fromX) });
  };

  Esfera.prototype._step = function (dt) {
    var self = this, t = (this.time += dt), o = this.o;
    this.rot += dt * o.rotSpeed;
    this.ring += dt * o.ringSpeed * (this.hoverNode ? 0.12 : 1);
    this.energy = Math.max(0, this.energy - dt * 1.4);
    this.cats.forEach(function (c) { c.flash = Math.max(0, c.flash - dt * 2.2); });
    this.pulses = this.pulses.filter(function (p) { return t - p.t < 1.2; });

    if (o.mode === "stream") {
      this.acc += dt * o.rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        /* sale una foto del frente del globo */
        var front = [];
        for (var i = 0; i < this.slots.length; i++) {
          var sl = this.slots[i];
          if (sl.f && sl.f.st === "slot") { var p = this._sp(sl.v); if (p.z > 0.3) front.push([sl, p]); }
        }
        if (front.length) {
          var pick = front[Math.floor(this.rnd() * front.length)], f = pick[0].f;
          pick[0].f = null; pick[0].free = t;
          f.target = f.d.f;
          this._launch(f, pick[1].x, pick[1].y, pick[1].z, this.ts);
          this.fotos.push(f);
        }
        /* llega una foto nueva desde fuera y rellena un hueco */
        var empty = this.slots.filter(function (s) { return !s.f && !s.res && t - s.free > 0.5; });
        if (empty.length) {
          var slot = empty[Math.floor(this.rnd() * empty.length)], idx = this.slots.indexOf(slot);
          var src = this.pool[Math.floor(this.rnd() * this.pool.length)];
          var g = this._inst(src, idx);
          var ang = this.rnd() * TAU, dist = Math.max(this.W, this.H) * 0.62;
          var sx = clamp(Math.cos(ang) * dist, this.avoid - this.cx + 10, this.W - this.cx + 40);
          var sy = Math.sin(ang) * dist * 0.7;
          this._join(g, idx, sx, sy, -0.2, this.ts * 0.7, 1.5 + this.rnd() * 0.6);
          this.fotos.push(g);
        }
      }
    } else if (this.sorting && !this.inspecting && t >= this.nextPull) {
      /* demo: la foto más al frente sale del globo y pasa por la lupa */
      var best = null, bp = null;
      for (var j = 0; j < this.slots.length; j++) {
        var s2 = this.slots[j];
        if (s2.f && s2.f.st === "slot") { var q = this._sp(s2.v); if (!bp || q.z > bp.z) { best = s2; bp = q; } }
      }
      if (best) {
        var h = best.f; best.f = null; best.free = t;
        if (this.assign) h.target = this.assign(h);
        h.st = "pull"; h.t0 = t; h.dur = 0.42; h.sx = bp.x; h.sy = bp.y; h.sz = bp.z; h.ss = this.ts;
        this.inspecting = h;
      } else if (!this.fotos.some(function (f) { return f.st === "join"; })) {
        this.sorting = false;
      }
    }

    var settled = true;
    this.fotos = this.fotos.filter(function (f) { return !(o.mode === "stream" && f.st === "gone"); });
    this.fotos.forEach(function (f) {
      var p, e;
      switch (f.st) {
        case "slot": break;
        case "pull":
          settled = false;
          p = clamp((t - f.t0) / f.dur, 0, 1); e = E.out(p);
          f.x = lerp(f.sx, 0, e); f.y = lerp(f.sy, 0, e); f.z = lerp(f.sz, 1.4, e); f.size = lerp(f.ss, self.ts * 2.1, E.back(p));
          if (p >= 1) {
            f.st = "inspect"; f.t0 = t; f.dw = o.dwell(f); self.energy = 1; self.pulses.push({ t: t });
            if (o.onInside) o.onInside(f, false);
          }
          break;
        case "inspect":
          settled = false;
          f.x = 0; f.y = Math.sin((t - f.t0) * 3) * 2; f.z = 1.4; f.size = self.ts * 2.1;
          if (t - f.t0 >= f.dw) {
            self._launch(f, f.x, f.y, f.z, f.size);
            self.inspecting = null; self.nextPull = t + 0.04;
          }
          break;
        case "out":
        case "hop":
          settled = false;
          p = clamp((t - f.t0) / f.dur, 0, 1); e = E.out(p);
          var dp = self._dockPos(f);
          if (f.st === "out") { f.x = bez(f.sx, f.c1x, dp.x, e); f.y = bez(f.sy, f.c1y, dp.y, e); }
          else { var my = Math.min(f.sy, dp.y) - self.R; f.x = bez(f.sx, (f.sx + dp.x) / 2, dp.x, e); f.y = bez(f.sy, my, dp.y, e); }
          f.z = lerp(f.sz, dp.z, e); f.size = lerp(f.ss, dp.size, e);
          f.trail.push([f.x, f.y]); if (f.trail.length > 16) f.trail.shift();
          if (p >= 1) {
            f.trail = [];
            if (f.cat.items.indexOf(f) < 0) { f.st = "gone"; break; } /* ya salió de la pila visible */
            f.st = "dock"; f.cat.flash = 1;
            if (o.mode === "stream") f.cat.n++; else f.cat.n = f.cat.items.length;
            if (o.onDock) o.onDock(f, f.cat);
          }
          break;
        case "join":
          settled = false;
          p = clamp((t - f.t0) / f.dur, 0, 1); e = E.inOut(p);
          var sp = self._sp(self.slots[f.slot].v);
          f.x = bez(f.sx, f.c1x, sp.x, e); f.y = bez(f.sy, f.c1y, sp.y, e); f.z = lerp(f.sz, sp.z, e); f.size = lerp(f.ss, self.ts, e);
          if (p >= 1) { f.st = "slot"; self.slots[f.slot].f = f; self.slots[f.slot].res = false; }
          break;
        case "dock":
          var dq = self._dockPos(f); f.x = dq.x; f.y = dq.y; f.z = dq.z; f.size = dq.size;
          break;
      }
    });
    if (o.mode === "stream") {
      /* las que ya no se ven en la pila dejan de existir */
      this.fotos = this.fotos.filter(function (f) { return f.st !== "dock" || f.cat.items.indexOf(f) >= 0; });
    } else if (!this.sorting && settled && !this.doneFired) {
      this.doneFired = true;
      if (o.onDone) o.onDone();
    }
  };

  /* ── dibujo ──────────────────────────────── */
  Esfera.prototype._draw = function () {
    var x = this.ctx, self = this;
    x.clearRect(0, 0, this.W, this.H);
    this._floor();
    this._dust();
    if (!this.slots.length) return;
    var nodes = this.cats.map(function (c) { var p = self._nodePos(c); p.c = c; return p; }).sort(function (a, b) { return a.z - b.z; });
    var flying = this.fotos.filter(function (f) { return f.st !== "slot" && f.st !== "dock" && f.st !== "gone"; });
    this._ringPath();
    nodes.filter(function (n) { return n.z < 0; }).forEach(function (n) { self._node(n); });
    flying.filter(function (f) { return f.st === "join" && f.z < 0; }).forEach(function (f) { self._flyer(f); });
    this._globe();
    this._trails();
    nodes.filter(function (n) { return n.z >= 0; }).forEach(function (n) { self._node(n); });
    flying.filter(function (f) { return !(f.st === "join" && f.z < 0); }).sort(function (a, b) { return a.z - b.z; }).forEach(function (f) { self._flyer(f); });
  };

  Esfera.prototype._floor = function () {
    var x = this.ctx, W = this.W, H = this.H, cx = this.cx, top = this.cy + this.Ry + this.R * 0.5;
    if (top > H - 20) return;
    x.save();
    var g = x.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, "rgba(" + CYAN + ",0)"); g.addColorStop(0.4, "rgba(" + CYAN + ",0.09)"); g.addColorStop(1, "rgba(" + CYAN + ",0.02)");
    x.strokeStyle = g; x.lineWidth = 1;
    var vy = this.cy - this.R * 0.5;
    for (var i = -14; i <= 14; i++) {
      var bx = cx + i * 90, tx = lerp(cx, bx, (top - vy) / (H - vy));
      x.beginPath(); x.moveTo(tx, top); x.lineTo(bx + (bx - cx) * 0.6, H); x.stroke();
    }
    var off = (this.time * 0.25) % 1;
    for (var j = 0; j < 9; j++) { var u = (j + off) / 9, y = top + (H - top) * u * u; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    x.restore();
  };

  Esfera.prototype._dust = function () {
    var x = this.ctx, W = this.W, H = this.H, t = this.time;
    for (var i = 0; i < this.dust.length; i++) {
      var d = this.dust[i], px = ((d.x + t * d.v * 0.3) % 1) * W, py = (((d.y - t * d.v) % 1) + 1) % 1 * H;
      x.fillStyle = "rgba(" + ICE + "," + (0.1 + d.z * 0.32) + ")";
      x.beginPath(); x.arc(px, py, d.s, 0, TAU); x.fill();
    }
  };

  Esfera.prototype._ringPath = function () {
    var x = this.ctx;
    x.save(); x.translate(this.cx, this.cy + this.R * 0.12);
    x.strokeStyle = "rgba(" + CYAN + ",0.12)"; x.lineWidth = 1; x.setLineDash([2, 7]);
    x.beginPath(); x.ellipse(0, 0, this.Rx, this.Ry, 0, 0, TAU); x.stroke();
    x.restore();
  };

  /* una miniatura pegada al globo, inclinada según hacia dónde mira */
  Esfera.prototype._tile = function (im, p, size, front) {
    var x = this.ctx, z = p.z, sq = Math.max(0.06, Math.abs(z)), phi = Math.atan2(p.ny, p.nx);
    x.save();
    x.translate(this.cx + p.x, this.cy + p.y);
    x.rotate(phi); x.scale(sq, 1); x.rotate(-phi);
    var h = size / 2;
    if (front) {
      x.globalAlpha = 0.55 + 0.45 * z;
      x.drawImage(im, -h, -h, size, size);
      /* luz: más oscuro en los bordes del globo, brillo arriba a la izquierda */
      var shade = (1 - z) * 0.62 - Math.max(0, -p.ny * 0.2 - p.nx * 0.12);
      if (shade > 0) { x.fillStyle = "rgba(1,6,24," + shade + ")"; x.fillRect(-h, -h, size, size); }
      var band = Math.exp(-Math.pow((p.ny - Math.sin(this.time * 0.9) * 0.9) * 4, 2)) * 0.28;
      x.fillStyle = "rgba(" + CYAN + "," + (0.05 + band) + ")"; x.fillRect(-h, -h, size, size);
      x.globalAlpha = 1;
      x.strokeStyle = "rgba(" + ICE + "," + (0.25 + 0.5 * z + band) + ")"; x.lineWidth = 1 / sq > 3 ? 0.4 : 0.9;
      x.strokeRect(-h, -h, size, size);
    } else {
      x.globalAlpha = 0.16 * sq + 0.04;
      x.drawImage(im, -h, -h, size, size);
      x.globalAlpha = 0.5; x.fillStyle = "rgba(" + DEEP + ",0.35)"; x.fillRect(-h, -h, size, size);
    }
    x.restore();
  };

  Esfera.prototype._globe = function () {
    var x = this.ctx, R = this.R, t = this.time, en = this.energy, cx = this.cx, cy = this.cy, self = this;
    /* resplandor exterior */
    x.save(); x.translate(cx, cy);
    var g = x.createRadialGradient(0, 0, R * 0.5, 0, 0, R * (2.5 + en * 0.4));
    g.addColorStop(0, "rgba(" + DEEP + "," + (0.38 + en * 0.2) + ")"); g.addColorStop(0.45, "rgba(" + DEEP + ",0.10)"); g.addColorStop(1, "rgba(" + DEEP + ",0)");
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, R * 3, 0, TAU); x.fill();
    /* anillos HUD */
    x.strokeStyle = "rgba(" + CYAN + ",0.2)"; x.lineWidth = 1;
    x.beginPath(); x.arc(0, 0, R * 1.24, 0, TAU); x.stroke();
    x.save(); x.rotate(t * 0.12);
    for (var k = 0; k < 90; k++) {
      var a = k / 90 * TAU, l = k % 6 === 0 ? 8 : 3;
      x.strokeStyle = "rgba(" + CYAN + "," + (k % 6 === 0 ? 0.5 : 0.2) + ")";
      x.beginPath(); x.moveTo(Math.cos(a) * R * 1.24, Math.sin(a) * R * 1.24); x.lineTo(Math.cos(a) * (R * 1.24 + l), Math.sin(a) * (R * 1.24 + l)); x.stroke();
    }
    x.restore();
    x.save(); x.rotate(-t * 0.2);
    x.lineWidth = 2;
    x.strokeStyle = "rgba(" + ICE + ",0.55)"; x.beginPath(); x.arc(0, 0, R * 1.4, 0, 0.75); x.stroke();
    x.beginPath(); x.arc(0, 0, R * 1.4, Math.PI, Math.PI + 0.4); x.stroke();
    x.strokeStyle = "rgba(" + AMBER + ",0.6)"; x.beginPath(); x.arc(0, 0, R * 1.4, 2.1, 2.45); x.stroke();
    x.restore();
    /* pulsos */
    this.pulses.forEach(function (p) {
      var u = (t - p.t) / 1.2;
      if (p.ray !== undefined) {
        x.save(); x.rotate(p.ray);
        var bg = x.createLinearGradient(R * 0.2, 0, R * 1.9, 0);
        bg.addColorStop(0, "rgba(" + ICE + "," + 0.5 * (1 - u) + ")"); bg.addColorStop(1, "rgba(" + ICE + ",0)");
        x.fillStyle = bg; x.beginPath(); x.moveTo(R * 0.2, -2.5 * (1 - u)); x.lineTo(R * 1.9, 0); x.lineTo(R * 0.2, 2.5 * (1 - u)); x.fill();
        x.restore();
      } else {
        x.strokeStyle = "rgba(" + (p.big ? AMBER : CYAN) + "," + 0.55 * (1 - u) * (1 - u) + ")";
        x.lineWidth = 1.5 + (1 - u) * 2;
        x.beginPath(); x.arc(0, 0, R * (1.03 + E.out(u) * (p.big ? 2.2 : 1.1)), 0, TAU); x.stroke();
      }
    });
    x.restore();

    /* fotos de la cara de atrás (se ven a través del globo) */
    var pts = [];
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (!s.f || s.f.st !== "slot" || !s.f.im) continue;
      pts.push([s, this._sp(s.v)]);
    }
    pts.sort(function (a, b) { return a[1].z - b[1].z; });
    pts.forEach(function (q) { if (q[1].z < 0) self._tile(q[0].f.im, q[1], self.ts, false); });

    /* núcleo de luz, visible entre las fotos */
    x.save(); x.translate(cx, cy);
    var core = R * (0.62 + Math.sin(t * 2) * 0.03 + en * 0.12);
    var cg = x.createRadialGradient(0, 0, 0, 0, 0, core);
    cg.addColorStop(0, "rgba(255,255,255,0.95)"); cg.addColorStop(0.25, "rgba(" + ICE + ",0.8)"); cg.addColorStop(0.6, "rgba(" + CYAN + ",0.28)"); cg.addColorStop(1, "rgba(" + CYAN + ",0)");
    x.fillStyle = cg; x.beginPath(); x.arc(0, 0, core, 0, TAU); x.fill();
    x.restore();
    /* órbita de atrás */
    this._orbit(R * 1.62, R * 0.55, -0.42, CYAN, t * 0.9, 2.4, true);
    this._orbit(R * 1.5, R * 0.46, 0.66, AMBER, -t * 0.7 + 2, 2, true);

    /* fotos del frente */
    pts.forEach(function (q) { if (q[1].z >= 0) self._tile(q[0].f.im, q[1], self.ts, true); });

    /* borde de cristal y órbitas de delante */
    x.save(); x.translate(cx, cy);
    var rim = x.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, "rgba(" + ICE + ",0.7)"); rim.addColorStop(0.5, "rgba(" + CYAN + ",0.12)"); rim.addColorStop(1, "rgba(" + CYAN + ",0.45)");
    x.strokeStyle = rim; x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, R * 1.04, 0, TAU); x.stroke();
    x.restore();
    this._orbit(R * 1.62, R * 0.55, -0.42, CYAN, t * 0.9, 2.4, false);
    this._orbit(R * 1.5, R * 0.46, 0.66, AMBER, -t * 0.7 + 2, 2, false);
  };

  /* órbitas del logo: la mitad de atrás pasa por detrás del globo */
  Esfera.prototype._orbit = function (rx, ry, rot, col, ph, w, backHalf) {
    var x = this.ctx;
    x.save(); x.translate(this.cx, this.cy); x.rotate(rot);
    var a0 = backHalf ? Math.PI : 0, a1 = backHalf ? TAU : Math.PI;
    x.strokeStyle = "rgba(" + col + "," + (backHalf ? 0.05 : 0.12) + ")"; x.lineWidth = w * 4;
    x.beginPath(); x.ellipse(0, 0, rx, ry, 0, a0, a1); x.stroke();
    x.strokeStyle = "rgba(" + col + "," + (backHalf ? 0.35 : 0.9) + ")"; x.lineWidth = w * 0.7;
    x.beginPath(); x.ellipse(0, 0, rx, ry, 0, a0, a1); x.stroke();
    var pa = ((ph % TAU) + TAU) % TAU, isBack = pa > Math.PI;
    if (isBack === backHalf) {
      var sx = Math.cos(pa) * rx, sy = Math.sin(pa) * ry;
      var sg = x.createRadialGradient(sx, sy, 0, sx, sy, 12);
      sg.addColorStop(0, "rgba(255,255,255," + (backHalf ? 0.5 : 1) + ")"); sg.addColorStop(0.35, "rgba(" + col + ",0.9)"); sg.addColorStop(1, "rgba(" + col + ",0)");
      x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, 12, 0, TAU); x.fill();
    }
    x.restore();
  };

  Esfera.prototype._trails = function () {
    var x = this.ctx, cx = this.cx, cy = this.cy;
    x.save(); x.globalCompositeOperation = "lighter"; x.lineCap = "round";
    this.fotos.forEach(function (f) {
      var tr = f.trail;
      if (!tr || tr.length < 2) return;
      var col = f.target === "Duplicados" ? AMBER : CYAN;
      for (var i = 1; i < tr.length; i++) {
        var u = i / tr.length;
        x.strokeStyle = "rgba(" + col + "," + 0.5 * u + ")"; x.lineWidth = 0.6 + u * 4;
        x.beginPath(); x.moveTo(cx + tr[i - 1][0], cy + tr[i - 1][1]); x.lineTo(cx + tr[i][0], cy + tr[i][1]); x.stroke();
      }
    });
    x.restore();
  };

  /* foto en vuelo (o apilada en su carpeta): plana, con brillo */
  Esfera.prototype._flyer = function (f, alphaMul) {
    if (!f.im) return;
    var x = this.ctx, size = f.size || this.ts;
    if (size < 3) return;
    var px = this.cx + f.x, py = this.cy + f.y, h = size / 2;
    x.save();
    x.globalAlpha = alphaMul === undefined ? 1 : alphaMul;
    if (f.st === "join") x.globalAlpha *= 0.55 + 0.45 * clamp((this.time - f.t0) / f.dur * 2, 0, 1);
    x.translate(px, py);
    if (f.st === "dock") x.rotate((f.home % 3 - 1) * 0.05);
    if (f.st === "inspect" || f.st === "pull") {
      var gl = x.createRadialGradient(0, 0, h * 0.6, 0, 0, h * 1.8);
      gl.addColorStop(0, "rgba(" + CYAN + ",0.45)"); gl.addColorStop(1, "rgba(" + CYAN + ",0)");
      x.fillStyle = gl; x.fillRect(-h * 1.8, -h * 1.8, h * 3.6, h * 3.6);
    } else {
      x.fillStyle = "rgba(" + CYAN + ",0.16)"; x.fillRect(-h - 3, -h - 3, size + 6, size + 6);
    }
    x.drawImage(f.im, -h, -h, size, size);
    x.strokeStyle = "rgba(" + ICE + ",0.9)"; x.lineWidth = 1;
    x.strokeRect(-h, -h, size, size);
    if (f.st === "inspect") {
      /* escáner que recorre la foto */
      var u = ((this.time - f.t0) * 1.6) % 1, yy = -h + u * size;
      x.fillStyle = "rgba(" + ICE + ",0.9)"; x.fillRect(-h, yy - 1, size, 2);
      x.fillStyle = "rgba(" + CYAN + ",0.16)"; x.fillRect(-h, -h, size, yy + h);
      var c = 10;
      x.strokeStyle = "rgba(" + AMBER + ",1)"; x.lineWidth = 2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
        var ex = s[0] * (h + 6), ey = s[1] * (h + 6);
        x.beginPath(); x.moveTo(ex, ey - s[1] * -c); x.lineTo(ex, ey); x.lineTo(ex - s[0] * c, ey); x.stroke();
      });
    }
    x.restore();
  };

  Esfera.prototype._node = function (n) {
    var x = this.ctx, c = n.c, k = this.k * n.s, self = this;
    var px = this.cx + n.x, py = this.cy + n.y;
    var a = 0.42 + 0.58 * (n.z + 1) / 2;
    var col = c.name === "Duplicados" ? AMBER : CYAN;
    var dockS = this.o.dock * k, bw = dockS * 1.9, bh = dockS * 0.42;
    x.save(); x.globalAlpha = a;
    var g = x.createRadialGradient(px, py + 2, 0, px, py + 2, bw * 0.75);
    g.addColorStop(0, "rgba(" + col + "," + (0.26 + c.flash * 0.5) + ")"); g.addColorStop(1, "rgba(" + col + ",0)");
    x.fillStyle = g; x.beginPath(); x.ellipse(px, py + 2, bw * 0.75, bh * 0.75, 0, 0, TAU); x.fill();
    x.strokeStyle = "rgba(" + col + "," + (0.45 + c.flash * 0.5) + ")"; x.lineWidth = 1;
    x.beginPath(); x.ellipse(px, py + 2, bw * 0.5, bh * 0.45, 0, 0, TAU); x.stroke();
    if (c.flash > 0) {
      x.strokeStyle = "rgba(" + col + "," + c.flash * 0.8 + ")";
      x.beginPath(); x.ellipse(px, py + 2, bw * (0.5 + (1 - c.flash) * 0.6), bh * (0.45 + (1 - c.flash) * 0.5), 0, 0, TAU); x.stroke();
    }
    x.restore();
    c.items.slice(-6).forEach(function (f) { if (f.st === "dock") self._flyer(f, a); });
    var fs = Math.max(11, 13.5 * k);
    x.save(); x.globalAlpha = Math.max(a, 0.6);
    x.font = "600 " + fs + "px Geist, system-ui, sans-serif";
    var tw = x.measureText(c.name).width, num = String(c.n || 0);
    x.font = "600 " + fs + "px 'Geist Mono', monospace";
    var nw = x.measureText(num).width;
    var pw = tw + nw + 34 * k + 8, ph = fs * 2;
    var lx = px - pw / 2, ly = py + bh * 0.65 + 4, hov = this.hoverNode === c;
    x.fillStyle = hov ? "rgba(12,40,110,0.96)" : "rgba(3,12,40,0.86)";
    x.strokeStyle = "rgba(" + col + "," + (hov ? 0.95 : 0.4 + c.flash * 0.6) + ")"; x.lineWidth = 1;
    x.beginPath(); x.roundRect(lx, ly, pw, ph, ph / 2); x.fill(); x.stroke();
    x.textBaseline = "middle";
    x.font = "600 " + fs + "px Geist, system-ui, sans-serif"; x.fillStyle = "rgba(232,241,255,0.96)";
    x.fillText(c.name, lx + 12 * k + 3, ly + ph / 2 + 0.5);
    x.font = "600 " + fs + "px 'Geist Mono', monospace"; x.fillStyle = "rgba(" + col + ",1)";
    x.fillText(num, lx + pw - nw - 12 * k - 3, ly + ph / 2 + 0.5);
    x.restore();
    c._hit = { x: lx - 6, y: py - dockS * 1.3, w: pw + 12, h: ly + ph - (py - dockS * 1.3) + 4 };
  };

  Esfera.prototype._hit = function (ev) {
    var r = this.cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    for (var i = 0; i < this.cats.length; i++) {
      var h = this.cats[i]._hit;
      if (h && this.cats[i].items.length && mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return this.cats[i];
    }
    return null;
  };

  window.Esfera = Esfera;
})();
