/* =========================================================
   stage.js — 무대 그리기 (카메라 · 노래방 가사 · 가이드 카드)
   화면에 보이는 것 = 녹화되는 것. DOM은 조작 버튼만 얹는다.
   ========================================================= */
(function (global) {
  'use strict';

  var HB = global.HB = global.HB || {};
  var Chords = HB.Chords;

  var GOLD = '#f6cd8c';
  var GOLD_HI = '#ffdfae';
  var GOLD_DIM = 'rgba(246,205,140,.42)';
  var INK = '#fff7ec';
  var INK_DIM = 'rgba(255,247,236,.46)';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function rr(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
  }

  /* ── 레이아웃 ─────────────────────────────────────────── */
  function layout(w, h, inset) {
    inset = inset || {};
    var land = w >= h * 1.05;
    var topH = inset.top || clamp(h * 0.115, 36, 78);
    var ctlH = inset.bottom || clamp(h * 0.118, 41, 84);
    var pad = clamp(h * 0.028, 8, 22);
    var gap = clamp(h * 0.024, 7, 18);

    var cardH = clamp(h * (land ? 0.255 : 0.185), 86, 178);
    var cardW = land
      ? Math.min(w * 0.60, cardH * 3.45)
      : Math.min(w * 0.93, cardH * 2.3);

    var cardBottom = h - ctlH - gap * 0.7;
    var cardTop = cardBottom - cardH;

    var hintH = clamp(cardH * 0.115, 9, 17) * 3.5;
    var bandTop = topH + clamp(h * 0.05, 4, 26);
    var bandBottom = cardTop - hintH;

    var baseSize = land
      ? Math.min(h * 0.062, w * 0.052)
      : Math.min(h * 0.040, w * 0.072);
    baseSize = clamp(baseSize, 14, 54);

    var L = {
      w: w, h: h, land: land,
      topH: topH, ctlH: ctlH, pad: pad, gap: gap,
      cardX: (w - cardW) / 2, cardY: cardTop, cardW: cardW, cardH: cardH,
      bandTop: bandTop, bandBottom: bandBottom,
      bandH: Math.max(40, bandBottom - bandTop),
      base: baseSize,
      chordSize: baseSize * 0.60,
      lineH: baseSize * 1.02 + baseSize * 0.60 * 1.5 + baseSize * 0.34
    };
    var f = 1 - (L.lineH * 1.35) / Math.max(1, L.bandH);
    L.anchorY = bandTop + L.bandH * clamp(f, 0.30, 0.60);
    return L;
  }

  /* ── 텍스트 측정 캐시 ─────────────────────────────────── */
  var measure = document.createElement('canvas').getContext('2d');
  var cache = {};

  function fontOf(kind, size) {
    if (kind === 'lyric') return '400 ' + size.toFixed(1) + 'px "Gowun Batang", "Nanum Myeongjo", serif';
    if (kind === 'chord') return '600 ' + size.toFixed(1) + 'px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    return '500 ' + size.toFixed(1) + 'px "Pretendard Variable", Pretendard, system-ui, sans-serif';
  }

  function textWidth(text, px, font) {
    if (!text) return 0;
    var key = font + '|' + px.toFixed(1) + '|' + text;
    if (cache[key] !== undefined) return cache[key];
    measure.font = fontOf(font, px);
    var v = measure.measureText(text).width;
    cache[key] = v;
    return v;
  }

  function chordLabel(sym, tr) {
    if (!tr) return sym;
    var c = Chords.parse(sym);
    if (!c) return sym;
    return Chords.transposeSymbol(c, tr);
  }

  function degreeLabel(sym, tonicPc) {
    var c = Chords.parse(sym);
    if (!c || tonicPc == null) return '';
    var d = ((c.root - tonicPc) % 12 + 12) % 12;
    var names = { 0: '루트', 2: '2도', 4: '3도', 5: '4도', 7: '5도', 9: '6도', 11: '7도',
      1: '♭2도', 3: '♭3도', 6: '♭5도', 8: '♭6도', 10: '♭7도' };
    var base = names[d] || '';
    var minor = /^m(?!aj)/.test(c.suffix || '');
    return base + (minor && d !== 0 ? ' (m)' : '');
  }

  /* ── 카메라 ───────────────────────────────────────────── */
  function orientedSize(vw, vh, rot) {
    return rot % 180 ? { w: vh, h: vw } : { w: vw, h: vh };
  }

  function project(w, h, vw, vh, rot, mirror) {
    var o = orientedSize(vw, vh, rot);
    var s = Math.max(w / o.w, h / o.h);
    var dw = o.w * s, dh = o.h * s;
    var dx = (w - dw) / 2, dy = (h - dh) / 2;
    return function (nx, ny) {
      var x = nx, y = ny;
      if (rot === 90) { x = 1 - ny; y = nx; }
      else if (rot === 180) { x = 1 - nx; y = 1 - ny; }
      else if (rot === 270) { x = ny; y = 1 - nx; }
      var px = dx + x * dw;
      var py = dy + y * dh;
      if (mirror) px = w - px;
      return { x: px, y: py };
    };
  }

  function drawCamera(ctx, L, S) {
    var w = L.w, h = L.h;
    var video = S.video;
    if (!S.camOn || !video || !video.videoWidth) return false;

    var vw = video.videoWidth, vh = video.videoHeight;
    var o = orientedSize(vw, vh, S.rot);
    var s = Math.max(w / o.w, h / o.h);
    var dw = vw * s, dh = vh * s;

    ctx.save();
    if (S.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.translate(w / 2, h / 2);
    ctx.rotate(S.rot * Math.PI / 180);
    try {
      ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
    } catch (e) { /* 첫 프레임 전 */ }
    ctx.restore();
    return true;
  }

  function drawBackdrop(ctx, L, t) {
    var w = L.w, h = L.h;
    var g = ctx.createLinearGradient(0, 0, w * 0.35, h);
    g.addColorStop(0, '#2c2119');
    g.addColorStop(0.55, '#1c1511');
    g.addColorStop(1, '#100b08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var blobs = [
      { x: 0.32 + Math.sin(t * 0.10) * 0.06, y: 0.28 + Math.cos(t * 0.08) * 0.05, r: 0.7, c: 'rgba(190,132,72,.36)' },
      { x: 0.72 + Math.cos(t * 0.12) * 0.05, y: 0.62 + Math.sin(t * 0.09) * 0.05, r: 0.6, c: 'rgba(120,88,124,.28)' },
      { x: 0.5, y: 0.95, r: 0.65, c: 'rgba(198,150,96,.20)' }
    ];
    blobs.forEach(function (b) {
      var rg = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * Math.max(w, h) * 0.6);
      rg.addColorStop(0, b.c);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function drawGrade(ctx, L) {
    var w = L.w, h = L.h;
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(48,30,14,.34)');
    g.addColorStop(0.42, 'rgba(38,24,13,.04)');
    g.addColorStop(1, 'rgba(16,10,6,.48)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var vg = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.28, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,6,3,.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(236,180,116,.30)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  var grainCache = null;
  function drawGrain(ctx, L, t) {
    if (!grainCache) {
      var c = document.createElement('canvas');
      c.width = c.height = 96;
      var g = c.getContext('2d');
      var img = g.createImageData(96, 96);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = 128 + (Math.random() * 2 - 1) * 96;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      grainCache = c;
    }
    var pat = ctx.createPattern(grainCache, 'repeat');
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.globalCompositeOperation = 'overlay';
    var ox = (t * 17) % 96, oy = (t * 11) % 96;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, L.w + 96, L.h + 96);
    ctx.restore();
  }

  /* ── 가사 (노래방) ────────────────────────────────────── */
  function lineMetrics(compiled, L, maxW) {
    return compiled.lines.map(function (line, li) {
      var chords = line.chords || [];
      var segs = [];
      var x = 0;
      for (var i = 0; i < chords.length; i++) {
        var end = i + 1 < chords.length ? chords[i + 1].at : line.text.length;
        var txt = line.text.slice(chords[i].at, end);
        var wSeg = textWidth(txt, L.base, 'lyric');
        segs.push({ x: x, w: wSeg, text: txt, sym: chords[i].sym, left: chords[i].left, bank: chords[i].bank });
        x += wSeg;
      }
      var total = x || textWidth(line.text, L.base, 'lyric');
      var scale = 1;
      if (total > maxW && total > 0) scale = Math.max(0.62, maxW / total);
      return {
        index: li,
        text: line.text,
        segs: segs,
        total: total * scale,
        scale: scale,
        spacer: line.spacer,
        partLabel: line.partLabel,
        partIndex: line.partLine
      };
    });
  }

  function drawLyrics(ctx, L, S) {
    var compiled = S.score;
    if (!compiled || !compiled.lines.length) return;

    var key = L.w.toFixed(0) + 'x' + L.h.toFixed(0) + '|' + (S.transpose || 0) + '|' + L.base.toFixed(1) + '|' + (compiled.rev || 0);
    if (!S._lyr || S._lyrKey !== key) {
      S._lyr = lineMetrics(compiled, L, L.w * 0.84);
      S._lyrKey = key;
    }
    var metrics = S._lyr;

    var curLine = S.step ? S.step.lineIndex : 0;
    if (S.scroll == null) S.scroll = curLine;

    /* 위쪽 어둡게 — 가사가 영상 위에서 읽히도록 */
    var bg = ctx.createLinearGradient(0, 0, 0, L.bandBottom + L.base * 0.8);
    bg.addColorStop(0, 'rgba(8,5,3,.70)');
    bg.addColorStop(0.55, 'rgba(8,5,3,.32)');
    bg.addColorStop(1, 'rgba(8,5,3,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.w, L.bandBottom + L.base * 0.8);

    var anchor = L.anchorY;
    var lh = L.lineH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, L.bandTop - L.base * 1.6, L.w, (L.bandBottom + L.base * 0.15) - (L.bandTop - L.base * 1.6));
    ctx.clip();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    for (var i = 0; i < metrics.length; i++) {
      var m = metrics[i];
      var d = i - S.scroll;
      if (d < -2.1 || d > 2.1) continue;

      var active = Math.abs(d) < 0.45;
      var alpha = active ? 1 : Math.max(0, 0.6 - (Math.abs(d) - 0.45) * 0.3);
      if (alpha <= 0.015) continue;
      if (!m.text && !m.segs.length) continue;

      var y = anchor + d * lh;
      if (y < L.bandTop - lh || y > L.bandBottom + lh) continue;

      var size = L.base * m.scale;
      var tm = textWidth(m.text, size, 'lyric');
      var x0 = (L.w - tm) / 2;

      ctx.save();
      ctx.globalAlpha = alpha;

      /* ── 코드 라벨 ── */
      if (m.segs.length) {
        var csize = L.chordSize * Math.max(0.82, m.scale);
        ctx.font = fontOf('chord', csize);
        var prevRight = -1e9;
        for (var k = 0; k < m.segs.length; k++) {
          var sg = m.segs[k];
          var label = chordLabel(sg.sym, S.transpose);
          var cw = textWidth(label, csize, 'chord');
          var cxp = x0 + sg.x * m.scale + cw / 2;
          cxp = Math.max(cxp, prevRight + cw / 2 + csize * 0.22);
          cxp = Math.min(cxp, L.w - L.pad - cw / 2);
          prevRight = cxp + cw / 2;
          var cy = y - csize * 1.55;
          var isCur = active && S.step && S.step.ci === k;

          ctx.textAlign = 'center';
          if (isCur) {
            var padX = cw * 0.2 + csize * 0.26;
            ctx.save();
            ctx.shadowColor = 'rgba(255,190,110,.7)';
            ctx.shadowBlur = csize * 0.8;
            ctx.fillStyle = GOLD_HI;
            ctx.fillText(label, cxp, cy);
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,214,160,.5)';
            ctx.lineWidth = Math.max(1, csize * 0.055);
            rr(ctx, cxp - cw / 2 - padX, cy - csize * 0.9, cw + padX * 2, csize * 1.34, csize * 0.5);
            ctx.stroke();
          } else {
            ctx.fillStyle = active ? 'rgba(250,214,164,.72)' : GOLD_DIM;
            ctx.fillText(label, cxp, cy);
          }
          ctx.textAlign = 'left';
        }
      }

      /* ── 가사 ── */
      if (!m.text) { ctx.restore(); continue; }
      ctx.font = fontOf('lyric', size);

      if (active && S.step) {
        ctx.fillStyle = 'rgba(255,246,235,.40)';
        ctx.fillText(m.text, x0, y);

        var upto = textWidth(m.text.slice(0, S.step.at), size, 'lyric')
          + textWidth(S.step.text, size, 'lyric') * clamp(S.segProgress || 0, 0, 1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 - 2, y - size * 1.4, upto + 2, size * 2.1);
        ctx.clip();
        ctx.shadowColor = 'rgba(255,196,120,.5)';
        ctx.shadowBlur = size * 0.5;
        ctx.fillStyle = INK;
        ctx.fillText(m.text, x0, y);
        ctx.restore();

        /* 지금 부르는 토막 밑줄 */
        var seg = m.segs[S.step.ci];
        if (seg) {
          var ux = x0 + (seg.x + seg.w * clamp(S.segProgress || 0, 0, 1)) * m.scale;
          if (ux > x0 + 2) {
            var uy = y + size * 0.26;
            var gw = ctx.createLinearGradient(ux - size * 3, 0, ux, 0);
            gw.addColorStop(0, 'rgba(246,205,140,0)');
            gw.addColorStop(1, 'rgba(255,214,160,.7)');
            ctx.strokeStyle = gw;
            ctx.lineWidth = Math.max(1.2, size * 0.05);
            ctx.beginPath();
            ctx.moveTo(ux - size * 3, uy);
            ctx.lineTo(ux, uy);
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = active ? 'rgba(255,247,236,.9)' : 'rgba(255,247,236,.6)';
        ctx.fillText(m.text, x0, y);
      }

      ctx.restore();
    }

    ctx.restore();

    /* 화면 밖으로 밀려난 가사는 위아래 가장자리에서 사라지게 */
    var fade = ctx.createLinearGradient(0, L.bandTop - L.base, 0, L.bandTop + L.base * 2.4);
    fade.addColorStop(0, 'rgba(8,5,3,.55)');
    fade.addColorStop(1, 'rgba(8,5,3,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, L.bandTop - L.base, L.w, L.base * 3.4);

    var fade2 = ctx.createLinearGradient(0, L.bandBottom - L.base * 0.6, 0, L.bandBottom + L.base * 2);
    fade2.addColorStop(0, 'rgba(8,5,3,0)');
    fade2.addColorStop(1, 'rgba(8,5,3,.5)');
    ctx.fillStyle = fade2;
    ctx.fillRect(0, L.bandBottom - L.base * 0.6, L.w, L.base * 2.6);
  }

  /* ── 손 그림 ──────────────────────────────────────────── */
  function drawHandIcon(ctx, cx, cy, s, count, opts) {
    opts = opts || {};
    var up = [0, 0, 0, 0];
    if (count >= 1) up[0] = 1;
    if (count >= 2) up[1] = 1;
    if (count >= 3) up[2] = 1;
    if (count >= 4) up[3] = 1;
    var thumbUp = count >= 5;

    var palmW = s * 0.54, palmH = s * 0.42;
    var palmX = cx - palmW / 2;
    var palmY = cy + s * 0.02;

    var stroke = opts.color || GOLD;
    var lw = s * 0.098;

    ctx.save();
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = s * 0.32;
    }

    var grad = ctx.createLinearGradient(cx, palmY - s * 0.5, cx, palmY + palmH);
    grad.addColorStop(0, opts.hi || GOLD_HI);
    grad.addColorStop(1, opts.lo || '#d79a4d');

    ctx.strokeStyle = grad;
    ctx.fillStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;

    /* 손바닥 */
    rr(ctx, palmX, palmY, palmW, palmH, s * 0.13);
    ctx.fill();

    /* 네 손가락 */
    var xs = [-0.195, -0.065, 0.065, 0.195];
    var lens = [0.30, 0.355, 0.325, 0.255];
    for (var i = 0; i < 4; i++) {
      var fx = cx + xs[i] * s;
      var base = palmY + s * 0.03;
      var len = up[i] ? lens[i] * s : s * 0.055;
      ctx.beginPath();
      ctx.moveTo(fx, base);
      ctx.lineTo(fx, base - len);
      ctx.stroke();
    }

    /* 엄지 */
    ctx.beginPath();
    if (thumbUp) {
      ctx.moveTo(palmX + s * 0.04, palmY + palmH * 0.62);
      ctx.lineTo(palmX - s * 0.17, palmY - s * 0.06);
    } else {
      ctx.moveTo(palmX + s * 0.03, palmY + palmH * 0.5);
      ctx.lineTo(palmX + s * 0.14, palmY + palmH * 0.42);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ── 가이드 카드 ──────────────────────────────────────── */
  function drawGuide(ctx, L, S) {
    var x = L.cardX, y = L.cardY, cw = L.cardW, ch = L.cardH;
    var radius = Math.min(ch * 0.26, 30);

    var hint = S.hint || '';
    ctx.save();

    /* 안내 문구 — 카드 위 */
    if (hint) {
      var hs = clamp(ch * 0.115, 9, 17);
      ctx.font = fontOf('ui', hs);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var hw = Math.min(L.w * 0.9, textWidth(hint, hs, 'ui') + hs * 2.1);
      var hy = y - hs * 1.9;
      ctx.fillStyle = 'rgba(10,7,4,.46)';
      rr(ctx, L.w / 2 - hw / 2, hy - hs * 0.95, hw, hs * 1.9, hs);
      ctx.fill();
      ctx.fillStyle = S.matched ? GOLD_HI : 'rgba(255,240,222,.86)';
      ctx.fillText(hint, L.w / 2, hy + hs * 0.04);
      ctx.textAlign = 'left';
    }

    /* 카드 본체 */
    ctx.save();
    if (S.matched) {
      ctx.shadowColor = 'rgba(255,200,130,.5)';
      ctx.shadowBlur = ch * 0.5;
    }
    var glass = ctx.createLinearGradient(x, y, x, y + ch);
    glass.addColorStop(0, 'rgba(34,25,18,.60)');
    glass.addColorStop(1, 'rgba(18,13,9,.70)');
    ctx.fillStyle = glass;
    rr(ctx, x, y, cw, ch, radius);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = S.matched ? 'rgba(255,214,160,.85)' : 'rgba(255,214,160,.22)';
    ctx.lineWidth = Math.max(1, ch * (S.matched ? 0.011 : 0.007));
    rr(ctx, x, y, cw, ch, radius);
    ctx.stroke();

    /* 위쪽 하이라이트 */
    var hl = ctx.createLinearGradient(x, y, x, y + ch * 0.5);
    hl.addColorStop(0, 'rgba(255,236,208,.10)');
    hl.addColorStop(1, 'rgba(255,236,208,0)');
    ctx.fillStyle = hl;
    rr(ctx, x, y, cw, ch * 0.5, radius);
    ctx.fill();

    var iconS = Math.min(ch * 0.54, cw * 0.155);
    var leftCx = x + cw * 0.15;
    var rightCx = x + cw * 0.85;
    var cy = y + ch * 0.45;

    /* 왼손 = 코드 손가락 */
    drawHandIcon(ctx, leftCx, cy, iconS, S.needLeft, {
      glow: S.matched ? 'rgba(255,196,120,.7)' : null,
      color: S.matched ? GOLD_HI : GOLD
    });

    /* 오른손 = 연주/묶음 */
    drawHandIcon(ctx, rightCx, cy, iconS, S.rightCount, {
      color: S.muted ? 'rgba(240,150,130,.9)' : GOLD,
      hi: S.muted ? 'rgba(255,190,175,.95)' : GOLD_HI,
      lo: S.muted ? 'rgba(190,90,75,.95)' : '#d79a4d'
    });

    var labelY = y + ch * 0.88;
    var ls = clamp(ch * 0.10, 8, 13);
    ctx.font = fontOf('ui', ls);
    ctx.fillStyle = 'rgba(255,240,220,.5)';
    ctx.textAlign = 'center';
    ctx.fillText('왼손', leftCx, labelY);
    ctx.fillText('오른손', rightCx, labelY);
    ctx.textAlign = 'left';

    /* 가운데 코드 */
    var chordTxt = S.curChord || '—';
    var cs = clamp(Math.min(ch * 0.40, cw * 0.185), 15, 58);
    ctx.font = '700 ' + cs.toFixed(1) + 'px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = 'rgba(255,190,110,.45)';
    ctx.shadowBlur = cs * 0.5;
    ctx.fillStyle = S.muted ? 'rgba(255,240,230,.65)' : GOLD_HI;
    ctx.fillText(chordTxt, x + cw / 2, y + ch * 0.44);
    ctx.restore();

    var deg = S.curDegree || '';
    if (deg) {
      var ds = clamp(ch * 0.105, 8, 14);
      ctx.font = fontOf('ui', ds);
      ctx.fillStyle = 'rgba(255,232,205,.62)';
      ctx.fillText(deg, x + cw / 2, y + ch * 0.70);
    }

    /* 듣기 진행 — 카드 아래 얇은 선 */
    var barY = y + ch - Math.max(3, ch * 0.03);
    var barX = x + radius * 0.7;
    var barW = cw - radius * 1.4;
    ctx.strokeStyle = 'rgba(255,220,180,.14)';
    ctx.lineWidth = Math.max(2, ch * 0.022);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barW, barY);
    ctx.stroke();
    if (S.progress > 0) {
      ctx.strokeStyle = S.matched ? 'rgba(255,214,160,.95)' : 'rgba(255,214,160,.55)';
      ctx.beginPath();
      ctx.moveTo(barX, barY);
      ctx.lineTo(barX + barW * clamp(S.progress, 0, 1), barY);
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ── 손 인식 오버레이 ─────────────────────────────────── */
  var CONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10],
    [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

  function drawHands(ctx, L, S) {
    if (!S.showHands || !S.hands || !S.hands.length) return;
    var video = S.video;
    if (!S.camOn || !video || !video.videoWidth) return;

    var pr = project(L.w, L.h, video.videoWidth, video.videoHeight, S.rot, S.mirror);
    var unit = Math.min(L.w, L.h);

    S.hands.forEach(function (hd) {
      var pts = hd.landmarks.map(function (p) { return pr(p.x, p.y); });
      ctx.save();
      ctx.lineWidth = Math.max(1.4, unit * 0.0042);
      ctx.strokeStyle = 'rgba(255,214,160,.40)';
      ctx.beginPath();
      for (var i = 0; i < CONN.length; i++) {
        var a = pts[CONN[i][0]], b = pts[CONN[i][1]];
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();

      var r = Math.max(1.6, unit * 0.0042);
      for (var k = 0; k < pts.length; k++) {
        ctx.beginPath();
        ctx.arc(pts[k].x, pts[k].y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,235,205,.7)';
        ctx.fill();
      }

      /* 손 라벨 */
      var palm = pr(hd.x, hd.y);
      var label = (hd.label === 'L' ? '왼손' : '오른손') + ' ' + hd.count;
      var fs = clamp(unit * 0.026, 10, 16);
      ctx.font = fontOf('ui', fs);
      var bw = textWidth(label, fs, 'ui') + fs * 1.4;
      ctx.fillStyle = 'rgba(10,7,4,.55)';
      rr(ctx, palm.x - bw / 2, palm.y + unit * 0.06, bw, fs * 1.75, fs * 0.9);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,232,205,.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, palm.x, palm.y + unit * 0.06 + fs * 0.9);
      ctx.restore();
    });
  }

  /* ── 곡 제목 / 상태 배지 ──────────────────────────────── */
  function drawTitle(ctx, L, S) {
    if (!S.partLabel) return;
    var fs = clamp(L.h * 0.021, 9.5, 16);
    ctx.save();
    ctx.font = fontOf('ui', fs);
    ctx.textBaseline = 'middle';
    var y = L.topH + fs * 1.15;
    var x = L.pad + 2;
    var cw = textWidth(S.partLabel, fs, 'ui') + fs * 1.7;
    ctx.fillStyle = 'rgba(10,7,4,.44)';
    rr(ctx, x, y - fs * 0.92, cw, fs * 1.84, fs * 0.92);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,226,190,.9)';
    ctx.textAlign = 'left';
    ctx.fillText(S.partLabel, x + fs * 0.85, y);
    ctx.restore();
  }

  function drawRecBadge(ctx, L, S) {
    if (!S.recording) return;
    var fs = clamp(L.h * 0.021, 10, 16);
    var label = 'REC ' + (S.recText || '00:00');
    ctx.save();
    ctx.font = fontOf('ui', fs);
    var bw = textWidth(label, fs, 'ui') + fs * 3.2;
    var x = L.w - L.pad - bw;
    var y = L.topH + fs * 0.9 - fs * 0.95;
    ctx.fillStyle = 'rgba(24,8,6,.62)';
    rr(ctx, x, y, bw, fs * 1.9, fs * 0.95);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + fs * 1.1, y + fs * 0.95, fs * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5c4d';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,236,.92)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + fs * 1.9, y + fs * 0.98);
    ctx.restore();
  }

  function drawMuted(ctx, L, S) {
    if (!S.muted) return;
    var fs = clamp(L.h * 0.02, 10, 15);
    var label = '뮤트';
    ctx.save();
    ctx.font = fontOf('ui', fs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var bw = textWidth(label, fs, 'ui') + fs * 1.8;
    var y = L.cardY - fs * 3.5;
    ctx.fillStyle = 'rgba(90,26,20,.6)';
    rr(ctx, L.w / 2 - bw / 2, y - fs * 0.95, bw, fs * 1.9, fs * 0.95);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,205,195,.95)';
    ctx.fillText(label, L.w / 2, y + fs * 0.02);
    ctx.restore();
  }

  /* ── 렌더 ─────────────────────────────────────────────── */
  function render(ctx, w, h, S) {
    var L = layout(w, h, S.inset);
    S.L = L;

    ctx.clearRect(0, 0, w, h);
    var cam = drawCamera(ctx, L, S);
    if (!cam) drawBackdrop(ctx, L, S.time || 0);
    drawGrade(ctx, L);

    drawTitle(ctx, L, S);
    if (S.showLyric) drawLyrics(ctx, L, S);
    if (S.showCard) drawGuide(ctx, L, S);
    drawHands(ctx, L, S);
    drawRecBadge(ctx, L, S);
    drawGrain(ctx, L, S.time || 0);

    /* 아주 얇은 프레임 라인 — 릴스 느낌 */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,235,205,.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.restore();

    return L;
  }

  HB.Stage = {
    render: render,
    layout: layout,
    drawHandIcon: drawHandIcon,
    degreeLabel: degreeLabel,
    chordLabel: chordLabel,
    invalidate: function () { cache = {}; },
    _cache: function () { return cache; }
  };
})(window);
