/* EduStrike - the arena.
   One compact low-poly map, built from boxes. All the solid boxes are merged into
   ONE mesh (one draw call) so even weak school laptops can draw it quickly.
   This file also holds the "physics": collisions, ray tests (for blasters),
   and a simple path-finding grid so bots can walk around walls. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const T = window.THREE;

  const HALF = 30;       // arena is 60 x 60 metres
  const STEP = 0.25;     // how high a player can step up onto a low crate
  const LOW = 1.25;      // boxes this low can be hopped onto

  /* The maps the teacher can choose from (more are added stage by stage). All share the same size, bases and spawn points. */
  ES.MAPS_LIST = [
    { id: 'park', name: '🌳 Classic Park', desc: 'Open grass, walls and towers' },
    { id: 'rooftops', name: '🏙️ City Rooftops', desc: 'Buildings with stairs - fight from the roofs!' }
  ];
  ES.mapName = function (id) { const m = ES.MAPS_LIST.filter(function (x) { return x.id === id; })[0]; return m ? m.name : ES.MAPS_LIST[0].name; };

  /* opts.map      = which map to build (see ES.MAPS_LIST)
     opts.fancy    = prettier look (cartoon shading, windows, round trees, flowers, hills, clouds) for strong computers
     opts.noVisual = build only the collision/path-finding part (used by the teacher's page, which draws nothing) */
  /* a 4-step light ramp: makes shading look hand-drawn ("toon") */
  ES.toonGradient = function (T) {
    const d = new Uint8Array([160, 160, 160, 255, 200, 200, 200, 255, 232, 232, 232, 255, 255, 255, 255, 255]);
    const t = new T.DataTexture(d, 4, 1);
    t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  };

  ES.buildWorld = function (scene, opts) {
    opts = opts || {};
    const FANCY = !!opts.fancy, NOVIS = !!opts.noVisual;
    const MAPID = ES.MAPS_LIST.some(function (m) { return m.id === opts.map; }) ? opts.map : 'park';
    // colours and extras that make each map feel different
    const THEME = MAPID === 'rooftops'
      ? { lowA: '#9aa1ab', lowB: '#8d949f', lowOuter: 0x7d8a7a, fancyBase: '#8f969f', fancyOuter: 0x7fa07a, flowers: false, plaza: ['#c9ccd4', '#bcc0c9'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(255,214,90,.8)' }
      : { lowA: '#86cf74', lowB: '#78c466', lowOuter: 0x5fa65a, fancyBase: '#7cc86a', fancyOuter: 0x6cb868, flowers: true, plaza: ['#f1e7b8', '#e6d9a0'], blue: ['#b9d6ff', '#a4c8fa'], red: ['#ffc7b8', '#ffb4a2'], lane: 'rgba(255,255,255,.55)' };
    const shade = function (hex, k) { const c = new T.Color(hex); c.multiplyScalar(k); return c.getHex(); };
    const boxes = [];    // solid things: {x0,x1,z0,z1,h}
    const vis = [];      // things to draw: boxes + cones (merged into one mesh later)

    /* ---------- helpers to place things ---------- */
    // y0 (optional) = the box floats: it starts at height y0 instead of the ground (used for walls on top of roofs).
    // walk = true means a player can stand on top of it (low crates, roofs, stairs).
    function solid(cx, cz, w, d, h, color, cap, style, y0, walk) {
      y0 = y0 || 0;
      boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: h, y0: y0, walk: !!walk || (h <= LOW && !y0) });
      vis.push({ cx: cx, cy: (y0 + h) / 2, cz: cz, w: w, h: h - y0, d: d, color: color });
      if (cap !== undefined) vis.push({ cx: cx, cy: h + 0.06, cz: cz, w: w + 0.12, h: 0.12, d: d + 0.12, color: cap });
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
          sphere(px, h + 0.7, pz, 0.5, 0.8, 0xffd23f);
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
      if (style === 'tower') { deco(cx, h + 0.4, cz, 0.12, 0.8, 0.12, 0xdddddd); sphere(cx, h + 0.85, cz, 0.18, 1, 0xffd23f); }   // antenna with a golden ball
    }
    function deco(cx, cy, cz, w, h, d, color) {
      vis.push({ cx: cx, cy: cy, cz: cz, w: w, h: h, d: d, color: color });
    }
    function cone(cx, cy, cz, r, h, color) {
      vis.push({ cone: true, cx: cx, cy: cy, cz: cz, r: r, h: h, color: color });
    }
    function sphere(cx, cy, cz, r, sy, color) {        // Fancy: a squashed/stretched ball
      vis.push({ sphere: true, cx: cx, cy: cy, cz: cz, r: r, sy: sy, color: color });
    }
    function cyl(cx, cy, cz, r0, r1, h, color) {
      vis.push({ cyl: true, cx: cx, cy: cy, cz: cz, r0: r0, r1: r1, h: h, color: color });
    }
    function tree(cx, cz, collide) {
      if (collide) boxes.push({ x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5, h: 5, y0: 0, walk: false });
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
    function stairs(fx, fz, dx, dz, width, n, color) {
      const run = 0.45, rise = 0.24;
      for (let k = 1; k <= n; k++) {
        const dist0 = (n - k) * run, mid = dist0 + run / 2, h = k * rise;
        const cx = fx + dx * mid, cz = fz + dz * mid;
        solid(cx, cz, dx ? run : width, dz ? run : width, h, k % 2 ? color : shade(color, 0.9), undefined, 'step', 0, true);
      }
    }
    /* A low wall around a roof (cover while you fight up there). gap = where the stairs arrive, so you can step onto the roof. */
    function parapet(cx, cz, w, d, h, gap) {
      const T2 = 0.4, H = 0.9, col = 0xe6e9ef;
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
    function building(cx, cz, w, d, h, color, capColor, side, c) {
      solid(cx, cz, w, d, h, color, capColor, 'wall', 0, true);
      const n = Math.round(h / 0.24), sw = 3;
      let fx = cx, fz = cz, dx = 0, dz = 0;
      if (side === '+x') { fx = cx + w / 2; dx = 1; fz = c; } else if (side === '-x') { fx = cx - w / 2; dx = -1; fz = c; }
      else if (side === '+z') { fz = cz + d / 2; dz = 1; fx = c; } else { fz = cz - d / 2; dz = -1; fx = c; }
      stairs(fx, fz, dx, dz, sw, n, 0xd8c9a3);
      parapet(cx, cz, w, d, h, { edge: side, c: c, w: sw + 0.5 });
    }
    const flipSide = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
    function zoneBuildingColor(z) { return Math.abs(z) < 5 ? 0xc9d0dc : (z > 0 ? 0x6f9be0 : 0xe0806b); }

    /* Everything is placed on the "blue" half (z > 0) and mirrored onto the red half,
       so the map is perfectly fair for both teams. */
    function both(x, z, w, d, h, kind) {
      [[x, z], [-x, -z]].forEach(function (p) {
        const zone = Math.abs(p[1]) < 10 ? 0 : (p[1] > 0 ? 1 : 2);   // 0 neutral, 1 blue half, 2 red half
        if (kind === 'wall') {
          const c = zone === 1 ? 0x5b8fe0 : (zone === 2 ? 0xe0735b : 0xc4ccd8);
          solid(p[0], p[1], w, d, h, c, 0xeef2f7, 'wall');
        } else if (kind === 'crate') {
          solid(p[0], p[1], w, d, h, 0xd9a05b, 0xf0c98a, 'crate');
        } else if (kind === 'tower') {
          solid(p[0], p[1], w, d, h, 0x6f7f9f, zone === 2 ? 0xff8a6d : (zone === 1 ? 0x6fb0ff : 0xf2d46b), 'tower');
        } else if (kind === 'tree') {
          tree(p[0], p[1], true);
        }
      });
    }

    /* ---------- the map ---------- */
    // outer walls (same for every map)
    solid(0, -HALF - 0.5, 63, 1, 4, 0x9aa5b8, 0xdfe5ee, 'outer');
    solid(0, HALF + 0.5, 63, 1, 4, 0x9aa5b8, 0xdfe5ee, 'outer');
    solid(-HALF - 0.5, 0, 1, 61, 4, 0x9aa5b8, 0xdfe5ee, 'outer');
    solid(HALF + 0.5, 0, 1, 61, 4, 0x9aa5b8, 0xdfe5ee, 'outer');

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

    if (MAPID === 'rooftops') buildRooftops(); else buildPark();

    // ---- decoration (no collision): base pads, flags, ring of trees outside ----
    deco(0, 0.03, 25.5, 20, 0.06, 9, 0xa9cdff);
    deco(0, 0.03, -25.5, 20, 0.06, 9, 0xffb4a2);
    [[1, 0x2f86ff], [-1, 0xff5a3c]].forEach(function (t) {
      const z = 28.6 * t[0];
      deco(-12, 2.5, z, 0.2, 5, 0.2, 0xdddddd); deco(-11.2, 4.4, z, 1.6, 1.0, 0.06, t[1]);
      deco(12, 2.5, z, 0.2, 5, 0.2, 0xdddddd);  deco(12.8, 4.4, z, 1.6, 1.0, 0.06, t[1]);
    });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const edge = 35 + (i % 3) * 3;                                   // distance of the tree from the middle, measured to a square
      const r = edge / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      tree(Math.cos(a) * r, Math.sin(a) * r, false);
    }
    for (let i = -28; i <= 28; i += 8) { tree(i, -35.5 - (i % 3), false); tree(i + 3, 35.5 + (i % 2), false); }

    /* ---------- Fancy only: flowers, bushes, rocks, far hills, light beacons, clouds ---------- */
    const fx = { clouds: null, beams: [], t: 0 };
    if (FANCY && !NOVIS) {
      const rr = function (a, b) { return a + Math.random() * (b - a); };
      // flowers + grass tufts in the open grass (never inside a wall)
      const petals = [0xff6fa5, 0xffd23f, 0xffffff, 0xb78bff, 0xff8a3d];
      for (let i = 0, made = 0; THEME.flowers && i < 400 && made < 150; i++) {
        const x = rr(-29, 29), z = rr(-29, 29);
        if (blockedAt(x, z, 1.0) || (Math.abs(x) < 7.5 && Math.abs(z) < 7.5)) continue;
        made++;
        deco(x, 0.13, z, 0.03, 0.26, 0.03, 0x3a9a48);
        deco(x, 0.3, z, 0.16, 0.12, 0.16, petals[made % petals.length]);
        if (made % 3 === 0) cone(x + 0.25, 0.18, z + 0.1, 0.12, 0.36, 0x4fb85a);
      }
      // bushes and rocks outside the walls
      for (let i = 0; i < 60; i++) {
        const side = i % 4, t = rr(-34, 34), off = rr(32.5, 39);
        const x = side < 2 ? t : (side === 2 ? off : -off), z = side < 2 ? (side === 0 ? off : -off) : t;
        if (i % 5 === 0) { sphere(x, 0.45, z, rr(0.5, 0.9), 0.65, 0x9aa5b8); }
        else { sphere(x, 0.55, z, rr(0.7, 1.2), 0.8, [0x2f9a4e, 0x3bb35c, 0x57c46c][i % 3]); if (i % 2) sphere(x + 0.7, 0.4, z + 0.3, 0.55, 0.8, 0x3bb35c); }
      }
      // far hills (a ring of soft green and blue hills so the world has a horizon)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rr(-0.1, 0.1), r = rr(78, 96), big = rr(14, 26);
        sphere(Math.cos(a) * r, 0, Math.sin(a) * r, big, rr(0.45, 0.8), i % 3 === 0 ? 0x6fb0a8 : (i % 3 === 1 ? 0x5fb56a : 0x7ac07a));
      }
    }

    /* ---------- merge every visual piece into a single mesh ---------- */
    const pos = [], nor = [], col = [];
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
        for (let i = 0; i < p.length; i += 3) {
          pos.push(p[i] + b.cx, p[i + 1] + b.cy, p[i + 2] + b.cz);
          nor.push(n[i], n[i + 1], n[i + 2]);
          col.push(tmp.r, tmp.g, tmp.b);
        }
        g.dispose();
      });
      geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      let mat;
      if (FANCY) {                       // cartoon ("toon") shading: light comes in clear steps, like a drawing
        toonTex = ES.toonGradient(T);
        mat = new T.MeshToonMaterial({ vertexColors: true, gradientMap: toonTex });
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
        const S = 1024, k = S / 64;                                     // 16 pixels per metre
        cv.width = cv.height = S;
        const c2 = cv.getContext('2d');
        c2.fillStyle = THEME.fancyBase; c2.fillRect(0, 0, S, S);
        for (let i = 0; i < 2600; i++) {                                // soft grass patches (or asphalt patches in the city)
          const g = Math.random();
          c2.fillStyle = THEME.flowers ? (g < 0.4 ? 'rgba(98,176,84,.55)' : (g < 0.8 ? 'rgba(150,214,118,.5)' : 'rgba(70,150,76,.45)')) : (g < 0.4 ? 'rgba(110,116,126,.45)' : (g < 0.8 ? 'rgba(170,176,186,.4)' : 'rgba(90,96,106,.4)'));
          const w = 6 + Math.random() * 26, h = 4 + Math.random() * 14;
          c2.fillRect(Math.random() * S, Math.random() * S, w, h);
        }
        const tiles = function (x0, z0, w, d, a, b2, gap) {              // a tile floor (world metres -> pixels)
          const px = (x0 + 32) * k, pz = (z0 + 32) * k, pw = w * k, pd = d * k, t = 1.6 * k;
          for (let y = 0; y < pd; y += t) for (let x = 0; x < pw; x += t) {
            c2.fillStyle = (((x / t) | 0) + ((y / t) | 0)) % 2 ? a : b2;
            c2.fillRect(px + x, pz + y, Math.min(t, pw - x) - gap, Math.min(t, pd - y) - gap);
          }
        };
        tiles(-6.6, -6.6, 13.2, 13.2, THEME.plaza[0], THEME.plaza[1], 2);   // centre plaza
        tiles(-10, 21, 20, 9, THEME.blue[0], THEME.blue[1], 2);             // blue base
        tiles(-10, -30, 20, 9, THEME.red[0], THEME.red[1], 2);              // red base
        c2.fillStyle = THEME.lane;                                          // dashed centre lane
        for (let z = -20; z < 20; z += 2.4) if (Math.abs(z) > 7.5) c2.fillRect((-0.15 + 32) * k, (z + 32) * k, 0.3 * k, 1.2 * k);
        const flowers = ['#ff6fa5', '#ffd23f', '#ffffff', '#b78bff'];     // painted flower dots
        for (let i = 0; THEME.flowers && i < 380; i++) { c2.fillStyle = flowers[i % 4]; c2.beginPath(); c2.arc(Math.random() * S, Math.random() * S, 2 + Math.random() * 2, 0, 7); c2.fill(); }
        c2.strokeStyle = 'rgba(0,0,0,.18)'; c2.lineWidth = 6; c2.strokeRect(3, 3, S - 6, S - 6);
        tex = new T.CanvasTexture(cv);
        tex.anisotropy = 4;
      } else {
        cv.width = cv.height = 64;
        const c2 = cv.getContext('2d');
        c2.fillStyle = THEME.lowA; c2.fillRect(0, 0, 64, 64);
        c2.fillStyle = THEME.lowB; c2.fillRect(0, 0, 32, 32); c2.fillRect(32, 32, 32, 32);
        tex = new T.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.magFilter = T.NearestFilter;
        tex.repeat.set(16, 16);
      }
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      ground = new T.Mesh(new T.PlaneGeometry(64, 64), new T.MeshLambertMaterial({ map: tex }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
      scene.add(ground);
      outer = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ color: FANCY ? THEME.fancyOuter : THEME.lowOuter }));
      outer.rotation.x = -Math.PI / 2; outer.position.y = -0.04;
      scene.add(outer);

      if (FANCY) {
        /* tall beams of light above each team's base (cheap see-through tubes) */
        [[0x3d8bff, 26.5], [0xff6a45, -26.5]].forEach(function (t) {
          const m = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 22, 16, 1, true),
            new T.MeshBasicMaterial({ color: t[0], transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false }));
          m.position.set(0, 11, t[1]); scene.add(m); fx.beams.push(m);
        });
        /* clouds: white puffs high in the sky that drift slowly round the arena */
        const cp = [], tmpC = new T.Color(0xffffff);
        const cl = [];
        for (let i = 0; i < 9; i++) {
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
      const lim = HALF - r;
      if (e.x > lim) e.x = lim; else if (e.x < -lim) e.x = -lim;
      if (e.z > lim) e.z = lim; else if (e.z < -lim) e.z = -lim;
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
    const CELL = 2, N = (HALF * 2) / CELL;        // 30 x 30 cells
    const free = new Uint8Array(N * N);
    function blockedAt(px, pz, r) {
      for (let k = 0; k < boxes.length; k++) {
        const b = boxes[k];
        if (b.y0) continue;                                   // walls on roofs are inside buildings anyway
        if (px > b.x0 - r && px < b.x1 + r && pz > b.z0 - r && pz < b.z1 + r) return true;
      }
      return false;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      free[j * N + i] = blockedAt(-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL, 0.65) ? 0 : 1;
    }
    function cellOf(x, z) {
      const i = Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / CELL)));
      const j = Math.max(0, Math.min(N - 1, Math.floor((z + HALF) / CELL)));
      return j * N + i;
    }
    function cx(idx) { return -HALF + ((idx % N) + 0.5) * CELL; }
    function cz(idx) { return -HALF + (Math.floor(idx / N) + 0.5) * CELL; }
    function nearestFree(idx) {
      if (free[idx]) return idx;
      const i0 = idx % N, j0 = Math.floor(idx / N);
      for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        if (free[j * N + i]) return j * N + i;
      }
      return -1;
    }
    // Like nearestFree, but only accepts a cell we can walk to in a straight line from (x, z).
    // (Without this, a bot hugging a wall could "snap" to a cell on the OTHER side of the wall and get stuck.)
    function nearestFreeVisible(idx, x, z) {
      if (free[idx] && lineFree(x, z, cx(idx), cz(idx), 0.3)) return idx;
      const i0 = idx % N, j0 = Math.floor(idx / N);
      let best = -1, bd = 1e9;
      for (let r = 1; r < 5 && best < 0; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= N || j >= N || !free[j * N + i]) continue;
        const px = cx(j * N + i), pz = cz(j * N + i), d = (px - x) * (px - x) + (pz - z) * (pz - z);
        if (d < bd && lineFree(x, z, px, pz, 0.3)) { bd = d; best = j * N + i; }
      }
      return best >= 0 ? best : nearestFree(idx);
    }
    function lineFree(x0, z0, x1, z1, r) {
      const dx = x1 - x0, dz = z1 - z0, n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dz * dz) / 0.5));
      for (let k = 0; k <= n; k++) if (blockedAt(x0 + dx * k / n, z0 + dz * k / n, r)) return false;
      return true;
    }

    // which free cells can actually be reached from the blue spawn? (used so bots never pick a sealed-off spot)
    const reach = new Uint8Array(N * N);
    const spawns = [[], []];
    for (let x = -9; x <= 9; x += 3) {
      spawns[0].push({ x: x, z: 26.5, yaw: 0 });
      spawns[1].push({ x: -x, z: -26.5, yaw: Math.PI });
    }
    (function flood() {
      const start = nearestFree(cellOf(0, 26.5));
      const q = [start]; reach[start] = 1;
      while (q.length) {
        const c = q.pop(), i = c % N, j = Math.floor(c / N);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const n = nj * N + ni;
          if (!free[n] || reach[n]) continue;
          if (di && dj && (!free[j * N + ni] || !free[nj * N + i])) continue;
          reach[n] = 1; q.push(n);
        }
      }
    })();
    const reachList = [];
    for (let k = 0; k < N * N; k++) if (reach[k]) reachList.push(k);

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
    const gScore = new Float32Array(N * N), prev = new Int16Array(N * N), closed = new Uint8Array(N * N);
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
      function h(idx) { const dx = Math.abs(idx % N - g % N), dz = Math.abs(Math.floor(idx / N) - Math.floor(g / N)); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); }
      gScore[s] = 0; push(h(s), s);
      let found = false;
      while (heap.length) {
        const cur = pop()[1];
        if (closed[cur]) continue;
        closed[cur] = 1;
        if (cur === g) { found = true; break; }
        const i = cur % N, j = Math.floor(cur / N);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const n = nj * N + ni;
          if (!free[n] || closed[n]) continue;
          if (di && dj && (!free[j * N + ni] || !free[nj * N + i])) continue;   // no cutting corners
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
      const s = size / (HALF * 2);
      ctx.fillStyle = '#16301d'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(80,140,255,.28)'; ctx.fillRect(0, size * 0.5 + 21 * s, size, 9 * s);
      ctx.fillStyle = 'rgba(255,100,70,.28)'; ctx.fillRect(0, 0, size, 9 * s);
      boxes.forEach(function (b) {
        if (b.y0) return;
        ctx.fillStyle = b.walk && b.h > LOW ? '#e3d9b8' : (b.h > LOW ? '#9fb0c8' : '#c99a5b');
        ctx.fillRect((b.x0 + HALF) * s, (b.z0 + HALF) * s, (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
      });
    }

    return {
      half: HALF, boxes: boxes, mesh: mesh, spawns: spawns, map: MAPID,
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
