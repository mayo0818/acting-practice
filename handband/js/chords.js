/* =========================================================
   chords.js — 범용 코드 파서 + 보이싱
   C · Cm · Cmaj7 · Am7 · Fmaj7 · G7 · Eb maj7 · Bb7 · Fm7 ·
   Dm7 · Gsus4 · Bdim · C/E · D/F# · A7 · G7#9 … 전부 처리
   ========================================================= */
(function (global) {
  'use strict';

  var LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MIX = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  function mod12(n) { return ((n % 12) + 12) % 12; }

  /* 코드 루트 문자열 → pitch class */
  function readNote(str) {
    var m = /^([A-Ga-g])([#b]{0,2})/.exec(str || '');
    if (!m) return null;
    var pc = LETTER[m[1].toUpperCase()];
    for (var i = 0; i < m[2].length; i++) pc += m[2][i] === '#' ? 1 : -1;
    return { pc: mod12(pc), accidental: m[2].indexOf('b') >= 0 ? 'b' : (m[2].indexOf('#') >= 0 ? '#' : '') , len: m[0].length };
  }

  /* 품질 문자열 → 반음 인터벌 집합 */
  function parseQuality(src) {
    var s = String(src || '')
      .replace(/\s+/g, '')
      .replace(/Δ/g, 'maj')
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b')
      .replace(/ø/g, 'm7b5')
      .replace(/°/g, 'dim')
      .replace(/^M(?=\d|$)/, 'maj');

    if (!s) return [0, 4, 7];

    var third = 4, fifth = 7, major7 = false, sus = null, isDim = false;
    var rest = s;

    if (/^maj/i.test(s)) { major7 = true; rest = s.slice(3); }
    else if (/^min/i.test(s)) { third = 3; rest = s.slice(3); }
    else if (/^dim/i.test(s) || /^o/.test(s)) { third = 3; fifth = 6; isDim = true; rest = s.replace(/^(dim|o)/, ''); }
    else if (/^aug/i.test(s) || /^\+/.test(s)) { third = 4; fifth = 8; rest = s.replace(/^(aug|\+)/, ''); }
    else if (/^sus2/i.test(s)) { sus = 2; rest = s.slice(4); }
    else if (/^sus4?/i.test(s)) { sus = 5; rest = s.replace(/^sus4?/i, ''); }
    else if (/^m(?=[0-9#b]|$)/i.test(s)) { third = 3; rest = s.slice(1); }
    else if (/^5(?![0-9])/.test(s)) { third = null; rest = s.slice(1); }
    else if (/^6(?=\/9)/.test(s)) { rest = s; }

    var set = [0];
    if (/sus/.test(rest)) {
      sus = /sus2/.test(rest) ? 2 : 5;
      rest = rest.replace(/sus2?4?/, '');
    }
    if (sus !== null) set.push(sus);
    else if (third !== null) set.push(third);
    if (fifth !== null) set.push(fifth);

    var tokens = rest.match(/add\d+|no\d+|omit\d+|[#b]\d+|\d+|alt/g) || [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      var m;
      if ((m = /^add(\d+)$/.exec(t))) {
        var av = parseInt(m[1], 10) % 12 || 0;
        if (av === 2) av = 2; else if (av === 4) av = third === 3 ? 3 : 4;
        if (set.indexOf(av) < 0) set.push(av);
        continue;
      }
      if ((m = /^(?:no|omit)(\d+)$/.exec(t))) {
        var nv = mod12(parseInt(m[1], 10));
        if (nv === 3 || nv === 4) { set = set.filter(function (x) { return x !== 3 && x !== 4; }); }
        else if (nv === 5) set = set.filter(function (x) { return x !== 6 && x !== 7 && x !== 8; });
        else set = set.filter(function (x) { return mod12(x) !== nv; });
        continue;
      }
      if ((m = /^([#b])(\d+)$/.exec(t))) {
        var base = mod12(parseInt(m[2], 10));
        var alt = mod12(base + (m[1] === '#' ? 1 : -1));
        if (base === 5) set = set.filter(function (x) { return x !== 5 && x !== 6 && x !== 7 && x !== 8; });
        if (base === 9 || base === 2) set = set.filter(function (x) { return mod12(x) !== 2; });
        if (base === 11) set = set.filter(function (x) { return mod12(x) !== 11; });
        if (base === 13) set = set.filter(function (x) { return mod12(x) !== 9; });
        if (set.indexOf(alt) < 0) set.push(alt);
        continue;
      }
      // 숫자만 → 확장음
      var n = parseInt(t, 10);
      switch (n) {
        case 6:
          if (set.indexOf(9) < 0) set.push(9);
          break;
        case 7:
          set.push(isDim ? 9 : (major7 ? 11 : 10));
          break;
        case 9:
          set.push(major7 ? 11 : 10); set.push(14); break;
        case 11:
          set.push(major7 ? 11 : 10); set.push(17); break;
        case 13:
          set.push(major7 ? 11 : 10); set.push(14); set.push(21); break;
        case 2:
          set.push(2); break;
        case 4:
          set.push(5); break;
        default:
          if (n >= 5) set.push(mod12(n));
      }
    }

    // 중복 정리 · 정렬
    var out = [];
    set.sort(function (a, b) { return a - b; });
    for (var k = 0; k < set.length; k++) if (out.indexOf(set[k]) < 0) out.push(set[k]);
    if (out.length < 2) out = [0, 4, 7];
    return out;
  }

  /* 코드 문자열 → 구조 */
  function parse(raw) {
    var src = String(raw == null ? '' : raw).trim();
    if (!src) return null;
    var s = src.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');
    if (/^(n\/?c\.?|-|\.|_)$/i.test(s)) return null;

    var root = readNote(s);
    if (!root) return null;

    var rest = s.slice(root.len);
    var bass = null;
    var slash = rest.indexOf('/');
    if (slash >= 0) {
      var bnote = readNote(rest.slice(slash + 1));
      if (bnote) bass = bnote.pc;
      rest = rest.slice(0, slash);
    }

    var iv = parseQuality(rest);
    return {
      symbol: src,
      root: root.pc,
      bass: bass,
      iv: iv,
      suffix: rest,
      accidental: root.accidental,
      ok: true
    };
  }

  /* 반음 조옮김한 표기 */
  function transposeSymbol(chord, steps) {
    if (!chord) return '';
    var n = steps || 0;
    var table = chord.accidental === 'b' ? FLAT : (chord.accidental === '#' ? SHARP : MIX);
    var out = table[mod12(chord.root + n)] + (chord.suffix || '');
    if (chord.bass !== null && chord.bass !== undefined) {
      out += '/' + table[mod12(chord.bass + n)];
    }
    return out;
  }

  /* 구성음 표기 (C · E · G) */
  function noteNames(chord, steps) {
    if (!chord) return '';
    var n = steps || 0;
    var table = chord.accidental === 'b' ? FLAT : (chord.accidental === '#' ? SHARP : MIX);
    var seen = [];
    chord.iv.forEach(function (iv) {
      var pc = mod12(chord.root + n + iv);
      var name = table[pc];
      if (seen.indexOf(name) < 0) seen.push(name);
    });
    return seen.join(' · ');
  }

  /* 코드 → 실제 미디 노트 (보이싱: 이전 코드와 최소 이동) */
  function midisFor(chord, steps, prevMidis) {
    if (!chord) return [];
    var n = steps || 0;
    var rootPc = mod12(chord.root + n);
    var rootMidi = 48 + rootPc;                    // C3 ~ B3
    var notes = chord.iv.map(function (iv) {
      var m = rootMidi + iv;
      while (m > rootMidi + 17) m -= 12;           // 너무 높은 텐션은 접기
      return m;
    });
    notes.sort(function (a, b) { return a - b; });

    var cands = [];
    for (var k = 0; k < notes.length; k++) {
      var arr = notes.map(function (v, i) { return i < k ? v + 12 : v; })
        .sort(function (a, b) { return a - b; });
      cands.push(arr);
    }

    var prev = (prevMidis && prevMidis.length) ? prevMidis : null;
    var best = null, bestCost = Infinity;
    for (var c = 0; c < cands.length; c++) {
      var arr2 = cands[c];
      var cost = 0;
      if (prev) {
        for (var i2 = 0; i2 < arr2.length; i2++) {
          var near = Infinity;
          for (var p = 0; p < prev.length; p++) {
            var d = Math.abs(arr2[i2] - prev[p]);
            if (d < near) near = d;
          }
          cost += near;
        }
        cost /= arr2.length;
        cost += Math.abs(arr2[0] - 52) * 0.12;
      } else {
        cost = Math.abs(arr2[0] - 52) * 0.5;
      }
      if (cost < bestCost) { bestCost = cost; best = arr2; }
    }

    var out = (best || notes).slice();
    if (chord.bass !== null && chord.bass !== undefined) {
      var bassMidi = 36 + mod12(chord.bass + n);   // C2 ~ B2
      if (out.indexOf(bassMidi) < 0) out.unshift(bassMidi);
    }
    return out;
  }

  /* "C, G/B | Am7 D7" → ['C','G/B','Am7','D7']
     슬래시 코드(C/E)는 쪼개지 않는다 */
  function splitChords(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return [];
    return raw
      .split(/[,|·•\n\r\t]+/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean)
      .reduce(function (acc, part) {
        // 공백으로 한 번 더 나누되, "/" 뒤 베이스는 붙여둔다 (이미 위에서 분리됨)
        part.split(/\s+/).forEach(function (t) { if (t) acc.push(t); });
        return acc;
      }, []);
  }

  global.HB = global.HB || {};
  global.HB.Chords = {
    parse: parse,
    midisFor: midisFor,
    transposeSymbol: transposeSymbol,
    noteNames: noteNames,
    splitChords: splitChords,
    parseQuality: parseQuality
  };
})(window);
