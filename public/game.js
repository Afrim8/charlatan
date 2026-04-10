const socket = io();

// === STATE ===
const S = {
  playerName: '',
  socketId: '',
  team: null,
  roomCode: '',
  isCreator: false,
  roomState: null,
  myAvatar: '🎩',
  teamNames: { team1: 'Équipe 1', team2: 'Équipe 2' },
  timerDuration: 60,
  timerInterval: null,
  // question phase
  currentQuestion: '',
  currentRealAnswer: '',
  myTokens: 16,
  oppTokens: 16,
  currentRound: 0,
  teamSubmitted: false,
  // voting phase
  votingAnswers: [],
  bets: [0, 0, 0],
};

// === UTILS ===
const GAME_VIEWS = ['question-view', 'voting-view', 'results-view', 'gameover-view'];
const CHAT_VIEWS = ['lobby-view', 'question-view', 'voting-view', 'results-view', 'gameover-view'];

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Show reaction bar only during gameplay
  const bar = document.getElementById('reaction-bar');
  if (bar) bar.classList.toggle('hidden', !GAME_VIEWS.includes(id));
  // Show chat toggle in lobby + gameplay
  const chatToggle = document.getElementById('chat-toggle');
  if (chatToggle) chatToggle.classList.toggle('hidden', !CHAT_VIEWS.includes(id));
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// === TIMER ===
function startTimer(duration, textId, fillId) {
  stopTimer();
  let remaining = duration;
  const textEl = document.getElementById(textId);
  const fillEl = document.getElementById(fillId);
  if (!textEl || !fillEl) return;

  function tick() {
    if (remaining < 0) remaining = 0;
    textEl.textContent = remaining;
    const pct = (remaining / duration) * 100;
    fillEl.style.width = pct + '%';
    // Color transitions
    if (remaining <= 10) {
      fillEl.style.background = 'var(--red)';
      fillEl.style.boxShadow = '0 0 10px rgba(248,113,113,0.6)';
      textEl.style.color = 'var(--red)';
    } else if (remaining <= 20) {
      fillEl.style.background = 'var(--gold)';
      fillEl.style.boxShadow = '0 0 10px var(--gold-glow)';
      textEl.style.color = 'var(--gold)';
    } else {
      fillEl.style.background = 'var(--purple-light)';
      fillEl.style.boxShadow = '0 0 10px var(--purple-glow)';
      textEl.style.color = 'var(--text)';
    }
    if (remaining === 0) { stopTimer(); return; }
    remaining--;
  }

  tick();
  S.timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  if (S.timerInterval) { clearInterval(S.timerInterval); S.timerInterval = null; }
}

