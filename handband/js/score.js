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

  /* 코드 배열 + 가사 줄들 → 줄별 코드 위치 */
  function distribute(chords, lines) {
    var n = chords.length;
    if (!n) return lines.map(function () { return []; });

    var total = 0;
    var lineStart = [];
    for (var i = 0; i < lines.length; i++) { lineStart.push(total); total += lines[i].length + 1; }

    var anchors = [];
    for (var c = 0; c < n; c++) {
      var frac = n > 1 ? c / n : 0;
      var abs = Math.floor(frac * total);
      var li = 0;
      for (var j = 0; j < lines.length; j++) {
        if (abs <= lineStart[j] + lines[j].length || j === lines.length - 1) { li = j; break; }
      }
      var local = Math.max(0, Math.min(lines[li].length, abs - lineStart[li]));
      var ws = wordStarts(lines[li]);
      var best = ws[0], bd = Infinity;
      for (var k = 0; k < ws.length; k++) {
        var d = Math.abs(ws[k] - local);
        if (d < bd) { bd = d; best = ws[k]; }
      }
      anchors.push({ line: li, at: best, sym: chords[c] });
    }

    /* 같은 자리에 두 코드가 오면 한 칸씩 밀어 글자 위에 흩어 놓는다 */
    var buckets = [];
    for (var b = 0; b < lines.length; b++) buckets.push([]);
    anchors.forEach(function (a) { buckets[a.line].push(a); });

    var out = [];
    for (var L = 0; L < lines.length; L++) {
      var list = buckets[L].sort(function (x, y) { return x.at - y.at; });
      var prev = -1;
      var placed = [];
      for (var q = 0; q < list.length; q++) {
        var at = list[q].at;
        if (at <= prev) at = prev + 1;
        if (at > lines[L].length) at = lines[L].length;
        if (at <= prev) {
          /* 줄 끝까지 밀어도 자리가 없으면 마지막 코드로 겹쳐 둔다 */
          at = lines[L].length;
        }
        placed.push({ sym: list[q].sym, at: at });
        prev = at === lines[L].length ? prev : at;
      }
      out.push(placed.sort(function (x, y) { return x.at - y.at; }));
    }
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
