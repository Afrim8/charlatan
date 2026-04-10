const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { questions } = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

const AVATARS = ['🦊','🐺','🦁','🐯','🐻','🦝','🦄','🐸','🐙','🦋','🦈','🐉','🦓','🦒','🦔','🐬'];
const REACTIONS = ['😂','🤯','💀','👏','🔥'];

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateCode() : code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicRoom(room) {
  return {
    code: room.code,
    state: room.state,
    round: room.round,
    creatorId: room.creatorId,
    teamNames: room.teamNames,
    timerDuration: room.timerDuration,
    teams: {
      team1: {
        players: room.teams.team1.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
        tokens: room.teams.team1.tokens,
        submitted: room.teams.team1.submittedAnswers,
      },
      team2: {
        players: room.teams.team2.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
        tokens: room.teams.team2.tokens,
        submitted: room.teams.team2.submittedAnswers,
      },
    },
  };
}

function clearPhaseTimer(room) {
  if (room.phaseTimer) { clearTimeout(room.phaseTimer); room.phaseTimer = null; }
}

function startRound(room) {
  clearPhaseTimer(room);
  room.round++;
  room.state = 'question';

  for (const t of ['team1', 'team2']) {
    room.teams[t].fakeAnswers = null;
    room.teams[t].bets = null;
    room.teams[t].submittedAnswers = false;
    room.teams[t].submittedBets = false;
  }

  let available = questions
    .map((q, i) => ({ ...q, index: i }))
    .filter(q => !room.usedQuestionIndices.includes(q.index));

  if (available.length < 2) {
    room.usedQuestionIndices = [];
    available = questions.map((q, i) => ({ ...q, index: i }));
  }

  const picked = shuffle(available).slice(0, 2);
  room.usedQuestionIndices.push(picked[0].index, picked[1].index);
  room.currentQuestions = { team1: picked[0], team2: picked[1] };

  for (const teamName of ['team1', 'team2']) {
    const q = room.currentQuestions[teamName];
    const opp = teamName === 'team1' ? 'team2' : 'team1';
    room.teams[teamName].players.forEach(p => {
      io.to(p.id).emit('questionPhase', {
        round: room.round,
        question: q.question,
        realAnswer: q.answer,
        myTokens: room.teams[teamName].tokens,
        oppTokens: room.teams[opp].tokens,
        teamNames: room.teamNames,
        timerDuration: room.timerDuration,
      });
    });
  }

  // Safety auto-advance after timer expires
  room.phaseTimer = setTimeout(() => {
    if (room.state !== 'question') return;
    for (const teamName of ['team1', 'team2']) {
      if (!room.teams[teamName].submittedAnswers) {
        room.teams[teamName].fakeAnswers = ['...', '...'];
        room.teams[teamName].submittedAnswers = true;
        io.to(room.code).emit('teamSubmittedAnswers', { team: teamName, roomState: publicRoom(room) });
      }
    }
    setTimeout(() => { if (room.state === 'question') startVoting(room); }, 1200);
  }, (room.timerDuration + 5) * 1000);
}

function startVoting(room) {
  clearPhaseTimer(room);
  room.state = 'voting';

  room.answersForVote = {
    team1: shuffle([
      { text: room.currentQuestions.team1.answer, isReal: true },
      { text: room.teams.team1.fakeAnswers[0], isReal: false },
      { text: room.teams.team1.fakeAnswers[1], isReal: false },
    ]),
    team2: shuffle([
      { text: room.currentQuestions.team2.answer, isReal: true },
      { text: room.teams.team2.fakeAnswers[0], isReal: false },
      { text: room.teams.team2.fakeAnswers[1], isReal: false },
    ]),
  };

  room.teams.team1.players.forEach(p => {
    io.to(p.id).emit('votingPhase', {
      question: room.currentQuestions.team2.question,
      answers: room.answersForVote.team2.map(a => a.text),
      myTokens: room.teams.team1.tokens,
      teamNames: room.teamNames,
      timerDuration: room.timerDuration,
    });
  });

  room.teams.team2.players.forEach(p => {
    io.to(p.id).emit('votingPhase', {
      question: room.currentQuestions.team1.question,
      answers: room.answersForVote.team1.map(a => a.text),
      myTokens: room.teams.team2.tokens,
      teamNames: room.teamNames,
      timerDuration: room.timerDuration,
    });
  });

  room.phaseTimer = setTimeout(() => {
    if (room.state !== 'voting') return;
    for (const teamName of ['team1', 'team2']) {
      if (!room.teams[teamName].submittedBets) {
        const tokens = room.teams[teamName].tokens;
        const base = Math.floor(tokens / 3);
        room.teams[teamName].bets = [base, base, tokens - 2 * base];
        room.teams[teamName].submittedBets = true;
        io.to(room.code).emit('teamSubmittedBets', { team: teamName });
      }
    }
    setTimeout(() => { if (room.state === 'voting') resolveRound(room); }, 800);
  }, (room.timerDuration + 5) * 1000);
}