// === ANIMATED COUNTER ===
function animateCounter(el, from, to, duration = 800) {
  if (!el || from === to) { if (el) el.textContent = to; return; }
  const start = performance.now();
  const diff = to - from;
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    el.textContent = Math.round(from + diff * ease);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// === REACTIONS ===
function sendReaction(emoji) {
  socket.emit('sendReaction', { emoji });
}

function showReaction(emoji, playerName, avatar) {
  const container = document.getElementById('reactions-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'floating-reaction';
  // Random horizontal position
  const left = 10 + Math.random() * 80;
  el.style.left = left + '%';
  el.innerHTML = `<span class="float-avatar">${avatar || '🎩'}</span><span class="float-emoji">${emoji}</span>`;
  container.appendChild(el);

  // Clean up after animation
  setTimeout(() => el.remove(), 2800);
}

// === CHAT ===
let chatOpen = false;
let chatUnread = 0;

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('hidden', !chatOpen);
  if (chatOpen) {
    chatUnread = 0;
    const badge = document.getElementById('chat-unread');
    badge.classList.add('hidden');
    badge.textContent = '0';
    // Scroll to bottom
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    // Focus input
    setTimeout(() => {
      const inp = document.getElementById('chat-input');
      if (inp) inp.focus();
    }, 50);
  }
}

function sendChat() {
  const inp = document.getElementById('chat-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  socket.emit('chatMessage', { text });
  inp.value = '';
  inp.focus();
}

function appendChatMessage({ playerName, avatar, team, text, isSystem }) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;

  const el = document.createElement('div');

  if (isSystem) {
    el.className = 'chat-system';
    el.textContent = text;
  } else {
    const isMe = playerName === S.playerName;
    el.className = 'chat-msg' + (isMe ? ' is-me' : '');
    const teamClass = team === 'team1' ? 'chat-team1' : team === 'team2' ? 'chat-team2' : '';
    el.innerHTML = `
      <span class="chat-avatar">${avatar || '🎩'}</span>
      <div class="chat-bubble ${teamClass}">
        <span class="chat-name">${isMe ? 'Toi' : playerName}</span>
        <span class="chat-text">${escapeHtml(text)}</span>
      </div>
    `;
  }

  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;

  // Unread badge when panel is closed
  if (!chatOpen && !isSystem) {
    chatUnread++;
    const badge = document.getElementById('chat-unread');
    if (badge) {
      badge.textContent = chatUnread > 9 ? '9+' : chatUnread;
      badge.classList.remove('hidden');
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// === HOME ===
function showJoin() {
  const sec = document.getElementById('join-section');
  sec.classList.toggle('hidden');
  if (!sec.classList.contains('hidden')) document.getElementById('join-code').focus();
}

function getPlayerName() {
  const name = document.getElementById('home-name').value.trim();
  if (!name) { showError('home-error', '✏️ Entre ton pseudo avant de continuer !'); return null; }
  return name;
}

function createRoom() {
  const name = getPlayerName();
  if (!name) return;
  S.playerName = name;
  socket.emit('createRoom', { playerName: name });
}

function joinRoom() {
  const name = getPlayerName();
  if (!name) return;
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length < 2) { showError('home-error', '🔑 Entre le code du salon !'); return; }
  S.playerName = name;
  socket.emit('joinRoom', { code, playerName: name });
}

// Allow Enter key on code input
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('join-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom();
  });
  document.getElementById('home-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const join = document.getElementById('join-section');
      if (!join.classList.contains('hidden')) joinRoom();
      else createRoom();
    }
  });
  // Enter to save team name
  ['team1', 'team2'].forEach(team => {
    const inp = document.getElementById(`${team}-name-input`);
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveTeamName(team); });
  });
  // Enter to send chat
  const chatInp = document.getElementById('chat-input');
  if (chatInp) chatInp.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
});

// === LOBBY ===
function copyCode() {
  navigator.clipboard.writeText(S.roomCode).then(() => {
    const btn = document.querySelector('.btn-copy');
    btn.textContent = '✅';
    setTimeout(() => btn.textContent = '📋', 1500);
  });
}

function chooseTeam(team) {
  socket.emit('chooseTeam', { team });
}

function startGame() {
  socket.emit('startGame');
}

function editTeamName(team) {
  if (S.team !== team) return; // Only team members can rename
  const editDiv = document.getElementById(`${team}-name-edit`);
  const inp = document.getElementById(`${team}-name-input`);
  if (!editDiv || !inp) return;
  const currentName = S.teamNames[team].replace(/^[🔵🔴]\s*/, '');
  inp.value = currentName;
  editDiv.classList.remove('hidden');
  inp.focus();
}

function saveTeamName(team) {
  const inp = document.getElementById(`${team}-name-input`);
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) return;
  socket.emit('setTeamName', { team, name });
  document.getElementById(`${team}-name-edit`).classList.add('hidden');
}

function setTimerDuration(duration) {
  socket.emit('setTimerDuration', { duration });
  // Optimistic UI update
  document.querySelectorAll('.timer-opt').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.dur) === duration);
  });
}

function renderLobby(roomState) {
  S.roomState = roomState;
  document.getElementById('room-code-text').textContent = S.roomCode;
  document.getElementById('lobby-t1-tokens').textContent = roomState.teams.team1.tokens;
  document.getElementById('lobby-t2-tokens').textContent = roomState.teams.team2.tokens;

  // Team names
  if (roomState.teamNames) {
    S.teamNames = roomState.teamNames;
    document.getElementById('lobby-team1-name').textContent = '🔵 ' + roomState.teamNames.team1;
    document.getElementById('lobby-team2-name').textContent = '🔴 ' + roomState.teamNames.team2;
  }

  // Timer setting
  if (roomState.timerDuration) {
    S.timerDuration = roomState.timerDuration;
    document.querySelectorAll('.timer-opt').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.dur) === roomState.timerDuration);
    });
    const displayVal = document.getElementById('timer-display-val');
    if (displayVal) displayVal.textContent = roomState.timerDuration >= 60 ? (roomState.timerDuration / 60) + 'min' : roomState.timerDuration + 's';
  }

  renderTeamPlayers('lobby-team1-players', roomState.teams.team1.players, roomState.creatorId);
  renderTeamPlayers('lobby-team2-players', roomState.teams.team2.players, roomState.creatorId);

  // Creator UI
  const isCreator = roomState.creatorId === S.socketId;
  S.isCreator = isCreator;

  document.getElementById('start-btn').classList.toggle('hidden', !isCreator);
  document.getElementById('wait-start-msg').classList.toggle('hidden', isCreator);

  // Show timer setting for creator, timer display for others
  const timerSetting = document.getElementById('timer-setting');
  const timerDisplay = document.getElementById('timer-display');
  if (timerSetting) timerSetting.classList.toggle('hidden', !isCreator);
  if (timerDisplay) timerDisplay.classList.toggle('hidden', isCreator);

  // Show/hide edit buttons (only for own team members)
  ['team1', 'team2'].forEach(t => {
    const btn = document.getElementById(`edit-${t}-btn`);
    if (btn) btn.classList.toggle('hidden', S.team !== t);
  });
}

