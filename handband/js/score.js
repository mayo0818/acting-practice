/* =========================================================
   score.js — 악보 해석
   · 내장 곡: chords[] + lyric 줄 → 줄마다 코드 위치 자동 배치
   · 사용자 곡: `[Eb]나의 모든 [Gm]사랑이` 인라인 표기 그대로
   결과: { parts, lines, steps }
   — steps 하나가 "코드 한 번" = 가이드 한 칸 = 가사 한 토막
   ========================================================= */
(function (global) {
  'use strict';

  var HB = global.HB = global.HB || {};

  function wordStarts(text) {
    var out = [], re = /\S+/g, m;
    while ((m = re.exec(text))) out.push(m.index);
    if (!out.length) out.push(0);
    return out;
  }

  /* 코드 배열 + 가사 줄들 → 줄별 코드 위치
     · 줄마다 코드 개수는 가사 길이에 비례
     · 줄 안에서는 낱말에 고르게 (마지막 코드는 마지막 낱말에) */
  function distribute(chords, lines) {
    var n = chords.length;
    if (!n) return lines.map(function () { return []; });

    var lens = lines.map(function (l) { return Math.max(1, l.trim().length); });
    var totalLen = lens.reduce(function (a, b) { return a + b; }, 0);
    var counts = lens.map(function (l) { return Math.max(0, Math.round(n * l / totalLen)); });

    var sum = counts.reduce(function (a, b) { return a + b; }, 0);
    while (sum < n) {
      var bi = 0;
      for (var i = 1; i < counts.length; i++) if (counts[i] < counts[bi]) bi = i;
      counts[bi]++; sum++;
    }
    while (sum > n) {
      var mi = 0;
      for (var k = 1; k < counts.length; k++) if (counts[k] > counts[mi]) mi = k;
      if (counts[mi] <= 0) break;
      counts[mi]--; sum--;
    }

    var out = [];
    var ci = 0;
    for (var li = 0; li < lines.length; li++) {
      var text = lines[li];
      var k2 = counts[li] || 0;
      var ws = wordStarts(text);
      var arr = [];
      for (var j = 0; j < k2 && ci < n; j++) {
        var at;
        if (k2 === 1) at = 0;
        else if (k2 <= ws.length) at = ws[Math.round(j * (ws.length - 1) / (k2 - 1))];
        else at = Math.min(text.length, Math.round(j * text.length / k2));
        arr.push({ sym: chords[ci++], at: at });
      }
      out.push(arr);
    }
    while (ci < n) out[out.length - 1].push({ sym: chords[ci++], at: Math.max(0, out[out.length - 1].length) });
    return out;
  }

  /* `[Eb]나의 모든 [Gm]사랑이` → { text, chords:[{sym, at}] } */
  function parseInline(raw) {
    var re = /\[([^\]\[]{1,16})\]/g;
    var text = '', chords = [], last = 0, m;
    while ((m = re.exec(raw))) {
      text += raw.slice(last, m.index);
      chords.push({ sym: m[1].trim(), at: text.length });
      last = m.index + m[0].length;
    }
    text += raw.slice(last);
    return { text: text.replace(/\s+$/, ''), chords: chords };
  }

  /* 인라인 악보 텍스트 → parts */
  function parseScore(text) {
    var parts = [];
    var cur = null;
    var raw = String(text == null ? '' : text).split(/\r?\n/);
    for (var i = 0; i < raw.length; i++) {
      var line = raw[i];
      var t = line.trim();
      if (/^#/.test(t)) {
        cur = { label: t.replace(/^#+\s*/, '') || ('구간 ' + (parts.length + 1)), lines: [] };
        parts.push(cur);
        continue;
      }
      if (!cur) { cur = { label: '1절', lines: [] }; parts.push(cur); }
      if (!t) { cur.lines.push({ text: '', chords: [], spacer: true }); continue; }
      var parsed = parseInline(line.replace(/\s+$/, ''));
      cur.lines.push({ text: parsed.text, chords: parsed.chords });
    }
    while (parts.length && !parts[parts.length - 1].lines.length) parts.pop();
    return parts;
  }

  /* 곡 객체(내장·사용자 공통) → parts */
  function partsOf(song) {
    if (song && typeof song.score === 'string' && song.score.trim()) return parseScore(song.score);
    var out = [];
    (song && song.parts || []).forEach(function (p) {
      var lines = String(p.lyric || '').split(/\r?\n/).map(function (s) { return s.replace(/\s+$/, ''); });
      if (lines.length > 4) lines = lines.slice(0, 4);
      var anchors = distribute(p.chords || [], lines);
      out.push({
        label: p.label || '구간',
        lines: lines.map(function (L, i) { return { text: L, chords: anchors[i] }; })
      });
    });
    return out;
  }

  /* 왼손 손가락 개수(1~5) + 오른손 묶음(1~5) 매핑
     한 구간 안에서 처음 나온 코드 순서대로 1..5, 그 다음 묶음 */
  function assignGestures(parts) {
    parts.forEach(function (part) {
      var seen = {};
      var list = [];
      part.lines.forEach(function (line) {
        line.chords.forEach(function (c) {
          var key = c.sym.toUpperCase();
          if (seen[key] === undefined) {
            seen[key] = list.length;
            list.push(key);
          }
        });
      });
      part.lines.forEach(function (line) {
        line.chords.forEach(function (c) {
          var idx = seen[c.sym.toUpperCase()] || 0;
          c.left = (idx % 5) + 1;
          c.bank = Math.floor(idx / 5) + 1;
        });
      });
    });
    return parts;
  }

  /* 곡 → 컴파일된 악보 */
  var compileRev = 0;

  function compile(song) {
    var parts = assignGestures(partsOf(song));
    var lines = [];
    var steps = [];
    parts.forEach(function (part, pi) {
      part.lines.forEach(function (line) {
        var entry = {
          partIndex: pi,
          partLabel: part.label,
          text: line.text,
          chords: line.chords || [],
          spacer: !!line.spacer,
          firstStep: steps.length
        };
        lines.push(entry);
        var chs = entry.chords;
        for (var i = 0; i < chs.length; i++) {
          var c = chs[i];
          var end = i + 1 < chs.length ? chs[i + 1].at : line.text.length;
          steps.push({
            index: steps.length,
            ci: i,
            line: entry,
            lineIndex: lines.length - 1,
            partIndex: pi,
            chord: c.sym,
            at: c.at,
            end: end,
            text: line.text.slice(c.at, end),
            left: c.left,
            bank: c.bank
          });
        }
      });
    });
    return { parts: parts, lines: lines, steps: steps, rev: ++compileRev };
  }

  HB.Score = {
    compile: compile,
    parseScore: parseScore,
    distribute: distribute,
    parseInline: parseInline
  };
})(window);
