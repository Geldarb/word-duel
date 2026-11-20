(() => {
  const VERSION = 'v0.3.1';
  const EMOJIS = ['😍', '😂', '😮', '👏', '🔥', '😭', '😘', '🙈'];
  const NAME_KEY = 'wordduel_name';
  const TOKEN_KEY = 'wordduel_token';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const screens = {
    home: $('#screen-home'),
    lobby: $('#screen-lobby'),
    coin: $('#screen-coin'),
    play: $('#screen-play'),
    result: $('#screen-result'),
    end: $('#screen-end'),
  };

  const els = {
    name: $('#name-input'),
    code: $('#code-input'),
    homeError: $('#home-error'),
    create: $('#btn-create'),
    join: $('#btn-join'),
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
    funMode: $('#fun-mode'),
    resultSlang: $('#result-slang'),
    tray: $('#tile-tray'),
    clear: $('#btn-clear'),
    shuffle: $('#btn-shuffle'),
    submit: $('#btn-submit'),
    emojiBar: $('#emoji-bar'),
    endEmojiBar: $('#end-emoji-bar'),
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
    for (const bar of [els.emojiBar, els.endEmojiBar]) {
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

  function screenFor(status) {
    switch (status) {
      case 'lobby': return 'lobby';
      case 'coin': return 'coin';
      case 'playing':
      case 'paused': return 'play';
      case 'intermission': return 'result';
      case 'ended': return 'end';
      default: return 'home';
    }
  }

  function setFunBadges(on) {
    $$('[data-fun-badge]').forEach((el) => { el.hidden = !on; });
  }

  function renderState() {
    if (!state) {
      showScreen('home');
      els.disconnect.hidden = true;
      setFunBadges(false);
      return;
    }
    showScreen(screenFor(state.status));
    const oppGone = !!(state.opponent && !state.opponent.connected);
    els.disconnect.hidden = !oppGone;
    setFunBadges(!!state.funMode);

    if (state.status === 'lobby') renderLobby();
    if (state.status === 'coin') renderCoin();
    if (state.status === 'playing' || state.status === 'paused') renderPlay();
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

  function tickTimer() {
    const s = remainingSeconds();
    els.timerNum.textContent = String(s);
    els.timer.classList.toggle('warn', s <= 15 && s > 5);
    els.timer.classList.toggle('urgent', s <= 5);
  }

  function armTimer() {
    if (timerId) clearInterval(timerId);
    if (!state?.current) return;
    if (state.current.paused) {
      localEnd = Date.now() + (state.current.remainingMs || 0);
    } else {
      localEnd = Date.now() + (state.current.remainingMs || 0);
    }
    tickTimer();
    if (state.status === 'paused' || state.current.paused) return;
    timerId = setInterval(tickTimer, 200);
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
    armTimer();
    renderRackAndTray();
    const canPlay = yours && !paused;
    els.clear.disabled = !canPlay;
    els.shuffle.disabled = !canPlay;
    els.submit.disabled = !canPlay;
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

  function canCheckWord() {
    return !!(state?.current?.yours && state.status === 'playing' && !state.current.paused);
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
    if (!valid) el.textContent = '';
    else el.textContent = slang ? '✓ slang!' : '✓ word!';
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
    // A state refresh for the same selection must not cancel the in-flight check.
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
    btn.className = 'tile' + (!inRack && tile.used ? ' used' : '');
    btn.dataset.id = String(tile.id);
    btn.innerHTML = `${tile.letter}<span class="val">${tile.value}</span>`;
    const canPlay = !!(state?.current?.yours && state.status === 'playing' && !state.current.paused);
    btn.disabled = !canPlay;
    btn.addEventListener('click', () => {
      if (!canPlay) return;
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
  }

  function historyItems(listEl, history) {
    listEl.innerHTML = '';
    for (const entry of history || []) {
      const li = document.createElement('li');
      if (entry.reason === 'timeout') {
        li.innerHTML = `<span class="miss">Time up</span><span>0</span>`;
      } else if (!entry.valid) {
        const shown = entry.word ? entry.word : 'Invalid';
        li.innerHTML = `<span class="miss">${shown}</span><span>0</span>`;
      } else if (entry.slang || entry.reason === 'slang') {
        li.innerHTML = `<span>${entry.word}</span><span>${entry.score} <em class="slang-tag">slang +2</em></span>`;
      } else {
        li.innerHTML = `<span>${entry.word}</span><span>${entry.score}</span>`;
      }
      listEl.appendChild(li);
    }
  }

  function renderEnd() {
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
    historyItems(els.histYou, you?.history);
    historyItems(els.histOpp, opp?.history);
    els.rematch.disabled = !!state.rematch?.you;
    els.rematch.textContent = state.rematch?.you ? 'Rematch ready' : 'Rematch';
    if (state.rematch?.you && !state.rematch?.opponent) {
      els.rematchStatus.hidden = false;
      els.rematchStatus.textContent = `Waiting for ${opp?.name || 'your opponent'}…`;
    } else {
      els.rematchStatus.hidden = true;
    }
  }

  function goHome(clearSession) {
    if (timerId) clearInterval(timerId);
    if (checkTimer) clearTimeout(checkTimer);
    tiles = [];
    state = null;
    coinAnimatedFor = '';
    checkSeq += 1;
    inFlightWord = '';
    lastCheckedWord = '';
    lastCheckValid = false;
    lastCheckSlang = false;
    setWordHint(false);
    setFunBadges(false);
    if (clearSession) rememberToken('');
    showScreen('home');
    els.disconnect.hidden = true;
    setError('');
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

  els.create.addEventListener('click', () => {
    saveName();
    socket.emit('createRoom', { name: displayName(), token, funMode: !!els.funMode.checked }, (res) => {
      handleAck(res, 'Could not create a room.');
    });
  });

  els.join.addEventListener('click', () => {
    saveName();
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
    const word = currentWord().map((t) => t.letter).join('');
    if (word.length < 2) return;
    socket.emit('submitWord', { word });
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

  // Service worker + update prompt
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

  // Prefill name
  const savedName = localStorage.getItem(NAME_KEY);
  if (savedName) els.name.value = savedName;

  setupFullscreenButtons();
  renderEmojiBars();
  showScreen('home');

  window.__wordDuel = {
    version: VERSION,
    getState: () => state,
    submit: (word) => new Promise((resolve) => {
      socket.emit('submitWord', { word }, resolve);
    }),
    checkWord: (word) => new Promise((resolve) => {
      socket.emit('checkWord', { word, token }, resolve);
    }),
  };
})();
