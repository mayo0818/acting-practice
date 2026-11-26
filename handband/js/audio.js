/* =========================================================
   audio.js — Web Audio 코드 신스
   Warm Pad · Electric Piano · Lush Synth · Music Box
   코드 전환 시 부드러운 어택/릴리즈 + 리버브/코러스
   ========================================================= */
(function (global) {
  'use strict';

  var PRESETS = {
    warm: {
      label: 'Warm Pad', desc: '릴스 기본 감성',
      attack: 0.55, decay: 1.1, sustain: 0.82, rel: 1.25,
      cutoff: 1450, q: 0.7, rev: 0.55, cho: 0.45,
      layers: [
        { type: 'sawtooth', detune: -7, level: 0.40 },
        { type: 'sawtooth', detune: 7, level: 0.40 },
        { type: 'triangle', octave: -12, level: 0.32 }
      ]
    },
    ep: {
      label: 'Electric Piano', desc: '잔잔한 반주',
      attack: 0.008, decay: 1.45, sustain: 0.40, rel: 0.75,
      cutoff: 3100, q: 0.5, rev: 0.38, cho: 0.20,
      layers: [
        { type: 'triangle', level: 0.80 },
        { type: 'sine', octave: 12, level: 0.18 },
        { type: 'sine', octave: -12, level: 0.24 }
      ]
    },
    lush: {
      label: 'Lush Synth', desc: '넓게 번지는 브라스',
      attack: 0.30, decay: 0.9, sustain: 0.90, rel: 1.45,
      cutoff: 2400, q: 1.2, rev: 0.52, cho: 0.62,
      layers: [
        { type: 'sawtooth', detune: -14, level: 0.34 },
        { type: 'sawtooth', detune: 0, level: 0.34 },
        { type: 'sawtooth', detune: 14, level: 0.34 },
        { type: 'square', octave: -12, level: 0.12 }
      ]
    },
    bell: {
      label: 'Music Box', desc: '맑은 오르골',
      attack: 0.005, decay: 1.9, sustain: 0.05, rel: 1.7,
      cutoff: 5200, q: 0.4, rev: 0.62, cho: 0.16,
      layers: [
        { type: 'sine', level: 0.68 },
        { type: 'sine', octave: 12, level: 0.32 },
        { type: 'triangle', octave: 19, level: 0.14 }
      ]
    }
  };

  function Synth() {
    this.ctx = null;
    this.preset = 'warm';
    this.voice = null;
    this.volume = 0.82;
    this.reverb = 0.55;
    this.level = 0;
    this._expr = { vol: 1, bright: 1 };
  }

  Synth.prototype.isReady = function () { return !!this.ctx; };

  Synth.prototype.start = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return Promise.resolve();
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return Promise.reject(new Error('no-webaudio'));

    var ctx = this.ctx = new AC({ latencyHint: 'interactive' });

    this.voiceBus = ctx.createGain();
    this.expr = ctx.createGain();          // 손 오므림 → 음량
    this.expr.gain.value = 0.9;
    this.tone = ctx.createBiquadFilter();  // 손 거리 → 밝기
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 1450;
    this.tone.Q.value = 0.7;

    this.master = ctx.createGain();
    this.master.gain.value = 0.82;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;

    this.dest = ctx.createMediaStreamDestination();

    // 리버브
    this.revSend = ctx.createGain();
    this.conv = ctx.createConvolver();
    this.conv.buffer = this._makeIR(2.6, 2.4);
    this.revOut = ctx.createGain();
    this.revOut.gain.value = 0.55;

    // 코러스
    this.choSend = ctx.createGain();
    this.choDelay = ctx.createDelay(0.2);
    this.choDelay.delayTime.value = 0.019;
    this.choFb = ctx.createGain();
    this.choFb.gain.value = 0.22;
    this.choLfo = ctx.createOscillator();
    this.choLfo.frequency.value = 0.27;
    this.choDepth = ctx.createGain();
    this.choDepth.gain.value = 0.0032;

    // 라우팅
    this.voiceBus.connect(this.expr);
    this.expr.connect(this.tone);
    this.tone.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.comp.connect(this.dest);
    this.comp.connect(this.analyser);

    this.voiceBus.connect(this.revSend);
    this.revSend.connect(this.conv);
    this.conv.connect(this.revOut);
    this.revOut.connect(this.tone);

    this.voiceBus.connect(this.choSend);
    this.choSend.connect(this.choDelay);
    this.choDelay.connect(this.choFb);
    this.choFb.connect(this.choDelay);
    this.choDelay.connect(this.tone);
    this.choLfo.connect(this.choDepth);
    this.choDepth.connect(this.choDelay.delayTime);
    this.choLfo.start();

    this.setPreset(this.preset);
    this.setVolume(this.volume);
    this.setReverb(this.reverb);

    if (ctx.state === 'suspended') ctx.resume();
    return Promise.resolve();
  };

  Synth.prototype._makeIR = function (seconds, decay) {
    var ctx = this.ctx;
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  };

  Synth.prototype.available = function () {
    return Object.keys(PRESETS).map(function (k) {
      return { id: k, label: PRESETS[k].label, desc: PRESETS[k].desc };
    });
  };

  Synth.prototype.setPreset = function (id) {
    if (!PRESETS[id]) return;
    this.preset = id;
    var p = PRESETS[id];
    if (!this.ctx) return;
    this.choSend.gain.setTargetAtTime(p.cho, this.ctx.currentTime, 0.08);
    this.revSend.gain.setTargetAtTime(p.rev * this.reverb * 1.4, this.ctx.currentTime, 0.08);
    this.tone.Q.setTargetAtTime(p.q, this.ctx.currentTime, 0.1);
    this._applyTone();
  };

  Synth.prototype.setVolume = function (v) {
    this.volume = v;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0.9 * v, this.ctx.currentTime, 0.06);
  };

  Synth.prototype.setReverb = function (v) {
    this.reverb = v;
    if (!this.ctx) return;
    var p = PRESETS[this.preset];
    this.revOut.gain.setTargetAtTime(0.12 + v * 0.9, this.ctx.currentTime, 0.08);
    this.revSend.gain.setTargetAtTime(p.rev * v * 1.4, this.ctx.currentTime, 0.08);
  };

  /* 손 제스처 → 음량 · 밝기 */
  Synth.prototype.setExpression = function (vol, bright) {
    this._expr.vol = Math.max(0, Math.min(1, vol));
    this._expr.bright = Math.max(0, Math.min(1, bright));
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    this.expr.gain.setTargetAtTime(0.05 + 0.95 * this._expr.vol, t, 0.05);
    this._applyTone();
  };

  Synth.prototype._applyTone = function () {
    if (!this.ctx) return;
    var p = PRESETS[this.preset];
    var cut = p.cutoff * (0.32 + 0.68 * this._expr.bright);
    this.tone.frequency.setTargetAtTime(Math.max(180, Math.min(9000, cut)), this.ctx.currentTime, 0.06);
  };

  /* 코드 연주 — notes: MIDI 번호 배열 */
  Synth.prototype.play = function (notes, vel) {
    if (!this.ctx || !notes || !notes.length) return;
    var ctx = this.ctx, p = PRESETS[this.preset], t = ctx.currentTime;
    this.release(0.28);

    var n = notes.length;
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(this.voiceBus);

    var peak = (vel == null ? 1 : vel) * 0.85 / Math.sqrt(Math.max(1, n * 0.75));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + p.attack);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak * p.sustain), t + p.attack + p.decay);

    var oscs = [];
    for (var i = 0; i < notes.length; i++) {
      var freq = 440 * Math.pow(2, (notes[i] - 69) / 12);
      for (var L = 0; L < p.layers.length; L++) {
        var layer = p.layers[L];
        var o = ctx.createOscillator();
        o.type = layer.type;
        o.frequency.value = freq * Math.pow(2, (layer.octave || 0) / 12);
        if (layer.detune) o.detune.value = layer.detune;
        var lg = ctx.createGain();
        lg.gain.value = layer.level;
        o.connect(lg);
        lg.connect(g);
        o.start(t);
        oscs.push(o);
      }
    }

    this.voice = { g: g, oscs: oscs };
    this.currentNotes = notes.slice();
  };

  Synth.prototype.release = function (fade) {
    if (!this.voice || !this.ctx) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var p = PRESETS[this.preset];
    var f = fade == null ? p.rel : fade;
    var g = this.voice.g, oscs = this.voice.oscs;
    try {
      if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t);
      else { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); }
    } catch (e) { /* noop */ }
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, f));
    var stopAt = t + Math.max(0.05, f) + 0.06;
    oscs.forEach(function (o) { try { o.stop(stopAt); } catch (e) { /* noop */ } });
    this.voice = null;
    this.currentNotes = null;
  };

  /* 시각화용 레벨 (0~1) */
  Synth.prototype.readLevel = function () {
    if (!this.analyser) return 0;
    var buf = this._buf || (this._buf = new Uint8Array(this.analyser.fftSize));
    this.analyser.getByteTimeDomainData(buf);
    var sum = 0;
    for (var i = 0; i < buf.length; i++) {
      var v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    var rms = Math.sqrt(sum / buf.length);
    this.level = this.level * 0.72 + Math.min(1, rms * 3.4) * 0.28;
    return this.level;
  };

  Synth.prototype.streamTrack = function () {
    return this.dest ? this.dest.stream.getAudioTracks()[0] : null;
  };

  global.HB = global.HB || {};
  global.HB.Synth = Synth;
  global.HB.PRESETS = PRESETS;
})(window);
