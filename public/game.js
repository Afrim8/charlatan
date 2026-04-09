const socket = io();

// === STATE ===
const S = {
  playerName: '',
  socketId: '',
  team: null,
  roomCode: '',
  isCreator: false,
  roomState: null,
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
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
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

function renderLobby(roomState) {
  S.roomState = roomState;
  document.getElementById('room-code-text').textContent = S.roomCode;
  document.getElementById('lobby-t1-tokens').textContent = roomState.teams.team1.tokens;
  document.getElementById('lobby-t2-tokens').textContent = roomState.teams.team2.tokens;

  renderTeamPlayers('lobby-team1-players', roomState.teams.team1.players, roomState.creatorId);
  renderTeamPlayers('lobby-team2-players', roomState.teams.team2.players, roomState.creatorId);

  // Creator UI
  const isCreator = roomState.creatorId === S.socketId;
  S.isCreator = isCreator;

  document.getElementById('start-btn').classList.toggle('hidden', !isCreator);
  document.getElementById('wait-start-msg').classList.toggle('hidden', isCreator);
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
    chip.innerHTML = `<span>${p.id === S.socketId ? '👤' : '🎩'} ${p.name}${p.id === S.socketId ? ' (toi)' : ''}</span>${p.id === creatorId ? '<span class="creator-badge">👑 créateur</span>' : ''}`;
    el.appendChild(chip);
  });
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
  socket.emit('submitFakeAnswers', { answer1: a1, answer2: a2 });
  document.getElementById('q-submitted-msg').classList.remove('hidden');
}

function renderQuestionPhase(data) {
  S.currentRound = data.round;
  S.myTokens = data.myTokens;
  S.oppTokens = data.oppTokens;
  S.teamSubmitted = false;

  document.getElementById('q-round').textContent = data.round;
  document.getElementById('q-my-tokens').textContent = data.myTokens;
  document.getElementById('q-opp-tokens').textContent = data.oppTokens;
  document.getElementById('q-question').textContent = data.question;
  document.getElementById('q-real-answer').textContent = data.realAnswer || data.answer || '';

  // Store for reference (server sends question + answer)
  S.currentQuestion = data.question;

  // Reset UI
  document.getElementById('fake1').value = '';
  document.getElementById('fake2').value = '';
  document.getElementById('q-submitted-msg').classList.add('hidden');
  hideError('q-error');

  // Reset status
  document.getElementById('q-status-t1').classList.remove('done');
  document.getElementById('q-status-t2').classList.remove('done');
  document.getElementById('q-status-t1').querySelector('span').textContent = 'en cours...';
  document.getElementById('q-status-t2').querySelector('span').textContent = 'en cours...';

  showView('question-view');
}

// === VOTING PHASE ===
function renderVotingPhase(data) {
  S.votingAnswers = data.answers;
  S.myTokens = data.myTokens;
  S.bets = [0, 0, 0];
  S.teamSubmitted = false;

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
  socket.emit('submitBets', { bets: S.bets });
  document.getElementById('v-submitted-msg').classList.remove('hidden');
  document.getElementById('confirm-bets-btn').disabled = true;
}

// === RESULTS ===
function renderResults(data) {
  document.getElementById('r-round').textContent = data.round;
  document.getElementById('r-t1-tokens').textContent = data.tokens.team1;
  document.getElementById('r-t2-tokens').textContent = data.tokens.team2;

  renderResultBlock('r-q1', data.team1Data);
  renderResultBlock('r-q2', data.team2Data);

  // Next round button
  const isCreator = data.creatorId === S.socketId;
  document.getElementById('next-round-btn').classList.toggle('hidden', !isCreator || data.isGameOver);
  document.getElementById('wait-next-msg').classList.toggle('hidden', isCreator || data.isGameOver);

  showView('results-view');
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
  summaryEl.innerHTML = `
    <div style="color:var(--text-muted);font-size:0.8rem">${votingEmoji} Équipe ${teamData.votingTeam === 'team1' ? '1' : '2'} votait ici</div>
    <div class="tokens-change ${kept === 0 ? 'tokens-lost' : (lost === 0 ? 'tokens-kept' : '')}">
      ${teamData.prevTokens} 🪙 → ${kept} 🪙 ${lost > 0 ? `<span style="color:var(--red)">(-${lost})</span>` : '<span style="color:var(--green)">(tout gardé !)</span>'}
    </div>
    <div style="color:var(--text-muted);font-size:0.8rem">${kept} jeton(s) sur la bonne réponse</div>
  `;
}