function renderTeamPlayers(containerId, players, creatorId) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (players.length === 0) {
    el.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Aucun joueur</span>';
    return;
  }
  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (p.id === S.socketId ? ' is-me' : '');
    const avatar = p.avatar || '🎩';
    chip.innerHTML = `<span class="chip-avatar">${avatar}</span><span>${p.name}${p.id === S.socketId ? ' (toi)' : ''}</span>${p.id === creatorId ? '<span class="creator-badge">👑</span>' : ''}`;
    el.appendChild(chip);
  });
}

// === TEAM NAME ===
function updateTeamNameUI(team, name) {
  S.teamNames[team] = name;
  const prefix = team === 'team1' ? '🔵 ' : '🔴 ';
  const h3 = document.getElementById(`lobby-${team}-name`);
  if (h3) h3.textContent = prefix + name;
  // Update status row labels
  const statusEl = document.getElementById(`q-status-${team === 'team1' ? 't1' : 't2'}-name`);
  if (statusEl) statusEl.textContent = name;
  // Update results labels
  document.querySelectorAll(`.r-${team === 'team1' ? 't1' : 't2'}-label`).forEach(el => el.textContent = name);
}

// === QUESTION PHASE ===
function syncAnswers() {
  if (S.teamSubmitted) return;
  const a1 = document.getElementById('fake1').value;
  const a2 = document.getElementById('fake2').value;
  socket.emit('updateFakeAnswers', { answer1: a1, answer2: a2 });
}

function submitFakeAnswers() {
  const a1 = document.getElementById('fake1').value.trim();
  const a2 = document.getElementById('fake2').value.trim();
  if (!a1 || !a2) { showError('q-error', '✏️ Écris tes 2 fausses réponses !'); return; }
  S.teamSubmitted = true;
  stopTimer();
  socket.emit('submitFakeAnswers', { answer1: a1, answer2: a2 });
  document.getElementById('q-submitted-msg').classList.remove('hidden');
}

function renderQuestionPhase(data) {
  S.currentRound = data.round;
  S.myTokens = data.myTokens;
  S.oppTokens = data.oppTokens;
  S.teamSubmitted = false;
  if (data.teamNames) S.teamNames = data.teamNames;
  if (data.timerDuration) S.timerDuration = data.timerDuration;

  document.getElementById('q-round').textContent = data.round;
  document.getElementById('q-my-tokens').textContent = data.myTokens;
  document.getElementById('q-opp-tokens').textContent = data.oppTokens;
  document.getElementById('q-question').textContent = data.question;
  document.getElementById('q-real-answer').textContent = data.realAnswer || data.answer || '';

  // Team name labels in status row
  const t1name = document.getElementById('q-status-t1-name');
  const t2name = document.getElementById('q-status-t2-name');
  if (t1name) t1name.textContent = S.teamNames.team1;
  if (t2name) t2name.textContent = S.teamNames.team2;

  // Reset UI
  document.getElementById('fake1').value = '';
  document.getElementById('fake2').value = '';
  document.getElementById('q-submitted-msg').classList.add('hidden');
  hideError('q-error');

  // Reset status
  document.getElementById('q-status-t1').classList.remove('done');
  document.getElementById('q-status-t2').classList.remove('done');
  document.getElementById('q-status-t1').querySelector('span:last-child').textContent = 'en cours...';
  document.getElementById('q-status-t2').querySelector('span:last-child').textContent = 'en cours...';

  showView('question-view');

  // Start countdown timer
  startTimer(S.timerDuration, 'q-timer-text', 'q-timer-fill');
}

