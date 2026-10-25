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

  ES.buildWorld = function (scene) {
    const boxes = [];    // solid things: {x0,x1,z0,z1,h}
    const vis = [];      // things to draw: boxes + cones (merged into one mesh later)

    /* ---------- helpers to place things ---------- */
    function solid(cx, cz, w, d, h, color, cap) {
      boxes.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: h });
      vis.push({ cx: cx, cy: h / 2, cz: cz, w: w, h: h, d: d, color: color });
      if (cap !== undefined) vis.push({ cx: cx, cy: h + 0.06, cz: cz, w: w + 0.12, h: 0.12, d: d + 0.12, color: cap });
    }
    function deco(cx, cy, cz, w, h, d, color) {
      vis.push({ cx: cx, cy: cy, cz: cz, w: w, h: h, d: d, color: color });
    }
    function cone(cx, cy, cz, r, h, color) {
      vis.push({ cone: true, cx: cx, cy: cy, cz: cz, r: r, h: h, color: color });
    }
    function tree(cx, cz, collide) {
      if (collide) boxes.push({ x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5, h: 5 });
      deco(cx, 0.6, cz, 0.5, 1.2, 0.5, 0x8a5a33);
      cone(cx, 2.4, cz, 1.7, 2.6, 0x2f9a4e);
      cone(cx, 3.9, cz, 1.2, 2.2, 0x3bb35c);
    }

    /* Everything is placed on the "blue" half (z > 0) and mirrored onto the red half,
       so the map is perfectly fair for both teams. */
    function both(x, z, w, d, h, kind) {
      [[x, z], [-x, -z]].forEach(function (p) {
        const zone = Math.abs(p[1]) < 10 ? 0 : (p[1] > 0 ? 1 : 2);   // 0 neutral, 1 blue half, 2 red half
        if (kind === 'wall') {
          const c = zone === 1 ? 0x5b8fe0 : (zone === 2 ? 0xe0735b : 0xc4ccd8);
          solid(p[0], p[1], w, d, h, c, 0xeef2f7);
        } else if (kind === 'crate') {
          solid(p[0], p[1], w, d, h, 0xd9a05b, 0xf0c98a);
        } else if (kind === 'tower') {
          solid(p[0], p[1], w, d, h, 0x6f7f9f, zone === 2 ? 0xff8a6d : (zone === 1 ? 0x6fb0ff : 0xf2d46b));
        } else if (kind === 'tree') {
          tree(p[0], p[1], true);
        }
      });
    }

    /* ---------- the map ---------- */
    // outer walls
    solid(0, -HALF - 0.5, 63, 1, 4, 0x9aa5b8, 0xdfe5ee);
    solid(0, HALF + 0.5, 63, 1, 4, 0x9aa5b8, 0xdfe5ee);
    solid(-HALF - 0.5, 0, 1, 61, 4, 0x9aa5b8, 0xdfe5ee);
    solid(HALF + 0.5, 0, 1, 61, 4, 0x9aa5b8, 0xdfe5ee);

    // centre building with four doorways
    const BW = 0xcfd6e0, BC = 0xf2d46b;
    solid(-4.5, -7, 5, 1, 3.2, BW, BC); solid(4.5, -7, 5, 1, 3.2, BW, BC);
    solid(-4.5, 7, 5, 1, 3.2, BW, BC);  solid(4.5, 7, 5, 1, 3.2, BW, BC);
    solid(-7, -4.5, 1, 5, 3.2, BW, BC); solid(-7, 4.5, 1, 5, 3.2, BW, BC);
    solid(7, -4.5, 1, 5, 3.2, BW, BC);  solid(7, 4.5, 1, 5, 3.2, BW, BC);
    solid(0, 0, 2, 2, 0.9, 0xd9a05b, 0xf0c98a);
    solid(-3.5, 3, 1.6, 1.6, 0.9, 0xd9a05b, 0xf0c98a);
    solid(3.5, -3, 1.6, 1.6, 0.9, 0xd9a05b, 0xf0c98a);
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

    /* ---------- merge every visual piece into a single mesh ---------- */
    const pos = [], nor = [], col = [];
    const tmp = new T.Color();
    vis.forEach(function (b) {
      const g = (b.cone ? new T.ConeGeometry(b.r, b.h, 6) : new T.BoxGeometry(b.w, b.h, b.d)).toNonIndexed();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      tmp.set(b.color);
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i] + b.cx, p[i + 1] + b.cy, p[i + 2] + b.cz);
        nor.push(n[i], n[i + 1], n[i + 2]);
        col.push(tmp.r, tmp.g, tmp.b);
      }
      g.dispose();
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    /* ground: a tiny checker texture (cheap), plus a big plain plane so you never see the edge of the world */
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#86cf74'; c2.fillRect(0, 0, 64, 64);
    c2.fillStyle = '#78c466'; c2.fillRect(0, 0, 32, 32); c2.fillRect(32, 32, 32, 32);
    const tex = new T.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.magFilter = T.NearestFilter;
    tex.repeat.set(16, 16);
    if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    const ground = new T.Mesh(new T.PlaneGeometry(64, 64), new T.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const outer = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ color: 0x5fa65a }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.04;
    scene.add(outer);

    /* ---------- collisions ---------- */
    // Push a standing circle (radius r) out of every box it overlaps.
    function collide(e, r) {
      for (let it = 0; it < 2; it++) {
        for (let k = 0; k < boxes.length; k++) {
          const b = boxes[k];
          if (b.h <= LOW && e.y >= b.h - STEP) continue;          // feet above a low crate: free to pass
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
        if (b.h <= LOW && x > b.x0 - 0.15 && x < b.x1 + 0.15 && z > b.z0 - 0.15 && z < b.z1 + 0.15 && y >= b.h - STEP && b.h > g) g = b.h;
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
        if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > b.h) continue; }
        else { let a = (0 - oy) / dy, c = (b.h - oy) / dy; if (a > c) { const s = a; a = c; c = s; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue; }
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
        ctx.fillStyle = b.h > LOW ? '#9fb0c8' : '#c99a5b';
        ctx.fillRect((b.x0 + HALF) * s, (b.z0 + HALF) * s, (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
      });
    }

    return {
      half: HALF, boxes: boxes, mesh: mesh, spawns: spawns,
      collide: collide, groundAt: groundAt,
      rayWorld: rayWorld, clearLine: clearLine,
      findPath: findPath, randomSpot: randomSpot, lineFree: lineFree, blockedAt: blockedAt,
      drawRadarBase: drawRadarBase,
      dispose: function () {
        geo.dispose(); mesh.material.dispose(); tex.dispose();
        ground.geometry.dispose(); ground.material.dispose(); outer.geometry.dispose(); outer.material.dispose();
      }
    };
  };
})();
