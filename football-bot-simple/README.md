# ⚽ Football Prediction Bot — Version simplifiée

Bot Telegram de pronostics foot **ultra-simple** : 1 seul fichier, aucune base de données, aucune API de paiement tierce, données des 5 grands championnats **gratuites à vie**.

## Ce qui a changé vs l'ancienne version

| Avant | Après |
|---|---|
| MongoDB (Atlas) | Fichier `data.json` |
| Express + serveur webhook | Long polling (aucune config serveur) |
| API-Football (plan gratuit limité, grands championnats payants) | **football-data.org** : 5 grands championnats + Ligue des Champions gratuits à vie |
| API MTN MoMo + Orange Money (comptes marchands) | ⭐ Telegram Stars (automatique) + Mobile Money validé par l'admin |
| node-cron, notifications, winston, moment… | Supprimés |
| 9 dépendances, ~20 fichiers | 3 dépendances, 1 fichier (`bot.js`) |

## 🚀 Installation en 3 étapes

```bash
cd football-bot-simple
npm install
cp .env.example .env   # puis remplis les valeurs
npm start
```

## 🔑 Obtenir les clés

1. **BOT_TOKEN** : [@BotFather](https://t.me/BotFather) → /newbot
2. **FOOTBALL_DATA_KEY** : inscription gratuite sur [football-data.org](https://www.football-data.org/client/register) — le plan gratuit couvre pour toujours les 5 grands championnats (PL, La Liga, Serie A, Bundesliga, Ligue 1) + la Ligue des Champions (limite : 10 requêtes/min, le bot a déjà un cache de 5 min intégré)
3. **ADMIN_IDS** : ton ID Telegram via [@userinfobot](https://t.me/userinfobot)
4. **MTN_NUMBER / ORANGE_NUMBER** : les numéros qui recevront les paiements Mobile Money

> ⚠️ Ne mets JAMAIS ton token dans un fichier commité sur GitHub. Utilise `.env` (ignoré par git) ou les variables d'environnement de ton hébergeur. Si un token a fuité, régénère-le avec /revoke dans @BotFather.

## 💰 Paiement simplifié

- **Telegram Stars** : 100 % automatique. L'utilisateur paie, le premium s'active tout seul.
- **Mobile Money (MTN / Orange)** : l'utilisateur paie sur ton numéro, t'envoie `/preuve <ID> <plan>`, tu valides avec `/valider <ID>`. Aucun compte marchand nécessaire.

## 📋 Commandes

| Commande | Qui | Description |
|---|---|---|
| /start | tous | Menu principal |
| /matchs | tous | Matchs du jour |
| /live | tous | Scores en direct |
| /pred_XXXX | tous | Prédiction d'un match (ID affiché dans /matchs) |
| /premium | tous | Offres + achat en Stars |
| /compte | tous | Profil et statut VIP |
| /preuve \<ID\> \<plan\> | utilisateur | Déclarer un paiement Mobile Money |
| /valider \<ID\> | admin | Valider un paiement Mobile Money |
| /refuser \<ID\> | admin | Refuser un paiement |
| /paiements | admin | Liste des paiements en attente |
| /addpremium \<id\> \<plan\> | admin | Activer premium manuellement |
| /broadcast \<msg\> | admin | Message à tous les utilisateurs |

## ☁️ Déployer sur Render (gratuit)

1. Nouveau **Web Service** → ton repo GitHub, **Root Directory : football-bot-simple**
2. Build : `npm install` — Start : `npm start`
3. Ajoute les variables d'environnement (celles du .env)
4. Le plan gratuit s'endort après 15 min → utilise [UptimeRobot](https://uptimerobot.com) (ping toutes les 10 min) pour garder le bot actif

## 📝 Notes

- **football-data.org** : le plan gratuit inclut 12 compétitions dont les 5 grands championnats + C1, pour toujours. Limite : 10 requêtes/min (le cache 5 min du bot évite la plupart des erreurs 429). Les scores en direct en temps réel sont un add-on payant : le plan gratuit les actualise avec un léger retard.
- Les données (utilisateurs, premium, paiements en attente) sont dans `data.json`. Sauvegarde ce fichier de temps en temps.
- Le moteur de prédiction se base sur les 5 derniers matchs de chaque équipe : forme, attaque, défense, avantage du terrain.
- L'ancienne version (API-Football + MongoDB) reste dans `football-bot/` si tu veux comparer.