// === VOTING PHASE ===
function renderVotingPhase(data) {
  S.votingAnswers = data.answers;
  S.myTokens = data.myTokens;
  S.bets = [0, 0, 0];
  S.teamSubmitted = false;
  if (data.teamNames) S.teamNames = data.teamNames;
  if (data.timerDuration) S.timerDuration = data.timerDuration;

  document.getElementById('v-round').textContent = S.currentRound;
  document.getElementById('v-my-tokens').textContent = data.myTokens;
  document.getElementById('v-question').textContent = data.question;

  const container = document.getElementById('voting-answers');
  container.innerHTML = '';

  const labels = ['A', 'B', 'C'];
  data.answers.forEach((ans, i) => {
    const row = document.createElement('div');
    row.className = 'answer-bet-row';
    row.innerHTML = `
      <div class="answer-index">${labels[i]}</div>
      <div class="answer-text">${ans}</div>
      <div class="bet-input-wrap">
        <label>🪙</label>
        <input type="number" class="bet-input" id="bet-${i}" min="0" max="${data.myTokens}" value="0"
          oninput="updateBetInput(${i})" onchange="updateBetInput(${i})">
      </div>
    `;
    container.appendChild(row);
  });

  document.getElementById('bets-total').textContent = '0';
  updateBetDisplay();
  document.getElementById('v-submitted-msg').classList.add('hidden');
  document.getElementById('confirm-bets-btn').disabled = false;
  hideError('v-error');

  showView('voting-view');

  // Start countdown timer
  startTimer(S.timerDuration, 'v-timer-text', 'v-timer-fill');
}

function updateBetInput(idx) {
  const val = parseInt(document.getElementById(`bet-${idx}`).value) || 0;
  S.bets[idx] = Math.max(0, val);
  document.getElementById(`bet-${idx}`).value = S.bets[idx];
  const total = S.bets.reduce((s, b) => s + b, 0);
  document.getElementById('bets-total').textContent = total;
  socket.emit('updateBets', { bets: S.bets });
  updateBetDisplay();
}

function updateBetDisplay() {
  const total = S.bets.reduce((s, b) => s + b, 0);
  const remaining = S.myTokens - total;
  const remEl = document.getElementById('bets-remaining-display');
  const btn = document.getElementById('confirm-bets-btn');

  if (remaining === 0) {
    remEl.textContent = '✅ Tous misés !';
    remEl.className = 'bets-ok';
    btn.disabled = false;
  } else if (remaining > 0) {
    remEl.textContent = `Reste : ${remaining} 🪙`;
    remEl.className = 'bets-bad';
    btn.disabled = true;
  } else {
    remEl.textContent = `Trop de ${Math.abs(remaining)} 🪙 !`;
    remEl.className = 'bets-bad';
    btn.disabled = true;
  }
}

function submitBets() {
  const total = S.bets.reduce((s, b) => s + b, 0);
  if (total !== S.myTokens) { showError('v-error', `⚖️ Mise exactement ${S.myTokens} jetons (actuellement ${total})`); return; }
  S.teamSubmitted = true;
  stopTimer();
  socket.emit('submitBets', { bets: S.bets });
  document.getElementById('v-submitted-msg').classList.remove('hidden');
  document.getElementById('confirm-bets-btn').disabled = true;
}

// === RESULTS ===
function renderResults(data) {
  stopTimer();
  if (data.teamNames) S.teamNames = data.teamNames;

  // Animate token counters
  const t1El = document.getElementById('r-t1-tokens');
  const t2El = document.getElementById('r-t2-tokens');
  animateCounter(t1El, S.myTokens, data.tokens.team1);
  animateCounter(t2El, S.oppTokens !== undefined ? S.oppTokens : data.tokens.team2, data.tokens.team2);

  document.getElementById('r-round').textContent = data.round;

  // Update team name labels in results
  document.querySelectorAll('.r-t1-label').forEach(el => el.textContent = S.teamNames.team1);
  document.querySelectorAll('.r-t2-label').forEach(el => el.textContent = S.teamNames.team2);

  renderResultBlock('r-q1', data.team1Data);
  renderResultBlock('r-q2', data.team2Data);

  // Next round button
  const isCreator = data.creatorId === S.socketId;
  document.getElementById('next-round-btn').classList.toggle('hidden', !isCreator || data.isGameOver);
  document.getElementById('wait-next-msg').classList.toggle('hidden', isCreator || data.isGameOver);

  showView('results-view');

  // Confetti for the team that kept more tokens
  const myTeamKept = S.team === 'team1' ? data.tokens.team1 : data.tokens.team2;
  const oppKept = S.team === 'team1' ? data.tokens.team2 : data.tokens.team1;
  if (myTeamKept > oppKept) {
    setTimeout(() => launchConfetti(), 400);
  }
}

