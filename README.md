# 🎩 Charlatan ! — Jeu de bluff multijoueur

## Lancer le jeu

### 1. Installer les dépendances

```bash
cd charlatan
npm install
```

### 2. Démarrer le serveur

```bash
npm start
```

### 3. Ouvrir le jeu

Ouvre ton navigateur sur : **http://localhost:3000**

---

## Règles du jeu

**Objectif :** La première équipe qui se retrouve avec 0 jeton perd !

### Déroulement d'une manche

1. **Phase de rédaction** — Chaque équipe reçoit une question insolite. Elle connaît la vraie réponse et doit inventer **2 fausses réponses** convaincantes.

2. **Phase de mise** — Chaque équipe voit les **3 réponses de l'adversaire** (1 vraie + 2 inventées, mélangées). Elle répartit ses jetons sur les réponses pour parier sur laquelle est vraie.

3. **Résultats** — Seuls les jetons misés sur la **bonne réponse** sont conservés. Les jetons sur les mauvaises réponses sont perdus.

> 💡 *Stratégie : si ton équipe est sûre, mets tout sur une réponse. Si tu hésites, répartis — mais tu prends le risque de perdre plus.*

### Jetons
- Chaque équipe commence avec **16 jetons**
- La première équipe à atteindre **0 jeton** a perdu !

---

## Comment jouer en réseau local

1. Lance le serveur sur un PC du réseau
2. Trouve l'IP locale du PC (ex: `192.168.1.42`)
3. Les autres joueurs accèdent à `http://192.168.1.42:3000`

---

## Structure du projet

```
charlatan/
├── server.js          # Serveur Node.js (Express + Socket.io)
├── questions.js       # 200 questions insolites en français
├── package.json
└── public/
    ├── index.html     # Interface du jeu (SPA)
    ├── style.css      # Styles
    └── game.js        # Logique client (Socket.io)
```

## Stack technique

- **Backend :** Node.js, Express, Socket.io
- **Frontend :** HTML/CSS/JS vanilla (pas de framework)
- **Temps réel :** WebSockets via Socket.io
- **Questions :** 200 questions insolites en français intégrées