function resolveRound(room) {
  clearPhaseTimer(room);
  room.state = 'results';

  const team2RealIdx = room.answersForVote.team2.findIndex(a => a.isReal);
  const team1RealIdx = room.answersForVote.team1.findIndex(a => a.isReal);

  const team1Kept = room.teams.team1.bets[team2RealIdx];
  const team2Kept = room.teams.team2.bets[team1RealIdx];

  const prevT1 = room.teams.team1.tokens;
  const prevT2 = room.teams.team2.tokens;

  room.teams.team1.tokens = team1Kept;
  room.teams.team2.tokens = team2Kept;

  const isGameOver = team1Kept === 0 || team2Kept === 0;
  if (isGameOver) room.state = 'gameover';

  io.to(room.code).emit('roundResults', {
    round: room.round,
    isGameOver,
    winner: isGameOver ? (team1Kept > 0 ? 'team1' : 'team2') : null,
    tokens: { team1: room.teams.team1.tokens, team2: room.teams.team2.tokens },
    creatorId: room.creatorId,
    teamNames: room.teamNames,
    team1Data: {
      question: room.currentQuestions.team1.question,
      answers: room.answersForVote.team1.map(a => a.text),
      realIndex: team1RealIdx,
      bets: room.teams.team2.bets,
      tokensKept: team2Kept,
      prevTokens: prevT2,
      votingTeam: 'team2',
    },
    team2Data: {
      question: room.currentQuestions.team2.question,
      answers: room.answersForVote.team2.map(a => a.text),
      realIndex: team2RealIdx,
      bets: room.teams.team1.bets,
      tokensKept: team1Kept,
      prevTokens: prevT1,
      votingTeam: 'team1',
    },
  });
}

