/* =========================================================
   songs.js — 기본 내장 악보 10곡 (한국어 6 · English 4) + 자유 잼
   chords[] + lyric 줄 → 화면에서 코드가 가사 글자 위에 자동 배치됩니다.

   · 곡은 전주~1절~후렴~2절~브릿지~마지막 후렴~후주까지 전체 구성
   · 코드는 실제 연주 키(콘서트 피치) 기준. 기타 카포 위치는 key에 표기
   · 코드·구성은 공개 코드악보(코드스코어/뮤직메카/patross0303/mac11 등)로 확인
   · 가사는 구간을 알아보기 위한 첫 구절만 싣습니다(권리는 원저작자에게).
     전체 가사를 직접 넣고 싶으면 악보 편집에서 이 기기에만 저장해 쓰세요.
   ========================================================= */
(function (global) {
  'use strict';

  /* 연주 구간(간주·전주 등)은 가사 대신 음표 자리(·)로 코드 위치를 잡는다 */
  function dots(n) {
    var a = [];
    var total = Math.max(8, Math.round(n * 3));
    for (var i = 0; i < total; i++) a.push('·');
    return a.join(' ');
  }

  var BUILTIN = [
    /* ══════════════════════════════════════════════════════
       한국어
       ══════════════════════════════════════════════════════ */

    /* ── 잔나비 · 원곡 B♭ (기타는 카포 3 G폼) ─────────────── */
    {
      id: 'jannabi-hesitate',
      title: '주저하는 연인들을 위해',
      artist: '잔나비',
      key: 'B♭ · 카포 3',
      lang: 'ko',
      preset: 'warm',
      bpm: 78,
      builtin: true,
      parts: [
        { label: '전주', chords: ['Bb', 'Dm', 'Eb', 'Ebm', 'Bb'], lyric: dots(5) },
        { label: '1절 ①', chords: ['Bb', 'Dm'], lyric: '나는 읽기 쉬운 마음이야' },
        { label: '1절 ②', chords: ['Eb', 'Ebm', 'Bb'], lyric: '당신도 스윽 훑고 가셔요' },
        { label: '1절 ③', chords: ['Ebm', 'Dm', 'G7'], lyric: '달랠 길 없는 외로운 마음 있지' },
        { label: '1절 ④', chords: ['Cm', 'F'], lyric: '머물다 가셔요 음' },
        { label: '1절 ⑤', chords: ['Bb', 'Dm'], lyric: '내게 긴 여운을 남겨줘요' },
        { label: '1절 ⑥', chords: ['Eb', 'Ebm', 'Bb', 'Bb7'], lyric: '사랑을 사랑을 해줘요' },
        { label: '1절 ⑦', chords: ['Ebm', 'Dm', 'G7'], lyric: '할 수 있다면 그럴 수만 있다면' },
        { label: '1절 ⑧', chords: ['Cm', 'F'], lyric: '새하얀 빛으로 그댈 비춰 줄게요' },
        { label: '후렴 ①', chords: ['Bb', 'D7'], lyric: '그러다 밤이 찾아오면' },
        { label: '후렴 ②', chords: ['Gm', 'Bb7', 'Eb', 'Ebm', 'Bb', 'Bb7'], lyric: '우리 둘만의 비밀을 새겨요' },
        { label: '후렴 ③', chords: ['Eb', 'A7', 'Dm'], lyric: '추억할 그 밤 위에 갈피를 꽂고 선' },
        { label: '후렴 ④', chords: ['Gm', 'Eb', 'Ebm', 'Bb'], lyric: '남몰래 펼쳐보아요' },
        { label: '간주 ①', chords: ['Eb', 'A7', 'Dm', 'Gm', 'Eb', 'Ebm', 'Bb'], lyric: dots(7) },
        { label: '2절 ①', chords: ['Bb', 'Dm'], lyric: '나의 자라나는 마음을' },
        { label: '2절 ②', chords: ['Eb', 'Ebm', 'Bb', 'F'], lyric: '못 본채 꺾어 버릴 수는 없네' },
        { label: '2절 ③', chords: ['Ebm', 'Dm', 'G7'], lyric: '미련 남길바엔 그리워 아픈 게 나아' },
        { label: '2절 ④', chords: ['Cm', 'Cm', 'F'], lyric: '서둘러 안겨본 그 품은 따스할 테니' },
        { label: '후렴 ⑤', chords: ['Bb', 'D7'], lyric: '그러다 밤이 찾아오면' },
        { label: '후렴 ⑥', chords: ['Gm', 'Bb7', 'Eb', 'Ebm', 'Bb', 'Bb7'], lyric: '우리 둘만의 비밀을 새겨요' },
        { label: '후렴 ⑦', chords: ['Eb', 'A7', 'Dm'], lyric: '추억할 그 밤 위에 갈피를 꽂고 선' },
        { label: '후렴 ⑧', chords: ['Gm', 'Eb', 'C/E', 'F'], lyric: '남몰래 펼쳐보아요' },
        { label: '후렴 ⑨', chords: ['Bb', 'D7'], lyric: '언젠가 또 그날이 온대도' },
        { label: '후렴 ⑩', chords: ['Gm', 'Bb7', 'Eb', 'Ebm', 'Bb', 'Bb7'], lyric: '우린 서둘러 뒤돌지 말아요' },
        { label: '후렴 ⑪', chords: ['Eb', 'A7', 'Dm'], lyric: '마주보던 그대로 뒷걸음치면서' },
        { label: '후렴 ⑫', chords: ['Gm', 'Eb', 'Ebm/F', 'Bb'], lyric: '서로의 안녕을 보아요' },
        { label: '간주 ②', chords: ['Bb', 'Dm', 'Gm', 'Gm/F', 'Eb', 'F', 'Gm', 'F/A'], lyric: dots(8) },
        { label: '브릿지 ①', chords: ['Bb', 'Dm', 'Gm', 'Gm/F'], lyric: '피고 지는 마음을 알아요' },
        { label: '브릿지 ②', chords: ['Eb', 'Fsus4', 'F'], lyric: '다시 돌아온 계절도' },
        { label: '브릿지 ③', chords: ['Bb', 'Dm', 'Gm', 'Gm/F'], lyric: '난 한 동안 새 활짝 피었다 질래' },
        { label: '브릿지 ④', chords: ['Eb', 'Fsus4', 'F'], lyric: '또 한번 영원히' },
        { label: '브릿지 ⑤', chords: ['Bb', 'Dm', 'Gm', 'Gm/F'], lyric: '그럼에도 내 사랑은 또' },
        { label: '브릿지 ⑥', chords: ['Eb', 'Fsus4', 'F'], lyric: '같은 꿈을 꾸고' },
        { label: '브릿지 ⑦', chords: ['Bb', 'Dm', 'Gm', 'Gm/F'], lyric: '그럼에도 꾸던 꿈을' },
        { label: '브릿지 ⑧', chords: ['Eb', 'Fsus4', 'F'], lyric: '난 또 미루진 않을거야' },
        { label: '후주', chords: ['Bb', 'Dm', 'Gm', 'Gm/F', 'Eb', 'F', 'Bb'], lyric: dots(7) }
      ]
    },

    /* ── 홍이삭 · E♭ (폭싹 속았수다 OST / 원곡 김현식 G) ────── */
    {
      id: 'hong-isaac-eb',
      title: '내사랑 내곁에',
      artist: '홍이삭',
      key: 'E♭ · OST',
      lang: 'ko',
      preset: 'ep',
      bpm: 72,
      builtin: true,
      parts: [
        { label: '1절 ①', chords: ['Eb', 'Gm'], lyric: '나의 모든 사랑이 떠나가는 날이' },
        { label: '1절 ②', chords: ['Ab', 'Eb', 'Cm', 'Ab', 'Bb7'], lyric: '당신의 그 웃음 뒤에서 함께 하는데' },
        { label: '1절 ③', chords: ['Eb', 'Gm'], lyric: '철이 없는 욕심에 그 많은 미련에' },
        { label: '1절 ④', chords: ['Ab', 'Eb', 'Cm', 'F7', 'Ab', 'Bb'], lyric: '당신이 있는 건 아닌지 아니겠지요' },
        { label: '1절 ⑤', chords: ['Eb', 'Gm'], lyric: '시간은 멀어 집으로 향해 가는데' },
        { label: '1절 ⑥', chords: ['Ab', 'Eb', 'Cm', 'Ab', 'Bb7'], lyric: '약속했던 그대만은 올 줄을 모르고' },
        { label: '1절 ⑦', chords: ['Eb', 'Gm'], lyric: '애써 웃음 지으며 돌아오는 길은' },
        { label: '1절 ⑧', chords: ['Ab', 'Eb', 'Cm', 'F7', 'Ab', 'Bb', 'Eb', 'Eb7'], lyric: '왜 그리도 낯설고 멀기만 한지' },
        { label: '프리코러스 ①', chords: ['Ab', 'Bb7', 'Eb', 'Gm', 'Cm'], lyric: '저 여린 가지 사이로 혼자인 날 느낄 때' },
        { label: '프리코러스 ②', chords: ['Fm', 'Fm7', 'Bb7'], lyric: '이렇게 아픈 그대 기억이 날까' },
        { label: '후렴 ①', chords: ['Eb', 'Bb/D', 'Cm', 'Gm/Bb'], lyric: '내 사랑 그대 내 곁에 있어줘' },
        { label: '후렴 ②', chords: ['Ab', 'Eb', 'Fm7', 'Bb7'], lyric: '이 세상 하나뿐인 오직 그대만이' },
        { label: '후렴 ③', chords: ['Eb', 'Bb/D', 'Cm', 'Gm/Bb'], lyric: '힘겨운 날에 너마저 떠나면' },
        { label: '후렴 ④', chords: ['Ab', 'Eb', 'Bb7', 'Eb'], lyric: '비틀거릴 내가 안길 곳은 어디에' },
        { label: '간주', chords: ['Eb', 'Gm', 'Ab', 'Eb', 'Cm', 'Ab', 'Bb7', 'Eb'], lyric: dots(8) },
        { label: '프리코러스 ③', chords: ['Ab', 'Bb7', 'Eb', 'Gm', 'Cm'], lyric: '저 여린 가지 사이로 혼자인 날 느낄 때' },
        { label: '프리코러스 ④', chords: ['Fm', 'Fm7', 'Bb7'], lyric: '이렇게 아픈 그대 기억이 날까' },
        { label: '후렴 ⑤', chords: ['Eb', 'Bb/D', 'Cm', 'Gm/Bb'], lyric: '내 사랑 그대 내 곁에 있어줘' },
        { label: '후렴 ⑥', chords: ['Ab', 'Eb', 'Fm7', 'Bb7'], lyric: '이 세상 하나뿐인 오직 그대만이' },
        { label: '후렴 ⑦', chords: ['Eb', 'Bb/D', 'Cm', 'Gm/Bb'], lyric: '힘겨운 날에 너마저 떠나면' },
        { label: '후렴 ⑧', chords: ['Ab', 'Eb', 'Bb7', 'Eb'], lyric: '비틀거릴 내가 안길 곳은 어디에' },
        { label: '후주', chords: ['Ab', 'Bb7', 'Eb', 'Eb'], lyric: dots(4) }
      ]
    },

    /* ── 김현식 · G (원곡) ───────────────────────────────── */
    {
      id: 'kimhyunsik-g',
      title: '내사랑 내곁에',
      artist: '김현식',
      key: 'G · 원곡',
      lang: 'ko',
      preset: 'ep',
      bpm: 70,
      builtin: true,
      parts: [
        { label: '1절 ①', chords: ['G', 'Bm'], lyric: '나의 모든 사랑이 떠나가는 날이' },
        { label: '1절 ②', chords: ['C', 'G', 'Em', 'C', 'D7'], lyric: '당신의 그 웃음 뒤에서 함께 하는데' },
        { label: '1절 ③', chords: ['G', 'Bm'], lyric: '철이 없는 욕심에 그 많은 미련에' },
        { label: '1절 ④', chords: ['C', 'G', 'Em', 'Am7', 'C', 'D', 'G'], lyric: '당신이 있는 건 아닌지 아니겠지요' },
        { label: '1절 ⑤', chords: ['G', 'Bm'], lyric: '시간은 멀어 집으로 향해 가는데' },
        { label: '1절 ⑥', chords: ['C', 'G', 'Em', 'C', 'D7'], lyric: '약속했던 그대만은 올 줄을 모르고' },
        { label: '1절 ⑦', chords: ['G', 'Bm'], lyric: '애써 웃음 지으며 돌아오는 길은' },
        { label: '1절 ⑧', chords: ['C', 'G', 'Em', 'A7', 'C', 'D', 'G', 'G7'], lyric: '왜 그리도 낯설고 멀기만 한지' },
        { label: '프리코러스 ①', chords: ['C', 'D7', 'G', 'Bm', 'Em'], lyric: '저 여린 가지 사이로 혼자인 날 느낄 때' },
        { label: '프리코러스 ②', chords: ['Am', 'Am7', 'D7'], lyric: '이렇게 아픈 그대 기억이 날까' },
        { label: '후렴 ①', chords: ['G', 'D/F#', 'Em', 'Bm/D'], lyric: '내 사랑 그대 내 곁에 있어줘' },
        { label: '후렴 ②', chords: ['C', 'G', 'Am7', 'D7'], lyric: '이 세상 하나뿐인 오직 그대만이' },
        { label: '후렴 ③', chords: ['G', 'D/F#', 'Em', 'Bm/D'], lyric: '힘겨운 날에 너마저 떠나면' },
        { label: '후렴 ④', chords: ['C', 'G', 'D7', 'G'], lyric: '비틀거릴 내가 안길 곳은 어디에' },
        { label: '간주', chords: ['G', 'Bm', 'C', 'G', 'Em', 'C', 'D', 'G'], lyric: dots(8) },
        { label: '프리코러스 ③', chords: ['C', 'D7', 'G', 'Bm', 'Em'], lyric: '저 여린 가지 사이로 혼자인 날 느낄 때' },
        { label: '프리코러스 ④', chords: ['Am', 'Am7', 'D7'], lyric: '이렇게 아픈 그대 기억이 날까' },
        { label: '후렴 ⑤', chords: ['G', 'D/F#', 'Em', 'Bm/D'], lyric: '내 사랑 그대 내 곁에 있어줘' },
        { label: '후렴 ⑥', chords: ['C', 'G', 'Am7', 'D7'], lyric: '이 세상 하나뿐인 오직 그대만이' },
        { label: '후렴 ⑦', chords: ['G', 'D/F#', 'Em', 'Bm/D'], lyric: '힘겨운 날에 너마저 떠나면' },
        { label: '후렴 ⑧', chords: ['C', 'G', 'D7', 'G'], lyric: '비틀거릴 내가 안길 곳은 어디에' },
        { label: '후주', chords: ['C', 'D7', 'G', 'G'], lyric: dots(4) }
      ]
    },

    /* ── 변진섭 · D (12/8 발라드) ─────────────────────────── */
    {
      id: 'byeon-jinseop-lady',
      title: '숙녀에게',
      artist: '변진섭',
      key: 'D · 원곡',
      lang: 'ko',
      preset: 'warm',
      bpm: 76,
      builtin: true,
      parts: [
        { label: '전주', chords: ['D', 'A7/C#', 'D7/C', 'G/B', 'Gm/Bb', 'D/A', 'G', 'A7'], lyric: dots(8) },
        { label: '1절 ①', chords: ['D', 'F#m7', 'D/A', 'G'], lyric: '어쩌면 처음 그땐 시간이 멈춘 듯이' },
        { label: '1절 ②', chords: ['Gm', 'D/F#', 'Em7', 'A7'], lyric: '미지의 나라 그곳에서 걸어온 것처럼' },
        { label: '1절 ③', chords: ['D', 'F#m7', 'D/A', 'G'], lyric: '가을에 서둘러온 초겨울 새벽녘에' },
        { label: '1절 ④', chords: ['Gm', 'D/F#', 'Em7', 'A7', 'D'], lyric: '반가운 눈처럼 그대는 내게로 다가왔죠' },
        { label: '프리 ①', chords: ['Bm', 'F#m7', 'G', 'D'], lyric: '그대의 맑은 미소는 내 맘에 꼭 들지만' },
        { label: '프리 ②', chords: ['Bm', 'F#m7', 'G', 'E7', 'A7'], lyric: '가끔씩 보이는 우울한 눈빛이 마음에 걸려요' },
        { label: '후렴 ①', chords: ['D', 'F#m7', 'F#7', 'Bm'], lyric: '나 그대 아주 작은 일까지 알고 싶지만' },
        { label: '후렴 ②', chords: ['Em7', 'A7'], lyric: '어쩐지 그댄 내게 말을 안 해요' },
        { label: '후렴 ③', chords: ['F#m7', 'F#7', 'Bm', 'Bm7/A'], lyric: '허면 그대 잠든 밤 꿈속으로 찾아가' },
        { label: '후렴 ④', chords: ['G', 'A7', 'D'], lyric: '살며시 얘기 듣고 올래요' },
        { label: '간주', chords: ['D', 'A7/C#', 'D7/C', 'G/B', 'Gm/Bb', 'D/A', 'Em7', 'A7', 'D'], lyric: dots(9) },
        { label: '프리 ③', chords: ['Bm', 'F#m7', 'G', 'D'], lyric: '그대의 맑은 미소는 내 맘에 꼭 들지만' },
        { label: '프리 ④', chords: ['Bm', 'F#m7', 'G', 'E7', 'A7'], lyric: '가끔씩 보이는 우울한 눈빛이 마음에 걸려요' },
        { label: '후렴 ⑤', chords: ['D', 'F#m7', 'F#7', 'Bm'], lyric: '나 그대 아주 작은 일까지 알고 싶지만' },
        { label: '후렴 ⑥', chords: ['Em7', 'A7'], lyric: '어쩐지 그댄 내게 말을 안 해요' },
        { label: '후렴 ⑦', chords: ['F#m7', 'F#7', 'Bm', 'Bm7/A'], lyric: '허면 그대 잠든 밤 꿈속으로 찾아가' },
        { label: '후렴 ⑧', chords: ['G', 'A7', 'D'], lyric: '살며시 얘기 듣고 올래요' },
        { label: '후렴 ⑨', chords: ['D', 'F#m7', 'F#7', 'Bm', 'Em7', 'A7'], lyric: '나 그대 아주 작은 일까지 알고 싶지만' },
        { label: '후렴 ⑩', chords: ['F#m7', 'F#7', 'Bm', 'Bm7/A', 'G', 'A7', 'D'], lyric: '허면 그대 잠든 밤 꿈속으로 찾아가' },
        { label: '후주', chords: ['A/C#', 'G/B', 'A7', 'D', 'A/C#', 'G', 'Gm', 'D'], lyric: dots(8) }
      ]
    },

    /* ── 김필 · 원곡 A♭ (기타 카포 1 G폼) ─────────────────── */
    {
      id: 'kimfeel-again',
      title: '다시 사랑한다면',
      artist: '김필',
      key: 'A♭ · 카포 1',
      lang: 'ko',
      preset: 'ep',
      bpm: 76,
      builtin: true,
      parts: [
        { label: '전주', chords: ['Ab', 'Eb', 'Fm', 'Db'], lyric: dots(4) },
        { label: '1절 ①', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '다시 태어난다면 다시 사랑한다면' },
        { label: '1절 ②', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '그때는 우리 이러지 말아요' },
        { label: '1절 ③', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '조금 덜 만나고 조금 덜 기대하며' },
        { label: '1절 ④', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '많은 약속 않기로 해요' },
        { label: '1절 ⑤', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '다시 이별이 와도 서로 큰 아픔 없이' },
        { label: '1절 ⑥', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '돌아설 수 있을 만큼' },
        { label: '1절 ⑦', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '버려도 되는 가벼운 추억만' },
        { label: '1절 ⑧', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '서로의 가슴에 만들기로 해요' },
        { label: '프리코러스 ①', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '이젠 알아요 너무 깊은 사랑은' },
        { label: '프리코러스 ②', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '외려 슬픈 마지막을 가져 온다는 걸' },
        { label: '후렴 ①', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '그대여 빌게요 다음 번의 사랑은' },
        { label: '후렴 ②', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '우리 같지 않길 부디 아픔이 없이' },
        { label: '후렴 ③', chords: ['Ab', 'Eb', 'Fm', 'Cm', 'Db', 'Eb', 'Ab'], lyric: '나~ 꼭 나보다 더 행복해져야만 해' },
        { label: '간주', chords: ['Db', 'Ab', 'Eb', 'Fm', 'Bb', 'Db', 'Bbm', 'Eb'], lyric: dots(8) },
        { label: '2절 ①', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '많은 시간이 흘러 서로 잊고 지내도' },
        { label: '2절 ②', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '지난 날을 회상하며' },
        { label: '2절 ③', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '그 때도 이건 사랑이었다고 말할 수 있다면' },
        { label: '2절 ④', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '그걸로 된 거죠' },
        { label: '프리코러스 ③', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '이젠 알아요 너무 깊은 사랑은' },
        { label: '프리코러스 ④', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '외려 슬픈 마지막을 가져 온다는 걸' },
        { label: '후렴 ④', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '그대여 빌게요 다음 번의 사랑은' },
        { label: '후렴 ⑤', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '우리 같지 않길 부디 아픔이 없이' },
        { label: '후렴 ⑥', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '이젠 알아요 영원할 줄 알았던' },
        { label: '후렴 ⑦', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '그대와의 사랑마저 날 속였다는 게' },
        { label: '후렴 ⑧', chords: ['Ab', 'Eb', 'Fm', 'Cm'], lyric: '그보다 슬픈 건 나 없이 그대가' },
        { label: '후렴 ⑨', chords: ['Db', 'Ab', 'Bbm', 'Eb'], lyric: '행복하게 지낼 먼 훗날의 모습' },
        { label: '후렴 ⑩', chords: ['Ab', 'Eb', 'Fm', 'Cm', 'Db', 'Eb', 'Ab'], lyric: '나~ 내 마음을 하늘만은 알기를' },
        { label: '후주', chords: ['Ab', 'Eb', 'Fm', 'Ebm', 'Db', 'Ab'], lyric: dots(6) }
      ]
    },

    /* ── 나윤권 · D (후렴 E → 브릿지 F 전조) ──────────────── */
    {
      id: 'nayoonkwon-ifme',
      title: '나였으면',
      artist: '나윤권',
      key: 'D · 원곡',
      lang: 'ko',
      preset: 'ep',
      bpm: 71,
      builtin: true,
      parts: [
        { label: '전주', chords: ['G#m7', 'Em/G', 'D6/F#', 'Dm/F', 'BbM7', 'Asus4', 'A'], lyric: dots(7) },
        { label: '1절 ①', chords: ['D', 'A/D', 'Gm/Bb', 'D/A'], lyric: '늘 바라만 보네요' },
        { label: '1절 ②', chords: ['G#m7', 'Em7/G', 'D/F#'], lyric: '그대 숨소리 그대 웃음소리' },
        { label: '1절 ③', chords: ['Fdim7', 'Em7', 'G/A', 'A7'], lyric: '아직도 나를 흔들죠' },
        { label: '1절 ④', chords: ['D', 'A/D', 'Gm/Bb', 'D/A'], lyric: '또 눈물이 흐르죠' },
        { label: '1절 ⑤', chords: ['E/G#', 'Gm6', 'D/F#'], lyric: '아픈 내 맘 모른 채 그댄 웃고 있네요' },
        { label: '1절 ⑥', chords: ['C#m', 'Em', 'A'], lyric: '바보 같은 나 철없는 못난 나를' },
        { label: '1절 ⑦', chords: ['C#m7', 'F#/A#', 'Bm7', 'G#m7', 'Em'], lyric: '한 번쯤 그대 돌아봐 줄 수 없는지' },
        { label: '1절 ⑧', chords: ['D/F#', 'G', 'G/A'], lyric: '알고 있죠 내 바램들은' },
        { label: '후렴 ①', chords: ['A/B', 'E', 'F#m7', 'E/G#'], lyric: '나였으면 그대 사랑하는 사람 나였으면' },
        { label: '후렴 ②', chords: ['D#m7', 'G#7', 'C#m7'], lyric: '수없이 많은 날을 나 기도해 왔죠' },
        { label: '후렴 ③', chords: ['E/B', 'A#m7', 'Am6'], lyric: '푸르른 나무처럼 말없이 빛난 별처럼' },
        { label: '후렴 ④', chords: ['E/G#', 'D#/G', 'F#m7', 'A/B', 'E/G#'], lyric: '또 바라만 보고 있는 나를 그댄 알고 있나요' },
        { label: '간주', chords: ['Gdim7', 'F#m', 'G/A', 'E/G#', 'A', 'D', 'Bb/C'], lyric: dots(7) },
        { label: '2절 ①', chords: ['D', 'A/D', 'Gm/Bb', 'D/A'], lyric: '늘 오늘까지만 혼자 연습해 왔던' },
        { label: '2절 ②', chords: ['E/G#', 'Gm6', 'D/F#'], lyric: '사랑의 고백들도 슬픈 뒷모습' },
        { label: '2절 ③', chords: ['C#m', 'Em', 'A'], lyric: '그저 오늘까지만' },
        { label: '2절 ④', chords: ['C#m7', 'F#/A#', 'Bm7', 'G#m7', 'Em'], lyric: '이런 내 맘을 모른 채 살아갈 테죠' },
        { label: '2절 ⑤', chords: ['D/F#', 'G', 'G/A'], lyric: '기다림이 잊혀짐보다 쉽다는 걸' },
        { label: '후렴 ⑤', chords: ['A/B', 'E', 'F#m7', 'E/G#'], lyric: '나였으면 그대 사랑하는 사람 나였으면' },
        { label: '후렴 ⑥', chords: ['D#m7', 'G#7', 'C#m7'], lyric: '수없이 많은 날을 나 기도해 왔죠' },
        { label: '후렴 ⑦', chords: ['E/B', 'A#m7', 'Am6'], lyric: '푸르른 나무처럼 말없이 빛난 별처럼' },
        { label: '후렴 ⑧', chords: ['E/G#', 'D#/G', 'F#m7', 'A/B', 'E/G#'], lyric: '또 바라만 보고 있는 나를 그댄 알고 있나요' },
        { label: '브릿지 ①', chords: ['F', 'G', 'F/A', 'Gm', 'C7'], lyric: '묻고 싶죠 그댄 잘 지내는가요' },
        { label: '브릿지 ②', chords: ['Bb', 'F/A', 'Em7', 'A/C#', 'Dm7'], lyric: '함께하는 그 사람이 그대에게 잘해 주나요' },
        { label: '브릿지 ③', chords: ['F', 'G', 'F/A', 'Gm', 'C7'], lyric: '바보 같은 걱정도 부질없단 걸 알지만' },
        { label: '브릿지 ④', chords: ['Bb', 'F/A', 'E/G#', 'Gm', 'Am', 'Bb', 'Bb/C'], lyric: '눈물 없이 꼭 한 번은 말하고 싶었죠 사랑한다고' },
        { label: '후주', chords: ['Bm7', 'Bb7', 'Am7', 'Ab7', 'Gm7', 'C7', 'F'], lyric: dots(7) }
      ]
    },

    /* ══════════════════════════════════════════════════════
       English
       ══════════════════════════════════════════════════════ */

    /* ── Bruno Mars · B ──────────────────────────────────── */
    {
      id: 'bruno-lazy-song',
      title: 'The Lazy Song',
      artist: 'Bruno Mars',
      key: 'B · 원곡',
      lang: 'en',
      preset: 'bell',
      bpm: 88,
      builtin: true,
      parts: [
        { label: 'Chorus 1', chords: ['B', 'F#', 'E'], lyric: "Today I don't feel like doing anything" },
        { label: 'Chorus 2', chords: ['B', 'F#', 'E'], lyric: 'I just wanna lay in my bed' },
        { label: 'Chorus 3', chords: ['B', 'F#', 'E'], lyric: 'So leave a message at the tone' },
        { label: 'Chorus 4', chords: ['B', 'D#7', 'E'], lyric: "Cause today I swear I'm not doing anything" },
        { label: 'Post-Chorus', chords: ['B', 'F#', 'E'], lyric: 'Nothing at all' },
        { label: 'Verse 1 ①', chords: ['B', 'F#', 'E'], lyric: "I'm gonna kick my feet up and stare at the fan" },
        { label: 'Verse 1 ②', chords: ['B', 'F#', 'E'], lyric: 'Turn the TV on, throw my hand in my pants' },
        { label: 'Verse 1 ③', chords: ['B', 'F#', 'E'], lyric: "Nobody's gonna tell me I can't" },
        { label: 'Verse 1 ④', chords: ['B', 'F#', 'E'], lyric: "I'll be lying on the couch just chillin'" },
        { label: 'Verse 1 ⑤', chords: ['B', 'F#', 'E'], lyric: 'Click to MTV so they can teach me how to dougie' },
        { label: 'Pre-Chorus ①', chords: ['C#m', 'D#m', 'E', 'F#'], lyric: 'Yes I said it, I said it cause I can' },
        { label: 'Chorus 5', chords: ['B', 'F#', 'E'], lyric: "Today I don't feel like doing anything" },
        { label: 'Chorus 6', chords: ['B', 'F#', 'E'], lyric: 'I just wanna lay in my bed' },
        { label: 'Chorus 7', chords: ['B', 'D#7', 'E'], lyric: 'So leave a message at the tone' },
        { label: 'Verse 2 ①', chords: ['B', 'F#', 'E'], lyric: 'Tomorrow I wake up, do some P90X' },
        { label: 'Verse 2 ②', chords: ['B', 'F#', 'E'], lyric: 'With a really nice girl have some really nice sex' },
        { label: 'Verse 2 ③', chords: ['B', 'F#', 'E'], lyric: 'I might mess around and get my college degree' },
        { label: 'Verse 2 ④', chords: ['B', 'F#', 'E'], lyric: "I'm sorry pops you just have to wait" },
        { label: 'Pre-Chorus ②', chords: ['C#m', 'D#m', 'E', 'F#'], lyric: 'Yes I said it, I said it cause I can' },
        { label: 'Chorus 8', chords: ['B', 'F#', 'E'], lyric: "Today I don't feel like doing anything" },
        { label: 'Chorus 9', chords: ['B', 'D#7', 'E'], lyric: "Cause today I swear I'm not doing anything" },
        { label: 'Bridge ①', chords: ['C#m', 'F#', 'G#m'], lyric: "No I ain't gonna comb my hair" },
        { label: 'Bridge ②', chords: ['E', 'F#', 'G#m'], lyric: "Cause I ain't going anywhere" },
        { label: 'Bridge ③', chords: ['C#m', 'F#', 'G#m'], lyric: "I'll just strut in my birthday suit" },
        { label: 'Bridge ④', chords: ['E', 'F#', 'G#m'], lyric: 'And let everything hang loose' },
        { label: 'Final Chorus ①', chords: ['B', 'F#', 'E'], lyric: "Today I don't feel like doing anything" },
        { label: 'Final Chorus ②', chords: ['B', 'D#7', 'E'], lyric: "Cause today I swear I'm not doing anything" },
        { label: 'Outro', chords: ['B', 'F#', 'E'], lyric: 'Nothing at all' }
      ]
    },

    /* ── John Legend · A♭ (기타 카포 1 G폼) ───────────────── */
    {
      id: 'john-legend-allofme',
      title: 'All of Me',
      artist: 'John Legend',
      key: 'A♭ · 원곡',
      lang: 'en',
      preset: 'ep',
      bpm: 60,
      builtin: true,
      parts: [
        { label: 'Intro', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: dots(4) },
        { label: 'Verse 1 ①', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'What would I do without your smart mouth' },
        { label: 'Verse 1 ②', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'Drawing me in, and you kicking me out' },
        { label: 'Verse 1 ③', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "You've got my head spinning, no kidding" },
        { label: 'Verse 1 ④', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "What's going on in that beautiful mind" },
        { label: 'Verse 1 ⑤', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "I'm on your magical mystery ride" },
        { label: 'Verse 1 ⑥', chords: ['Db', 'Ab', 'Eb', 'Bbm'], lyric: "And I'm so dizzy, don't know what hit me" },
        { label: 'Pre-Chorus ①', chords: ['Bbm', 'Ab', 'Eb', 'Bbm'], lyric: "My head's under water" },
        { label: 'Pre-Chorus ②', chords: ['Ab', 'Eb'], lyric: "But I'm breathing fine" },
        { label: 'Chorus ①', chords: ['Ab', 'Fm', 'Bbm', 'Db', 'Eb'], lyric: "Cause all of me loves all of you" },
        { label: 'Chorus ②', chords: ['Ab', 'Fm', 'Bbm', 'Db', 'Eb'], lyric: 'Love your curves and all your edges' },
        { label: 'Chorus ③', chords: ['Ab', 'Fm', 'Bbm', 'Db', 'Eb'], lyric: "Give your all to me, I'll give my all to you" },
        { label: 'Chorus ④', chords: ['Bbm', 'Db', 'Eb', 'Fm', 'Db'], lyric: "You're my end and my beginning" },
        { label: 'Chorus ⑤', chords: ['Ab', 'Eb', 'Fm', 'Db', 'Ab', 'Eb'], lyric: 'Cause I give you all, all of me' },
        { label: 'Verse 2 ①', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'How many times do I have to tell you' },
        { label: 'Verse 2 ②', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "Even when you're crying you're beautiful too" },
        { label: 'Verse 2 ③', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'The world is beating you down' },
        { label: 'Verse 2 ④', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "You're my downfall, you're my muse" },
        { label: 'Verse 2 ⑤', chords: ['Db', 'Ab', 'Eb', 'Bbm'], lyric: "I can't stop singing, it's ringing in my head for you" },
        { label: 'Pre-Chorus ③', chords: ['Bbm', 'Ab', 'Eb', 'Bbm'], lyric: "My head's under water" },
        { label: 'Pre-Chorus ④', chords: ['Ab', 'Eb'], lyric: "You're crazy and I'm out of my mind" },
        { label: 'Chorus ⑥', chords: ['Ab', 'Fm', 'Bbm', 'Db', 'Eb'], lyric: "Cause all of me loves all of you" },
        { label: 'Chorus ⑦', chords: ['Ab', 'Fm', 'Bbm', 'Db', 'Eb'], lyric: 'Love your curves and all your edges' },
        { label: 'Chorus ⑧', chords: ['Bbm', 'Db', 'Eb', 'Fm', 'Db'], lyric: "You're my end and my beginning" },
        { label: 'Chorus ⑨', chords: ['Ab', 'Eb', 'Fm', 'Db', 'Ab', 'Eb'], lyric: 'Even when I lose I\'m winning' },
        { label: 'Bridge ①', chords: ['Bbm', 'Ab', 'Eb', 'Bbm'], lyric: 'Cards on the table' },
        { label: 'Bridge ②', chords: ['Ab', 'Eb'], lyric: "Risking it all, though it's hard" },
        { label: 'Final Chorus ①', chords: ['Ab', 'Fm', 'Bbm', 'Db', 'Eb'], lyric: "Cause all of me loves all of you" },
        { label: 'Final Chorus ②', chords: ['Bbm', 'Db', 'Eb', 'Fm', 'Db'], lyric: "You're my end and my beginning" },
        { label: 'Outro', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'I give you all, all of me' }
      ]
    },

    /* ── Ed Sheeran · A♭ (기타 카포 1 G폼) ────────────────── */
    {
      id: 'ed-sheeran-perfect',
      title: 'Perfect',
      artist: 'Ed Sheeran',
      key: 'A♭ · 카포 1',
      lang: 'en',
      preset: 'bell',
      bpm: 64,
      builtin: true,
      parts: [
        { label: 'Verse 1 ①', chords: ['Ab', 'Fm'], lyric: 'I found a love for me' },
        { label: 'Verse 1 ②', chords: ['Db', 'Eb'], lyric: 'Darling, just dive right in, and follow my lead' },
        { label: 'Verse 1 ③', chords: ['Ab', 'Fm'], lyric: 'Well I found a girl beautiful and sweet' },
        { label: 'Verse 1 ④', chords: ['Db', 'Eb'], lyric: 'I never knew you were the someone waiting for me' },
        { label: 'Pre-Chorus ①', chords: ['Ab', 'Fm', 'Db', 'Ab', 'Eb'], lyric: "'Cause we were just kids when we fell in love" },
        { label: 'Pre-Chorus ②', chords: ['Ab', 'Fm', 'Db', 'Eb'], lyric: 'I will not give you up this time' },
        { label: 'Pre-Chorus ③', chords: ['Ab', 'Fm', 'Db', 'Eb'], lyric: 'Darling, just kiss me slow, your heart is all I own' },
        { label: 'Pre-Chorus ④', chords: ['Db', 'Eb'], lyric: "And in your eyes you're holding mine" },
        { label: 'Chorus ①', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "Baby, I'm dancing in the dark" },
        { label: 'Chorus ②', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'Barefoot on the grass, listening to our favorite song' },
        { label: 'Chorus ③', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'When you said you looked a mess' },
        { label: 'Chorus ④', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'Darling, you look perfect tonight' },
        { label: 'Verse 2 ①', chords: ['Ab', 'Fm'], lyric: 'I found a woman, stronger than anyone I know' },
        { label: 'Verse 2 ②', chords: ['Db', 'Eb'], lyric: "She shares my dreams, I hope that someday I'll share her home" },
        { label: 'Verse 2 ③', chords: ['Ab', 'Fm'], lyric: 'I found a love, to carry more than just my secrets' },
        { label: 'Verse 2 ④', chords: ['Db', 'Eb'], lyric: 'To carry love, to carry children of our own' },
        { label: 'Pre-Chorus ⑤', chords: ['Ab', 'Fm', 'Db', 'Ab', 'Eb'], lyric: "We are still kids, but we're so in love" },
        { label: 'Pre-Chorus ⑥', chords: ['Ab', 'Fm', 'Db', 'Eb'], lyric: "Darling, just hold my hand, be my girl, I'll be your man" },
        { label: 'Pre-Chorus ⑦', chords: ['Db', 'Eb'], lyric: 'I see my future in your eyes' },
        { label: 'Chorus ⑤', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "Baby, I'm dancing in the dark" },
        { label: 'Chorus ⑥', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'Barefoot on the grass, listening to our favorite song' },
        { label: 'Chorus ⑦', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'When I saw you in that dress, looking so beautiful' },
        { label: 'Chorus ⑧', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "Darling, you look perfect tonight" },
        { label: 'Interlude', chords: ['Db', 'Db', 'Eb', 'Eb'], lyric: dots(4) },
        { label: 'Chorus ⑨', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "Baby, I'm dancing in the dark" },
        { label: 'Chorus ⑩', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'Barefoot on the grass, listening to our favorite song' },
        { label: 'Chorus ⑪', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: 'I have faith in what I see' },
        { label: 'Chorus ⑫', chords: ['Fm', 'Db', 'Ab', 'Eb'], lyric: "Now I know I have met an angel in person" },
        { label: 'Outro', chords: ['Ab/C', 'Db', 'Ebsus4', 'Eb', 'Ab'], lyric: 'You look perfect tonight' }
      ]
    },

    /* ── Adele · A ──────────────────────────────────────── */
    {
      id: 'adele-someone-like-you',
      title: 'Someone Like You',
      artist: 'Adele',
      key: 'A · 원곡',
      lang: 'en',
      preset: 'ep',
      bpm: 68,
      builtin: true,
      parts: [
        { label: 'Intro', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: dots(4) },
        { label: 'Verse 1 ①', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: "I heard that you're settled down" },
        { label: 'Verse 1 ②', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: "That you found a girl and you're married now" },
        { label: 'Verse 1 ③', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: "I heard that your dreams came true" },
        { label: 'Verse 1 ④', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: "Guess she gave you things, I didn't give to you" },
        { label: 'Pre-Chorus ①', chords: ['E', 'F#m', 'D'], lyric: 'I hate to turn up out of the blue uninvited' },
        { label: 'Pre-Chorus ②', chords: ['E', 'F#m', 'D', 'Dmaj7'], lyric: "I'd hoped you'd see my face" },
        { label: 'Chorus ①', chords: ['A', 'E', 'F#m', 'D'], lyric: "Never mind, I'll find someone like you" },
        { label: 'Chorus ②', chords: ['A', 'E', 'F#m', 'D'], lyric: 'I wish nothing but the best for you too' },
        { label: 'Chorus ③', chords: ['A', 'E', 'F#m', 'D'], lyric: "Don't forget me, I beg, I remember you said" },
        { label: 'Chorus ④', chords: ['A', 'E', 'F#m', 'D'], lyric: 'Sometimes it lasts in love but sometimes it hurts instead' },
        { label: 'Verse 2 ①', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: 'You know how the time flies' },
        { label: 'Verse 2 ②', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: 'Only yesterday was the time of our lives' },
        { label: 'Verse 2 ③', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: 'We were born and raised in a summer haze' },
        { label: 'Verse 2 ④', chords: ['A', 'A/G#', 'F#m', 'D'], lyric: 'Bound by the surprise of our glory days' },
        { label: 'Pre-Chorus ③', chords: ['E', 'F#m', 'D'], lyric: 'I hate to turn up out of the blue uninvited' },
        { label: 'Pre-Chorus ④', chords: ['E', 'F#m', 'D', 'Dmaj7'], lyric: "I'd hoped you'd see my face" },
        { label: 'Chorus ⑤', chords: ['A', 'E', 'F#m', 'D'], lyric: "Never mind, I'll find someone like you" },
        { label: 'Chorus ⑥', chords: ['A', 'E', 'F#m', 'D'], lyric: 'I wish nothing but the best for you too' },
        { label: 'Bridge ①', chords: ['E', 'F#m', 'D', 'Bm'], lyric: 'Nothing compares, no worries or cares' },
        { label: 'Bridge ②', chords: ['C#m', 'D', 'Bm'], lyric: 'Who would have known how bittersweet this would taste' },
        { label: 'Final Chorus ①', chords: ['A', 'E', 'F#m', 'D'], lyric: "Never mind, I'll find someone like you" },
        { label: 'Final Chorus ②', chords: ['A', 'E', 'F#m', 'D'], lyric: 'I wish nothing but the best for you too' },
        { label: 'Final Chorus ③', chords: ['A', 'E', 'F#m', 'D'], lyric: "Sometimes it lasts in love but sometimes it hurts instead" }
      ]
    },

    /* ══════════════════════════════════════════════════════
       연습용
       ══════════════════════════════════════════════════════ */

    /* ── 자유 잼 ────────────────────────────────────────── */
    {
      id: 'free-jam',
      title: '자유 잼',
      artist: 'HandBand',
      key: 'C · 마음 가는 대로',
      lang: 'etc',
      preset: 'lush',
      bpm: 84,
      builtin: true,
      parts: [
        { label: '잼', chords: ['Cmaj7', 'Am7', 'Fmaj7', 'G7'], lyric: '마음 가는 대로' }
      ]
    }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  global.HB = global.HB || {};
  global.HB.Songs = {
    builtin: function () { return clone(BUILTIN); },
    groups: [
      { id: 'ko', label: '한국어' },
      { id: 'en', label: 'English' },
      { id: 'etc', label: '연습' }
    ],
    blank: function () {
      return {
        id: 'new-' + Date.now(),
        title: '새 곡',
        artist: '',
        key: '',
        lang: 'ko',
        preset: 'warm',
        bpm: 80,
        score: '#1절\n[C]가사를 [Am]여기에 [F]써 보세요\n[G]코드는 대괄호 안에'
      };
    }
  };
})(window);