function renderResultBlock(prefix, teamData) {
  document.getElementById(`${prefix}-question`).textContent = teamData.question;

  const answersEl = document.getElementById(`${prefix}-answers`);
  answersEl.innerHTML = '';
  const labels = ['A', 'B', 'C'];
  teamData.answers.forEach((ans, i) => {
    const isReal = i === teamData.realIndex;
    const betOnThis = teamData.bets[i] || 0;
    const row = document.createElement('div');
    row.className = 'result-answer-row ' + (isReal ? 'is-real' : 'is-fake');
    row.innerHTML = `
      <span class="answer-label">${labels[i]}. ${ans}</span>
      ${isReal ? '<span class="answer-badge badge-real">✅ Vraie</span>' : '<span class="answer-badge badge-fake">🎭 Inventée</span>'}
      ${betOnThis > 0 ? `<span class="bet-on-answer">+${betOnThis}🪙</span>` : ''}
    `;
    answersEl.appendChild(row);
  });

  const kept = teamData.tokensKept;
  const lost = teamData.prevTokens - kept;
  const summaryEl = document.getElementById(`${prefix}-summary`);
  const votingEmoji = teamData.votingTeam === 'team1' ? '🔵' : '🔴';
  const votingName = S.teamNames[teamData.votingTeam];
  summaryEl.innerHTML = `
    <div style="color:var(--text-muted);font-size:0.8rem">${votingEmoji} ${votingName} votait ici</div>
    <div class="tokens-change ${kept === 0 ? 'tokens-lost' : (lost === 0 ? 'tokens-kept' : '')}">
      ${teamData.prevTokens} 🪙 → ${kept} 🪙 ${lost > 0 ? `<span style="color:var(--red)">(-${lost})</span>` : '<span style="color:var(--green)">(tout gardé !)</span>'}
    </div>
    <div style="color:var(--text-muted);font-size:0.8rem">${kept} jeton(s) sur la bonne réponse</div>
  `;
}

function nextRound() {
  socket.emit('nextRound');
}

// === CONFETTI ===
function launchConfetti() {
  if (typeof confetti === 'undefined') return;
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ['#f5c518', '#a78bfa', '#4ade80', '#38bdf8', '#fb7185'] });
  setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.4 }, angle: 60 }), 350);
  setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.4 }, angle: 120 }), 350);
}

// === GAME OVER ===
function renderGameOver(data) {
  stopTimer();
  if (data.teamNames) S.teamNames = data.teamNames;

  const winnerKey = data.winner;
  const loserKey = winnerKey === 'team1' ? 'team2' : 'team1';
  const winnerName = (winnerKey === 'team1' ? '🔵 ' : '🔴 ') + S.teamNames[winnerKey];
  const loserName = (loserKey === 'team1' ? '🔵 ' : '🔴 ') + S.teamNames[loserKey];

  document.getElementById('go-emoji').textContent = '🏆';
  document.getElementById('go-title').textContent = `${winnerName} gagne !`;
  document.getElementById('go-subtitle').textContent = `${loserName} a perdu tous ses jetons ! 🪦`;

  document.getElementById('go-t1-tokens').textContent = data.tokens.team1;
  document.getElementById('go-t2-tokens').textContent = data.tokens.team2;
  document.getElementById('go-t1-name').textContent = S.teamNames.team1;
  document.getElementById('go-t2-name').textContent = S.teamNames.team2;

  const isCreator = data.creatorId === S.socketId;
  document.getElementById('restart-btn').classList.toggle('hidden', !isCreator);
  document.getElementById('wait-restart-msg').classList.toggle('hidden', isCreator);

  showView('gameover-view');

  // Confetti if we won
  if (S.team === winnerKey) {
    setTimeout(() => {
      launchConfetti();
      setTimeout(launchConfetti, 800);
    }, 300);
  }
}

function restartGame() {
  socket.emit('restartGame');
}

// === SOCKET EVENTS ===
socket.on('connect', () => {
  S.socketId = socket.id;
});

socket.on('roomCreated', ({ code, roomState, myAvatar }) => {
  S.roomCode = code;
  S.isCreator = true;
  if (myAvatar) S.myAvatar = myAvatar;
  if (roomState.teamNames) S.teamNames = roomState.teamNames;
  renderLobby(roomState);
  showView('lobby-view');
});

