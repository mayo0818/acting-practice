/* ===========================================================
   audio-engine.js — Web Audio 그래프·마스터 버스·BPM 분석 유틸
   iOS/iPadOS Safari 대응: 오디오 세션(무음 스위치)·제스처 잠금 해제·파일 읽기
   =========================================================== */
(function () {
  'use strict';
  const DJ = (window.DJ = window.DJ || {});

  DJ.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  DJ.lerp = (a, b, t) => a + (b - a) * t;
  DJ.fmtTime = function (sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  };

  /* ---------- helpers ---------- */
  DJ.makeNoise = function (ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * (seconds || 2));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  DJ.distCurve = function (k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return c;
  };

  /* ---------- iOS 파일 읽기/디코딩 ----------
     iOS Safari에서는 ① input.value='' 를 먼저 지우면 File 접근이 막히고
     ② ArrayBuffer 가 분리되면 decodeAudioData 가 실패한다.
     FileReader 로 읽고, 실패하면 복사본으로 한 번 더 시도한다. */
  DJ.readArrayBuffer = function (file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('파일이 없습니다')); return; }
      let fr;
      try {
        fr = new FileReader();
      } catch (e) { reject(e); return; }
      fr.onload = () => {
        if (fr.result && fr.result.byteLength) resolve(fr.result);
        else reject(new Error('파일을 읽지 못했습니다'));
      };
      fr.onerror = () => reject(fr.error || new Error('파일을 읽지 못했습니다'));
      fr.onabort = () => reject(new Error('파일 읽기가 취소되었습니다'));
      try {
        fr.readAsArrayBuffer(file);
      } catch (e) {
        reject(e);
      }
    });
  };

  DJ.decodeAudio = function (ctx, arr) {
    return new Promise((resolve, reject) => {
      let done = false;
      const ok = (b) => { if (!done) { done = true; resolve(b); } };
      const fail = (e) => { if (!done) { done = true; reject(e || new Error('decode 실패')); } };
      let p = null;
      try {
        p = ctx.decodeAudioData(arr, ok, fail);
      } catch (e) {
        fail(e);
      }
      if (p && typeof p.then === 'function') p.then(ok, fail);
    });
  };

  /* 파일 → AudioBuffer (iOS 재시도 포함) */
  DJ.decodeFile = async function (ctx, file) {
    const arr = await DJ.readArrayBuffer(file);
    try {
      return await DJ.decodeAudio(ctx, arr);
    } catch (e1) {
      // iOS: 첫 시도에서 버퍼가 분리되거나 실패하면 복사본으로 재시도
      const copy = arr.slice(0);
      return await DJ.decodeAudio(ctx, copy);
    }
  };

  /* ---------- 무음 WAV(0.1초) : iOS 오디오 세션 깨우기용 ---------- */
  DJ.SILENT_WAV =
    'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

  /* ---------- BPM 추정 ---------- */
  DJ.detectBpm = function (buffer) {
    try {
      const sr = buffer.sampleRate;
      const ch = buffer.getChannelData(0);
      const hop = Math.max(1, Math.floor(sr / 200)); // 200 Hz 엔벨로프
      const n = Math.floor(ch.length / hop);
      if (n < 240) return null;

      const env = new Float32Array(n);
      const per = Math.max(1, Math.floor(hop / 2));
      for (let i = 0; i < n; i++) {
        const base = i * hop;
        let s = 0;
        for (let j = 0; j < hop; j += per) {
          const v = ch[base + j];
          s += v * v;
        }
        env[i] = Math.sqrt(s / Math.ceil(hop / per));
      }

      // 온셋(스펙트럴 플럭스의 단순화): 엔벨로프 상승분
      const flux = new Float32Array(n);
      let mean = 0;
      for (let i = 1; i < n; i++) {
        const d = env[i] - env[i - 1];
        flux[i] = d > 0 ? d : 0;
        mean += flux[i];
      }
      mean /= n;
      for (let i = 0; i < n; i++) flux[i] = Math.max(0, flux[i] - mean);

      const fps = 200;
      const minLag = Math.round((60 / 190) * fps);
      const maxLag = Math.round((60 / 65) * fps);
      const scores = new Float32Array(maxLag + 2);
      let best = -1, bestLag = -1;
      for (let lag = minLag; lag <= Math.min(maxLag, n - 2); lag++) {
        let s = 0;
        for (let i = 0; i < n - lag; i++) s += flux[i] * flux[i + lag];
        s /= n - lag;
        scores[lag] = s;
        if (s > best) { best = s; bestLag = lag; }
      }
      if (bestLag < 0 || best <= 0) return null;

      // 배음(2배·1/2배) 후보 중 더 강한 쪽 선택 → 옥타브 오류 보정
      const cand = [bestLag];
      if (bestLag * 2 <= n - 2 && scores[bestLag * 2]) cand.push(bestLag * 2);
      if (bestLag / 2 >= minLag) cand.push(Math.round(bestLag / 2));
      let pick = bestLag, pickScore = best;
      for (const lag of cand) {
        const sc = scores[lag] || 0;
        // 박자가 두 배 느린 후보는 같은 에너지라도 우선순위를 낮춤
        const w = lag > bestLag * 1.5 ? 0.72 : 1;
        if (sc * w > pickScore) { pickScore = sc * w; pick = lag; }
      }

      const y0 = scores[pick - 1] || 0, y1 = scores[pick] || 0, y2 = scores[pick + 1] || 0;
      const den = y0 - 2 * y1 + y2;
      const shift = den !== 0 ? (0.5 * (y0 - y2)) / den : 0;
      let bpm = (60 * fps) / (pick + DJ.clamp(shift, -1, 1));
      while (bpm < 80) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      return Math.round(bpm * 10) / 10;
    } catch (e) {
      return null;
    }
  };

  /* ---------- AudioEngine ---------- */
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.unlocked = false;
      this.noiseBuf = null;
      this._dist = null;
      this._vu = { l: new Float32Array(1024), r: new Float32Array(1024) };
      this.lastLevel = { l: 0, r: 0, peakL: 0, peakR: 0 };
      this._peakHold = { l: 0, r: 0, t: 0 };

      this._silentEl = null;
      this._silentTried = false;
      this.sessionType = 'none';
      this._gestures = 0;
      this._gAt = 0;
      this._everRunning = false;
      this._kicked = false;
      this._rebuilt = 0;
    }

    /* 같은 탭에서 6종류 이벤트가 모두 들어오므로 제스처는 300ms 에 한 번만 센다 */
    _countGesture() {
      const now = performance.now();
      if (!this._gAt || now - this._gAt > 300) {
        this._gestures++;
        this._gAt = now;
      }
    }

    /* iPadOS: 오디오 세션을 playback 으로 올려야 무음 스위치에서도 소리가 난다 */
    applySession() {
      try {
        const s = navigator.audioSession;
        if (!s) { this.sessionType = 'unsupported'; return; }
        if (s.type !== 'playback') s.type = 'playback';
        this.sessionType = s.type || 'playback';
      } catch (e) {
        this.sessionType = 'error';
      }
    }

    /* iOS 구버전: 무음 오디오 요소를 재생해 미디어 채널을 열어 둔다 */
    primeSilentElement() {
      try {
        if (!this._silentEl) {
          const el = document.createElement('audio');
          el.setAttribute('playsinline', '');
          el.setAttribute('webkit-playsinline', '');
          el.setAttribute('preload', 'auto');
          el.setAttribute('aria-hidden', 'true');
          el.loop = true;
          el.volume = 1;
          el.src = DJ.SILENT_WAV;
          el.style.cssText =
            'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1';
          (document.body || document.documentElement).appendChild(el);
          this._silentEl = el;
        }
        const el = this._silentEl;
        if (el.paused) {
          const p = el.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        this._silentTried = true;
      } catch (e) { /* noop */ }
    }

    /* 1샘플 무음 재생: iOS 에서 그래프를 확실히 깨우는 용도 */
    kick() {
      const ctx = this.ctx;
      if (!ctx) return;
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
        this._kicked = true;
      } catch (e) { /* noop */ }
    }

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      let ctx;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        ctx = new AC();
      }
      this.ctx = ctx;
      this._build();
      this.unlocked = ctx.state === 'running';
      ctx.onstatechange = () => {
        this.unlocked = ctx.state === 'running';
        if (this.unlocked) { this._kicked = false; this._everRunning = true; }
        window.dispatchEvent(new CustomEvent('dj:audio-state', { detail: ctx.state }));
      };
      return ctx;
    }

    _build() {
      const ctx = this.ctx;
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0.82;

      this.padBus = ctx.createGain();
      this.padBus.gain.value = 0.85;

      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -9;
      this.comp.knee.value = 8;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.18;

      this.splitter = ctx.createChannelSplitter(2);
      this.anL = ctx.createAnalyser();
      this.anR = ctx.createAnalyser();
      [this.anL, this.anR].forEach((a) => {
        a.fftSize = 1024;
        a.smoothingTimeConstant = 0.6;
      });
      this.merger = ctx.createChannelMerger(2);

      // padBus + 데크 → masterGain → 컴프레서 → 분석 → 스피커
      this.comp.connect(this.splitter);
      this.splitter.connect(this.anL, 0, 0);
      this.splitter.connect(this.anR, 1, 0);
      this.anL.connect(this.merger, 0, 0);
      this.anR.connect(this.merger, 0, 1);
      this.merger.connect(ctx.destination);
      this.masterGain.connect(this.comp);
      this.padBus.connect(this.masterGain);

      this.noiseBuf = DJ.makeNoise(ctx, 2);
      this._dist = DJ.distCurve(2.4);
    }

    get running() {
      return !!this.ctx && this.ctx.state === 'running';
    }

    /* -------- 제스처 핸들러에서 '동기적으로' 호출하는 잠금 해제 --------
       await 없이 ctx.resume() 을 즉시 호출해야 iOS Safari 가 인정한다. */
    unlockSync() {
      this.applySession();
      const ctx = this.ensure();
      this._countGesture();
      if (ctx.state !== 'running') {
        try {
          const p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) { /* noop */ }
      }
      if (ctx.state === 'running' && !this._kicked) this.kick();
      if (!this._silentTried) this.primeSilentElement();
      this.unlocked = ctx.state === 'running';
      if (this.unlocked) this._everRunning = true;
      return this.unlocked;
    }

    /* 비동기 버전 (파일 로드 등 제스처 밖 흐름에서도 사용) */
    async unlock() {
      this.applySession();
      const ctx = this.ensure();
      this._countGesture();
      if (ctx.state !== 'running') {
        try { await ctx.resume(); } catch (e) { /* 사용자 제스처 필요 */ }
      }
      if (ctx.state === 'running' && !this._kicked) this.kick();
      if (!this._silentTried) this.primeSilentElement();
      this.unlocked = ctx.state === 'running';
      if (this.unlocked) this._everRunning = true;
      return this.unlocked;
    }

    /* 제스처를 여러 번 받았는데도 계속 잠겨 있으면 컨텍스트를 새로 만든다
       (iOS 에서 페이지 로드 시점에 만든 컨텍스트가 영영 안 깨어나는 경우 대비) */
    rescueIfStuck() {
      const ctx = this.ctx;
      if (!ctx) return false;
      if (ctx.state === 'running' || this._everRunning) return false;
      if (this._gestures < 3 || this._rebuilt >= 2) return false;
      try { ctx.close(); } catch (e) { /* noop */ }
      this.ctx = null;
      this.unlocked = false;
      this._kicked = false;
      this._rebuilt++;
      const fresh = this.ensure();
      try {
        const p = fresh.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (e) { /* noop */ }
      this.kick();
      this.unlocked = fresh.state === 'running';
      window.dispatchEvent(new CustomEvent('dj:ctx-rebuilt'));
      return true;
    }

    get t() { return this.ctx ? this.ctx.currentTime : 0; }

    setMaster(v) {
      if (!this.ctx) return;
      this.masterGain.gain.setTargetAtTime(v, this.t, 0.02);
    }

    setPadVolume(v) {
      if (!this.ctx) return;
      this.padBus.gain.setTargetAtTime(v, this.t, 0.02);
    }

    /* 실시간 레벨(RMS + 피크) */
    levels() {
      const out = this.lastLevel;
      if (!this.ctx || this.ctx.state !== 'running') {
        out.l = out.r = 0;
        return out;
      }
      const buf = this._vu;
      this.anL.getFloatTimeDomainData(buf.l);
      this.anR.getFloatTimeDomainData(buf.r);
      const calc = (arr) => {
        let peak = 0, sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i];
          sum += v * v;
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
        }
        return { rms: Math.sqrt(sum / arr.length), peak };
      };
      const L = calc(buf.l), R = calc(buf.r);
      out.l = L.rms;
      out.r = R.rms;
      const now = performance.now();
      if (L.peak > this._peakHold.l || now - this._peakHold.t > 900) {
        this._peakHold.l = Math.max(L.peak, this._peakHold.l * 0.86);
        this._peakHold.t = now;
      } else {
        this._peakHold.l *= 0.9;
      }
      if (R.peak > this._peakHold.r) this._peakHold.r = R.peak;
      else this._peakHold.r *= 0.9;
      out.peakL = this._peakHold.l;
      out.peakR = this._peakHold.r;
      return out;
    }
  }

  DJ.AudioEngine = AudioEngine;
})();