io.on('connection', (socket) => {
  console.log('Connecté:', socket.id);

  socket.on('createRoom', ({ playerName }) => {
    const code = generateCode();
    socket.avatar = AVATARS[0];
    rooms[code] = {
      code,
      state: 'lobby',
      round: 0,
      creatorId: socket.id,
      teamNames: { team1: 'Équipe 1', team2: 'Équipe 2' },
      timerDuration: 60,
      phaseTimer: null,
      avatarCounter: 1,
      teams: {
        team1: { players: [], tokens: 16, fakeAnswers: null, bets: null, submittedAnswers: false, submittedBets: false },
        team2: { players: [], tokens: 16, fakeAnswers: null, bets: null, submittedAnswers: false, submittedBets: false },
      },
      currentQuestions: null,
      answersForVote: null,
      usedQuestionIndices: [],
    };

    socket.join(code);
    socket.roomCode = code;
    socket.playerName = playerName;
    socket.team = null;

    socket.emit('roomCreated', { code, roomState: publicRoom(rooms[code]), myAvatar: socket.avatar });
    console.log(`Salon ${code} créé par ${playerName}`);
  });

  socket.on('joinRoom', ({ code, playerName }) => {
    const upper = code.toUpperCase().trim();
    const room = rooms[upper];
    if (!room) { socket.emit('error', { message: '❌ Salon introuvable. Vérifie le code !' }); return; }
    if (room.state !== 'lobby') { socket.emit('error', { message: '⏳ Cette partie a déjà commencé !' }); return; }

    socket.avatar = AVATARS[room.avatarCounter % AVATARS.length];
    room.avatarCounter++;

    socket.join(upper);
    socket.roomCode = upper;
    socket.playerName = playerName;
    socket.team = null;

    socket.emit('roomJoined', { roomState: publicRoom(room), myAvatar: socket.avatar });
    socket.to(upper).emit('playerJoined', { playerName, socketId: socket.id, roomState: publicRoom(room) });
    console.log(`${playerName} a rejoint ${upper}`);
  });

  socket.on('setTeamName', ({ team, name }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'lobby' || !['team1', 'team2'].includes(team)) return;
    if (socket.team !== team) return;
    const cleaned = (name || '').trim().substring(0, 20);
    if (!cleaned) return;
    room.teamNames[team] = cleaned;
    io.to(socket.roomCode).emit('teamNameUpdate', { team, name: cleaned });
  });

  socket.on('setTimerDuration', ({ duration }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'lobby' || socket.id !== room.creatorId) return;
    const d = parseInt(duration);
    if (![30, 45, 60, 90, 120].includes(d)) return;
    room.timerDuration = d;
    io.to(socket.roomCode).emit('timerDurationUpdate', { duration: d });
  });

  socket.on('sendReaction', ({ emoji }) => {
    const room = rooms[socket.roomCode];
    if (!room || !REACTIONS.includes(emoji)) return;
    io.to(socket.roomCode).emit('reaction', { emoji, playerName: socket.playerName, avatar: socket.avatar });
  });

  socket.on('chatMessage', ({ text }) => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    const cleaned = (text || '').trim().substring(0, 200);
    if (!cleaned) return;
    io.to(socket.roomCode).emit('chatMessage', {
      playerName: socket.playerName,
      avatar: socket.avatar,
      team: socket.team,
      text: cleaned,
    });
  });

  socket.on('chooseTeam', ({ team }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'lobby' || !['team1', 'team2'].includes(team)) return;

    if (socket.team) {
      room.teams[socket.team].players = room.teams[socket.team].players.filter(p => p.id !== socket.id);
    }
    room.teams[team].players.push({ id: socket.id, name: socket.playerName, avatar: socket.avatar });
    socket.team = team;

    io.to(socket.roomCode).emit('teamUpdate', { roomState: publicRoom(room), socketId: socket.id, team });
  });

  socket.on('startGame', () => {
    const room = rooms[socket.roomCode];
    if (!room || socket.id !== room.creatorId || room.state !== 'lobby') return;
    if (room.teams.team1.players.length === 0 || room.teams.team2.players.length === 0) {
      socket.emit('error', { message: '⚠️ Chaque équipe doit avoir au moins un joueur !' });
      return;
    }
    startRound(room);
  });

  socket.on('updateFakeAnswers', ({ answer1, answer2 }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'question' || !socket.team) return;
    if (room.teams[socket.team].submittedAnswers) return;
    room.teams[socket.team].players.forEach(p => {
      if (p.id !== socket.id) io.to(p.id).emit('fakeAnswersSync', { answer1, answer2 });
    });
  });

  socket.on('submitFakeAnswers', ({ answer1, answer2 }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'question' || !socket.team) return;
    if (room.teams[socket.team].submittedAnswers) return;

    const a1 = (answer1 || '').trim();
    const a2 = (answer2 || '').trim();
    if (!a1 || !a2) { socket.emit('error', { message: '✏️ Écris 2 fausses réponses avant de valider !' }); return; }

    room.teams[socket.team].fakeAnswers = [a1, a2];
    room.teams[socket.team].submittedAnswers = true;

    io.to(socket.roomCode).emit('teamSubmittedAnswers', { team: socket.team, roomState: publicRoom(room) });

    if (room.teams.team1.submittedAnswers && room.teams.team2.submittedAnswers) {
      clearPhaseTimer(room);
      setTimeout(() => startVoting(room), 1800);
    }
  });

  socket.on('updateBets', ({ bets }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'voting' || !socket.team) return;
    if (room.teams[socket.team].submittedBets) return;
    room.teams[socket.team].players.forEach(p => {
      if (p.id !== socket.id) io.to(p.id).emit('betsSync', { bets });
    });
  });

  socket.on('submitBets', ({ bets }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'voting' || !socket.team) return;
    if (room.teams[socket.team].submittedBets) return;

    const parsed = bets.map(b => parseInt(b) || 0);
    const total = parsed.reduce((s, b) => s + b, 0);
    if (total !== room.teams[socket.team].tokens) {
      socket.emit('error', { message: `⚖️ Mise ${total} jeton(s), mais tu en as ${room.teams[socket.team].tokens} !` });
      return;
    }
    if (parsed.some(b => b < 0)) { socket.emit('error', { message: '⚠️ Les mises ne peuvent pas être négatives !' }); return; }

    room.teams[socket.team].bets = parsed;
    room.teams[socket.team].submittedBets = true;

    io.to(socket.roomCode).emit('teamSubmittedBets', { team: socket.team });

    if (room.teams.team1.submittedBets && room.teams.team2.submittedBets) {
      clearPhaseTimer(room);
      setTimeout(() => resolveRound(room), 1000);
    }
  });

  socket.on('nextRound', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'results' || socket.id !== room.creatorId) return;
    startRound(room);
  });

  socket.on('restartGame', () => {
    const room = rooms[socket.roomCode];
    if (!room || room.state !== 'gameover' || socket.id !== room.creatorId) return;
    clearPhaseTimer(room);
    room.state = 'lobby';
    room.round = 0;
    room.teams.team1.tokens = 16;
    room.teams.team2.tokens = 16;
    room.teams.team1.submittedAnswers = false;
    room.teams.team2.submittedAnswers = false;
    room.usedQuestionIndices = [];
    io.to(room.code).emit('gameRestarted', { roomState: publicRoom(room) });
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    if (socket.team) {
      room.teams[socket.team].players = room.teams[socket.team].players.filter(p => p.id !== socket.id);
    }

    io.to(socket.roomCode).emit('playerLeft', {
      playerName: socket.playerName,
      socketId: socket.id,
      roomState: publicRoom(room),
    });

    if (socket.id === room.creatorId) {
      const all = [...room.teams.team1.players, ...room.teams.team2.players];
      if (all.length > 0) {
        room.creatorId = all[0].id;
        io.to(socket.roomCode).emit('newCreator', { socketId: all[0].id });
      } else {
        clearPhaseTimer(room);
        delete rooms[socket.roomCode];
        console.log(`Salon ${socket.roomCode} supprimé (vide)`);
      }
    }
    console.log(`${socket.playerName} déconnecté`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎩 Charlatan ! lancé sur http://localhost:${PORT}\n`);
});
