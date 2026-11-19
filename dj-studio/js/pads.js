/* ===========================================================
   pads.js — 16패드 런치패드: 내장 신스 사운드 + 내 파일 할당
   =========================================================== */
(function () {
  'use strict';
  const DJ = window.DJ;
  const lib = () => DJ.lib || { noise: null, dist: new Float32Array(2) };

  const env = (g, t, v, a, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };

  const SOUNDS = [
    /* 1 */ {
      id: 'kick', label: '킥', key: '1', dur: 0.45,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
        env(g, t, 0.95 * v, 0.005, 0.38);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.45); s.push(o);
        const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
        n.buffer = lib().noise; hp.type = 'highpass'; hp.frequency.value = 1500;
        ng.gain.setValueAtTime(0.28 * v, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
        n.connect(hp).connect(ng).connect(out); n.start(t, Math.random() * 1.5, 0.03); s.push(n);
      },
    },
    /* 2 */ {
      id: 'snare', label: '스네어', key: '2', dur: 0.22,
      play(c, out, t, v, s) {
        const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        n.buffer = lib().noise; bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
        env(g, t, 0.55 * v, 0.002, 0.17);
        n.connect(bp).connect(g).connect(out); n.start(t, Math.random() * 1.5, 0.22); s.push(n);
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(150, t + 0.09);
        env(og, t, 0.32 * v, 0.002, 0.08);
        o.connect(og).connect(out); o.start(t); o.stop(t + 0.12); s.push(o);
      },
    },
    /* 3 */ {
      id: 'clap', label: '클랩', key: '3', dur: 0.3,
      play(c, out, t, v, s) {
        [0, 0.011, 0.022, 0.034].forEach((off, i) => {
          const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
          n.buffer = lib().noise; bp.type = 'bandpass'; bp.frequency.value = 1250; bp.Q.value = 1.4;
          const dec = i === 3 ? 0.16 : 0.025;
          env(g, t + off, (i === 3 ? 0.5 : 0.34) * v, 0.001, dec);
          n.connect(bp).connect(g).connect(out);
          n.start(t + off, Math.random() * 1.5, dec + 0.03); s.push(n);
        });
      },
    },
    /* 4 */ {
      id: 'hat', label: '하이햇', key: '4', dur: 0.08,
      play(c, out, t, v, s) {
        const n = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
        n.buffer = lib().noise; hp.type = 'highpass'; hp.frequency.value = 7600;
        env(g, t, 0.3 * v, 0.001, 0.045);
        n.connect(hp).connect(g).connect(out); n.start(t, Math.random() * 1.5, 0.09); s.push(n);
      },
    },
    /* 5 */ {
      id: 'openhat', label: '오픈햇', key: 'q', dur: 0.42,
      play(c, out, t, v, s) {
        const n = c.createBufferSource(), hp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain();
        n.buffer = lib().noise; hp.type = 'highpass'; hp.frequency.value = 6200;
        bp.type = 'peaking'; bp.frequency.value = 9000; bp.gain.value = 6;
        env(g, t, 0.26 * v, 0.002, 0.4);
        n.connect(hp).connect(bp).connect(g).connect(out);
        n.start(t, Math.random() * 1.4, 0.45); s.push(n);
      },
    },
    /* 6 */ {
      id: 'bass808', label: '808', key: 'w', dur: 1.15,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain(), ws = c.createWaveShaper(), lp = c.createBiquadFilter();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(46, t + 0.06);
        ws.curve = lib().dist; ws.oversample = '2x';
        lp.type = 'lowpass'; lp.frequency.value = 820;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
        o.connect(ws).connect(lp).connect(g).connect(out);
        o.start(t); o.stop(t + 1.1); s.push(o);
      },
    },
    /* 7 */ {
      id: 'rim', label: '림샷', key: 'e', dur: 0.08,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = 1750;
        env(g, t, 0.22 * v, 0.001, 0.035);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.06); s.push(o);
        const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
        n.buffer = lib().noise; hp.type = 'highpass'; hp.frequency.value = 3200;
        env(ng, t, 0.2 * v, 0.001, 0.03);
        n.connect(hp).connect(ng).connect(out); n.start(t, Math.random() * 1.5, 0.05); s.push(n);
      },
    },
    /* 8 */ {
      id: 'crash', label: '크래시', key: 'r', dur: 1.8,
      play(c, out, t, v, s) {
        const n = c.createBufferSource(), hp = c.createBiquadFilter(), bp = c.createBiquadFilter(), g = c.createGain();
        n.buffer = lib().noise; hp.type = 'highpass'; hp.frequency.value = 4800;
        bp.type = 'peaking'; bp.frequency.value = 7200; bp.Q.value = 0.7; bp.gain.value = 7;
        env(g, t, 0.34 * v, 0.004, 1.7);
        n.connect(hp).connect(bp).connect(g).connect(out);
        n.start(t, Math.random() * 0.2, 1.85); s.push(n);
      },
    },
    /* 9 */ {
      id: 'tom', label: '탐', key: 'a', dur: 0.4,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(92, t + 0.24);
        env(g, t, 0.6 * v, 0.004, 0.3);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.4); s.push(o);
      },
    },
    /* 10 */ {
      id: 'airhorn', label: '에어혼', key: 's', dur: 1.0,
      play(c, out, t, v, s) {
        const lp = c.createBiquadFilter(), g = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 4200;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.03);
        g.gain.setValueAtTime(0.16 * v, t + 0.62);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        lp.connect(g).connect(out);
        [0, 0.4, -0.4].forEach((det) => {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(300, t);
          o.frequency.exponentialRampToValueAtTime(392, t + 0.09);
          o.detune.value = det * 22;
          o.connect(lp); o.start(t); o.stop(t + 0.98); s.push(o);
        });
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 7; lg.gain.value = 6;
        lfo.connect(lg).connect(lp.frequency); lfo.start(t); lfo.stop(t + 0.98); s.push(lfo);
      },
    },
    /* 11 */ {
      id: 'siren', label: '사이렌', key: 'd', dur: 1.5,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(620, t);
        for (let i = 0; i < 3; i++) {
          o.frequency.linearRampToValueAtTime(1180, t + 0.24 + i * 0.48);
          o.frequency.linearRampToValueAtTime(620, t + 0.48 + i * 0.48);
        }
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.3 * v, t + 0.05);
        g.gain.setValueAtTime(0.3 * v, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
        o.connect(g).connect(out); o.start(t); o.stop(t + 1.5); s.push(o);
      },
    },
    /* 12 */ {
      id: 'scratch', label: '스크래치', key: 'f', dur: 0.3,
      play(c, out, t, v, s) {
        const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        n.buffer = lib().noise; bp.type = 'bandpass'; bp.Q.value = 3;
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(3600, t + 0.07);
        bp.frequency.exponentialRampToValueAtTime(420, t + 0.22);
        env(g, t, 0.55 * v, 0.01, 0.26);
        n.connect(bp).connect(g).connect(out); n.start(t, Math.random(), 0.3); s.push(n);
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(90, t + 0.2);
        env(og, t, 0.12 * v, 0.01, 0.2);
        o.connect(og).connect(out); o.start(t); o.stop(t + 0.28); s.push(o);
      },
    },
    /* 13 */ {
      id: 'riser', label: '라이저', key: 'z', dur: 1.7,
      play(c, out, t, v, s) {
        const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        n.buffer = lib().noise; bp.type = 'bandpass'; bp.Q.value = 2.2;
        bp.frequency.setValueAtTime(400, t);
        bp.frequency.exponentialRampToValueAtTime(7000, t + 1.6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.4 * v, t + 1.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.68);
        n.loop = true;
        n.connect(bp).connect(g).connect(out); n.start(t); s.push(n);
        const o = c.createOscillator(), og = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(880, t + 1.55);
        og.gain.setValueAtTime(0.0001, t);
        og.gain.linearRampToValueAtTime(0.08 * v, t + 1.4);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 1.66);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
        o.connect(lp).connect(og).connect(out); o.start(t); o.stop(t + 1.7); s.push(o);
      },
    },
    /* 14 */ {
      id: 'drop', label: '드롭', key: 'x', dur: 1.2,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
        o.connect(g).connect(out); o.start(t); o.stop(t + 1.1); s.push(o);
        const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
        n.buffer = lib().noise; hp.type = 'highpass'; hp.frequency.value = 3000;
        env(ng, t, 0.3 * v, 0.005, 0.9);
        n.connect(hp).connect(ng).connect(out); n.start(t, Math.random() * 1.5, 1.0); s.push(n);
      },
    },
    /* 15 */ {
      id: 'laser', label: '레이저', key: 'c', dur: 0.4,
      play(c, out, t, v, s) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(2600, t);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
        env(g, t, 0.14 * v, 0.004, 0.3);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.36); s.push(o);
      },
    },
    /* 16 */ {
      id: 'chord', label: '코드', key: 'v', dur: 1.0,
      play(c, out, t, v, s) {
        const lp = c.createBiquadFilter(), g = c.createGain();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(2400, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + 0.8);
        lp.Q.value = 3;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        lp.connect(g).connect(out);
        [261.63, 329.63, 392.0].forEach((f, i) => {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = (i - 1) * 7;
          o.connect(lp); o.start(t); o.stop(t + 1.0); s.push(o);
        });
      },
    },
  ];

  class PadBank {
    constructor(app, gridEl, ui) {
      this.app = app;
      this.grid = gridEl;
      this.ui = ui;
      this.mode = 'oneshot';
      this.selected = 0;
      this.hits = 0;
      this.pads = SOUNDS.map((s, i) => ({
        index: i,
        id: s.id,
        label: s.label,
        key: s.key,
        dur: s.dur,
        play: s.play,
        custom: null,
        hitCount: 0,
        el: null,
        voices: [],
        timer: 0,
      }));
      this._build();
    }

    get audio() { return this.app.audio; }

    _build() {
      this.grid.innerHTML = this.pads
        .map(
          (p, i) => `
        <button class="pad" type="button" data-pad="${i}" data-row="${Math.floor(i / 4)}">
          <span class="pad__dot"></span>
          <b>${p.label}</b>
          <i>${p.key.toUpperCase()}</i>
        </button>`
        )
        .join('');

      this.grid.querySelectorAll('[data-pad]').forEach((el) => {
        const i = +el.dataset.pad;
        const pad = this.pads[i];
        pad.el = el;
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          el.setPointerCapture(e.pointerId);
          this.select(i);
          this._down(i);
        });
        el.addEventListener('pointerup', () => this._up(i));
        el.addEventListener('pointercancel', () => this._up(i));
        el.addEventListener('lostpointercapture', () => this._up(i));
        el.addEventListener('contextmenu', (e) => e.preventDefault());
      });

      this.ui.mode.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b) return;
        this.setMode(b.dataset.mode);
      });
      this.ui.assignBtn.addEventListener('click', () => this.ui.file.click());
      this.ui.clearBtn.addEventListener('click', () => this.clearSelected());
      this.ui.file.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) this.assignFile(f);
        e.target.value = '';
      });
      this.ui.vol.addEventListener('input', () => {
        const v = +this.ui.vol.value / 100;
        this.ui.volVal.textContent = Math.round(v * 100);
        this.ui.vol.style.setProperty('--fill', this.ui.vol.value + '%');
        this.audio.setPadVolume(v);
      });
      this.ui.vol.style.setProperty('--fill', this.ui.vol.value + '%');
      this.select(0);
    }

    setMode(mode) {
      this.mode = mode;
      this.ui.mode.querySelectorAll('[data-mode]').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.mode === mode);
      });
      if (this.ui.modeDesc) {
        const desc = {
          oneshot: '<b>원샷</b> · 한 번 누르면 끝까지 재생됩니다.',
          hold: '<b>홀드</b> · 누르고 있는 동안만 소리가 납니다.',
          loop: '<b>루프</b> · 누르고 있는 동안 계속 반복됩니다.',
        };
        this.ui.modeDesc.innerHTML = desc[mode] || '';
      }
    }

    select(i) {
      this.selected = DJ.clamp(i, 0, this.pads.length - 1);
      const pad = this.pads[this.selected];
      this.pads.forEach((p) => p.el && p.el.classList.toggle('is-sel', p.index === this.selected));
      this.ui.selName.textContent = pad.custom ? pad.custom.name : pad.label;
      this.ui.selTag.textContent = pad.custom ? '내 샘플' : '내장 사운드';
    }

    _down(i) {
      const pad = this.pads[i];
      pad.voices = pad.voices.filter((v) => v.alive);
      this.trigger(i, 1);
      pad.el.classList.add('is-hit');
      clearTimeout(pad.timer);
      if (this.mode === 'oneshot') {
        pad.timer = setTimeout(() => pad.el.classList.remove('is-hit'), 130);
      } else if (this.mode === 'loop') {
        const interval = DJ.clamp(pad.dur * 1000, 130, 620);
        pad.timer = setInterval(() => this.trigger(i, 0.9), interval);
      }
    }

    _up(i) {
      const pad = this.pads[i];
      if (this.mode !== 'oneshot') {
        clearInterval(pad.timer);
        clearTimeout(pad.timer);
        pad.timer = 0;
        const now = this.audio.ctx ? this.audio.ctx.currentTime : 0;
        pad.voices.forEach((v) => { try { v.stop(now); } catch (e) { /* noop */ } });
        pad.voices = [];
        pad.el.classList.remove('is-hit');
      }
    }

    trigger(i, velocity) {
      const pad = this.pads[i];
      const audio = this.audio;
      const c = audio.ctx;
      if (!c) { audio.ensure(); }
      const ctx = audio.ctx;
      pad.hitCount++;
      this.hits++;

      const t = ctx.currentTime + 0.002;
      const vg = ctx.createGain();
      vg.gain.value = 1;
      vg.connect(audio.padBus);
      const sources = [];
      let voice;

      if (pad.custom) {
        const src = ctx.createBufferSource();
        src.buffer = pad.custom.buffer;
        if (this.mode === 'loop') src.loop = true;
        src.connect(vg);
        src.start(t);
        sources.push(src);
      } else {
        pad.play(ctx, vg, t, velocity, sources);
      }

      const self = this;
      voice = {
        alive: true,
        stop(at) {
          if (!this.alive) return;
          this.alive = false;
          const when = Math.max(at || ctx.currentTime, ctx.currentTime);
          try {
            vg.gain.cancelScheduledValues(when);
            vg.gain.setValueAtTime(Math.max(0.0002, vg.gain.value), when);
            vg.gain.linearRampToValueAtTime(0.0001, when + 0.03);
          } catch (e) { /* noop */ }
          setTimeout(() => {
            sources.forEach((s) => { try { s.stop(); } catch (e) { /* noop */ } });
            try { vg.disconnect(); } catch (e) { /* noop */ }
          }, 90);
          self.pads[i].voices = self.pads[i].voices.filter((v) => v !== this);
        },
      };
      if (this.mode !== 'oneshot') pad.voices.push(voice);
      return voice;
    }

    async assignFile(file) {
      if (!file) return;
      const audio = this.audio;
      await audio.unlock();
      const ctx = audio.ensure();
      try {
        const arr = await file.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        const pad = this.pads[this.selected];
        pad.custom = { buffer: buf, name: file.name.replace(/\.[^.]+$/, '') };
        pad.el.classList.add('is-custom');
        pad.el.classList.remove('is-nosound');
        const short = pad.custom.name.length > 9 ? pad.custom.name.slice(0, 8) + '…' : pad.custom.name;
        pad.el.querySelector('b').textContent = short;
        this.select(this.selected);
        this.app.toast(`패드 ${this.selected + 1}에 “${pad.custom.name}” 할당`);
      } catch (e) {
        this.app.toast('이 파일은 열 수 없어요. MP3·M4A·WAV로 시도해 주세요.');
      }
    }

    clearSelected() {
      const pad = this.pads[this.selected];
      if (!pad.custom) {
        this.app.toast('이 패드는 원래 내장 사운드예요');
        return;
      }
      pad.custom = null;
      pad.el.classList.remove('is-custom');
      pad.el.querySelector('b').textContent = pad.label;
      this.select(this.selected);
      this.app.toast(`패드 ${this.selected + 1} 초기화`);
    }

    snapshot() {
      return {
        mode: this.mode,
        selected: this.selected,
        hits: this.hits,
        pads: this.pads.map((p) => ({
          index: p.index,
          label: p.label,
          custom: !!p.custom,
          customName: p.custom ? p.custom.name : null,
          hitCount: p.hitCount,
        })),
      };
    }
  }

  DJ.PadBank = PadBank;
  DJ.SOUNDS = SOUNDS;
})();
