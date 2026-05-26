# ⚽ Football Prediction Bot

Bot Telegram de prédictions football avec système premium, alimenté par API-Football et MongoDB.

---

## 🚀 Fonctionnalités

### Gratuit
- 📅 Matchs du jour (toutes les grandes ligues + Cameroun)
- ⚡ Scores en direct
- 🔮 Prédictions avec probabilités (domicile/nul/extérieur)
- 📊 Forme récente des équipes
- 🔔 Notifications de début de matchs

### 👑 Premium
- 🎯 Score exact prédit (ex: 2-1)
- 💡 Analyse VIP exclusive par IA
- 📈 Both Teams To Score (BTTS)
- 🔢 Over/Under 2.5 buts
- ⚽ H2H (historique face-à-face)
- 🔔 Alertes VIP 30 min avant les matchs
- 📊 Statistiques complètes (attaque/défense)

---

## 💰 Système de paiement

| Méthode | Semaine | Mois | Année |
|---------|---------|------|-------|
| ⭐ Telegram Stars | 150★ | 500★ | 4500★ |
| 💛 MTN MoMo (XAF) | 2 000 | 6 500 | 55 000 |
| 🟠 Orange Money (XAF) | 2 000 | 6 500 | 55 000 |

---

## 🛠️ Installation

### Prérequis
- Node.js 18+
- MongoDB Atlas (compte gratuit sur mongodb.com)
- Clé API-Football (api-football.com)
- Bot Telegram (via @BotFather)

### 1. Cloner et installer
```bash
git clone https://github.com/votre-repo/football-bot
cd football-bot
npm install
```

### 2. Configuration
```bash
cp .env.example .env
# Remplissez toutes les variables dans .env
```

### 3. Variables d'environnement requises

```env
BOT_TOKEN=          # Token de @BotFather
API_FOOTBALL_KEY=   # Clé API-Football
MONGODB_URI=        # URI MongoDB Atlas
ADMIN_IDS=          # Votre Telegram ID (pour commandes admin)
TIMEZONE=Africa/Douala
NODE_ENV=development
```

### 4. Lancer en développement
```bash
npm run dev
```

---

## ☁️ Déploiement sur Render

### Étapes:
1. Créez un compte sur [render.com](https://render.com)
2. Nouveau Web Service → connectez votre repo GitHub
3. Render détecte automatiquement `render.yaml`
4. Configurez les variables d'environnement dans Dashboard > Environment
5. **WEBHOOK_URL** = `https://votre-app.onrender.com`
6. Déployez!

### Variables à configurer dans Render:
```
BOT_TOKEN         → Token Telegram
API_FOOTBALL_KEY  → Clé API-Football  
MONGODB_URI       → Connexion MongoDB Atlas
ADMIN_IDS         → Votre Telegram ID
WEBHOOK_URL       → https://votre-app.onrender.com
MTN_API_KEY       → (optionnel) Clé MTN MoMo
ORANGE_API_KEY    → (optionnel) Clé Orange Money
```

> ⚠️ **Plan gratuit Render**: Le service s'endort après 15 min d'inactivité.
> Utilisez un service de ping (UptimeRobot) pour garder le bot actif 24/7.

---

## 📋 Commandes Telegram

| Commande | Description |
|----------|-------------|
| `/start` | Menu principal |
| `/matchs` | Matchs du jour |
| `/live` | Scores en direct |
| `/premium` | Offres premium |
| `/compte` | Mon profil |
| `/stats` | Stats d'une équipe |
| `/verifier_paiement` | Vérifier paiement mobile |

### Commandes Admin
| Commande | Description |
|----------|-------------|
| `/broadcast <msg>` | Envoyer à tous les utilisateurs |
| `/adminstats` | Statistiques du bot |
| `/addpremium <id> <plan>` | Activer premium manuellement |

---

## 🏗️ Architecture

```
football-bot/
├── src/
│   ├── index.js              # Point d'entrée
│   ├── commands/
│   │   └── handlers.js       # Tous les handlers de commandes
│   ├── models/
│   │   ├── User.js           # Modèle utilisateur
│   │   ├── Prediction.js     # Modèle prédiction
│   │   └── Alert.js          # Modèle alertes
│   ├── services/
│   │   ├── apiFootball.js    # Client API-Football (avec cache)
│   │   ├── predictionEngine.js # Algorithme de prédiction
│   │   ├── paymentService.js # Stars, MTN, Orange
│   │   ├── notificationService.js # Système d'alertes
│   │   ├── cronJobs.js       # Tâches planifiées
│   │   └── webhookServer.js  # Serveur Express
│   ├── middlewares/
│   │   └── auth.js           # Auth & vérification premium
│   └── utils/
│       ├── formatters.js     # Formatage des messages
│       └── logger.js         # Winston logger
└── config/
    └── constants.js          # Ligues, plans, constantes
```

---

## 🔧 Configuration MTN MoMo

1. Créez un compte sur [momodeveloper.mtn.com](https://momodeveloper.mtn.com)
2. Créez une application Collection
3. Obtenez: `API_KEY`, `API_SECRET`, `SUBSCRIPTION_KEY`
4. En production, contactez MTN Cameroun pour l'environnement `mtncameroon`

## 🔧 Configuration Orange Money

1. Portail développeur Orange: [developer.orange.com](https://developer.orange.com)
2. API: Orange Money Web Payment Cameroun
3. Obtenez la `merchant_key`

---

## 📊 API-Football

- Site: [api-football.com](https://api-football.com)
- Plan gratuit: 100 requêtes/jour
- Plan recommandé: Basic (7500 req/jour) ~$10/mois

### Ligues configurées
- Premier League (🏴󠁧󠁢󠁥󠁮󠁧󠁿), La Liga (🇪🇸), Serie A (🇮🇹)
- Bundesliga (🇩🇪), Ligue 1 (🇫🇷)
- Champions League, Europa League
- MTN Elite One & Coupe du Cameroun (🇨🇲)

---

## ⚡ Performance

- **Cache en mémoire**: Les appels API sont mis en cache 5 min
- **Pré-génération**: Les prédictions du lendemain sont calculées à 23h
- **MongoDB**: Index sur `fixtureId`, `telegramId`, `match.date`
- **Batch notifications**: Envoi par lots de 30 avec délai anti-spam

---

## 📄 Licence

 Alfred junior @ IAI Edea,cameroun