function nextRound() {
  socket.emit('nextRound');
}

// === GAME OVER ===
function renderGameOver(data) {
  const winnerName = data.winner === 'team1' ? '🔵 Équipe 1' : '🔴 Équipe 2';
  const loserName = data.winner === 'team1' ? '🔴 Équipe 2' : '🔵 Équipe 1';

  document.getElementById('go-emoji').textContent = data.winner === 'team1' ? '🏆' : '🏆';
  document.getElementById('go-title').textContent = `${winnerName} gagne !`;
  document.getElementById('go-subtitle').textContent = `${loserName} a perdu tous ses jetons ! 🪦`;

  document.getElementById('go-t1-tokens').textContent = data.tokens.team1;
  document.getElementById('go-t2-tokens').textContent = data.tokens.team2;

  const isCreator = data.creatorId === S.socketId;
  document.getElementById('restart-btn').classList.toggle('hidden', !isCreator);
  document.getElementById('wait-restart-msg').classList.toggle('hidden', isCreator);

  showView('gameover-view');
}

function restartGame() {
  socket.emit('restartGame');
}

// === SOCKET EVENTS ===
socket.on('connect', () => {
  S.socketId = socket.id;
});

socket.on('roomCreated', ({ code, roomState }) => {
  S.roomCode = code;
  S.isCreator = true;
  renderLobby(roomState);
  showView('lobby-view');
});

socket.on('roomJoined', ({ roomState }) => {
  S.isCreator = roomState.creatorId === S.socketId;
  renderLobby(roomState);
  showView('lobby-view');
});

socket.on('error', ({ message }) => {
  // Show in whichever error area is relevant
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
});

socket.on('teamUpdate', ({ roomState, socketId, team }) => {
  if (socketId === S.socketId) S.team = team;
  renderLobby(roomState);
});

socket.on('playerLeft', ({ playerName, roomState }) => {
  renderLobby(roomState);
});

socket.on('newCreator', ({ socketId }) => {
  S.isCreator = socketId === S.socketId;
  if (S.roomState) {
    S.roomState.creatorId = socketId;
    renderLobby(S.roomState);
  }
  if (S.isCreator) {
    const btn = document.getElementById('start-btn');
    if (btn) btn.classList.remove('hidden');
    const msg = document.getElementById('wait-start-msg');
    if (msg) msg.classList.add('hidden');
    const nb = document.getElementById('next-round-btn');
    if (nb) nb.classList.remove('hidden');
    const wn = document.getElementById('wait-next-msg');
    if (wn) wn.classList.add('hidden');
    const rb = document.getElementById('restart-btn');
    if (rb) rb.classList.remove('hidden');
    const wr = document.getElementById('wait-restart-msg');
    if (wr) wr.classList.add('hidden');
  }
});

socket.on('questionPhase', (data) => {
  // Server sends question + answer for this team's question
  // We need to display the real answer so the team knows it
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
    el.querySelector('span').textContent = 'soumis ✅';
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
  // Could show a UI indicator, but voting-submitted-msg handles own team
});

socket.on('roundResults', (data) => {
  if (data.isGameOver) {
    renderGameOver({
      winner: data.winner,
      tokens: data.tokens,
      creatorId: data.creatorId,
    });
  } else {
    renderResults(data);
  }
});

socket.on('gameRestarted', ({ roomState }) => {
  S.team = null;
  // Find which team we were in
  const allTeams = { ...roomState.teams };
  for (const t of ['team1', 'team2']) {
    if (allTeams[t].players.some(p => p.id === S.socketId)) {
      S.team = t;
    }
  }
  renderLobby(roomState);
  showView('lobby-view');
});
