/* ===========================================================
   audio-engine.js — Web Audio 그래프·마스터 버스·BPM 분석 유틸
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
    }

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this._build();
      this.unlocked = ctx.state === 'running';
      ctx.onstatechange = () => {
        this.unlocked = ctx.state === 'running';
        window.dispatchEvent(new CustomEvent('dj:audio-state', { detail: ctx.state }));
      };
      return ctx;
    }

    _build() {
      const ctx = this.ctx;
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0.82;

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

      this.masterGain.connect(this.comp);
      this.comp.connect(this.splitter);
      this.splitter.connect(this.anL, 0, 0);
      this.splitter.connect(this.anR, 1, 0);
      this.anL.connect(this.merger, 0, 0);
      this.anR.connect(this.merger, 0, 1);
      this.merger.connect(ctx.destination);

      this.noiseBuf = DJ.makeNoise(ctx, 2);
      this._dist = DJ.distCurve(2.4);

      // 패드 전용 버스
      this.padBus = ctx.createGain();
      this.padBus.gain.value = 0.85;
      this.padBus.connect(this.masterGain);
    }

    async unlock() {
      const ctx = this.ensure();
      if (ctx.state !== 'running') {
        try { await ctx.resume(); } catch (e) { /* 사용자 제스처 필요 */ }
      }
      if (ctx.state === 'running') {
        // iOS: 무음 버퍼 1샘플 재생으로 세션 확실히 깨우기
        try {
          const b = ctx.createBuffer(1, 1, ctx.sampleRate);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start(0);
        } catch (e) { /* noop */ }
      }
      this.unlocked = ctx.state === 'running';
      return this.unlocked;
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
