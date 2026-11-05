/* EduStrike - ULTRA REALISM (loaded only when a student picks the Ultra level, so everybody else downloads nothing extra).
   What it adds on top of High:
     1. REFLECTIONS   a sky picture made by code is blurred into a "reflection map": guns, helmets and shiny things pick up the sky and the sun.
     2. GLOW + COLOUR  the picture is drawn to a spare canvas first, then bright things (sun glints, energy strips, shots) glow softly,
                       a camera-like curve so highlights fade softly instead of blowing out, with deeper shadows and colours get a little richer.
     3. ATMOSPHERE    floating dust in the sunlight, and a puff of smoke where a shot hits.
     4. MUZZLE LIGHT  your gun really lights up the ground and walls for a moment when you fire.
   SAFETY CHECKS: every step is wrapped in try/catch; if this computer cannot do it (no WebGL2, no half-float canvas, any error) the game quietly
   keeps the normal High-style picture; stepping down to High removes everything again (dispose). Nothing here changes the rules or the network. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  ES.ultra = {
    ready: true,
    /* ctx: { T (three.js), renderer, scene, camera, sun, hemi, sky (map sky colours or null), wrap, stars (night map) } */
    attach: function (ctx) {
      const T = ctx.T, renderer = ctx.renderer, scene = ctx.scene, camera = ctx.camera;
      const U = { on: false, ok: {}, dispose: dispose, render: render, resize: resize, update: update, shot: shot, impact: impact };
      const tidy = [];                                   // everything we made, so dispose can remove it
      const saved = { tone: renderer.toneMapping, hemi: ctx.hemi ? ctx.hemi.intensity : 0, sun: ctx.sun ? ctx.sun.intensity : 0, env: scene.environment };

      /* ---------- 1. reflection map (sky gradient + a bright sun) ---------- */
      try {
        const sk = ctx.sky || {};
        const col = function (hex, d) { return new T.Color(hex !== undefined ? hex : d); };
        const sunDir = ctx.sun ? ctx.sun.position.clone().normalize() : new T.Vector3(0.45, 0.8, 0.27);
        const night = !!ctx.stars;
        const mat = new T.ShaderMaterial({
          side: T.BackSide, depthWrite: false,
          uniforms: {
            top: { value: col(sk.top, 0x2f8cf0) }, mid: { value: col(sk.mid, 0xa6dbff) }, bot: { value: col(sk.bot, 0xfff3da) },
            ground: { value: col(sk.hemiGround, 0x6f9a5a).multiplyScalar(0.55) }, sunDir: { value: sunDir },
            sunCol: { value: col(sk.sun, 0xfff0d0) }, sunPow: { value: night ? 1.5 : 14.0 }
          },
          vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform vec3 top, mid, bot, ground, sunDir, sunCol; uniform float sunPow; varying vec3 vD;' +
            'void main(){ vec3 d = normalize(vD); float h = d.y;' +
            ' vec3 sky = h > 0.0 ? mix(bot, mix(mid, top, smoothstep(0.25, 0.9, h)), smoothstep(0.0, 0.3, h)) : mix(bot * 0.7, ground, smoothstep(0.0, -0.35, h));' +
            ' float s = max(dot(d, normalize(sunDir)), 0.0);' +
            ' sky += sunCol * (pow(s, 600.0) * sunPow + pow(s, 14.0) * 0.35);' +      // a hard bright sun and a soft glow around it
            ' gl_FragColor = vec4(sky, 1.0); }'
        });
        const envScene = new T.Scene(), dome = new T.Mesh(new T.SphereGeometry(50, 32, 16), mat); envScene.add(dome);
        const pm = new T.PMREMGenerator(renderer), env = pm.fromScene(envScene, 0.02);
        scene.environment = env.texture; tidy.push(function () { env.dispose(); });
        pm.dispose(); dome.geometry.dispose(); mat.dispose();
        // rough surfaces (walls, ground) only get a gentle hint of the sky; guns and helmets get the full shine
        scene.traverse(function (o) {
          if (o.material && o.material.isMeshStandardMaterial && o.userData && !o.userData.noEnv) {
            const big = o.geometry && o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.count > 20000;
            if (big || o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry') { o.material.envMapIntensity = 0.28; o.material.needsUpdate = true; }
          }
        });
        U.ok.env = true;
      } catch (e) { U.ok.env = false; }

      /* ---------- 2. glow + highlight roll-off + colour (draw to a spare canvas first) ---------- */
      let rt = null, ping = [], quad = null, quadScene = null, ortho = null, mBright = null, mBlur = null, mMix = null, mComp = null;
      let vw = 0, vh = 0, bloomOn = 1;
      try {
        const gl = renderer.getContext();
        if (!renderer.capabilities.isWebGL2) throw new Error('no WebGL2');
        if (!(renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'))) throw new Error('no float canvas');
        ortho = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        quadScene = new T.Scene();
        const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
        mBright = new T.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: vert, depthTest: false, depthWrite: false,
          fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float m = max(c.r, max(c.g, c.b));' +
            ' float k = smoothstep(1.0, 1.7, m); gl_FragColor = vec4(c * k, 1.0); }' });
        mBlur = new T.ShaderMaterial({ uniforms: { t: { value: null }, dir: { value: new T.Vector2(1, 0) } }, vertexShader: vert, depthTest: false, depthWrite: false,
          fragmentShader: 'uniform sampler2D t; uniform vec2 dir; varying vec2 vUv; void main(){' +
            ' vec3 c = texture2D(t, vUv).rgb * 0.227027; vec2 o1 = dir * 1.3846, o2 = dir * 3.2308;' +
            ' c += (texture2D(t, vUv + o1).rgb + texture2D(t, vUv - o1).rgb) * 0.316216; c += (texture2D(t, vUv + o2).rgb + texture2D(t, vUv - o2).rgb) * 0.070270;' +
            ' gl_FragColor = vec4(c, 1.0); }' });
        mMix = new T.ShaderMaterial({ uniforms: { t: { value: null } }, vertexShader: vert, depthTest: false, depthWrite: false,
          fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }' });
        mComp = new T.ShaderMaterial({
          uniforms: { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, bloom: { value: 0.22 }, time: { value: 0 } },
          vertexShader: vert, depthTest: false, depthWrite: false,
          fragmentShader: 'uniform sampler2D tScene, tB1, tB2; uniform float bloom, time; varying vec2 vUv;' +
            'vec3 roll(vec3 x){ vec3 over = max(x - 0.8, 0.0); return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2)); }' +   // bright parts fade softly to white, like a camera
            'void main(){ vec3 c = texture2D(tScene, vUv).rgb; c += (texture2D(tB1, vUv).rgb * 0.7 + texture2D(tB2, vUv).rgb * 0.9) * bloom;' +
            ' c = pow(roll(max(c, vec3(0.0))), vec3(1.14));' +                                                                          // deeper shadows + gentle contrast
            ' float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.14);' +                                          // a little richer colour
            ' c *= mix(vec3(1.03, 1.0, 0.97), vec3(0.97, 1.0, 1.04), smoothstep(0.0, 0.7, l));' +                                      // warm shadows, cool lights
            ' c += (fract(sin(dot(vUv * 1000.0 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;' +                         // tiny noise: no banding in the sky
            ' gl_FragColor = vec4(c, 1.0);\n' +
                        '#include <colorspace_fragment>\n' +
            '}'
        });
        quad = new T.Mesh(new T.PlaneGeometry(2, 2), mMix); quad.frustumCulled = false; quadScene.add(quad);
        renderer.toneMapping = T.NoToneMapping;               // our own film-like curve (below) does it, so the sky keeps its colour
        mkTargets();
        U.ok.post = true; U.on = true;
        tidy.push(function () { if (rt) rt.dispose(); ping.forEach(function (p) { p.dispose(); }); [mBright, mBlur, mMix, mComp].forEach(function (m) { m.dispose(); }); quad.geometry.dispose(); });
      } catch (e) { U.ok.post = false; U.on = false; renderer.toneMapping = saved.tone; }

      function mkTargets() {
        const size = renderer.getDrawingBufferSize(new T.Vector2());
        let w = Math.max(2, Math.round(size.x)), h = Math.max(2, Math.round(size.y));
        const cap = 2560; if (w > cap) { h = Math.round(h * cap / w); w = cap; }                 // never draw an enormous spare canvas
        if (w === vw && h === vh && rt) return;
        vw = w; vh = h;
        if (rt) rt.dispose(); ping.forEach(function (p) { p.dispose(); });
        const mk = function (ww, hh, samples) { return new T.WebGLRenderTarget(Math.max(2, ww | 0), Math.max(2, hh | 0), { type: T.HalfFloatType, format: T.RGBAFormat, depthBuffer: !!samples, samples: samples || 0, minFilter: T.LinearFilter, magFilter: T.LinearFilter }); };
        rt = mk(w, h, 4);                                                                            // the picture itself (4x smoothing of jagged edges)
        ping = [mk(w / 4, h / 4), mk(w / 4, h / 4), mk(w / 8, h / 8), mk(w / 8, h / 8)];          // quarter size and eighth size for the glow (small = fast)
      }
      function pass(mat, target, uniforms) {
        quad.material = mat; Object.keys(uniforms || {}).forEach(function (k) { mat.uniforms[k].value = uniforms[k]; });
        renderer.setRenderTarget(target); renderer.render(quadScene, ortho);
      }
      function render() {
        if (!U.on) { renderer.render(scene, camera); return; }
        try {
          renderer.setRenderTarget(rt); renderer.render(scene, camera);
          pass(mBright, ping[0], { t: rt.texture });                                                   // 1. bright bits only (quarter size)
          pass(mBlur, ping[1], { t: ping[0].texture, dir: new T.Vector2(1 / (vw / 4), 0) });          // 2. blur sideways, then up and down
          pass(mBlur, ping[0], { t: ping[1].texture, dir: new T.Vector2(0, 1 / (vh / 4)) });
          pass(mMix, ping[2], { t: ping[0].texture });                                                  // 3. shrink to an eighth and blur again (wider glow)
          pass(mBlur, ping[3], { t: ping[2].texture, dir: new T.Vector2(1 / (vw / 8), 0) });
          pass(mBlur, ping[2], { t: ping[3].texture, dir: new T.Vector2(0, 1 / (vh / 8)) });
          mComp.uniforms.time.value = (mComp.uniforms.time.value + 0.37) % 100;
          pass(mComp, null, { tScene: rt.texture, tB1: ping[0].texture, tB2: ping[2].texture });          // 4. put it all together on the screen
        } catch (e) {                                                                                  // any problem: back to the normal picture for good
          U.on = false; renderer.setRenderTarget(null); renderer.toneMapping = saved.tone; U.ok.post = false;
          try { renderer.render(scene, camera); } catch (e2) { /* the game loop reports it */ }
        }
      }
      function resize() { if (U.on) { try { mkTargets(); } catch (e) { U.on = false; renderer.toneMapping = saved.tone; } } }

      /* the picture is now drawn with softer light: the reflection map supplies sky light, so the flat lights are turned down a bit */
      if (U.ok.env && ctx.hemi) ctx.hemi.intensity = saved.hemi * 0.8;
      if (U.on && ctx.sun) ctx.sun.intensity = saved.sun * 1.05;

      /* ---------- 3. atmosphere: dust floating in the light + smoke puffs where shots hit ---------- */
      let dust = null, dustBase = null, puffs = [], puffI = 0, flash = null, flashT = 0;
      try {
        const N = 150, pos = new Float32Array(N * 3); dustBase = new Float32Array(N * 3);
        for (let i = 0; i < N * 3; i++) dustBase[i] = (Math.random() - 0.5) * 24;
        const dg = new T.BufferGeometry(); dg.setAttribute('position', new T.BufferAttribute(pos, 3));
        const dcv = document.createElement('canvas'); dcv.width = dcv.height = 32; const dx = dcv.getContext('2d'), dgr = dx.createRadialGradient(16, 16, 0, 16, 16, 16);
        dgr.addColorStop(0, 'rgba(255,248,225,1)'); dgr.addColorStop(1, 'rgba(255,248,225,0)'); dx.fillStyle = dgr; dx.fillRect(0, 0, 32, 32);
        dust = new T.Points(dg, new T.PointsMaterial({ map: new T.CanvasTexture(dcv), size: 0.09, transparent: true, opacity: ctx.stars ? 0.25 : 0.5, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
        dust.frustumCulled = false; dust.userData.shared = true; scene.add(dust);
        const pcv = document.createElement('canvas'); pcv.width = pcv.height = 64; const px = pcv.getContext('2d'), pgr = px.createRadialGradient(32, 32, 2, 32, 32, 32);
        pgr.addColorStop(0, 'rgba(235,235,235,.85)'); pgr.addColorStop(0.6, 'rgba(200,200,200,.35)'); pgr.addColorStop(1, 'rgba(200,200,200,0)'); px.fillStyle = pgr; px.fillRect(0, 0, 64, 64);
        const ptex = new T.CanvasTexture(pcv);
        for (let i = 0; i < 14; i++) {
          const sp = new T.Sprite(new T.SpriteMaterial({ map: ptex, transparent: true, depthWrite: false, opacity: 0, fog: true }));
          sp.visible = false; sp.userData.shared = true; scene.add(sp); puffs.push({ s: sp, life: 0, max: 1 });
        }
        flash = new T.PointLight(0xffc98a, 0, 9, 2); flash.position.set(0.25, -0.1, -1.0); camera.add(flash);   // lights up the ground and walls when you fire
        U.ok.fx = true;
      } catch (e) { U.ok.fx = false; }

      function shot() { flashT = 1; }
      function impact(x, y, z) {
        if (!U.ok.fx) return;
        const p = puffs[puffI++ % puffs.length]; p.life = p.max = 0.9; p.s.position.set(x, y, z); p.s.visible = true; p.s.material.opacity = 0.5; p.s.scale.setScalar(0.25);
      }
      function update(dt) {
        if (!U.ok.fx) return;
        if (flash) { flashT = Math.max(0, flashT - dt * 14); flash.intensity = flashT * 7; }
        const c = camera.position;
        if (dust) {
          const a = dust.geometry.attributes.position.array, t = performance.now() * 0.0001;
          for (let i = 0; i < a.length; i += 3) {
            const bx = dustBase[i] + Math.sin(t * 3 + i) * 0.6, by = dustBase[i + 1] + t * 0 + Math.cos(t * 2 + i * 0.7) * 0.5, bz = dustBase[i + 2] + Math.sin(t * 2.4 + i * 1.3) * 0.6;
            a[i] = c.x + ((bx - c.x % 24 + 36) % 24) - 12; a[i + 1] = Math.max(0.2, 1.6 + by * 0.35); a[i + 2] = c.z + ((bz - c.z % 24 + 36) % 24) - 12;
          }
          dust.geometry.attributes.position.needsUpdate = true;
        }
        for (let i = 0; i < puffs.length; i++) {
          const p = puffs[i]; if (p.life <= 0) continue;
          p.life -= dt; const k = 1 - Math.max(0, p.life) / p.max;
          p.s.position.y += dt * 0.7; p.s.scale.setScalar(0.25 + k * 0.9); p.s.material.opacity = 0.5 * (1 - k);
          if (p.life <= 0) p.s.visible = false;
        }
      }

      function dispose() {
        try {
          U.on = false; renderer.setRenderTarget(null); renderer.toneMapping = saved.tone;
          if (ctx.hemi) ctx.hemi.intensity = saved.hemi; if (ctx.sun) ctx.sun.intensity = saved.sun;
          scene.environment = saved.env;
          if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.dispose(); }
          puffs.forEach(function (p) { scene.remove(p.s); p.s.material.dispose(); });
          if (flash) { camera.remove(flash); flash.dispose(); }
          tidy.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
          scene.traverse(function (o) { if (o.material && o.material.isMeshStandardMaterial) o.material.needsUpdate = true; });
        } catch (e) { /* ignore - leaving Ultra must never fail */ }
      }
      return U;
    }
  };
  window.dispatchEvent(new Event('edustrike-ultra-ready'));
})();
