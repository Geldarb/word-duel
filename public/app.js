(() => {
  const VERSION = 'v0.4';
  const EMOJIS = ['😍', '😂', '😮', '👏', '🔥', '😭', '😘', '🙈'];
  const NAME_KEY = 'wordduel_name';
  const TOKEN_KEY = 'wordduel_token';
  const SOUND_KEY = 'wordduel_sound';
  const HISTORY_KEY = 'wordduel_history_v1';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const screens = {
    home: $('#screen-home'),
    slang: $('#screen-slang'),
    lobby: $('#screen-lobby'),
    coin: $('#screen-coin'),
    play: $('#screen-play'),
    fill: $('#screen-fill'),
    reveal: $('#screen-reveal'),
    result: $('#screen-result'),
    end: $('#screen-end'),
  };

  const els = {
    name: $('#name-input'),
    code: $('#code-input'),
    homeError: $('#home-error'),
    create: $('#btn-create'),
    join: $('#btn-join'),
    funMode: $('#fun-mode'),
    funToggleWrap: $('#fun-toggle-wrap'),
    lengthPicker: $('#length-picker'),
    lobbyCode: $('#lobby-code'),
    lobbyPlayers: $('#lobby-players'),
    lobbyStatus: $('#lobby-status'),
    coin: $('#coin'),
    coinResult: $('#coin-result'),
    youName: $('#you-name'),
    oppName: $('#opp-name'),
    youScore: $('#you-score'),
    oppScore: $('#opp-score'),
    timer: $('#timer'),
    timerNum: $('#timer-num'),
    turnStatus: $('#turn-status'),
    turnCount: $('#turn-count'),
    rack: $('#word-rack'),
    wordHint: $('#word-hint'),
    resultSlang: $('#result-slang'),
    resultBreakdown: $('#result-breakdown'),
    tray: $('#tile-tray'),
    clear: $('#btn-clear'),
    shuffle: $('#btn-shuffle'),
    submit: $('#btn-submit'),
    emojiBar: $('#emoji-bar'),
    endEmojiBar: $('#end-emoji-bar'),
    fillEmojiBar: $('#fill-emoji-bar'),
    revealEmojiBar: $('#reveal-emoji-bar'),
    resultLabel: $('#result-label'),
    resultWord: $('#result-word'),
    resultScore: $('#result-score'),
    resultYouName: $('#result-you-name'),
    resultOppName: $('#result-opp-name'),
    resultYouScore: $('#result-you-score'),
    resultOppScore: $('#result-opp-score'),
    endTitle: $('#end-title'),
    endYouName: $('#end-you-name'),
    endOppName: $('#end-opp-name'),
    endYouScore: $('#end-you-score'),
    endOppScore: $('#end-opp-score'),
    endRecord: $('#end-record'),
    endClassic: $('#end-classic'),
    endStory: $('#end-story'),
    histYouTitle: $('#hist-you-title'),
    histOppTitle: $('#hist-opp-title'),
    histYou: $('#hist-you'),
    histOpp: $('#hist-opp'),
    rematch: $('#btn-rematch'),
    rematchStatus: $('#rematch-status'),
    disconnect: $('#disconnect-banner'),
    reactions: $('#reactions'),
    modal: $('#modal'),
    modalCancel: $('#modal-cancel'),
    modalLeave: $('#modal-leave'),
    updateBanner: $('#update-banner'),
    menuBtn: $('#btn-menu'),
    menuPanel: $('#menu-panel'),
    menuClose: $('#menu-close'),
    soundToggle: $('#sound-toggle'),
    openSlang: $('#btn-slang'),
    slangBack: $('#slang-back'),
    slangSearch: $('#slang-search'),
    slangList: $('#slang-list'),
    slangCount: $('#slang-count'),
    homeHistory: $('#home-history'),
    historyList: $('#history-list'),
    fillTimer: $('#fill-timer'),
    fillTimerNum: $('#fill-timer-num'),
    fillHeading: $('#fill-heading'),
    fillCount: $('#fill-count'),
    fillStory: $('#fill-story'),
    fillFields: $('#fill-fields'),
    fillStatus: $('#fill-status'),
    submitStory: $('#btn-submit-story'),
    revealYouName: $('#reveal-you-name'),
    revealOppName: $('#reveal-opp-name'),
    revealYouScore: $('#reveal-you-score'),
    revealOppScore: $('#reveal-opp-score'),
    revealLineCount: $('#reveal-line-count'),
    revealPreamble: $('#reveal-preamble'),
    versionPeachText: $('#version-peach-text'),
    versionBlossomText: $('#version-blossom-text'),
    beginTale: $('#btn-begin-tale'),
    muteVoice: $('#btn-mute-voice'),
    hearLine: $('#btn-hear-line'),
    voiceFallback: $('#voice-fallback'),
    voteRow: $('#vote-row'),
    voteStatus: $('#vote-status'),
  };

  let state = null;
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let tiles = [];
  let timerId = null;
  let localEnd = 0;
  let leavingConfirmed = false;
  let coinAnimatedFor = '';
  let checkTimer = null;
  let checkSeq = 0;
  let lastCheckedWord = '';
  let lastCheckValid = false;
  let lastCheckSlang = false;
  let inFlightWord = '';
  let selectedMode = 'classic';
  let storyLength = 5;
  let fillBoundFor = '';
  let fillAnswers = [];
  let lastTurnKey = '';
  let lastResultKey = '';
  let lastHintShown = false;
  let lastRevealKey = '';
  let viewingSlang = false;
  let slangWords = null;
  let audioCtx = null;
  let soundOn = localStorage.getItem(SOUND_KEY) !== 'off';

  const narrator = {
    unlocked: false,
    muted: false,
    failing: false,
  };

  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionAttempts: Infinity,
  });

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle('hidden', key !== name);
    }
  }

  function setError(text) {
    els.homeError.hidden = !text;
    els.homeError.textContent = text || '';
  }

  function displayName() {
    const raw = (els.name.value || '').trim().slice(0, 16);
    return raw || 'Player';
  }

  function saveName() {
    localStorage.setItem(NAME_KEY, displayName());
  }

  function rememberToken(next) {
    token = next || '';
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fullscreenSupported() {
    const el = document.documentElement;
    return typeof (el.requestFullscreen || el.webkitRequestFullscreen) === 'function';
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  }

  function setupFullscreenButtons() {
    const supported = fullscreenSupported();
    $$('[data-fs]').forEach((btn) => {
      btn.hidden = !supported;
      btn.addEventListener('click', toggleFullscreen);
    });
  }

  function renderEmojiBars() {
    for (const bar of [els.emojiBar, els.endEmojiBar, els.fillEmojiBar, els.revealEmojiBar]) {
      if (!bar) continue;
      bar.innerHTML = '';
      for (const emoji of EMOJIS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.setAttribute('aria-label', `Send ${emoji}`);
        btn.addEventListener('click', () => socket.emit('react', { emoji }));
        bar.appendChild(btn);
      }
    }
  }

  function showReaction(emoji, mine) {
    const node = document.createElement('div');
    node.className = 'float-emoji';
    node.textContent = emoji;
    const left = mine ? 18 + Math.random() * 30 : 50 + Math.random() * 32;
    node.style.left = `${left}%`;
    els.reactions.appendChild(node);
    setTimeout(() => node.remove(), 1700);
  }

  function unlockAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch {
      // ignore
    }
  }

  function beep({ freq = 440, dur = 0.08, type = 'sine', gain = 0.05, delay = 0 }) {
    if (!soundOn || !audioCtx) return;
    try {
      const t0 = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(Math.max(0.0001, gain), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // ignore
    }
  }

  function soundTap() { beep({ freq: 420, dur: 0.05, type: 'triangle', gain: 0.035 }); }
  function soundChime() {
    beep({ freq: 660, dur: 0.12, type: 'sine', gain: 0.06 });
    beep({ freq: 880, dur: 0.16, type: 'sine', gain: 0.05, delay: 0.08 });
  }
  function soundSubmit() { beep({ freq: 520, dur: 0.1, type: 'square', gain: 0.03 }); }
  function soundValid() {
    beep({ freq: 523, dur: 0.12, type: 'sine', gain: 0.06 });
    beep({ freq: 659, dur: 0.16, type: 'sine', gain: 0.06, delay: 0.1 });
  }
  function soundInvalid() {
    beep({ freq: 180, dur: 0.18, type: 'sawtooth', gain: 0.03 });
  }

  function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch { /* iOS ignores this */ }
  }

  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return {
        opponents: raw.opponents && typeof raw.opponents === 'object' ? raw.opponents : {},
        recorded: Array.isArray(raw.recorded) ? raw.recorded : [],
      };
    } catch {
      return { opponents: {}, recorded: [] };
    }
  }

  function saveHistory(data) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
  }

  function emptyRecord() {
    return { wins: 0, losses: 0, draws: 0 };
  }

  function recordMatch(next) {
    if (!next?.matchId || next.status !== 'ended' || !next.opponent) return;
    const data = loadHistory();
    if (data.recorded.includes(next.matchId)) return;
    const name = next.opponent.name || 'Opponent';
    const mode = next.mode === 'story' ? 'story' : 'classic';
    if (!data.opponents[name]) data.opponents[name] = { classic: emptyRecord(), story: emptyRecord() };
    if (!data.opponents[name][mode]) data.opponents[name][mode] = emptyRecord();
    const bucket = data.opponents[name][mode];
    const ys = next.you?.score ?? 0;
    const os = next.opponent?.score ?? 0;
    if (ys > os) bucket.wins += 1;
    else if (os > ys) bucket.losses += 1;
    else bucket.draws += 1;
    data.recorded.push(next.matchId);
    data.recorded = data.recorded.slice(-80);
    saveHistory(data);
  }

  function formatRecord(r) {
    const rec = r || emptyRecord();
    return `${rec.wins}–${rec.losses}–${rec.draws}`;
  }

  function renderHomeHistory() {
    const data = loadHistory();
    const names = Object.keys(data.opponents).sort((a, b) => a.localeCompare(b));
    if (!names.length) {
      els.homeHistory.hidden = true;
      return;
    }
    els.homeHistory.hidden = false;
    els.historyList.innerHTML = names.map((name) => {
      const row = data.opponents[name];
      return `<li><span class="opp-name">${escapeHtml(name)}</span><span class="record">Word ${formatRecord(row.classic)} · Story ${formatRecord(row.story)}</span></li>`;
    }).join('');
  }

  function recordLine(next) {
    if (!next?.opponent) return '';
    const data = loadHistory();
    const row = data.opponents[next.opponent.name || 'Opponent'];
    if (!row) return '';
    const mode = next.mode === 'story' ? 'story' : 'classic';
    const rec = row[mode] || emptyRecord();
    const label = mode === 'story' ? 'Story Duel' : 'Word Duel';
    return `vs ${next.opponent.name}: ${label} ${rec.wins} win${rec.wins === 1 ? '' : 's'}, ${rec.losses} loss${rec.losses === 1 ? '' : 'es'}, ${rec.draws} draw${rec.draws === 1 ? '' : 's'}`;
  }

  function screenFor(status) {
    switch (status) {
      case 'lobby': return 'lobby';
      case 'coin': return 'coin';
      case 'playing': return 'play';
      case 'paused':
        if (state?.mode === 'story' && state.story?.phase === 'fill') return 'fill';
        if (state?.mode === 'story' && state.story?.phase === 'reveal') return 'reveal';
        return 'play';
      case 'filling': return 'fill';
      case 'revealing': return 'reveal';
      case 'intermission': return 'result';
      case 'ended': return 'end';
      default: return 'home';
    }
  }

  function setFunBadges(on) {
    $$('[data-fun-badge]').forEach((el) => { el.hidden = !on; });
  }

  function setModeBadges(next) {
    const story = next?.mode === 'story';
    const label = story ? `Story Duel · ${next.storyLength || 5} blanks` : '';
    $$('[data-mode-badge]').forEach((el) => {
      el.hidden = !story;
      if (story) el.textContent = label;
    });
  }

  function updateModeUi() {
    $$('[data-mode]').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.mode === selectedMode);
    });
    $$('[data-length]').forEach((btn) => {
      btn.classList.toggle('selected', Number(btn.dataset.length) === storyLength);
    });
    const story = selectedMode === 'story';
    if (els.funToggleWrap) els.funToggleWrap.classList.toggle('hidden', story);
    if (els.lengthPicker) els.lengthPicker.classList.toggle('hidden', !story);
  }

  function renderState() {
    if (!state) {
      if (!viewingSlang) showScreen('home');
      els.disconnect.hidden = true;
      setFunBadges(false);
      setModeBadges(null);
      renderHomeHistory();
      return;
    }
    viewingSlang = false;
    els.menuPanel.classList.add('hidden');
    showScreen(screenFor(state.status));
    const oppGone = !!(state.opponent && !state.opponent.connected);
    els.disconnect.hidden = !oppGone;
    setFunBadges(!!state.funMode);
    setModeBadges(state);

    if (state.status === 'lobby') renderLobby();
    if (state.status === 'coin') renderCoin();
    if (state.status === 'playing' || (state.status === 'paused' && state.mode !== 'story')) renderPlay();
    if (state.status === 'filling' || (state.status === 'paused' && state.story?.phase === 'fill')) renderFill();
    if (state.status === 'revealing' || (state.status === 'paused' && state.story?.phase === 'reveal')) renderReveal();
    if (state.status === 'intermission') renderResult();
    if (state.status === 'ended') renderEnd();
  }

  function renderLobby() {
    els.lobbyCode.textContent = state.code || '————';
    const you = state.you?.name || 'You';
    const opp = state.opponent?.name;
    els.lobbyPlayers.textContent = opp ? `${you}  &  ${opp}` : you;
    els.lobbyStatus.textContent = opp
      ? 'Both here — getting ready…'
      : 'Waiting for your opponent…';
  }

  function renderCoin() {
    const firstId = state.firstPlayerId;
    const first = firstId && (firstId === state.you?.id ? state.you : state.opponent);
    const key = `${state.code}:${firstId}`;
    if (coinAnimatedFor !== key) {
      coinAnimatedFor = key;
      els.coin.classList.remove('show-tails', 'spinning');
      els.coinResult.textContent = 'Flipping a coin…';
      requestAnimationFrame(() => els.coin.classList.add('spinning'));
      setTimeout(() => {
        els.coin.classList.remove('spinning');
        if (firstId === 'p2') els.coin.classList.add('show-tails');
        els.coinResult.textContent = first
          ? `${first.name} goes first!`
          : 'Someone goes first!';
      }, 2100);
    } else if (!els.coin.classList.contains('spinning')) {
      els.coinResult.textContent = first
        ? `${first.name} goes first!`
        : 'Someone goes first!';
    }
  }

  function syncTilesFromState() {
    const letters = state.current?.letters || [];
    const values = state.current?.values || [];
    const same = tiles.length === letters.length
      && tiles.every((t, i) => t.letter === letters[i]);
    if (!same) {
      tiles = letters.map((letter, i) => ({
        id: i,
        letter,
        value: values[i] ?? 0,
        used: false,
      }));
    }
  }

  function remainingSeconds() {
    if (!state?.current) return 0;
    if (state.current.paused) return Math.ceil((state.current.remainingMs || 0) / 1000);
    return Math.max(0, Math.ceil((localEnd - Date.now()) / 1000));
  }

  function fillRemainingSeconds() {
    const story = state?.story;
    if (!story) return 0;
    if (story.paused) return Math.ceil((story.remainingMs || 0) / 1000);
    return Math.max(0, Math.ceil((localEnd - Date.now()) / 1000));
  }

  function formatSecs(s) {
    if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return String(s);
  }

  function tickTimer() {
    if (els.timerNum && (state?.status === 'playing' || state?.status === 'paused') && state?.current) {
      const s = remainingSeconds();
      els.timerNum.textContent = String(s);
      els.timer.classList.toggle('warn', s <= 15 && s > 5);
      els.timer.classList.toggle('urgent', s <= 5);
    }
    if (els.fillTimerNum && state?.story?.phase === 'fill') {
      const s = fillRemainingSeconds();
      els.fillTimerNum.textContent = formatSecs(s);
      els.fillTimer.classList.toggle('warn', s <= 30 && s > 10);
      els.fillTimer.classList.toggle('urgent', s <= 10);
    }
  }

  function armTimer(paused) {
    if (timerId) clearInterval(timerId);
    tickTimer();
    if (paused) return;
    timerId = setInterval(tickTimer, 200);
  }

  function maybeAnnounceTurn() {
    if (!(state?.status === 'playing' && state.current?.yours && !state.current.paused)) return;
    const key = `${state.matchId}:${state.current.turnNumber}`;
    if (key === lastTurnKey) return;
    lastTurnKey = key;
    vibrate([30, 40, 50]);
  }

  function renderPlay() {
    const you = state.you;
    const opp = state.opponent;
    els.youName.textContent = you?.name || 'You';
    els.oppName.textContent = opp?.name || 'Opponent';
    els.youScore.textContent = String(you?.score ?? 0);
    els.oppScore.textContent = String(opp?.score ?? 0);
    const turn = state.current;
    const yours = !!turn?.yours;
    const paused = state.status === 'paused' || turn?.paused;
    els.turnCount.textContent = turn ? `Turn ${turn.turnNumber} of 12` : '';
    if (paused) els.turnStatus.textContent = 'Paused — waiting…';
    else if (yours) els.turnStatus.textContent = 'Your turn';
    else els.turnStatus.textContent = `${opp?.name || 'Opponent'} is thinking…`;
    syncTilesFromState();
    if (turn) {
      localEnd = Date.now() + (turn.remainingMs || 0);
      armTimer(paused);
    }
    renderRackAndTray();
    const canPlay = yours && !paused;
    els.clear.disabled = !canPlay;
    els.shuffle.disabled = !canPlay;
    els.submit.disabled = !canPlay;
    maybeAnnounceTurn();
  }

  function currentWord() {
    return tiles.filter((t) => t.used).sort((a, b) => a.order - b.order);
  }

  function renderRackAndTray() {
    const placed = currentWord();
    els.rack.innerHTML = '';
    els.rack.classList.toggle('empty', placed.length === 0);
    for (const tile of placed) {
      els.rack.appendChild(makeTileButton(tile, true));
    }
    els.tray.innerHTML = '';
    for (const tile of tiles) {
      els.tray.appendChild(makeTileButton(tile, false));
    }
    scheduleWordCheck();
  }

  function currentSelection() {
    return currentWord().map((t) => t.letter).join('');
  }

  function ensureWordHint() {
    if (els.wordHint) return els.wordHint;
    const rack = els.rack;
    if (!rack) return null;
    let wrap = rack.closest('.word-area');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'word-area';
      rack.replaceWith(wrap);
      wrap.appendChild(rack);
    }
    const p = document.createElement('p');
    p.id = 'word-hint';
    p.className = 'word-hint';
    p.dataset.testid = 'word-hint';
    p.setAttribute('aria-live', 'polite');
    wrap.appendChild(p);
    els.wordHint = p;
    return p;
  }

  function setWordHint(valid, slang) {
    const el = ensureWordHint();
    if (!el) return;
    if (!valid) {
      el.textContent = '';
      lastHintShown = false;
    } else {
      el.textContent = slang ? '✓ slang!' : '✓ word!';
      if (!lastHintShown) soundChime();
      lastHintShown = true;
    }
  }

  function wordsMatch(a, b) {
    return String(a || '').toUpperCase() === String(b || '').toUpperCase();
  }

  function clearWordCheck() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = null;
    checkSeq += 1;
    inFlightWord = '';
    lastCheckedWord = '';
    lastCheckValid = false;
    lastCheckSlang = false;
    setWordHint(false);
  }

  function canCheckWord() {
    return !!(state?.current?.yours && state.status === 'playing' && !state.current.paused);
  }

  function scheduleWordCheck() {
    const word = currentSelection();
    if (!canCheckWord() || word.length < 2) {
      clearWordCheck();
      return;
    }
    if (word === lastCheckedWord) {
      setWordHint(lastCheckValid, lastCheckSlang);
      return;
    }
    if (inFlightWord === word) return;
    setWordHint(false);
    if (checkTimer) clearTimeout(checkTimer);
    const seq = ++checkSeq;
    inFlightWord = word;
    const send = (delay) => {
      checkTimer = setTimeout(() => {
        checkTimer = null;
        if (seq !== checkSeq) return;
        socket.emit('checkWord', { word, token }, (res) => {
          if (seq !== checkSeq) return;
          const current = currentSelection();
          const retryable = res?.error === 'slow-down' || res?.error === 'You are not in a match.';
          if (retryable) {
            inFlightWord = current;
            send(250);
            return;
          }
          inFlightWord = '';
          if (!res?.ok || !wordsMatch(res.word, current)) return;
          lastCheckedWord = current;
          lastCheckValid = !!res.valid;
          lastCheckSlang = !!res.slang;
          setWordHint(lastCheckValid, lastCheckSlang);
        });
      }, delay);
    };
    send(200);
  }

  function makeTileButton(tile, inRack) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const bonus = state?.current?.bonus;
    const isBonus = bonus && bonus.index === tile.id;
    btn.className = 'tile'
      + (!inRack && tile.used ? ' used' : '')
      + (isBonus && bonus.type === 'DL' ? ' bonus-dl' : '')
      + (isBonus && bonus.type === 'DW' ? ' bonus-dw' : '');
    btn.dataset.id = String(tile.id);
    const tag = isBonus ? `<span class="bonus-tag">${bonus.type}</span>` : '';
    btn.innerHTML = `${tag}${tile.letter}<span class="val">${tile.value}</span>`;
    const canPlay = !!(state?.current?.yours && state.status === 'playing' && !state.current.paused);
    btn.disabled = !canPlay;
    btn.addEventListener('click', () => {
      if (!canPlay) return;
      soundTap();
      if (inRack) {
        tile.used = false;
        delete tile.order;
      } else if (!tile.used) {
        tile.used = true;
        tile.order = Date.now();
      }
      renderRackAndTray();
    });
    return btn;
  }

  function formatBreakdown(b) {
    if (!b || !Array.isArray(b.letters) || !b.letters.length) return '';
    if (b.wordMultiplier === 2) {
      const inner = b.letters.map((p) => `${p.letter}${p.value}`).join(' + ');
      let s = `(${inner}) ×2 (DW)`;
      if (b.slangBonus) s += ` + ${b.slangBonus} slang`;
      return `${s} = ${b.total}`;
    }
    const bits = b.letters.map((p) => (p.doubled ? `${p.letter}${p.scored} (DL)` : `${p.letter}${p.value}`));
    let s = bits.join(' + ');
    if (b.slangBonus) s += ` + ${b.slangBonus} slang`;
    return `${s} = ${b.total}`;
  }

  function renderResult() {
    const r = state.lastResult;
    const you = state.you;
    const opp = state.opponent;
    els.resultYouName.textContent = you?.name || 'You';
    els.resultOppName.textContent = opp?.name || 'Opponent';
    els.resultYouScore.textContent = String(you?.score ?? 0);
    els.resultOppScore.textContent = String(opp?.score ?? 0);
    if (!r) return;
    const whose = r.playerId === you?.id ? 'You' : (r.playerName || 'Opponent');
    const slangHit = !!(r.slang || r.reason === 'slang');
    els.resultSlang.hidden = !slangHit;
    const breakdown = formatBreakdown(r.breakdown);
    els.resultBreakdown.hidden = !breakdown;
    els.resultBreakdown.textContent = breakdown;
    if (r.reason === 'timeout') {
      els.resultLabel.textContent = `${whose} — time up`;
      els.resultWord.textContent = 'Time up';
      els.resultWord.className = 'result-word bad';
      els.resultScore.textContent = '+0';
      els.resultScore.className = 'result-score';
    } else if (!r.valid) {
      els.resultLabel.textContent = `${whose} — not a word`;
      els.resultWord.textContent = r.word ? r.word : 'Invalid';
      els.resultWord.className = 'result-word bad';
      els.resultScore.textContent = '+0';
      els.resultScore.className = 'result-score';
    } else {
      els.resultLabel.textContent = `${whose} played`;
      els.resultWord.textContent = r.word;
      els.resultWord.className = 'result-word';
      els.resultScore.textContent = `+${r.score}`;
      els.resultScore.className = 'result-score good';
    }
    const key = `${state.matchId}:${r.turnNumber}:${r.word}:${r.reason}`;
    if (key !== lastResultKey) {
      lastResultKey = key;
      vibrate(40);
      if (r.valid) soundValid();
      else soundInvalid();
    }
  }

  function historyItems(listEl, history) {
    listEl.innerHTML = '';
    for (const entry of history || []) {
      const li = document.createElement('li');
      if (entry.reason === 'timeout') {
        li.innerHTML = `<span class="miss">Time up</span><span>0</span>`;
      } else if (!entry.valid) {
        const shown = entry.word ? entry.word : 'Invalid';
        li.innerHTML = `<span class="miss">${escapeHtml(shown)}</span><span>0</span>`;
      } else {
        const tags = [];
        if (entry.slang || entry.reason === 'slang') tags.push('<em class="slang-tag">slang +2</em>');
        if (entry.bonusApplied && entry.breakdown?.bonusType) {
          tags.push(`<em class="bonus-pill">${escapeHtml(entry.breakdown.bonusType)}</em>`);
        }
        li.innerHTML = `<span>${escapeHtml(entry.word)}</span><span>${entry.score} ${tags.join(' ')}</span>`;
      }
      listEl.appendChild(li);
    }
  }

  function highlightAnswers(text, answers, mark) {
    let out = escapeHtml(text);
    const unique = [...new Set((answers || []).map((a) => String(a || '').trim()).filter(Boolean))]
      .sort((a, b) => b.length - a.length);
    for (const ans of unique) {
      const esc = escapeHtml(ans);
      if (mark) out = out.split(esc).join(`<mark>${esc}</mark>`);
    }
    return out;
  }

  function renderEndStory() {
    const story = state.story;
    const youName = state.you?.name || 'You';
    const oppName = state.opponent?.name || 'Opponent';
    const full = story?.fullStories;
    if (!full) {
      els.endStory.innerHTML = '';
      return;
    }
    const merged = Array.isArray(full.merged) ? full.merged : [];
    const youWins = new Set();
    const oppWins = new Set();
    for (const part of merged) {
      if (part.you && part.winner === 'you') youWins.add(part.you);
      if (part.opponent && part.winner === 'opponent') oppWins.add(part.opponent);
    }
    const youAnswers = story.yourAnswers || [];
    const oppGuess = [];
    // We only have full text for opponent; highlight using merged winner lines
    els.endStory.innerHTML = `
      <article>
        <h3>${escapeHtml(youName)}</h3>
        <p>${highlightAnswers(full.you, youAnswers, true)}</p>
      </article>
      <article>
        <h3>${escapeHtml(oppName)}</h3>
        <p>${escapeHtml(full.opponent)}</p>
      </article>
    `;
    // Highlight winning fragments in both, from merged parts
    const youHtml = highlightFromMerged(merged, 'you');
    const oppHtml = highlightFromMerged(merged, 'opponent');
    els.endStory.innerHTML = `
      <article>
        <h3>${escapeHtml(youName)}</h3>
        <p data-testid="end-story-you">${youHtml}</p>
      </article>
      <article>
        <h3>${escapeHtml(oppName)}</h3>
        <p data-testid="end-story-opp">${oppHtml}</p>
      </article>
    `;
    void youWins;
    void oppWins;
  }

  function highlightFromMerged(merged, side) {
    const chunks = [];
    for (const part of merged) {
      if (part.text && part.winner == null && part.you == null) {
        chunks.push(escapeHtml(part.text));
        continue;
      }
      const text = side === 'you' ? part.you : part.opponent;
      if (!text) continue;
      const win = part.winner === side;
      chunks.push(win ? `<mark>${escapeHtml(text)}</mark>` : escapeHtml(text));
    }
    return chunks.join(' ');
  }

  function renderEnd() {
    recordMatch(state);
    const you = state.you;
    const opp = state.opponent;
    els.endYouName.textContent = you?.name || 'You';
    els.endOppName.textContent = opp?.name || 'Opponent';
    els.endYouScore.textContent = String(you?.score ?? 0);
    els.endOppScore.textContent = String(opp?.score ?? 0);
    els.histYouTitle.textContent = you?.name || 'You';
    els.histOppTitle.textContent = opp?.name || 'Opponent';
    const ys = you?.score ?? 0;
    const os = opp?.score ?? 0;
    if (ys > os) els.endTitle.textContent = 'You win!';
    else if (os > ys) els.endTitle.textContent = `${opp?.name || 'Opponent'} wins`;
    else els.endTitle.textContent = "It's a draw!";
    const rec = recordLine(state);
    els.endRecord.hidden = !rec;
    els.endRecord.textContent = rec;
    const storyMode = state.mode === 'story';
    els.endClassic.hidden = storyMode;
    els.endStory.hidden = !storyMode;
    if (storyMode) renderEndStory();
    else {
      historyItems(els.histYou, you?.history);
      historyItems(els.histOpp, opp?.history);
    }
    els.rematch.disabled = !!state.rematch?.you;
    els.rematch.textContent = state.rematch?.you ? 'Rematch ready' : 'Rematch';
    if (state.rematch?.you && !state.rematch?.opponent) {
      els.rematchStatus.hidden = false;
      els.rematchStatus.textContent = `Waiting for ${opp?.name || 'your opponent'}…`;
    } else {
      els.rematchStatus.hidden = true;
    }
  }

  function numberedStoryHtml(text) {
    return escapeHtml(text || '').replace(/\[(\d+)\]/g, '<span class="blank-num">$1</span>');
  }

  function collectFillAnswers() {
    const inputs = $$('#fill-fields input');
    return inputs.map((input) => input.value);
  }

  function buildFillFields() {
    const blanks = state.story?.blanks || [];
    const existing = state.story?.yourAnswers || [];
    fillAnswers = blanks.map((_, i) => existing[i] || fillAnswers[i] || '');
    els.fillFields.innerHTML = '';
    blanks.forEach((blank, i) => {
      const label = document.createElement('label');
      const caption = document.createElement('span');
      caption.textContent = `${i + 1}. ${blank.prompt}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 30;
      input.autocomplete = 'off';
      input.spellcheck = true;
      input.dataset.testid = `fill-blank-${i}`;
      input.placeholder = blank.prompt;
      input.value = fillAnswers[i] || '';
      input.addEventListener('input', () => {
        fillAnswers[i] = input.value;
      });
      label.append(caption, input);
      els.fillFields.appendChild(label);
    });
    els.fillStory.innerHTML = numberedStoryHtml(state.story?.numberedStory || '');
  }

  function renderFill() {
    const story = state.story;
    if (!story) return;
    const key = `${state.matchId}:${story.numberedStory || ''}`;
    if (fillBoundFor !== key) {
      fillBoundFor = key;
      fillAnswers = (story.yourAnswers || []).slice();
      buildFillFields();
    }
    const paused = state.status === 'paused' || story.paused;
    const submitted = !!story.youSubmitted;
    els.fillCount.textContent = `${story.length || story.blanks?.length || 5} blanks`;
    if (paused) els.fillHeading.textContent = 'Paused — waiting…';
    else if (submitted) els.fillHeading.textContent = 'Waiting for partner';
    else els.fillHeading.textContent = 'Fill in the blanks';
    localEnd = Date.now() + (story.remainingMs || 0);
    armTimer(paused || submitted);
    $$('#fill-fields input').forEach((input, i) => {
      input.disabled = submitted || paused;
      if (submitted && story.yourAnswers?.[i]) input.value = story.yourAnswers[i];
    });
    els.submitStory.disabled = submitted || paused;
    els.submitStory.hidden = submitted;
    if (submitted) {
      els.fillStatus.hidden = false;
      els.fillStatus.textContent = story.opponentSubmitted
        ? 'Both in — getting the tale ready…'
        : `Waiting for ${state.opponent?.name || 'your partner'}…`;
    } else {
      els.fillStatus.hidden = true;
    }
  }

  function pickVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find((v) => /en-GB/i.test(v.lang) && /UK|British|Google|Female|Daniel|Lily|Serena/i.test(v.name))
      || voices.find((v) => /en-GB/i.test(v.lang))
      || voices.find((v) => /^en(-|_)?/i.test(v.lang))
      || null;
  }

  function dramatise(text) {
    return String(text || '')
      .replace(/([,;:])/g, '... ')
      .replace(/([.!?])/g, '... ... ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stopSpeech() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  function speakText(text, { pitch = 1, rate = 0.7, onend } = {}) {
    if (narrator.muted || narrator.failing || !window.speechSynthesis) {
      if (!window.speechSynthesis) narrator.failing = true;
      if (onend) onend();
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(dramatise(text));
      u.rate = rate;
      u.pitch = pitch;
      u.lang = 'en-GB';
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.onend = () => { if (onend) onend(); };
      u.onerror = () => {
        narrator.failing = true;
        updateVoiceChrome();
        if (onend) onend();
      };
      window.speechSynthesis.speak(u);
    } catch {
      narrator.failing = true;
      updateVoiceChrome();
      if (onend) onend();
    }
  }

  function speakCurrentLine() {
    if (!state?.story?.currentLine || narrator.muted || narrator.failing) return;
    stopSpeech();
    const preamble = (state.story.preamble || []).join(' ');
    const versions = state.story.currentLine.versions || [];
    const parts = [];
    if (preamble) parts.push({ text: preamble, pitch: 0.85, rate: 0.72 });
    versions.forEach((ver, i) => {
      parts.push({
        text: `${ver.label}. ${ver.text}`,
        pitch: i === 0 ? 0.7 : 1.25,
        rate: 0.68,
      });
    });
    const play = (i) => {
      if (i >= parts.length) return;
      if (narrator.muted) return;
      speakText(parts[i].text, {
        pitch: parts[i].pitch,
        rate: parts[i].rate,
        onend: () => setTimeout(() => play(i + 1), 350),
      });
    };
    play(0);
  }

  function updateVoiceChrome() {
    const unlocked = narrator.unlocked;
    const authors = state?.story?.subphase === 'authors';
    els.beginTale.hidden = unlocked || narrator.failing || authors;
    els.hearLine.hidden = !unlocked || narrator.failing || narrator.muted;
    els.voiceFallback.hidden = !narrator.failing;
    els.muteVoice.textContent = narrator.muted ? 'Unmute voice' : 'Mute voice';
  }

  function renderReveal() {
    const story = state.story;
    if (!story) return;
    const you = state.you;
    const opp = state.opponent;
    els.revealYouName.textContent = you?.name || 'You';
    els.revealOppName.textContent = opp?.name || 'Opponent';
    const scores = story.scores || {};
    els.revealYouScore.textContent = String(scores.you ?? you?.score ?? 0);
    els.revealOppScore.textContent = String(scores.opponent ?? opp?.score ?? 0);
    els.revealLineCount.textContent = `Line ${(story.lineIndex || 0) + 1} of ${story.lineCount || 1}`;
    const preamble = (story.preamble || []).join(' ');
    els.revealPreamble.hidden = !preamble;
    els.revealPreamble.textContent = preamble;
    const versions = story.currentLine?.versions || [];
    const byKey = Object.fromEntries(versions.map((v) => [v.key, v]));
    els.versionPeachText.textContent = byKey.peach?.text || '';
    els.versionBlossomText.textContent = byKey.blossom?.text || '';
    const authorsOn = story.subphase === 'authors';
    $$('.version-card').forEach((card) => {
      const ver = byKey[card.dataset.version];
      const authorEl = $('[data-author]', card);
      card.classList.toggle('winner', !!(authorsOn && story.tally && story.tally[card.dataset.version] > 0 && story.tally[card.dataset.version] >= (story.tally.peach || 0) && story.tally[card.dataset.version] >= (story.tally.blossom || 0) && story.tally[card.dataset.version] > 0 && (story.tally.peach || 0) !== (story.tally.blossom || 0)));
      card.classList.toggle('mine-reveal', !!(authorsOn && ver?.yours));
      if (authorEl) {
        if (authorsOn && ver) {
          authorEl.hidden = false;
          authorEl.textContent = ver.yours ? 'That one was yours!' : `That one was ${ver.name || 'your partner'}'s`;
        } else {
          authorEl.hidden = true;
          authorEl.textContent = '';
        }
      }
    });
    const voted = !!story.youVoted;
    $$('[data-vote]').forEach((btn) => {
      btn.disabled = voted || authorsOn;
    });
    if (authorsOn) {
      const peachVotes = story.tally?.peach || 0;
      const blossomVotes = story.tally?.blossom || 0;
      els.voteStatus.textContent = `🍑 ${peachVotes}  ·  🌸 ${blossomVotes}`;
    } else if (voted) {
      els.voteStatus.textContent = `Waiting for ${opp?.name || 'your partner'}…`;
    } else {
      els.voteStatus.textContent = 'Vote for the funnier version';
    }
    updateVoiceChrome();
    const revealKey = `${state.matchId}:${story.lineIndex}:${story.subphase}`;
    if (revealKey !== lastRevealKey) {
      lastRevealKey = revealKey;
      if (narrator.unlocked && !narrator.muted && !narrator.failing && story.subphase === 'vote') {
        speakCurrentLine();
      }
    }
  }

  function goHome(clearSession) {
    if (timerId) clearInterval(timerId);
    if (checkTimer) clearTimeout(checkTimer);
    stopSpeech();
    tiles = [];
    state = null;
    coinAnimatedFor = '';
    fillBoundFor = '';
    fillAnswers = [];
    lastRevealKey = '';
    checkSeq += 1;
    inFlightWord = '';
    lastCheckedWord = '';
    lastCheckValid = false;
    lastCheckSlang = false;
    setWordHint(false);
    setFunBadges(false);
    setModeBadges(null);
    if (clearSession) rememberToken('');
    viewingSlang = false;
    showScreen('home');
    els.disconnect.hidden = true;
    setError('');
    renderHomeHistory();
  }

  function requestLeave() {
    if (!state || state.status === 'lobby') {
      confirmLeave();
      return;
    }
    els.modal.classList.remove('hidden');
  }

  function confirmLeave() {
    leavingConfirmed = true;
    els.modal.classList.add('hidden');
    socket.emit('leaveRoom', { token });
    goHome(true);
  }

  function handleAck(res, failMessage) {
    if (!res || res.error) {
      setError((res && res.error) || failMessage);
      return false;
    }
    if (res.token) rememberToken(res.token);
    setError('');
    return true;
  }

  function beginTheTale() {
    unlockAudio();
    narrator.unlocked = true;
    narrator.failing = !window.speechSynthesis;
    updateVoiceChrome();
    if (narrator.failing || narrator.muted) return;
    // First utterance must run in the tap handler for iPhone Safari.
    speakText('Hear me, dear listeners.', {
      pitch: 0.65,
      rate: 0.62,
      onend: () => setTimeout(speakCurrentLine, 200),
    });
  }

  async function openSlangPage() {
    els.menuPanel.classList.add('hidden');
    viewingSlang = true;
    showScreen('slang');
    if (!slangWords) {
      els.slangCount.textContent = 'Loading…';
      try {
        const res = await fetch('/api/slang');
        const data = await res.json();
        slangWords = Array.isArray(data.words) ? data.words : [];
      } catch {
        slangWords = [];
        els.slangCount.textContent = 'Could not load the list just now.';
      }
    }
    renderSlangList();
  }

  function renderSlangList() {
    const q = (els.slangSearch.value || '').trim().toLowerCase();
    const words = (slangWords || []).filter((w) => !q || w.includes(q));
    els.slangCount.textContent = q
      ? `${words.length} match${words.length === 1 ? '' : 'es'}`
      : `${words.length} words, A to Z`;
    els.slangList.innerHTML = words.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
  }

  $$('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMode = btn.dataset.mode;
      updateModeUi();
    });
  });
  $$('[data-length]').forEach((btn) => {
    btn.addEventListener('click', () => {
      storyLength = Number(btn.dataset.length) === 8 ? 8 : 5;
      updateModeUi();
    });
  });

  els.menuBtn.addEventListener('click', () => els.menuPanel.classList.remove('hidden'));
  els.menuClose.addEventListener('click', () => els.menuPanel.classList.add('hidden'));
  els.soundToggle.checked = soundOn;
  els.soundToggle.addEventListener('change', () => {
    soundOn = !!els.soundToggle.checked;
    localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    if (soundOn) unlockAudio();
  });
  els.openSlang.addEventListener('click', () => { openSlangPage(); });
  els.slangBack.addEventListener('click', () => {
    viewingSlang = false;
    showScreen('home');
    renderHomeHistory();
  });
  els.slangSearch.addEventListener('input', renderSlangList);

  els.create.addEventListener('click', () => {
    saveName();
    unlockAudio();
    socket.emit('createRoom', {
      name: displayName(),
      token,
      funMode: selectedMode === 'classic' && !!els.funMode.checked,
      mode: selectedMode,
      storyLength: selectedMode === 'story' ? storyLength : undefined,
    }, (res) => {
      handleAck(res, 'Could not create a room.');
    });
  });

  els.join.addEventListener('click', () => {
    saveName();
    unlockAudio();
    const code = els.code.value.trim();
    if (!code) {
      setError('Enter a room code.');
      return;
    }
    socket.emit('joinRoom', { name: displayName(), code, token }, (res) => {
      handleAck(res, 'Could not join that room.');
    });
  });

  els.code.addEventListener('input', () => {
    els.code.value = els.code.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  });

  $('#home-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (els.code.value.trim()) els.join.click();
    else els.create.click();
  });

  els.clear.addEventListener('click', () => {
    for (const tile of tiles) {
      tile.used = false;
      delete tile.order;
    }
    renderRackAndTray();
  });

  els.shuffle.addEventListener('click', () => {
    const unused = tiles.filter((t) => !t.used);
    for (let i = unused.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const ia = tiles.indexOf(unused[i]);
      const ib = tiles.indexOf(unused[j]);
      [tiles[ia], tiles[ib]] = [tiles[ib], tiles[ia]];
    }
    renderRackAndTray();
  });

  els.submit.addEventListener('click', () => {
    const used = currentWord();
    const word = used.map((t) => t.letter).join('');
    if (word.length < 2) return;
    soundSubmit();
    socket.emit('submitWord', { word, tiles: used.map((t) => t.id) });
  });

  els.submitStory.addEventListener('click', () => {
    const answers = collectFillAnswers();
    if (answers.some((a) => !String(a || '').trim())) {
      els.fillStatus.hidden = false;
      els.fillStatus.textContent = 'Please fill in every blank.';
      return;
    }
    soundSubmit();
    socket.emit('submitStory', { answers }, (res) => {
      if (res?.error) {
        els.fillStatus.hidden = false;
        els.fillStatus.textContent = res.error;
      }
    });
  });

  $$('[data-vote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      unlockAudio();
      socket.emit('voteStory', { key: btn.dataset.vote });
    });
  });

  els.beginTale.addEventListener('click', beginTheTale);
  els.hearLine.addEventListener('click', () => {
    unlockAudio();
    narrator.unlocked = true;
    speakCurrentLine();
  });
  els.muteVoice.addEventListener('click', () => {
    narrator.muted = !narrator.muted;
    if (narrator.muted) stopSpeech();
    updateVoiceChrome();
  });

  els.rematch.addEventListener('click', () => socket.emit('rematch'));
  els.modalCancel.addEventListener('click', () => els.modal.classList.add('hidden'));
  els.modalLeave.addEventListener('click', confirmLeave);
  $$('[data-back]').forEach((btn) => btn.addEventListener('click', requestLeave));

  socket.on('state', (next) => {
    leavingConfirmed = false;
    const prevLetters = state?.current?.letters?.join('') || '';
    const nextLetters = next?.current?.letters?.join('') || '';
    state = next;
    if (next?.you?.token) rememberToken(next.you.token);
    if (prevLetters !== nextLetters) {
      tiles = [];
      lastCheckedWord = '';
      lastCheckValid = false;
      lastCheckSlang = false;
      inFlightWord = '';
    }
    renderState();
  });

  socket.on('reaction', (payload) => {
    if (payload?.emoji) showReaction(payload.emoji, !!payload.mine);
  });

  function tryResume() {
    if (token && !leavingConfirmed) {
      socket.emit('resume', { token, name: displayName() }, (res) => {
        if (res?.error === 'session-expired') {
          rememberToken('');
          if (!state) goHome(true);
        }
      });
    }
  }
  socket.on('connect', tryResume);
  if (socket.connected) tryResume();

  socket.on('disconnect', () => {
    // keep current screen; socket.io will reconnect and resume
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const promptUpdate = () => {
        els.updateBanner.hidden = false;
      };
      if (reg.waiting) promptUpdate();
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate();
        });
      });
    }).catch(() => {});
    els.updateBanner.addEventListener('click', () => {
      const ready = navigator.serviceWorker.controller;
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) reg.waiting.postMessage({ type: 'skipWaiting' });
      });
      void ready;
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
  }

  const savedName = localStorage.getItem(NAME_KEY);
  if (savedName) els.name.value = savedName;

  document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {});
    try { window.speechSynthesis.getVoices(); } catch { /* ignore */ }
  }

  setupFullscreenButtons();
  renderEmojiBars();
  updateModeUi();
  renderHomeHistory();
  updateVoiceChrome();
  showScreen('home');

  window.__wordDuel = {
    version: VERSION,
    getState: () => state,
    submit: (word) => new Promise((resolve) => {
      const used = currentWord();
      const built = used.map((t) => t.letter).join('');
      const tileIds = built === String(word || '').toUpperCase() ? used.map((t) => t.id) : undefined;
      socket.emit('submitWord', { word, tiles: tileIds }, resolve);
    }),
    checkWord: (word) => new Promise((resolve) => {
      socket.emit('checkWord', { word, token }, resolve);
    }),
    submitStory: (answers) => new Promise((resolve) => {
      socket.emit('submitStory', { answers }, resolve);
    }),
    voteStory: (key) => new Promise((resolve) => {
      socket.emit('voteStory', { key }, resolve);
    }),
  };
})();
