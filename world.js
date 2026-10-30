/* EduStrike - the arena.
   One compact low-poly map, built from boxes. All the solid boxes are merged into
   ONE mesh (one draw call) so even weak school laptops can draw it quickly.
   This file also holds the "physics": collisions, ray tests (for blasters),
   and a simple path-finding grid so bots can walk around walls. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const T = window.THREE;

  const HALF = 30;       // arena is 60 x 60 metres (Capture the Flag: 60 wide and 90 long, see opts.ctf)
  const STEP = 0.25;     // how high a player can step up onto a low crate
  const LOW = 1.25;      // boxes this low can be hopped onto

  /* The maps the teacher can choose from (more are added stage by stage). All share the same size, bases and spawn points. */
  ES.MAPS_LIST = [
    { id: 'park', name: '🌳 Classic Park', desc: 'Open grass, walls and towers' },
    { id: 'rooftops', name: '🏙️ City Rooftops', desc: 'Buildings with stairs - fight from the roofs!' },
    { id: 'castle', name: '🏰 Castle', desc: 'Stone walls, a big keep and towers to climb' },
    { id: 'jungle', name: '🌴 Jungle Ruins', desc: 'Old temple, mossy walls and thick trees' },
    { id: 'space', name: '🚀 Space Station', desc: 'Metal decks, glowing lights and a night sky' },
    { id: 'snow', name: '❄️ Snowy Village', desc: 'Snow cabins, ice and falling snow' },
    { id: 'underwater', name: '🌊 Underwater Base', desc: 'A sunken ship, coral and floaty swimming' }
  ];
  /* sky + light colours for the maps that are not a sunny day (the other maps use the normal blue sky) */
  ES.MAP_SKY = {
    space:  { top: '#02030d', mid: '#0a1030', bot: '#1d2a5a', fog: 0x0c1330, hemiSky: 0x9fb4ff, hemiGround: 0x2a3050, sun: 0xcfd8ff, stars: true, trees: false },
    jungle: { top: '#6fc4a8', mid: '#b9e6c2', bot: '#e6f4d0', fog: 0xbfe0b8, hemiSky: 0xf2ffe0, hemiGround: 0x4f7a3d, sun: 0xfff0c0 },
    snow:   { top: '#9db9d2', mid: '#d3e1ee', bot: '#f2f7fb', fog: 0xe4eef6, hemiSky: 0xeaf2ff, hemiGround: 0xaab8c8, sun: 0xfff3e6 },
    underwater: { top: '#0a4a7c', mid: '#1b80b2', bot: '#52c6da', fog: 0x1b7fa8, fogNear: 12, fogFar: 62, hemiSky: 0xa6e6ff, hemiGround: 0x1a6a8a, sun: 0xcff6ff }
  };

  /* What makes each map special (the "map effect"). Everything is optional and cheap:
       kind  = which little floating particles are drawn (one single Points object, a few dozen dots)
       gravity / jump / speed = multipliers for YOUR player (1 = normal)      accel = how fast you start/stop on the ground (14 = normal, small = slippery)
       air   = extra jumps in the air (double jump)      glide = hold Space while falling to float down slowly
       text  = the tip shown at the start of the match.  Bots are not affected (they just walk), so it never changes who is winning unfairly. */
  ES.MAP_FX = {
    park:       { icon: '🦋', title: 'Bouncy Grass',   kind: 'petals',    n: 90,  jump: 1.25, text: '🦋 Bouncy Grass: the soft grass makes you jump higher!' },
    rooftops:   { icon: '💨', title: 'City Rush',      kind: 'wind',      n: 80,  speed: 1.1,  text: '💨 City Rush: the wind pushes you - you run a little faster!' },
    castle:     { icon: '🦘', title: "Knight's Leap",  kind: 'embers',    n: 70,  air: 1,       text: "🦘 Knight's Leap: press Space again in the air for a DOUBLE JUMP!" },
    jungle:     { icon: '🍃', title: 'Leaf Glide',     kind: 'fireflies', n: 80,  glide: true,   text: '🍃 Leaf Glide: hold Space while you fall to float down slowly!' },
    space:      { icon: '🌌', title: 'Low Gravity',    kind: 'stardust',  n: 90,  gravity: 0.38, text: '🌌 Low Gravity: you jump super high and float down!' },
    snow:       { icon: '❄️', title: 'Slippery Ice',   kind: 'snow',      n: 160, accel: 2.6,    text: '❄️ Slippery Ice: you slide when you stop - plan your moves!' },
    underwater: { icon: '🫧', title: 'Swim Mode',      kind: 'bubbles',   n: 110, gravity: 0.55, speed: 0.93, accel: 7, text: '🫧 Swim Mode: you float and swim - jumps are slow and long!' }
  };
  ES.mapName = function (id) { const m = ES.MAPS_LIST.filter(function (x) { return x.id === id; })[0]; return m ? m.name : ES.MAPS_LIST[0].name; };

  /* opts.map      = which map to build (see ES.MAPS_LIST)
     opts.fancy    = prettier look (cartoon shading, windows, round trees, flowers, hills, clouds) for strong computers
     opts.noVisual = build only the collision/path-finding part (used by the teacher's page, which draws nothing) */
  /* Surface detail made by code: a small grey "grain" picture (concrete / plaster / wood feel) that repeats everywhere.
     It is multiplied with the wall colours, so one tiny texture gives every wall, crate and roof a real surface. */
  ES.detailTexture = function (T) {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d');
    let seed = 12345; const rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    c.fillStyle = '#e4e4e4'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {                                    // soft blotches (stains, weathering), wrapped so the tile has no seams
      const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 26, dark = rnd() < 0.6, a = 0.025 + rnd() * 0.05;
      [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]].forEach(function (o) {
        const g = c.createRadialGradient(x + o[0], y + o[1], 0, x + o[0], y + o[1], r);
        g.addColorStop(0, (dark ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x + o[0] - r, y + o[1] - r, r * 2, r * 2);
      });
    }
    const im = c.getImageData(0, 0, S, S), d = im.data;                // very fine grain on top
    for (let i = 0; i < S * S; i++) { const n = (rnd() - 0.5) * 14; d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n; }
    c.putImageData(im, 0, 0);
    c.fillStyle = 'rgba(0,0,0,.12)';                                   // a few fine cracks / seams
    for (let i = 0; i < 8; i++) { c.fillRect(rnd() * S, rnd() * S, 6 + rnd() * 40, 1); c.fillRect(rnd() * S, rnd() * S, 1, 6 + rnd() * 40); }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    return t;
  };

  ES.buildWorld = function (scene, opts) {
    opts = opts || {};
    const FANCY = !!opts.fancy, REAL = !!opts.real, NOVIS = !!opts.noVisual;
    /* Capture the Flag uses a LONGER arena: the far parts of every map (everything with |z| >= 10) slide away from the middle by ZS metres,
       and a "no man's land" of cover is built in the gap. Width stays 60 m. Everything else (the 5 other modes) is exactly as before. */
    const CTF = !!opts.ctf, HX = HALF, ZS = CTF ? 15 : 0, HZ = HALF + ZS;
    let zoff = 0, NOSHIFT = false;                                   // z-shift applied to whatever is being placed right now
    const zsh = function (z) { return CTF && !NOSHIFT && Math.abs(z) >= 10 ? (z > 0 ? ZS : -ZS) : 0; };
    const MAPID = ES.MAPS_LIST.some(function (m) { return m.id === opts.map; }) ? opts.map : 'park';
    // colours and extras that make each map feel different
    const THEME = MAPID === 'space'
      ? { lowA: '#3a4258', lowB: '#323a4f', lowOuter: 0x1b2033, fancyBase: '#3b4358', fancyOuter: 0x1b2033, flowers: false, plaza: ['#56627f', '#4b5671'], blue: ['#4f7ed8', '#4573c8'], red: ['#d86a55', '#c85f4b'], lane: 'rgba(90,230,255,.75)',
          sky: { top: '#02030d', mid: '#0a1030', bot: '#1d2a5a', fog: 0x0c1330, hemiSky: 0x9fb4ff, hemiGround: 0x2a3050, sun: 0xcfd8ff, stars: true, trees: false } }
      : MAPID === 'jungle'
      ? { lowA: '#5f8f4a', lowB: '#547f42', lowOuter: 0x3f6b3a, fancyBase: '#5c8c48', fancyOuter: 0x3f6b3a, flowers: false, plaza: ['#a9a78f', '#9a987f'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(0,0,0,0)',
          sky: { top: '#6fc4a8', mid: '#b9e6c2', bot: '#e6f4d0', fog: 0xbfe0b8, hemiSky: 0xf2ffe0, hemiGround: 0x4f7a3d, sun: 0xfff0c0 } }
      : MAPID === 'snow'
      ? { lowA: '#eef4f9', lowB: '#e0ebf4', lowOuter: 0xdfe9f2, fancyBase: '#e9f1f8', fancyOuter: 0xdfe9f2, flowers: false, plaza: ['#cfe6f4', '#bfdcee'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(120,170,210,.55)',
          patch: ['rgba(214,228,242,.55)', 'rgba(255,255,255,.5)', 'rgba(190,210,232,.45)'], hills: [0xe8f1f7, 0xd5e4ef, 0xf4f9fc], bush: [0xdfeaf2, 0xcbdceb, 0xeaf2f8] }
      : MAPID === 'underwater'
      ? { lowA: '#d5c389', lowB: '#c9b67c', lowOuter: 0x1b6f93, fancyBase: '#d2bf88', fancyOuter: 0x1b6f93, flowers: false, plaza: ['#ecdfae', '#e0d199'], blue: ['#9ec8ff', '#8bb9f5'], red: ['#ffb4a2', '#ffa38f'], lane: 'rgba(255,255,255,.3)',
          patch: ['rgba(196,176,120,.5)', 'rgba(232,218,170,.45)', 'rgba(170,150,100,.4)'], hills: [0x2a7fa0, 0x3b97b5, 0x226e8c], bush: [0xff7a9a, 0xff9f6e, 0x6fe0a0] }
      : MAPID === 'castle'
      ? { lowA: '#b3aa94', lowB: '#a69d88', lowOuter: 0x6a9a5a, fancyBase: '#b1a88f', fancyOuter: 0x6cb868, flowers: false, plaza: ['#d8d0b8', '#cbc2a8'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(0,0,0,0)' }
      : MAPID === 'rooftops'
      ? { lowA: '#9aa1ab', lowB: '#8d949f', lowOuter: 0x7d8a7a, fancyBase: '#8f969f', fancyOuter: 0x7fa07a, flowers: false, plaza: ['#c9ccd4', '#bcc0c9'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(255,214,90,.8)' }
      : { lowA: '#86cf74', lowB: '#78c466', lowOuter: 0x5fa65a, fancyBase: '#7cc86a', fancyOuter: 0x6cb868, flowers: true, plaza: ['#f1e7b8', '#e6d9a0'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(255,255,255,.55)' };
    const NIGHT = !!(THEME.sky && THEME.sky.stars);     // space: no clouds or green hills
    const shade = function (hex, k) { const c = new T.Color(hex); c.multiplyScalar(k); return c.getHex(); };
    const boxes = [];    // solid things: {x0,x1,z0,z1,h}
    const vis = [];      // things to draw: boxes + cones (merged into one mesh later)

    /* ---------- helpers to place things ---------- */
    // y0 (optional) = the box floats: it starts at height y0 instead of the ground (used for walls on top of roofs).
    // walk = true means a player can stand on top of it (low crates, roofs, stairs).
    function solid(cx, cz, w, d, h, color, cap, style, y0, walk) {
      y0 = y0 || 0;
      const zc = cz + zoff;
      boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: zc - d / 2, z1: zc + d / 2, h: h, y0: y0, walk: !!walk || (h <= LOW && !y0) });
      vis.push({ cx: cx, cy: (y0 + h) / 2, cz: zc, w: w, h: h - y0, d: d, color: color });
      if (cap !== undefined) vis.push({ cx: cx, cy: h + 0.06, cz: zc, w: w + 0.12, h: 0.12, d: d + 0.12, color: cap });
      if (FANCY && !NOVIS && !y0 && style !== 'step') fancyDetail(cx, cz, w, d, h, color, cap, style);
    }

    /* Fancy only: extra little boxes that make walls, towers and crates look finished (all merged into the same single mesh) */
    function fancyDetail(cx, cz, w, d, h, color, cap, style) {
      if (style === 'crate') {                                  // wooden corner posts + a middle plank
        const post = shade(color, 0.72), plank = shade(color, 0.86);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { deco(cx + q[0] * (w / 2 - 0.05), h / 2, cz + q[1] * (d / 2 - 0.05), 0.14, h + 0.02, 0.14, post); });
        deco(cx, h * 0.5, cz, w + 0.04, 0.12, d + 0.04, plank);
        return;
      }
      deco(cx, 0.13, cz, w + 0.1, 0.26, d + 0.1, shade(color, 0.7));            // dark base band
      if (style === 'outer') {                                                  // boundary wall: a pillar every 6 m with a round top
        const alongLong = w >= d, len = alongLong ? w : d;
        for (let o = -len / 2 + 3; o < len / 2; o += 6) {
          const px = alongLong ? cx + o : cx, pz = alongLong ? cz : cz + o;
          deco(px, h / 2 + 0.2, pz, alongLong ? 0.9 : 1.3, h + 0.4, alongLong ? 1.3 : 0.9, 0xb7c1d3);
          if (!REAL) sphere(px, h + 0.7, pz, 0.5, 0.8, 0xffd23f); else deco(px, h + 0.55, pz, alongLong ? 1.0 : 1.4, 0.3, alongLong ? 1.4 : 1.0, 0x9aa3b2);
        }
        return;
      }
      if (h < 2.4) return;
      const alongX = w >= d, len = alongX ? w : d, n = Math.max(1, Math.floor((len - 0.6) / 1.9)), gap = len / n;
      for (let i = 0; i < n; i++) {
        const o = -len / 2 + gap * (i + 0.5), wy = style === 'tower' ? h * 0.62 : h * 0.58, ws = h > 3.6 ? 0.9 : 0.75;
        [-1, 1].forEach(function (side) {
          if (alongX) {
            const z = cz + side * (d / 2 + 0.02);
            deco(cx + o, wy, z, ws + 0.16, ws + 0.16, 0.05, 0xf4f6fa);
            deco(cx + o, wy, z + side * 0.03, ws, ws, 0.05, 0x2b4a7a);
            deco(cx + o, wy + ws * 0.18, z + side * 0.06, ws * 0.7, ws * 0.12, 0.03, 0x7fb4ff);        // window shine
          } else {
            const x = cx + side * (w / 2 + 0.02);
            deco(x, wy, cz + o, 0.05, ws + 0.16, ws + 0.16, 0xf4f6fa);
            deco(x + side * 0.03, wy, cz + o, 0.05, ws, ws, 0x2b4a7a);
            deco(x + side * 0.06, wy + ws * 0.18, cz + o, 0.03, ws * 0.12, ws * 0.7, 0x7fb4ff);
          }
        });
      }
      if (style === 'tower') { deco(cx, h + 0.4, cz, 0.12, 0.8, 0.12, 0xdddddd); if (!REAL) sphere(cx, h + 0.85, cz, 0.18, 1, 0xffd23f); }   // antenna with a golden ball (cartoon only)
    }
    function deco(cx, cy, cz, w, h, d, color) {
      vis.push({ cx: cx, cy: cy, cz: cz + zoff, w: w, h: h, d: d, color: color });
    }
    function cone(cx, cy, cz, r, h, color) {
      vis.push({ cone: true, cx: cx, cy: cy, cz: cz + zoff, r: r, h: h, color: color });
    }
    function sphere(cx, cy, cz, r, sy, color) {        // Fancy: a squashed/stretched ball
      vis.push({ sphere: true, cx: cx, cy: cy, cz: cz + zoff, r: r, sy: sy, color: color });
    }
    function cyl(cx, cy, cz, r0, r1, h, color) {
      vis.push({ cyl: true, cx: cx, cy: cy, cz: cz + zoff, r0: r0, r1: r1, h: h, color: color });
    }
    function tree(cx, cz, collide) {
      if (collide) boxes.push({ x0: cx - 0.5, x1: cx + 0.5, z0: cz + zoff - 0.5, z1: cz + zoff + 0.5, h: 5, y0: 0, walk: false });
      if (MAPID === 'snow') {                            // snowy pine: dark green layers with a white snow top
        deco(cx, 0.6, cz, 0.5, 1.2, 0.5, 0x7a5233);
        cone(cx, 2.3, cz, 1.7, 2.4, 0x2b6b4b); cone(cx, 3.5, cz, 1.35, 1.9, 0xeaf3f8); cone(cx, 4.5, cz, 0.95, 1.7, 0x2f7a55); cone(cx, 5.2, cz, 0.6, 1.1, 0xffffff);
        return;
      }
      if (MAPID === 'underwater') {                      // coral and tall kelp instead of trees
        if (((Math.abs(cx) * 7 + Math.abs(cz) * 3) | 0) % 2) {
          cyl(cx, 2.4, cz, 0.14, 0.24, 4.8, 0x35b86a); cyl(cx + 0.4, 1.7, cz + 0.2, 0.1, 0.18, 3.4, 0x4fd184); cone(cx, 5.0, cz, 0.3, 0.8, 0x6fe29a);
        } else {
          cyl(cx, 1.1, cz, 0.35, 0.55, 2.2, 0xff6f91); cone(cx - 0.45, 2.7, cz, 0.45, 1.5, 0xff8fae); cone(cx + 0.45, 2.4, cz + 0.2, 0.4, 1.2, 0xffa070); cone(cx, 3.2, cz - 0.2, 0.35, 1.6, 0xff6f91);
        }
        return;
      }
      if (REAL) {                                        // realistic tree: dark trunk + stacked layers of leaves
        cyl(cx, 1.1, cz, 0.2, 0.32, 2.2, 0x5a4029);
        cone(cx, 2.5, cz, 1.9, 2.4, 0x2d5a34);
        cone(cx, 3.7, cz, 1.5, 2.2, 0x356b3b);
        cone(cx, 4.8, cz, 1.0, 1.9, 0x3f7a45);
        return;
      }
      if (FANCY) {                                       // cartoon tree: curved trunk + three fluffy puffs
        cyl(cx, 0.9, cz, 0.22, 0.34, 1.8, 0x8a5a33);
        sphere(cx, 2.4, cz, 1.45, 0.85, 0x2f9a4e);
        sphere(cx + 0.35, 3.5, cz - 0.2, 1.15, 0.85, 0x3bb35c);
        sphere(cx - 0.25, 4.45, cz + 0.15, 0.8, 0.9, 0x5ccd77);
        return;
      }
      deco(cx, 0.6, cz, 0.5, 1.2, 0.5, 0x8a5a33);
      cone(cx, 2.4, cz, 1.7, 2.6, 0x2f9a4e);
      cone(cx, 3.9, cz, 1.2, 2.2, 0x3bb35c);
    }

    /* Stairs: n steps, each 0.24 m higher (a player can walk straight up, because 0.24 is less than a step-up of 0.25).
       (fx, fz) = the building face the stairs touch, (dx, dz) = direction the stairs stick out of the building
       (one of them is +1/-1, the other 0), width = how wide they are across. The highest step touches the building. */
    function stairs(fx, fz, dx, dz, width, n, color, base) {
      const run = 0.45, rise = 0.24; base = base || 0;      // base = height of the floor the stairs start from (stairs on top of a block)
      for (let k = 1; k <= n; k++) {
        const dist0 = (n - k) * run, mid = dist0 + run / 2, h = k * rise;
        const cx = fx + dx * mid, cz = fz + dz * mid;
        solid(cx, cz, dx ? run : width, dz ? run : width, base + h, k % 2 ? color : shade(color, 0.9), undefined, 'step', base, true);
      }
    }
    /* A low wall around a roof (cover while you fight up there). gap = where the stairs arrive, so you can step onto the roof. */
    let STAIR_COL = 0xd8c9a3, RAIL_COL = 0xe6e9ef;      // per-map colours of stairs and roof walls
    function parapet(cx, cz, w, d, h, gap) {
      const T2 = 0.4, H = 0.9, col = RAIL_COL;
      function seg(alongX, fixed, a, b, edge) {            // a wall piece from a to b along one axis, cut where the stairs arrive
        const pieces = [[a, b]];
        if (gap && gap.edge === edge) {
          const g0 = gap.c - gap.w / 2, g1 = gap.c + gap.w / 2;
          pieces.length = 0;
          if (g0 > a) pieces.push([a, Math.min(g0, b)]);
          if (g1 < b) pieces.push([Math.max(g1, a), b]);
        }
        pieces.forEach(function (q) {
          if (q[1] - q[0] < 0.05) return;
          const mid = (q[0] + q[1]) / 2, len = q[1] - q[0];
          if (alongX) solid(mid, fixed, len, T2, h + H, col, undefined, 'wall', h); else solid(fixed, mid, T2, len, h + H, col, undefined, 'wall', h);
        });
      }
      seg(true, cz - d / 2 + T2 / 2, cx - w / 2, cx + w / 2, '-z');
      seg(true, cz + d / 2 - T2 / 2, cx - w / 2, cx + w / 2, '+z');
      seg(false, cx - w / 2 + T2 / 2, cz - d / 2 + T2, cz + d / 2 - T2, '-x');
      seg(false, cx + w / 2 - T2 / 2, cz - d / 2 + T2, cz + d / 2 - T2, '+x');
    }
    /* A building you can climb: a solid block with a flat roof you can stand on, a low wall round the roof, and stairs.
       side = which face the stairs are on: '+x' '-x' '+z' '-z'. c = where along that face the stairs are (x or z). */
    function building(cx, cz, w, d, h, color, capColor, side, c) { const zo = zoff; zoff = zsh(cz); buildingRaw(cx, cz, w, d, h, color, capColor, side, c); zoff = zo; }
    function buildingRaw(cx, cz, w, d, h, color, capColor, side, c) {
      solid(cx, cz, w, d, h, color, capColor, 'wall', 0, true);
      const n = Math.round(h / 0.24), sw = 3;
      let fx = cx, fz = cz, dx = 0, dz = 0;
      if (side === '+x') { fx = cx + w / 2; dx = 1; fz = c; } else if (side === '-x') { fx = cx - w / 2; dx = -1; fz = c; }
      else if (side === '+z') { fz = cz + d / 2; dz = 1; fx = c; } else { fz = cz - d / 2; dz = -1; fx = c; }
      stairs(fx, fz, dx, dz, sw, n, STAIR_COL);
      parapet(cx, cz, w, d, h, { edge: side, c: c, w: sw + 0.5 });
    }
    const flipSide = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
    let WALLC = null;      // per-map wall colours [neutral, blue half, red half, cap] (null = the normal colours)
    function zoneBuildingColor(z) { return Math.abs(z) < 5 ? 0xc9d0dc : (z > 0 ? 0x6f9be0 : 0xe0806b); }

    /* Everything is placed on the "blue" half (z > 0) and mirrored onto the red half,
       so the map is perfectly fair for both teams. */
    function both(x, z, w, d, h, kind) {
      [[x, z], [-x, -z]].forEach(function (p) {
        zoff = zsh(p[1]);
        const zone = Math.abs(p[1]) < 10 ? 0 : (p[1] > 0 ? 1 : 2);   // 0 neutral, 1 blue half, 2 red half
        if (kind === 'wall') {
          const c = WALLC ? WALLC[zone] : (zone === 1 ? 0x5b8fe0 : (zone === 2 ? 0xe0735b : 0xc4ccd8));
          solid(p[0], p[1], w, d, h, c, WALLC ? WALLC[3] : 0xeef2f7, 'wall');
        } else if (kind === 'ice') {
          solid(p[0], p[1], w, d, h, 0xbfe3f5, 0xffffff, 'tower');
        } else if (kind === 'crate') {
          solid(p[0], p[1], w, d, h, 0xd9a05b, 0xf0c98a, 'crate');
        } else if (kind === 'tower') {
          solid(p[0], p[1], w, d, h, 0x6f7f9f, zone === 2 ? 0xff8a6d : (zone === 1 ? 0x6fb0ff : 0xf2d46b), 'tower');
        } else if (kind === 'tree') {
          tree(p[0], p[1], true);
        }
        zoff = 0;
      });
    }

    /* ---------- the map ---------- */
    // outer walls (same for every map)
    solid(0, -HZ - 0.5, 63, 1, 4, 0x9aa5b8, 0xdfe5ee, 'outer');
    solid(0, HZ + 0.5, 63, 1, 4, 0x9aa5b8, 0xdfe5ee, 'outer');
    solid(-HX - 0.5, 0, 1, 2 * HZ + 1, 4, 0x9aa5b8, 0xdfe5ee, 'outer');
    solid(HX + 0.5, 0, 1, 2 * HZ + 1, 4, 0x9aa5b8, 0xdfe5ee, 'outer');

    function buildPark() {
    // centre building with four doorways
    const BW = 0xcfd6e0, BC = 0xf2d46b;
    solid(-4.5, -7, 5, 1, 3.2, BW, BC, 'wall'); solid(4.5, -7, 5, 1, 3.2, BW, BC, 'wall');
    solid(-4.5, 7, 5, 1, 3.2, BW, BC, 'wall');  solid(4.5, 7, 5, 1, 3.2, BW, BC, 'wall');
    solid(-7, -4.5, 1, 5, 3.2, BW, BC, 'wall'); solid(-7, 4.5, 1, 5, 3.2, BW, BC, 'wall');
    solid(7, -4.5, 1, 5, 3.2, BW, BC, 'wall');  solid(7, 4.5, 1, 5, 3.2, BW, BC, 'wall');
    solid(0, 0, 2, 2, 0.9, 0xd9a05b, 0xf0c98a, 'crate');
    solid(-3.5, 3, 1.6, 1.6, 0.9, 0xd9a05b, 0xf0c98a, 'crate');
    solid(3.5, -3, 1.6, 1.6, 0.9, 0xd9a05b, 0xf0c98a, 'crate');
    deco(0, 0.03, 0, 13, 0.06, 13, 0xf5ecc0);

    // cover walls, towers, base pillars
    both(-9, 16, 7, 1, 2.6, 'wall');
    both(9, 19, 5, 1, 2.6, 'wall');
    both(-15, 6, 3, 3, 4, 'tower');
    both(15, 10, 3, 3, 4, 'tower');
    both(10, 26, 2, 2, 3.5, 'tower');
    both(-10, 26, 2, 2, 3.5, 'tower');
    both(0, 20, 4, 1, 1.0, 'crate');

    // crate clusters (low: you can jump on top of them!)
    [[-21, 12], [-19.4, 12], [-21, 10.4],
     [20, 16], [21.6, 16], [20, 17.6],
     [5, 11], [6.6, 11],
     [-4, 23.5], [-2.4, 23.5]].forEach(function (c) { both(c[0], c[1], 1.6, 1.6, 0.9, 'crate'); });

    // a few trees as obstacles
    both(-25, 3, 1, 1, 5, 'tree');
    both(26, -4, 1, 1, 5, 'tree');
    }

    /* Castle battlements: little blocks ("merlons") with gaps between them along the roof edge, like a real castle.
       gaps = places where stairs arrive: [{ edge: '+z', c: 0, w: 3.5 }, ...] (no blocks there, so you can step onto the roof) */
    function crenels(cx, cz, w, d, h, gaps) {
      const S = 0.9, G = 0.9, HH = 1.0, TH = 0.5, col = 0xd9d3c3;
      [['-z', cz - d / 2 + TH / 2, true], ['+z', cz + d / 2 - TH / 2, true], ['-x', cx - w / 2 + TH / 2, false], ['+x', cx + w / 2 - TH / 2, false]].forEach(function (e) {
        const alongX = e[2], len = alongX ? w : d, mid = alongX ? cx : cz;
        const n = Math.max(1, Math.round((len - S) / (S + G)) + 1), step = n > 1 ? (len - S) / (n - 1) : 0;   // spread evenly, one block in each corner
        for (let i = 0; i < n; i++) {
          const pos = mid - len / 2 + S / 2 + step * i;
          let skip = false;
          (gaps || []).forEach(function (g) { if (g.edge === e[0] && Math.abs(pos - g.c) < g.w / 2 + S / 2) skip = true; });
          if (skip) continue;
          if (alongX) solid(pos, e[1], S, TH, h + HH, col, undefined, 'wall', h); else solid(e[1], pos, TH, S, h + HH, col, undefined, 'wall', h);
        }
      });
    }
    /* a climbable stone block with battlements and stairs (same idea as building(), but castle style) */
    function castleBlock(cx, cz, w, d, h, color, side, c) { const zo = zoff; zoff = zsh(cz); castleBlockRaw(cx, cz, w, d, h, color, side, c); zoff = zo; }
    function castleBlockRaw(cx, cz, w, d, h, color, side, c) {
      solid(cx, cz, w, d, h, color, 0xe3dcc8, 'wall', 0, true);
      const n = Math.round(h / 0.24), sw = 3;
      let fx = cx, fz = cz, dx = 0, dz = 0;
      if (side === '+x') { fx = cx + w / 2; dx = 1; fz = c; } else if (side === '-x') { fx = cx - w / 2; dx = -1; fz = c; }
      else if (side === '+z') { fz = cz + d / 2; dz = 1; fx = c; } else { fz = cz - d / 2; dz = -1; fx = c; }
      stairs(fx, fz, dx, dz, sw, n, 0xcfc4a8);
      crenels(cx, cz, w, d, h, [{ edge: side, c: c, w: sw + 0.4 }]);
    }

    /* Castle: a big keep in the middle, towers with stairs, stone walls with a gate, banners on the keep. */
    function buildCastle() {
      // the keep (big stone block in the middle): stairs from the blue side and the red side
      solid(0, 0, 10, 10, 3.84, 0xa8a49a, 0xe3dcc8, 'wall', 0, true);
      stairs(0, 5, 0, 1, 3, 16, 0xcfc4a8);
      stairs(0, -5, 0, -1, 3, 16, 0xcfc4a8);
      crenels(0, 0, 10, 10, 3.84, [{ edge: '+z', c: 0, w: 3.4 }, { edge: '-z', c: 0, w: 3.4 }]);
      // banners on the keep roof: blue and red
      deco(-3.4, 3.84 + 1.6, -3.4, 0.12, 3.2, 0.12, 0xdddddd); deco(-3.4 + 0.65, 3.84 + 2.7, -3.4, 1.2, 0.8, 0.05, 0xff5a3c);
      deco(3.4, 3.84 + 1.6, 3.4, 0.12, 3.2, 0.12, 0xdddddd);   deco(3.4 + 0.65, 3.84 + 2.7, 3.4, 1.2, 0.8, 0.05, 0x2f86ff);
      // two towers on each half (the red half is the mirror of the blue half)
      [[-15, 10, 4, 4, 2.88, '+x', 10], [15, 20, 4, 4, 2.88, '-x', 20]].forEach(function (b) {
        [1, -1].forEach(function (sgn) {
          const side = sgn > 0 ? b[5] : flipSide[b[5]];
          castleBlock(b[0] * sgn, b[1] * sgn, b[2], b[3], b[4], 0x9a968c, side, b[6] * sgn);
        });
      });
      // stone walls with a gate in the middle, and gate pillars
      both(-8, 15, 9, 1.2, 2.6, 'wall'); both(8, 15, 9, 1.2, 2.6, 'wall');
      both(-3.2, 15, 1.8, 1.8, 3.4, 'tower'); both(3.2, 15, 1.8, 1.8, 3.4, 'tower');
      // cover in the yard
      both(0, 22, 4, 1, 1.0, 'crate');
      both(-20, 18, 1.6, 1.6, 0.9, 'crate'); both(-18.4, 18, 1.6, 1.6, 0.9, 'crate');
      both(22, 8, 1.6, 1.6, 0.9, 'crate'); both(22, 9.6, 1.6, 1.6, 0.9, 'crate');
      both(-9, 7, 1.6, 1.6, 0.9, 'crate'); both(10, 5, 1.6, 1.6, 0.9, 'crate');
      both(-25, 3, 1, 1, 5, 'tree');
      both(26, -4, 1, 1, 5, 'tree');
      deco(0, 0.03, 0, 16, 0.06, 16, 0xc9bfa2);
    }

    /* City Rooftops: five buildings you can climb. Stairs lead up, low walls on the roofs give cover. */
    function buildRooftops() {
      // the big building in the middle: stairs from the blue side AND the red side
      solid(0, 0, 9, 9, 3.6, 0xc9d0dc, 0xf2d46b, 'wall', 0, true);
      stairs(0, 4.5, 0, 1, 3, 15, 0xd8c9a3);
      stairs(0, -4.5, 0, -1, 3, 15, 0xd8c9a3);
      // roof wall with an opening at each stair
      (function () {
        const H = 3.6, T2 = 0.4, col = 0xe6e9ef;
        solid(-2.9, 4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H); solid(2.9, 4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H);
        solid(-2.9, -4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H); solid(2.9, -4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H);
        solid(-4.3, 0, T2, 8.4, H + 0.9, col, undefined, 'wall', H); solid(4.3, 0, T2, 8.4, H + 0.9, col, undefined, 'wall', H);
        solid(0, 0.0, 1.4, 1.4, H + 0.9, 0xd9a05b, 0xf0c98a, 'crate', H);           // a crate to hide behind in the middle of the roof
      })();
      // two more buildings on each half (the red half is the mirror of the blue half)
      [[-16, 9, 8, 7, 2.4, '+x', 9], [16, 18, 7, 7, 2.4, '-x', 18]].forEach(function (b) {
        [[1, 0], [-1, 1]].forEach(function (m) {
          const sgn = m[0], flip = m[1];
          const cx = b[0] * sgn, cz = b[1] * sgn, side = flip ? flipSide[b[5]] : b[5], c = b[6] * sgn;
          // for the mirrored copy, the stair position along the face is mirrored too
          building(cx, cz, b[2], b[3], b[4], zoneBuildingColor(cz), 0xeef2f7, side, side[1] === 'x' ? c : c * 1);
        });
      });
      // cover on the ground
      both(0, 16, 6, 1, 1.0, 'crate');
      both(-8, 19, 4, 1, 2.6, 'wall');
      both(9, 12, 1.6, 1.6, 0.9, 'crate'); both(10.6, 12, 1.6, 1.6, 0.9, 'crate');
      both(-24, 14, 1.6, 1.6, 0.9, 'crate'); both(-22.4, 14, 1.6, 1.6, 0.9, 'crate'); both(-24, 15.6, 1.6, 1.6, 0.9, 'crate');
      both(22, 6, 1.6, 1.6, 0.9, 'crate');
      both(-14, 24, 1.6, 1.6, 0.9, 'crate');
      both(-25, 3, 1, 1, 5, 'tree');
      both(26, -4, 1, 1, 5, 'tree');
      deco(0, 0.03, 0, 13, 0.06, 13, 0xd5d8df);
    }

    /* Jungle Ruins: a stepped old temple in the middle (stairs both sides), two ruined halls on each half, mossy walls, thick trees. */
    function buildJungle() {
      STAIR_COL = 0xb8b59a; RAIL_COL = 0x7f9a66;
      const STONE = 0x9a9a84, MOSS = 0x6f8f55;
      // temple: wide base + smaller top, stairs up from both teams' sides
      solid(0, 0, 10, 10, 2.4, STONE, 0xb9b79d, 'wall', 0, true);
      stairs(0, 5, 0, 1, 3, 10, STAIR_COL); stairs(0, -5, 0, -1, 3, 10, STAIR_COL);
      solid(0, 0, 4, 4, 3.84, 0xa6a68e, 0xc4c2a6, 'wall', 0, true);          // the top tier
      // steps from the base roof (2.4 m) up to the top tier (3.84 m), on the +x side and the -x side
      stairs(2, 0, 1, 0, 3, 6, STAIR_COL, 2.4); stairs(-2, 0, -1, 0, 3, 6, STAIR_COL, 2.4);
      deco(0, 3.84 + 0.7, 0, 0.9, 1.4, 0.9, 0xd9c36a);                      // golden idol on the top
      // two ruined halls on each half (the red half is the mirror of the blue half)
      [[-16, 9, 8, 6, 2.4, '+x', 9], [16, 19, 7, 6, 2.88, '-x', 19]].forEach(function (b) {
        [[1, 0], [-1, 1]].forEach(function (m) {
          const sgn = m[0], flip = m[1];
          const cx = b[0] * sgn, cz = b[1] * sgn, side = flip ? flipSide[b[5]] : b[5], c = b[6] * sgn;
          building(cx, cz, b[2], b[3], b[4], MOSS, 0x97b078, side, c);
        });
      });
      // broken pillars, mossy walls and stone blocks for cover
      both(-6, 17, 1.4, 1.4, 3.4, 'tower'); both(6, 17, 1.4, 1.4, 3.4, 'tower');
      both(-10, 22, 5, 1, 2.2, 'wall'); both(9, 22, 4, 1, 2.2, 'wall');
      both(-8, 12, 5, 1, 1.0, 'crate');
      both(-24, 16, 1.6, 1.6, 0.9, 'crate'); both(-22.4, 16, 1.6, 1.6, 0.9, 'crate');
      both(23, 8, 1.6, 1.6, 0.9, 'crate'); both(23, 9.6, 1.6, 1.6, 0.9, 'crate');
      both(-4, 7, 1.6, 1.6, 0.9, 'crate'); both(12, 14, 1.6, 1.6, 0.9, 'crate');
      // thick jungle trees that block the way
      both(-25, 3, 1, 1, 5, 'tree'); both(26, -4, 1, 1, 5, 'tree'); both(-12, 14, 1, 1, 5, 'tree');
      both(5, 24, 1, 1, 5, 'tree'); both(-20, 24, 1, 1, 5, 'tree'); both(19, 3, 1, 1, 5, 'tree');
      deco(0, 0.03, 0, 15, 0.06, 15, 0x8a8b72);
    }
    /* Space Station: dark metal decks. A reactor block in the middle with stairs, two raised decks on each half, bulkhead walls with glowing strips. */
    function buildSpace() {
      STAIR_COL = 0x7c89aa; RAIL_COL = 0x5fe6ff;
      const HULL = 0x6a7693;
      solid(0, 0, 9, 9, 3.6, 0x59647e, 0x5fe6ff, 'wall', 0, true);          // reactor deck
      stairs(0, 4.5, 0, 1, 3, 15, STAIR_COL); stairs(0, -4.5, 0, -1, 3, 15, STAIR_COL);
      (function () {                                                          // glowing rail round the deck, with an opening at each stair
        const H = 3.6, T2 = 0.4, col = RAIL_COL;
        solid(-2.9, 4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H); solid(2.9, 4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H);
        solid(-2.9, -4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H); solid(2.9, -4.3, 3.2, T2, H + 0.9, col, undefined, 'wall', H);
        solid(-4.3, 0, T2, 8.4, H + 0.9, col, undefined, 'wall', H); solid(4.3, 0, T2, 8.4, H + 0.9, col, undefined, 'wall', H);
      })();
      [[-16, 9, 8, 6, 2.4, '+x', 9], [16, 19, 7, 6, 2.4, '-x', 19]].forEach(function (b) {
        [[1, 0], [-1, 1]].forEach(function (m) {
          const sgn = m[0], flip = m[1];
          const cx = b[0] * sgn, cz = b[1] * sgn, side = flip ? flipSide[b[5]] : b[5], c = b[6] * sgn;
          building(cx, cz, b[2], b[3], b[4], zoneBuildingColor(cz) === 0xc9d0dc ? HULL : (cz > 0 ? 0x4f6fb8 : 0xb8624f), 0x5fe6ff, side, c);
        });
      });
      both(-6, 17, 6, 1, 2.6, 'wall'); both(9, 12, 4, 1, 2.6, 'wall');
      both(0, 21, 5, 1, 1.0, 'crate');
      both(-24, 14, 1.6, 1.6, 0.9, 'crate'); both(-22.4, 14, 1.6, 1.6, 0.9, 'crate');
      both(22, 6, 1.6, 1.6, 0.9, 'crate'); both(22, 7.6, 1.6, 1.6, 0.9, 'crate');
      both(-4, 8, 1.6, 1.6, 0.9, 'crate'); both(13, 24, 1.6, 1.6, 0.9, 'crate');
      both(-15, 26, 2, 2, 3.5, 'tower'); both(15, 4, 2, 2, 3.5, 'tower');
      // glowing floor strips
      deco(0, 0.03, 0, 13, 0.06, 13, 0x4b5671);
      [-1, 1].forEach(function (sg) { deco(sg * 11, 0.05, 0, 0.25, 0.04, 40 + 2 * ZS, 0x5fe6ff); });
    }

    /* Snowy Village: an ice fort in the middle, wooden cabins with snowy roofs (stairs up), snow walls, ice pillars, snowmen, pine trees. */
    function buildSnow() {
      STAIR_COL = 0xe3edf5; RAIL_COL = 0xf6fafd;
      WALLC = [0xdfe8f0, 0x9cc3ee, 0xeeb3a8, 0xffffff];
      const ICE = 0xbfe3f5, SNOWCAP = 0xffffff;
      // ice fort in the middle (four doorways, same shape as the park centre so every route stays open)
      solid(-4.5, -7, 5, 1, 3.2, ICE, SNOWCAP, 'wall'); solid(4.5, -7, 5, 1, 3.2, ICE, SNOWCAP, 'wall');
      solid(-4.5, 7, 5, 1, 3.2, ICE, SNOWCAP, 'wall');  solid(4.5, 7, 5, 1, 3.2, ICE, SNOWCAP, 'wall');
      solid(-7, -4.5, 1, 5, 3.2, ICE, SNOWCAP, 'wall'); solid(-7, 4.5, 1, 5, 3.2, ICE, SNOWCAP, 'wall');
      solid(7, -4.5, 1, 5, 3.2, ICE, SNOWCAP, 'wall');  solid(7, 4.5, 1, 5, 3.2, ICE, SNOWCAP, 'wall');
      deco(0, 0.03, 0, 13, 0.06, 13, 0xcfeaf7);                                   // the frozen floor inside
      // snowman in the middle of the fort (cover) + two snow blocks
      solid(0, 0, 1.6, 1.6, 1.4, 0xf4f8fb, SNOWCAP, 'wall'); sphere(0, 1.95, 0, 0.55, 1, 0xffffff); cone(0, 1.95, -0.6, 0.1, 0.5, 0xff8a1f);
      solid(-3.5, 3, 1.6, 1.6, 0.9, 0xe6eff6, SNOWCAP, 'wall'); solid(3.5, -3, 1.6, 1.6, 0.9, 0xe6eff6, SNOWCAP, 'wall');
      // two wooden cabins on each half (the red half is the mirror of the blue half). Snow on the roofs!
      [[-16, 9, 8, 6, 2.4, '+x', 9], [16, 19, 7, 6, 2.88, '-x', 19]].forEach(function (b) {
        [[1, 0], [-1, 1]].forEach(function (m) {
          const sgn = m[0], flip = m[1];
          building(b[0] * sgn, b[1] * sgn, b[2], b[3], b[4], 0xa9744b, SNOWCAP, flip ? flipSide[b[5]] : b[5], b[6] * sgn);
        });
      });
      // ice pillars, snow walls, a snow bank, crates
      both(-6, 17, 1.4, 1.4, 3.4, 'ice'); both(6, 17, 1.4, 1.4, 3.4, 'ice');
      both(-10, 22, 5, 1, 2.2, 'wall'); both(9, 22, 4, 1, 2.2, 'wall');
      both(-8, 12, 5, 1, 1.0, 'wall');
      both(-24, 16, 1.6, 1.6, 0.9, 'crate'); both(-22.4, 16, 1.6, 1.6, 0.9, 'crate');
      both(23, 8, 1.6, 1.6, 0.9, 'crate'); both(23, 9.6, 1.6, 1.6, 0.9, 'crate');
      both(-9, 7, 1.6, 1.6, 0.9, 'crate'); both(12, 14, 1.6, 1.6, 0.9, 'crate');
      // snowmen scattered around (solid, so they work as cover)
      [[4, 10], [-13, 18]].forEach(function (q) {
        [[q[0], q[1]], [-q[0], -q[1]]].forEach(function (p) {
          solid(p[0], p[1], 1.4, 1.4, 1.3, 0xf4f8fb, SNOWCAP, 'wall');
          sphere(p[0], 1.8, p[1], 0.5, 1, 0xffffff); cone(p[0], 1.8, p[1] - 0.55, 0.09, 0.45, 0xff8a1f);
        });
      });
      // pine trees that block the way
      both(-25, 3, 1, 1, 5, 'tree'); both(26, -4, 1, 1, 5, 'tree'); both(-12, 14, 1, 1, 5, 'tree');
      both(5, 24, 1, 1, 5, 'tree'); both(-20, 24, 1, 1, 5, 'tree'); both(19, 3, 1, 1, 5, 'tree');
      // frozen ponds (just for looks - the whole village is slippery!)
      deco(14, 0.035, 4, 8, 0.05, 6, 0xaee0f2); deco(-14, 0.035, -4, 8, 0.05, 6, 0xaee0f2);
    }

    /* Underwater Base: a sunken ship in the middle (stairs at both ends), glass-dome huts with coral roofs, bulkhead walls, treasure chests. */
    function buildUnderwater() {
      STAIR_COL = 0xc9b47a; RAIL_COL = 0x6fd6e8;
      WALLC = [0x4aa8b8, 0x3d7fd0, 0xd06a78, 0xbff4ff];
      const WOOD = 0x8a5a33, DECK = 0xa3703f;
      // the ship: a long deck you can climb on, with a rail along both sides and stairs at both ends
      solid(0, 0, 14, 5, 2.4, WOOD, 0xc08a52, 'wall', 0, true);
      stairs(7, 0, 1, 0, 3, 10, STAIR_COL); stairs(-7, 0, -1, 0, 3, 10, STAIR_COL);
      solid(0, 2.1, 14, 0.4, 3.3, DECK, undefined, 'wall', 2.4); solid(0, -2.1, 14, 0.4, 3.3, DECK, undefined, 'wall', 2.4);
      deco(0, 2.4 + 3, 0, 0.22, 6, 0.22, 0x5a3a1e); deco(1.3, 2.4 + 3.6, 0, 2.4, 2.4, 0.06, 0xf4ead0);        // mast and sail (looks only)
      deco(0, 0.03, 0, 15, 0.06, 7, 0xe3d49a);                                                                  // sand around the ship
      // glass-dome huts with coral roofs (two on each half)
      [[-16, 9, 8, 6, 2.4, '+x', 9], [16, 19, 7, 6, 2.4, '-x', 19]].forEach(function (b) {
        [[1, 0], [-1, 1]].forEach(function (m) {
          const sgn = m[0], flip = m[1];
          building(b[0] * sgn, b[1] * sgn, b[2], b[3], b[4], zoneBuildingColor(b[1] * sgn) === 0xc9d0dc ? 0x4aa8b8 : (b[1] * sgn > 0 ? 0x3d7fd0 : 0xd06a78), 0xff8fae, flip ? flipSide[b[5]] : b[5], b[6] * sgn);
        });
      });
      both(-6, 17, 6, 1, 2.6, 'wall'); both(9, 12, 4, 1, 2.6, 'wall');
      both(0, 21, 5, 1, 1.0, 'crate');
      both(-24, 14, 1.6, 1.6, 0.9, 'crate'); both(-22.4, 14, 1.6, 1.6, 0.9, 'crate');
      both(22, 6, 1.6, 1.6, 0.9, 'crate'); both(22, 7.6, 1.6, 1.6, 0.9, 'crate');
      both(-4, 8, 1.6, 1.6, 0.9, 'crate'); both(13, 24, 1.6, 1.6, 0.9, 'crate');
      both(-15, 26, 2, 2, 3.5, 'tower'); both(15, 4, 2, 2, 3.5, 'tower');
      // big coral and kelp that block the way
      both(-25, 3, 1, 1, 5, 'tree'); both(26, -4, 1, 1, 5, 'tree'); both(-12, 14, 1, 1, 5, 'tree'); both(6, 24, 1, 1, 5, 'tree');
      // glowing blue floor strips (like landing lights)
      [-1, 1].forEach(function (sg) { deco(sg * 11, 0.05, 0, 0.25, 0.04, 40 + 2 * ZS, 0x7fe6ff); });
    }

    /* Capture the Flag only: the middle of the longer arena ("no man's land"): cover to fight around, and a climbable building on each side if the map has them. */
    function ctfGap() {
      NOSHIFT = true;
      const B = { rooftops: [0xc9d0dc, 0xeef2f7], jungle: [0x6f8f55, 0x97b078], space: [0x6a7693, 0x5fe6ff], snow: [0xa9744b, 0xffffff], underwater: [0x4aa8b8, 0xff8fae] }[MAPID];
      [[1, 0], [-1, 1]].forEach(function (m) {                      // one cabin / hall on each half (the red one is the mirror of the blue one)
        const sgn = m[0], flip = m[1];
        if (MAPID === 'castle') castleBlock(-18 * sgn, 19 * sgn, 6, 5, 2.88, 0x9a968c, flip ? flipSide['+x'] : '+x', 19 * sgn);
        else if (B) building(-18 * sgn, 19 * sgn, 7, 6, 2.4, B[0], B[1], flip ? flipSide['+x'] : '+x', 19 * sgn);
      });
      both(-4, 17, 6, 1, 2.4, 'wall'); both(10, 21.5, 5, 1, 2.4, 'wall');
      both(8, 14, 1.6, 1.6, 0.9, 'crate'); both(9.6, 14, 1.6, 1.6, 0.9, 'crate'); both(8, 15.6, 1.6, 1.6, 0.9, 'crate');
      both(-2, 22.5, 4, 1, 1.0, 'crate');
      both(18, 14.5, 2.2, 2.2, 3.6, 'tower');
      both(-25, 14, 1, 1, 5, 'tree'); both(24, 22, 1, 1, 5, 'tree');
      NOSHIFT = false;
    }

    if (MAPID === 'snow') buildSnow(); else if (MAPID === 'underwater') buildUnderwater(); else if (MAPID === 'rooftops') buildRooftops(); else if (MAPID === 'castle') buildCastle(); else if (MAPID === 'jungle') buildJungle(); else if (MAPID === 'space') buildSpace(); else buildPark();
    if (CTF) ctfGap();

    // ---- decoration (no collision): base pads, flags, ring of trees outside ----
    const PADS = MAPID === 'underwater' ? [0x7fb0ff, 0xff9d8f] : MAPID === 'space' ? [0x2d4f93, 0x93392f] : (MAPID === 'jungle' ? [0x9bbbe0, 0xe0a898] : [0xa9cdff, 0xffb4a2]);
    deco(0, 0.03, 25.5 + ZS, 20, 0.06, 9, PADS[0]);
    deco(0, 0.03, -25.5 - ZS, 20, 0.06, 9, PADS[1]);
    [[1, 0x2f86ff], [-1, 0xff5a3c]].forEach(function (t) {
      const z = (28.6 + ZS) * t[0];
      deco(-12, 2.5, z, 0.2, 5, 0.2, 0xdddddd); deco(-11.2, 4.4, z, 1.6, 1.0, 0.06, t[1]);
      deco(12, 2.5, z, 0.2, 5, 0.2, 0xdddddd);  deco(12.8, 4.4, z, 1.6, 1.0, 0.06, t[1]);
    });
    const RING = THEME.sky && THEME.sky.trees === false ? 0 : Math.round((MAPID === 'jungle' ? 40 : (MAPID === 'underwater' ? 34 : 26)) * (CTF ? 1.3 : 1));
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2;
      const edge = 35 + (i % 3) * 3;                                   // distance of the tree from the middle, measured to a square
      const r = edge / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      tree(Math.cos(a) * r, Math.sin(a) * r * (HZ / HX), false);
    }
    for (let i = -28; i <= 28 && RING; i += 8) { tree(i, -35.5 - ZS - (i % 3), false); tree(i + 3, 35.5 + ZS + (i % 2), false); }
    for (let i = -34; CTF && RING && i <= 34; i += 10) { tree(-35.5 - (i % 3), i * 1.3, false); tree(35.5 + (i % 2), i * 1.3 + 2, false); }      // CTF: the long sides need trees too
    if (!RING) {                                        // space station: glowing light pylons instead of trees
      for (let i = -28; i <= 28; i += 8) [-1, 1].forEach(function (sg) {
        cyl(i, 3, sg * (33.5 + ZS), 0.35, 0.5, 6, 0x6b7694); deco(i, 6.2, sg * (33.5 + ZS), 0.9, 0.5, 0.9, sg > 0 ? 0x5fe6ff : 0xff7ad9);
      });
      [-1, 1].forEach(function (sg) { for (let i = -24 - ZS; i <= 24 + ZS; i += 12) { cyl(sg * 33.5, 2.5, i, 0.35, 0.5, 5, 0x6b7694); deco(sg * 33.5, 5.3, i, 0.9, 0.5, 0.9, 0x5fe6ff); } });
    }

    /* ---------- Fancy only: flowers, bushes, rocks, far hills, light beacons, clouds ---------- */
    const fx = { clouds: null, beams: [], t: 0 };
    if (FANCY && !NOVIS) {
      const rr = function (a, b) { return a + Math.random() * (b - a); };
      // flowers + grass tufts in the open grass (never inside a wall)
      const petals = [0xff6fa5, 0xffd23f, 0xffffff, 0xb78bff, 0xff8a3d];
      for (let i = 0, made = 0; THEME.flowers && i < 400 && made < 150 * (HZ / HX); i++) {
        const x = rr(-29, 29), z = rr(-29 - ZS, 29 + ZS);
        if (blockedAt(x, z, 1.0) || (Math.abs(x) < 7.5 && Math.abs(z) < 7.5)) continue;
        made++;
        deco(x, 0.13, z, 0.03, 0.26, 0.03, 0x3a9a48);
        deco(x, 0.3, z, 0.16, 0.12, 0.16, petals[made % petals.length]);
        if (made % 3 === 0) cone(x + 0.25, 0.18, z + 0.1, 0.12, 0.36, 0x4fb85a);
      }
      // bushes and rocks outside the walls
      for (let i = 0; i < 60 * (HZ / HX); i++) {
        const side = i % 4, t = rr(-34, 34), off = rr(32.5, 39);
        const x = side < 2 ? t : (side === 2 ? off : -off), z = (side < 2 ? (side === 0 ? off : -off) : t) * (HZ / HX);
        if (i % 5 === 0) { sphere(x, 0.45, z, rr(0.5, 0.9), 0.65, 0x9aa5b8); }
        else { sphere(x, 0.55, z, rr(0.7, 1.2), 0.8, (THEME.bush || [0x2f9a4e, 0x3bb35c, 0x57c46c])[i % 3]); if (i % 2) sphere(x + 0.7, 0.4, z + 0.3, 0.55, 0.8, (THEME.bush || [0, 0, 0x3bb35c])[2]); }
      }
      // far hills (a ring of soft green and blue hills so the world has a horizon)
      for (let i = 0; !NIGHT && i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rr(-0.1, 0.1), r = rr(78, 96), big = rr(14, 26);
        sphere(Math.cos(a) * r, 0, Math.sin(a) * r, big, rr(0.45, 0.8), THEME.hills ? THEME.hills[i % 3] : (i % 3 === 0 ? 0x6fb0a8 : (i % 3 === 1 ? 0x5fb56a : 0x7ac07a)));
      }
    }

    /* ---------- merge every visual piece into a single mesh ---------- */
    const pos = [], nor = [], col = [], uvs = [];
    const tmp = new T.Color();
    let geo = null, mesh = null, tex = null, ground = null, outer = null, toonTex = null;
    if (!NOVIS) {
      vis.forEach(function (b) {
        let g;
        if (b.cone) g = new T.ConeGeometry(b.r, b.h, 6);
        else if (b.sphere) { g = new T.SphereGeometry(b.r, 10, 7); g.scale(1, b.sy, 1); }
        else if (b.cyl) g = new T.CylinderGeometry(b.r0, b.r1, b.h, 8);
        else g = new T.BoxGeometry(b.w, b.h, b.d);
        g = g.toNonIndexed();
        const p = g.attributes.position.array, n = g.attributes.normal.array;
        tmp.set(b.color);
        if (REAL) tmp.offsetHSL(0, -0.16, -0.07);                    // calmer, more natural colours than the cartoon look
        for (let i = 0; i < p.length; i += 3) {
          const wx = p[i] + b.cx, wy = p[i + 1] + b.cy, wz = p[i + 2] + b.cz;
          pos.push(wx, wy, wz);
          nor.push(n[i], n[i + 1], n[i + 2]);
          col.push(tmp.r, tmp.g, tmp.b);
          if (REAL) {                                                // surface-detail map: projected from the side the face looks at
            const ax = Math.abs(n[i]), ay = Math.abs(n[i + 1]);
            if (ay > 0.6) uvs.push(wx * 0.25, wz * 0.25); else if (ax > 0.6) uvs.push(wz * 0.25, wy * 0.25); else uvs.push(wx * 0.25, wy * 0.25);
          }
        }
        g.dispose();
      });
      geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      let mat;
      if (REAL) {                        // realistic shading: rough surfaces with fine grain, made by code (no image files)
        geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
        toonTex = ES.detailTexture(T);   // (name kept: it is the surface-detail map)
        const mo = { vertexColors: true, roughness: 0.88, metalness: 0.02, map: toonTex };
        if (opts.bump) { mo.bumpMap = toonTex; mo.bumpScale = 0.7; }
        mat = new T.MeshStandardMaterial(mo);
      } else mat = new T.MeshLambertMaterial({ vertexColors: true });
      mesh = new T.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    }

    /* ground: a tiny checker texture (cheap), plus a big plain plane so you never see the edge of the world.
       Fancy draws a bigger picture: grass with patches, a stone plaza in the middle, coloured base pads, lane stripes. */
    if (!NOVIS) {
      const cv = document.createElement('canvas');
      if (FANCY) {
        let S = REAL ? (opts.texSize || 1024) : 1024;                   // 16 pixels per metre (32 on Ultra)
        if (CTF && S > 1536) S = 1536;                                  // the longer arena would need a huge picture: keep it lighter
        const k = S / 64, TW = S, TH = Math.round(S * (64 + 2 * ZS) / 64);
        cv.width = TW; cv.height = TH;
        const c2 = cv.getContext('2d');
        c2.fillStyle = THEME.fancyBase; c2.fillRect(0, 0, TW, TH);
        for (let i = 0; i < Math.round(2600 * TH / TW); i++) {                                // soft grass patches (or asphalt patches in the city)
          const g = Math.random();
          c2.fillStyle = THEME.patch ? (g < 0.4 ? THEME.patch[0] : (g < 0.8 ? THEME.patch[1] : THEME.patch[2])) : THEME.flowers ? (g < 0.4 ? 'rgba(98,176,84,.55)' : (g < 0.8 ? 'rgba(150,214,118,.5)' : 'rgba(70,150,76,.45)')) : (g < 0.4 ? 'rgba(110,116,126,.45)' : (g < 0.8 ? 'rgba(170,176,186,.4)' : 'rgba(90,96,106,.4)'));
          const w = 6 + Math.random() * 26, h = 4 + Math.random() * 14;
          c2.fillRect(Math.random() * TW, Math.random() * TH, w, h);
        }
        const tiles = function (x0, z0, w, d, a, b2, gap) {              // a tile floor (world metres -> pixels)
          const px = (x0 + 32) * k, pz = (z0 + 32 + ZS) * k, pw = w * k, pd = d * k, t = 1.6 * k;
          for (let y = 0; y < pd; y += t) for (let x = 0; x < pw; x += t) {
            c2.fillStyle = (((x / t) | 0) + ((y / t) | 0)) % 2 ? a : b2;
            c2.fillRect(px + x, pz + y, Math.min(t, pw - x) - gap, Math.min(t, pd - y) - gap);
          }
        };
        tiles(-6.6, -6.6, 13.2, 13.2, THEME.plaza[0], THEME.plaza[1], 2);   // centre plaza
        tiles(-10, 21 + ZS, 20, 9, THEME.blue[0], THEME.blue[1], 2);             // blue base
        tiles(-10, -30 - ZS, 20, 9, THEME.red[0], THEME.red[1], 2);              // red base
        c2.fillStyle = THEME.lane;                                          // dashed centre lane
        for (let z = -20 - ZS; z < 20 + ZS; z += 2.4) if (Math.abs(z) > 7.5) c2.fillRect((-0.15 + 32) * k, (z + 32 + ZS) * k, 0.3 * k, 1.2 * k);
        const flowers = ['#ff6fa5', '#ffd23f', '#ffffff', '#b78bff'];     // painted flower dots
        for (let i = 0; THEME.flowers && i < 380; i++) { c2.fillStyle = flowers[i % 4]; c2.beginPath(); c2.arc(Math.random() * TW, Math.random() * TH, 2 + Math.random() * 2, 0, 7); c2.fill(); }
        c2.strokeStyle = 'rgba(0,0,0,.18)'; c2.lineWidth = 6; c2.strokeRect(3, 3, TW - 6, TH - 6);
        if (REAL) {                                                         // fine grain (dirt / grass speckle) and calmer colours
          for (let i = 0; i < TW * TH / 90; i++) { c2.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.08)'; c2.fillRect(Math.random() * TW, Math.random() * TH, 1 + Math.random() * 2, 1 + Math.random() * 2); }
          try {
            const cv2 = document.createElement('canvas'); cv2.width = TW; cv2.height = TH; const c3 = cv2.getContext('2d');
            c3.filter = 'saturate(0.72) brightness(0.9) contrast(1.06)'; c3.drawImage(cv, 0, 0);
            c2.clearRect(0, 0, TW, TH); c2.drawImage(cv2, 0, 0);
          } catch (e) { /* ctx.filter missing: keep the plain ground */ }
        }
        tex = new T.CanvasTexture(cv);
        tex.anisotropy = REAL ? 8 : 4;
      } else {
        cv.width = cv.height = 64;
        const c2 = cv.getContext('2d');
        c2.fillStyle = THEME.lowA; c2.fillRect(0, 0, 64, 64);
        c2.fillStyle = THEME.lowB; c2.fillRect(0, 0, 32, 32); c2.fillRect(32, 32, 32, 32);
        tex = new T.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.magFilter = T.NearestFilter;
        tex.repeat.set(16, (64 + 2 * ZS) / 4);
      }
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      ground = new T.Mesh(new T.PlaneGeometry(64, 64 + 2 * ZS), REAL ? new T.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }) : new T.MeshLambertMaterial({ map: tex }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
      scene.add(ground);
      outer = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ color: REAL ? shade(THEME.fancyOuter, 0.72) : (FANCY ? THEME.fancyOuter : THEME.lowOuter) }));
      outer.rotation.x = -Math.PI / 2; outer.position.y = -0.04;
      scene.add(outer);

      if (FANCY) {
        /* tall beams of light above each team's base (cheap see-through tubes) */
        [[0x3d8bff, 26.5 + ZS], [0xff6a45, -26.5 - ZS]].forEach(function (t) {
          const m = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 22, 16, 1, true),
            new T.MeshBasicMaterial({ color: t[0], transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false }));
          m.position.set(0, 11, t[1]); scene.add(m); fx.beams.push(m);
        });
        /* clouds: white puffs high in the sky that drift slowly round the arena */
        const cp = [], tmpC = new T.Color(0xffffff);
        const cl = [];
        for (let i = 0; !NIGHT && MAPID !== 'underwater' && i < 9; i++) {
          const a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 50, y = 42 + Math.random() * 14;
          for (let j = 0; j < 4; j++) cl.push([Math.cos(a) * r + (j - 1.5) * 4.5, y + (j % 2) * 1.2, Math.sin(a) * r + Math.random() * 3, 4 + Math.random() * 2.5]);
        }
        cl.forEach(function (c) {
          const g = new T.SphereGeometry(c[3], 8, 6).toNonIndexed(); g.scale(1.5, 0.7, 1);
          const p = g.attributes.position.array;
          for (let i = 0; i < p.length; i += 3) cp.push(p[i] + c[0], p[i + 1] + c[1], p[i + 2] + c[2]);
          g.dispose();
        });
        const cg = new T.BufferGeometry(); cg.setAttribute('position', new T.Float32BufferAttribute(cp, 3));
        fx.clouds = new T.Mesh(cg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false, depthWrite: false }));
        fx.clouds.frustumCulled = false;
        scene.add(fx.clouds);
      }
    }

    /* ---------- collisions ---------- */
    // Push a standing circle (radius r) out of every box it overlaps.
    function collide(e, r) {
      for (let it = 0; it < 2; it++) {
        for (let k = 0; k < boxes.length; k++) {
          const b = boxes[k];
          if (b.walk && e.y >= b.h - STEP) continue;               // feet on top of a crate, step or roof: free to pass
          if (b.y0 && e.y >= b.h) continue;                         // above a wall that sits on a roof
          const cx = e.x < b.x0 ? b.x0 : (e.x > b.x1 ? b.x1 : e.x);
          const cz = e.z < b.z0 ? b.z0 : (e.z > b.z1 ? b.z1 : e.z);
          const dx = e.x - cx, dz = e.z - cz, d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-9) { const d = Math.sqrt(d2), f = (r - d) / d; e.x += dx * f; e.z += dz * f; }
            else {
              const l = e.x - b.x0, rr = b.x1 - e.x, t = e.z - b.z0, bt = b.z1 - e.z, m = Math.min(l, rr, t, bt);
              if (m === l) e.x = b.x0 - r; else if (m === rr) e.x = b.x1 + r; else if (m === t) e.z = b.z0 - r; else e.z = b.z1 + r;
            }
          }
        }
      }
      const limX = HX - r, limZ = HZ - r;
      if (e.x > limX) e.x = limX; else if (e.x < -limX) e.x = -limX;
      if (e.z > limZ) e.z = limZ; else if (e.z < -limZ) e.z = -limZ;
    }
    // Height of the floor under a point (0, or the top of a low crate you are standing on)
    function groundAt(x, z, y) {
      let g = 0;
      for (let k = 0; k < boxes.length; k++) {
        const b = boxes[k];
        if (b.walk && x > b.x0 - 0.15 && x < b.x1 + 0.15 && z > b.z0 - 0.15 && z < b.z1 + 0.15 && y >= b.h - STEP && b.h > g) g = b.h;
      }
      return g;
    }

    /* ---------- rays (used for blaster shots and for bots' line of sight) ---------- */
    // distance along the ray to the first wall/ground, or maxT if nothing is in the way
    function rayWorld(ox, oy, oz, dx, dy, dz, maxT) {
      let best = maxT;
      if (dy < -1e-6) { const tg = -oy / dy; if (tg > 0 && tg < best) best = tg; }
      for (let k = 0; k < boxes.length; k++) {
        const b = boxes[k];
        let t0 = 0, t1 = best;
        if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
        else { let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
        if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
        else { let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
        if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.h) continue; }
        else { let a = (b.y0 - oy) / dy, c = (b.h - oy) / dy; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
        if (t0 < best) best = t0;
      }
      return best;
    }
    function clearLine(ax, ay, az, bx, by, bz) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.01) return true;
      return rayWorld(ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 0.05;
    }

    /* ---------- bot path-finding grid ---------- */
    const CELL = 2, NX = (HX * 2) / CELL, NZ = (HZ * 2) / CELL;        // 30 x 30 cells (30 x 45 in Capture the Flag)
    const free = new Uint8Array(NX * NZ);
    function blockedAt(px, pz, r) {
      for (let k = 0; k < boxes.length; k++) {
        const b = boxes[k];
        if (b.y0) continue;                                   // walls on roofs are inside buildings anyway
        if (px > b.x0 - r && px < b.x1 + r && pz > b.z0 - r && pz < b.z1 + r) return true;
      }
      return false;
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      free[j * NX + i] = blockedAt(-HX + (i + 0.5) * CELL, -HZ + (j + 0.5) * CELL, 0.65) ? 0 : 1;
    }
    function cellOf(x, z) {
      const i = Math.max(0, Math.min(NX - 1, Math.floor((x + HX) / CELL)));
      const j = Math.max(0, Math.min(NZ - 1, Math.floor((z + HZ) / CELL)));
      return j * NX + i;
    }
    function cx(idx) { return -HX + ((idx % NX) + 0.5) * CELL; }
    function cz(idx) { return -HZ + (Math.floor(idx / NX) + 0.5) * CELL; }
    function nearestFree(idx) {
      if (free[idx]) return idx;
      const i0 = idx % NX, j0 = Math.floor(idx / NX);
      for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        if (free[j * NX + i]) return j * NX + i;
      }
      return -1;
    }
    // Like nearestFree, but only accepts a cell we can walk to in a straight line from (x, z).
    // (Without this, a bot hugging a wall could "snap" to a cell on the OTHER side of the wall and get stuck.)
    function nearestFreeVisible(idx, x, z) {
      if (free[idx] && lineFree(x, z, cx(idx), cz(idx), 0.3)) return idx;
      const i0 = idx % NX, j0 = Math.floor(idx / NX);
      let best = -1, bd = 1e9;
      for (let r = 1; r < 5 && best < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NZ || !free[j * NX + i]) continue;
        const px = cx(j * NX + i), pz = cz(j * NX + i), d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bd && lineFree(x, z, px, pz, 0.3)) { bd = d; best = j * NX + i; }
      }
      return best >= 0 ? best : nearestFree(idx);
    }
    function lineFree(x0, z0, x1, z1, r) {
      const dx = x1 - x0, dz = z1 - z0, n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / 0.5));
      for (let k = 0; k <= n; k++) if (blockedAt(x0 + dx * k / n, z0 + dz * k / n, r)) return false;
      return true;
    }

    // which free cells can actually be reached from the blue spawn? (used so bots never pick a sealed-off spot)
    const reach = new Uint8Array(NX * NZ);
    const spawns = [[], []];
    for (let x = -9; x <= 9; x += 3) {
      spawns[0].push({ x: x, z: 26.5 + ZS, yaw: 0 });
      spawns[1].push({ x: -x, z: -26.5 - ZS, yaw: Math.PI });
    }
    (function flood() {
      const start = nearestFree(cellOf(0, 26.5 + ZS));
      const q = [start]; reach[start] = 1;
      while (q.length) {
        const c = q.pop(), i = c % NX, j = Math.floor(c / NX);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
          const n = nj * NX + ni;
          if (!free[n] || reach[n]) continue;
          if (di && dj && (!free[j * NX + ni] || !free[nj * NX + i])) continue;
          reach[n] = 1; q.push(n);
        }
      }
    })();
    const reachList = [];
    for (let k = 0; k < NX * NZ; k++) if (reach[k]) reachList.push(k);

    function randomSpot(zBias) {
      // zBias: -1 prefers the red half, +1 the blue half, 0 anywhere
      for (let tries = 0; tries < 8; tries++) {
        const c = reachList[Math.floor(Math.random() * reachList.length)];
        const z = cz(c);
        if (!zBias || z * zBias > -6 || tries === 7) return { x: cx(c) + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6 };
      }
      return { x: 0, z: 0 };
    }

    // A* over the grid, then "string pulling" to remove zig-zags. Returns [{x,z},...] or null.
    const gScore = new Float32Array(NX * NZ), prev = new Int16Array(NX * NZ), closed = new Uint8Array(NX * NZ);
    function findPath(x0, z0, x1, z1) {
      const s = nearestFreeVisible(cellOf(x0, z0), x0, z0), g = nearestFreeVisible(cellOf(x1, z1), x1, z1);
      if (s < 0 || g < 0 || !reach[g]) return null;
      if (s === g) return [{ x: x1, z: z1 }];
      gScore.fill(1e9); closed.fill(0); prev.fill(-1);
      const heap = [];   // [f, idx] pairs kept as a binary min-heap
      function push(f, idx) {
        heap.push([f, idx]); let i = heap.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; }
      }
      function pop() {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last; let i = 0;
          for (;;) {
            let l = 2 * i + 1, r = l + 1, m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
          }
        }
        return top;
      }
      function h(idx) { const dx = Math.abs(idx % NX - g % NX), dz = Math.abs(Math.floor(idx / NX) - Math.floor(g / NX)); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); }
      gScore[s] = 0; push(h(s), s);
      let found = false;
      while (heap.length) {
        const cur = pop()[1];
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === g) { found = true; break; }
        const i = cur % NX, j = Math.floor(cur / NX);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
          const n = nj * NX + ni;
          if (!free[n] || closed[n]) continue;
          if (di && dj && (!free[j * NX + ni] || !free[nj * NX + i])) continue;   // no cutting corners
          const ng = gScore[cur] + (di && dj ? 1.414 : 1);
          if (ng < gScore[n]) { gScore[n] = ng; prev[n] = cur; push(ng + h(n), n); }
        }
      }
      if (!found) return null;
      const cells = [];
      for (let c = g; c !== -1 && c !== s; c = prev[c]) cells.push(c);
      cells.reverse();
      const pts = cells.map(function (c) { return { x: cx(c), z: cz(c) }; });
      if (free[cellOf(x1, z1)]) pts[pts.length - 1] = { x: x1, z: z1 };
      // string pulling
      const out = []; let ax = x0, az = z0, k = 0;
      while (k < pts.length) {
        let far = k;
        for (let m = pts.length - 1; m > k; m--) if (lineFree(ax, az, pts[m].x, pts[m].z, 0.5)) { far = m; break; }
        out.push(pts[far]); ax = pts[far].x; az = pts[far].z; k = far + 1;
      }
      return out;
    }

    /* ---------- radar picture (drawn once, reused every frame) ---------- */
    function drawRadarBase(ctx, size) {
      const s = size / (HZ * 2), ox = size / 2, oz = size / 2;            // the radar is square: a long arena leaves a dark strip on each side
      ctx.fillStyle = '#0c1a11'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#16301d'; ctx.fillRect(ox - HX * s, 0, HX * 2 * s, size);
      ctx.fillStyle = 'rgba(80,140,255,.28)'; ctx.fillRect(ox - HX * s, oz + (21 + ZS) * s, HX * 2 * s, 9 * s);
      ctx.fillStyle = 'rgba(255,100,70,.28)'; ctx.fillRect(ox - HX * s, 0, HX * 2 * s, 9 * s);
      boxes.forEach(function (b) {
        if (b.y0) return;
        ctx.fillStyle = b.walk && b.h > LOW ? '#e3d9b8' : (b.h > LOW ? '#9fb0c8' : '#c99a5b');
        ctx.fillRect(ox + b.x0 * s, oz + b.z0 * s, (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
      });
    }

    /* Weapon crate spots: the same list for every computer (so the teacher's page and the students agree).
       Candidates are on the blue half and mirrored to the red half; only open ground is used. */
    const crateSpots = [];
    const crateCands = [[0, 13], [-12, 19], [12, 13], [-20, 6], [20, 12], [0, 22], [-6, 10], [8, 22], [-14, 12], [14, 5]].map(function (c) { return [c[0], c[1] + zsh(c[1])]; });
    if (CTF) crateCands.unshift([-8, 13], [12, 18], [0, 27]);          // CTF: a few more in the middle of the long arena
    crateCands.forEach(function (c) {
      if (crateSpots.length >= (CTF ? 8 : 6)) return;
      if (blockedAt(c[0], c[1], 1.2) || blockedAt(-c[0], -c[1], 1.2)) return;
      crateSpots.push({ x: c[0], z: c[1] }); crateSpots.push({ x: -c[0], z: -c[1] });
    });
    /* Rescue & Bomb spots: the hostage (deep in the red half), the bomb site (on the blue half) and the blue safe zone (next to the blue spawn).
       The same answer on every computer (no random numbers), always on open ground that can be walked to from the blue spawn. */
    function pickSpot(cands, r) {
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i], cell = cellOf(c[0], c[1]);
        if (!blockedAt(c[0], c[1], r) && reach[cell] && free[cell]) return { x: c[0], z: c[1] };
      }
      for (let ring = 1; ring <= 14; ring++) {                    // nothing in the list was free: search outward from the first one
        for (let k = 0; k < 16; k++) {
          const a = k / 16 * Math.PI * 2, x = cands[0][0] + Math.cos(a) * ring, z = cands[0][1] + Math.sin(a) * ring;
          if (Math.abs(x) > HX - 3 || Math.abs(z) > HZ - 3) continue;
          const cell = cellOf(x, z);
          if (!blockedAt(x, z, r) && reach[cell] && free[cell]) return { x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2 };
        }
      }
      return { x: cands[0][0], z: cands[0][1] };
    }
    const rbSpots = {
      h: pickSpot([[0, -19], [7, -19], [-7, -19], [0, -15], [12, -17], [-12, -17], [0, -23], [6, -13], [-6, -13]], 1.4),
      z: pickSpot([[0, 12], [9, 10], [-9, 10], [0, 16], [14, 13], [-14, 13], [0, 8], [7, 15], [-7, 15]], 1.4),
      s: pickSpot([[0, 21.5], [6, 21.5], [-6, 21.5], [0, 18.5], [0, 23.5], [10, 21.5], [-10, 21.5]], 1.6)
    };
    /* Capture the Flag: where each team's flag stands (at their base; the red spot is the blue spot turned round, so it is fair) */
    let flagSpots = null;
    if (CTF) {
      const fb = pickSpot([[0, 36.5], [6, 36.5], [-6, 36.5], [0, 33.5], [10, 36.5], [-10, 36.5], [0, 39]], 1.6);
      flagSpots = { b: fb, r: { x: -fb.x, z: -fb.z } };
    }
    return {
      half: HALF, halfZ: HZ, ctf: CTF, flagSpots: flagSpots, boxes: boxes, mesh: mesh, spawns: spawns, map: MAPID, crateSpots: crateSpots, rbSpots: rbSpots,
      collide: collide, groundAt: groundAt,
      rayWorld: rayWorld, clearLine: clearLine,
      findPath: findPath, randomSpot: randomSpot, lineFree: lineFree, blockedAt: blockedAt,
      drawRadarBase: drawRadarBase,
      /* Fancy: slowly move the clouds and make the base beams softly pulse */
      update: function (dt) {
        if (!FANCY) return;
        fx.t += dt;
        if (fx.clouds) fx.clouds.rotation.y += dt * 0.004;
        for (let i = 0; i < fx.beams.length; i++) fx.beams[i].material.opacity = 0.17 + Math.sin(fx.t * 2 + i) * 0.05;
      },
      /* turn the see-through extras on/off (used when a slow computer drops to faster graphics) */
      setExtras: function (on) { if (fx.clouds) fx.clouds.visible = on; fx.beams.forEach(function (b) { b.visible = on; }); },
      fancy: FANCY,
      dispose: function () {
        if (!mesh) return;
        geo.dispose(); mesh.material.dispose(); tex.dispose(); if (toonTex) toonTex.dispose();
        ground.geometry.dispose(); ground.material.dispose(); outer.geometry.dispose(); outer.material.dispose();
        if (fx.clouds) { fx.clouds.geometry.dispose(); fx.clouds.material.dispose(); }
        fx.beams.forEach(function (b) { b.geometry.dispose(); b.material.dispose(); });
      }
    };
  };
})();
