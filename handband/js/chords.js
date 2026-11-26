/* =========================================================
   chords.js — 범용 코드 파서 + 보이싱 + 조옮김
   C · Cm · Cmaj7 · Am7 · Fmaj7 · G7 · Ebmaj7 · Bb7 · Fm7 ·
   Dm7 · Gsus4 · Bdim · C/E · D/F# · A7 · G7#9 … 전부 처리
   ========================================================= */
(function (global) {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MIX = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  /* 도수 → 반음 */
  var DEG_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 10: 16, 11: 17, 12: 19, 13: 21 };
  /* 반음 → 계이름 글자 이동 수 */
  var STEPS = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6 };

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function readNote(str) {
    var m = /^([A-Ga-g])([#b]{0,2})/.exec(str || '');
    if (!m) return null;
    var letter = m[1].toUpperCase();
    var pc = LETTER_PC[letter];
    for (var i = 0; i < m[2].length; i++) pc += m[2][i] === '#' ? 1 : -1;
    return {
      pc: mod12(pc),
      letter: LETTERS.indexOf(letter),
      accidental: m[2].indexOf('b') >= 0 ? 'b' : (m[2].indexOf('#') >= 0 ? '#' : ''),
      len: m[0].length
    };
  }

  /* 반음 간격을 계이름으로 정확히 표기 (근음 글자 기준) */
  function spellFrom(letterIdx, rootPc, semis) {
    var m = mod12(semis);
    var steps = (m === 6 || m === 8) ? 4 : STEPS[m];   // b5 / #5는 5도 글자
    var li = (letterIdx + steps) % 7;
    var letter = LETTERS[li];
    var target = mod12(rootPc + m);
    var d = target - LETTER_PC[letter];
    d = ((d + 18) % 12) - 6;
    if (d > 0) return letter + new Array(d + 1).join('#');
    if (d < 0) return letter + new Array(-d + 1).join('b');
    return letter;
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

    if (/sus/.test(rest)) {
      sus = /sus2/.test(rest) ? 2 : 5;
      rest = rest.replace(/sus2?4?/, '');
    }

    var set = [0];
    if (sus !== null) set.push(sus);
    else if (third !== null) set.push(third);
    if (fifth !== null) set.push(fifth);

    function add(iv) {
      if (iv < 0) iv = mod12(iv);
      if (set.map(mod12).indexOf(mod12(iv)) < 0) set.push(iv);
    }
    function drop(semi) {
      var t = mod12(semi);
      set = set.filter(function (x) { return mod12(x) !== t; });
    }

    var tokens = rest.match(/add\d+|no\d+|omit\d+|[#b]\d+|\d+|alt/g) || [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i], m;

      if ((m = /^add(\d+)$/.exec(t))) {
        var av = DEG_SEMI[parseInt(m[1], 10)];
        if (av !== undefined) { drop(mod12(av)); add(av); }
        continue;
      }
      if ((m = /^(?:no|omit)(\d+)$/.exec(t))) {
        var nv = DEG_SEMI[parseInt(m[1], 10)];
        if (nv !== undefined) drop(nv);
        continue;
      }
      if ((m = /^([#b])(\d+)$/.exec(t))) {
        var dv = DEG_SEMI[parseInt(m[2], 10)];
        if (dv === undefined) continue;
        var natural = mod12(dv);
        drop(natural);
        add(dv + (m[1] === '#' ? 1 : -1));
        continue;
      }
      // 숫자만 → 확장음
      var n = parseInt(t, 10);
      if (n === 6) { add(9); }
      else if (n === 7) { add(isDim ? 9 : (major7 ? 11 : 10)); }
      else if (n === 9) { add(major7 ? 11 : 10); add(14); }
      else if (n === 11) { add(major7 ? 11 : 10); add(17); }
      else if (n === 13) { add(major7 ? 11 : 10); add(14); add(21); }
      else if (n === 2) { add(2); }
      else if (n === 4) { add(5); }
      else if (n === 5) { add(7); }
    }

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
    var bass = null, bassLetter = null;
    var slash = rest.indexOf('/');
    if (slash >= 0) {
      var bnote = readNote(rest.slice(slash + 1));
      if (bnote) { bass = bnote.pc; bassLetter = bnote.letter; }
      rest = rest.slice(0, slash);
    }

    return {
      symbol: src,
      root: root.pc,
      letter: root.letter,
      bass: bass,
      bassLetter: bassLetter,
      iv: parseQuality(rest),
      suffix: rest,
      accidental: root.accidental,
      ok: true
    };
  }

  function rootNameOf(chord, steps) {
    var table = chord.accidental === 'b' ? FLAT : (chord.accidental === '#' ? SHARP : MIX);
    return table[mod12(chord.root + (steps || 0))];
  }

  /* 반음 조옮김한 표기 */
  function transposeSymbol(chord, steps) {
    if (!chord) return '';
    var n = steps || 0;
    var rn = rootNameOf(chord, n);
    var out = rn + (chord.suffix || '');
    if (chord.bass !== null && chord.bass !== undefined) {
      var rnote = readNote(rn);
      var semis = mod12(chord.bass + n - rnote.pc);
      out += '/' + spellFrom(rnote.letter, rnote.pc, semis);
    }
    return out;
  }

  /* 구성음 표기 (Cmaj7 → C · E · G · B) */
  function noteNames(chord, steps) {
    if (!chord) return '';
    var rn = rootNameOf(chord, steps || 0);
    var rnote = readNote(rn);
    var seen = [];
    chord.iv.forEach(function (iv) {
      var name = spellFrom(rnote.letter, rnote.pc, iv);
      if (seen.indexOf(name) < 0) seen.push(name);
    });
    return seen.join(' · ');
  }

  /* 코드 → 실제 미디 노트 (이전 코드와 최소 이동 · 근음 우선) */
  function midisFor(chord, steps, prevMidis) {
    if (!chord) return [];
    var n = steps || 0;
    var rootPc = mod12(chord.root + n);
    var rootMidi = 48 + rootPc;                    // C3 ~ B3
    var notes = chord.iv.map(function (iv) {
      var m = rootMidi + iv;
      while (m > rootMidi + 17) m -= 12;
      return m;
    });
    notes.sort(function (a, b) { return a - b; });

    var cands = [];
    for (var k = 0; k < notes.length; k++) {
      cands.push(notes.map(function (v, i) { return i < k ? v + 12 : v; })
        .sort(function (a, b) { return a - b; }));
    }

    var prev = (prevMidis && prevMidis.length) ? prevMidis : null;
    var best = null, bestCost = Infinity;
    for (var c = 0; c < cands.length; c++) {
      var arr = cands[c];
      var cost = 0;
      if (prev) {
        for (var i2 = 0; i2 < arr.length; i2++) {
          var near = Infinity;
          for (var p = 0; p < prev.length; p++) {
            var d = Math.abs(arr[i2] - prev[p]);
            if (d < near) near = d;
          }
          cost += near;
        }
        cost /= arr.length;
        cost += Math.abs(arr[0] - 52) * 0.12;
      } else {
        cost = Math.abs(arr[0] - 52) * 0.4;
      }
      if (mod12(arr[0]) !== rootPc) cost += 2.6;   // 되도록 근음을 아래에
      if (cost < bestCost) { bestCost = cost; best = arr; }
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
    parseQuality: parseQuality,
    spellFrom: spellFrom
  };
})(window);
