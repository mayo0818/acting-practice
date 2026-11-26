/* =========================================================
   songs.js — 기본 내장 악보
   코드 진행 + 가사 가이드. 앱 안에서 그대로 고쳐 쓸 수 있어요.
   가사는 연주용 짧은 안내이며 권리는 원저작자에게 있습니다.
   ========================================================= */
(function (global) {
  'use strict';

  var BUILTIN = [
    /* ── 잔나비 · 원곡 B♭ (기타는 카포 3 G폼) ─────────────── */
    {
      id: 'jannabi-hesitate',
      title: '주저하는 연인들을 위해',
      artist: '잔나비',
      key: 'B♭ 원곡 · 기타는 카포 3 (G폼)',
      preset: 'warm',
      builtin: true,
      parts: [
        {
          label: '1절 ①',
          chords: ['Bb', 'Dm', 'Eb', 'Ebm', 'Bb'],
          lyric: '나는 읽기 쉬운 마음이야\n당신도 스윽 훑고 가셔요'
        },
        {
          label: '1절 ②',
          chords: ['Ebm', 'Dm', 'G7', 'Cm', 'F'],
          lyric: '달랠 길 없는 외로운 마음 있지\n머물다 가셔요'
        },
        {
          label: '후렴 ①',
          chords: ['Bb', 'D7', 'Gm', 'Bb7', 'Eb', 'Ebm', 'Bb', 'Bb7'],
          lyric: '그러다 밤이 찾아오면\n우리 둘만의 비밀을 새겨요'
        },
        {
          label: '후렴 ②',
          chords: ['Eb', 'A7', 'Dm', 'Gm', 'Eb', 'F', 'Bb'],
          lyric: '추억할 그 밤 위에 갈피를 꽂고 선\n남몰래 펼쳐보아요'
        },
        {
          label: '브릿지',
          chords: ['Bb', 'Dm', 'Gm', 'Bb', 'Eb', 'F'],
          lyric: '피고 지는 마음을 알아요\n다시 돌아온 계절도'
        }
      ]
    },

    /* ── 홍이삭 · E♭ (폭싹 속았수다 OST) ──────────────────── */
    {
      id: 'hong-isaac-eb',
      title: '내사랑 내곁에',
      artist: '홍이삭 (E♭)',
      key: 'E♭ · 폭싹 속았수다 OST',
      preset: 'ep',
      builtin: true,
      parts: [
        {
          label: '1절 ①',
          chords: ['Eb', 'Gm', 'Ab', 'Eb', 'Cm', 'Ab', 'Bb7'],
          lyric: '나의 모든 사랑이 떠나가는 날이\n당신의 그 웃음 뒤에서 함께 하는데'
        },
        {
          label: '1절 ②',
          chords: ['Eb', 'Gm', 'Ab', 'Eb', 'Cm', 'F7', 'Ab', 'Bb'],
          lyric: '철이 없는 욕심에 그 많은 미련에\n당신이 있는 건 아닌지 아니겠지요 (끝에 Eb)'
        },
        {
          label: '1절 ③',
          chords: ['Eb', 'Gm', 'Ab', 'Eb', 'Cm', 'Ab', 'Bb7'],
          lyric: '시간은 멀어 집으로 향해 가는데\n약속했던 그대만은 올 줄을 모르고'
        },
        {
          label: '1절 ④',
          chords: ['Eb', 'Gm', 'Ab', 'Eb'],
          lyric: '애써 웃음 지으며 돌아오는 길은'
        },
        {
          label: '1절 ⑤',
          chords: ['Cm', 'F7', 'Ab', 'Bb', 'Eb', 'Eb7'],
          lyric: '왜 그리도 낯설고 멀기만 한지'
        },
        {
          label: '후렴 ①',
          chords: ['Ab', 'Bb7', 'Eb', 'Gm', 'Cm', 'Fm', 'Fm7', 'Bb7'],
          lyric: '저 여린 가지 사이로 혼자인 날 느낄 때\n이렇게 아픈 그대 기억이 날까'
        },
        {
          label: '후렴 ②',
          chords: ['Eb', 'Bb/D', 'Cm', 'Gm/Bb', 'Ab', 'Eb', 'Fm7', 'Bb7'],
          lyric: '내 사랑 그대 내 곁에 있어줘\n이 세상 하나뿐인 오직 그대만이'
        },
        {
          label: '후렴 ③',
          chords: ['Eb', 'Bb/D', 'Cm', 'Gm/Bb', 'Ab', 'Eb', 'Bb7', 'Eb'],
          lyric: '힘겨운 날에 너마저 떠나면\n비틀거릴 내가 안길 곳은 어디에'
        }
      ]
    },

    /* ── 김현식 · G ──────────────────────────────────────── */
    {
      id: 'kimhyunsik-g',
      title: '내사랑 내곁에',
      artist: '김현식 (G)',
      key: 'G 원곡 · 플랫이 없어 치기 편함',
      preset: 'ep',
      builtin: true,
      parts: [
        {
          label: '1절 ①',
          chords: ['G', 'Bm', 'C', 'G', 'Em', 'C', 'D7'],
          lyric: '나의 모든 사랑이 떠나가는 날이\n당신의 그 웃음 뒤에서 함께 하는데'
        },
        {
          label: '1절 ②',
          chords: ['G', 'Bm', 'C', 'G', 'Em', 'A7', 'C', 'D'],
          lyric: '철이 없는 욕심에 그 많은 미련에\n당신이 있는 건 아닌지 아니겠지요'
        },
        {
          label: '1절 ③',
          chords: ['G', 'Bm', 'C', 'G', 'Em', 'C', 'D7'],
          lyric: '시간은 멀어 집으로 향해 가는데\n약속했던 그대만은 올 줄을 모르고'
        },
        {
          label: '1절 ④',
          chords: ['G', 'Bm', 'C', 'G'],
          lyric: '애써 웃음 지으며 돌아오는 길은'
        },
        {
          label: '1절 ⑤',
          chords: ['Em', 'A7', 'C', 'D', 'G', 'G7'],
          lyric: '왜 그리도 낯설고 멀기만 한지'
        },
        {
          label: '프리코러스',
          chords: ['C', 'D7', 'G', 'D/F#', 'Em', 'Am', 'Am7', 'D7'],
          lyric: '저 여린 가지 사이로 혼자인 날 느낄 때\n이렇게 아픈 그대 기억이 날까'
        },
        {
          label: '후렴 ①',
          chords: ['G', 'D/F#', 'Em', 'Bm/D', 'C', 'G', 'Am7', 'D7'],
          lyric: '내 사랑 그대 내 곁에 있어줘\n이 세상 하나뿐인 오직 그대만이'
        },
        {
          label: '후렴 ②',
          chords: ['G', 'D/F#', 'Em', 'Bm/D', 'C', 'G', 'D7', 'G'],
          lyric: '힘겨운 날에 너마저 떠나면\n비틀거릴 내가 안길 곳은 어디에'
        }
      ]
    },

    /* ── 자유 잼 ────────────────────────────────────────── */
    {
      id: 'free-jam',
      title: '자유 잼',
      artist: 'HandBand',
      key: 'C · 마음 가는 대로',
      preset: 'lush',
      builtin: true,
      parts: [
        {
          label: '잼',
          chords: ['Cmaj7', 'Am7', 'Fmaj7', 'G7'],
          lyric: '마음 가는 대로\n천천히 돌려 보세요'
        }
      ]
    }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  global.HB = global.HB || {};
  global.HB.Songs = {
    builtin: function () { return clone(BUILTIN); }
  };
})(window);