socket.on('roomJoined', ({ roomState, myAvatar }) => {
  S.isCreator = roomState.creatorId === S.socketId;
  if (myAvatar) S.myAvatar = myAvatar;
  if (roomState.teamNames) S.teamNames = roomState.teamNames;
  renderLobby(roomState);
  showView('lobby-view');
});

socket.on('error', ({ message }) => {
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  const errEl = activeView.querySelector('.error-msg');
  if (!errEl) { alert(message); return; }
  errEl.textContent = message;
  errEl.classList.remove('hidden');
  setTimeout(() => errEl.classList.add('hidden'), 5000);
});

socket.on('playerJoined', ({ playerName, socketId, roomState }) => {
  renderLobby(roomState);
  appendChatMessage({ isSystem: true, text: `${playerName} a rejoint le salon` });
});

socket.on('teamUpdate', ({ roomState, socketId, team }) => {
  if (socketId === S.socketId) S.team = team;
  renderLobby(roomState);
});

socket.on('playerLeft', ({ playerName, roomState }) => {
  renderLobby(roomState);
  appendChatMessage({ isSystem: true, text: `${playerName} a quitté le salon` });
});

socket.on('newCreator', ({ socketId }) => {
  S.isCreator = socketId === S.socketId;
  if (S.roomState) {
    S.roomState.creatorId = socketId;
    renderLobby(S.roomState);
  }
  if (S.isCreator) {
    ['start-btn', 'next-round-btn', 'restart-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    ['wait-start-msg', 'wait-next-msg', 'wait-restart-msg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }
});

socket.on('teamNameUpdate', ({ team, name }) => {
  updateTeamNameUI(team, name);
  // Update timer display if needed
  const displayVal = document.getElementById('timer-display-val');
  // (no change needed for name update)
});

socket.on('timerDurationUpdate', ({ duration }) => {
  S.timerDuration = duration;
  document.querySelectorAll('.timer-opt').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.dur) === duration);
  });
  const displayVal = document.getElementById('timer-display-val');
  if (displayVal) displayVal.textContent = duration >= 60 ? (duration / 60) + 'min' : duration + 's';
});

socket.on('reaction', ({ emoji, playerName, avatar }) => {
  showReaction(emoji, playerName, avatar);
});

socket.on('questionPhase', (data) => {
  renderQuestionPhase(data);
});

socket.on('fakeAnswersSync', ({ answer1, answer2 }) => {
  if (!S.teamSubmitted) {
    const f1 = document.getElementById('fake1');
    const f2 = document.getElementById('fake2');
    if (f1 && document.activeElement !== f1) f1.value = answer1;
    if (f2 && document.activeElement !== f2) f2.value = answer2;
  }
});

socket.on('teamSubmittedAnswers', ({ team, roomState }) => {
  const key = team === 'team1' ? 'q-status-t1' : 'q-status-t2';
  const el = document.getElementById(key);
  if (el) {
    el.classList.add('done');
    el.querySelector('span:last-child').textContent = 'soumis ✅';
  }
});

socket.on('votingPhase', (data) => {
  renderVotingPhase(data);
});

socket.on('betsSync', ({ bets }) => {
  if (!S.teamSubmitted && bets) {
    bets.forEach((b, i) => {
      const inp = document.getElementById(`bet-${i}`);
      if (inp && document.activeElement !== inp) {
        inp.value = b;
        S.bets[i] = b;
      }
    });
    const total = S.bets.reduce((s, b) => s + b, 0);
    const totalEl = document.getElementById('bets-total');
    if (totalEl) totalEl.textContent = total;
    updateBetDisplay();
  }
});

socket.on('teamSubmittedBets', ({ team }) => {
  // Could show a UI indicator
});

socket.on('roundResults', (data) => {
  if (data.isGameOver) {
    renderGameOver({
      winner: data.winner,
      tokens: data.tokens,
      creatorId: data.creatorId,
      teamNames: data.teamNames,
    });
  } else {
    renderResults(data);
  }
});

socket.on('chatMessage', ({ playerName, avatar, team, text }) => {
  appendChatMessage({ playerName, avatar, team, text });
});

socket.on('gameRestarted', ({ roomState }) => {
  stopTimer();
  S.team = null;
  for (const t of ['team1', 'team2']) {
    if (roomState.teams[t].players.some(p => p.id === S.socketId)) {
      S.team = t;
    }
  }
  if (roomState.teamNames) S.teamNames = roomState.teamNames;
  renderLobby(roomState);
  showView('lobby-view');
});
