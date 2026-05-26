const User = require('../models/User');
const Alert = require('../models/Alert');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.bot = null;
  }

  setBot(bot) {
    this.bot = bot;
  }

  // ─────────────────────────────────────────
  // Envoyer à un utilisateur
  // ─────────────────────────────────────────
  async sendToUser(telegramId, message, options = {}) {
    if (!this.bot) return;
    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
        ...options
      });
    } catch (err) {
      if (err.code === 403) {
        // Utilisateur a bloqué le bot
        await User.updateOne({ telegramId }, { isBlocked: true });
      } else {
        logger.error(`Send notification error to ${telegramId}: ${err.message}`);
      }
    }
  }

  // ─────────────────────────────────────────
  // Broadcast à tous les abonnés
  // ─────────────────────────────────────────
  async broadcast(message, options = {}) {
    const { premiumOnly = false, leagueId = null } = options;

    const query = { isBlocked: false, 'notifications.dailyPredictions': true };
    if (premiumOnly) query.isPremium = true;
    if (leagueId) query.favoriteLeagues = leagueId;

    const users = await User.find(query).select('telegramId').lean();
    logger.info(`Broadcasting to ${users.length} users (premiumOnly: ${premiumOnly})`);

    const BATCH = 30;
    const DELAY = 1000; // 1s entre batches (anti-spam Telegram)

    for (let i = 0; i < users.length; i += BATCH) {
      const batch = users.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(u => this.sendToUser(u.telegramId, message))
      );
      if (i + BATCH < users.length) {
        await new Promise(r => setTimeout(r, DELAY));
      }
    }
  }

  // ─────────────────────────────────────────
  // Alerte début de match
  // ─────────────────────────────────────────
  async sendMatchStartAlert(fixture) {
    const home = fixture.teams.home.name;
    const away = fixture.teams.away.name;
    const league = fixture.league.name;

    const message = `
⚽ *COUP D'ENVOI !*

🏟️ *${home}* 🆚 *${away}*
🏆 ${league}

Le match vient de commencer !
Tapez /live pour suivre en direct`;

    await this.broadcast(message, { leagueId: fixture.league.id });

    await Alert.create({
      fixtureId: fixture.fixture.id,
      type: 'match_start',
      message,
      isPremium: false
    });
  }

  // ─────────────────────────────────────────
  // Alerte but
  // ─────────────────────────────────────────
  async sendGoalAlert(fixture, scorer, minute) {
    const home = fixture.teams.home.name;
    const away = fixture.teams.away.name;
    const { home: hg, away: ag } = fixture.goals;

    const message = `
🚨 *BUT !* 🚨

⚽ *${scorer}* (${minute}')
📊 *${home} ${hg} - ${ag} ${away}*

Tapez /live pour le score en direct`;

    await this.broadcast(message, { leagueId: fixture.league.id });
  }

  // ─────────────────────────────────────────
  // Alerte VIP (premium uniquement)
  // ─────────────────────────────────────────
  async sendVipAlert(prediction, extraInsight) {
    const { homeTeam, awayTeam, league } = prediction.match;
    const { probabilities, predictedScore, confidence } = prediction.prediction;

    const confBar = this._confidenceBar(confidence);

    const message = `
👑 *ALERTE VIP EXCLUSIVE*

⚽ *${homeTeam.name}* vs *${awayTeam.name}*
🏆 ${league.name}

🎯 Score probable: *${predictedScore.home}-${predictedScore.away}*
📊 Probabilités:
  🏠 Domicile: ${probBar(probabilities.home)}
  🤝 Nul: ${probBar(probabilities.draw)}
  ✈️ Extérieur: ${probBar(probabilities.away)}

${confBar} Confiance: *${confidence}%*

💡 ${extraInsight || prediction.analysis.vipInsight}

_Alerte VIP • Football Bot Pro_`;

    await this.broadcast(message, { premiumOnly: true, leagueId: league.id });

    await Alert.create({
      fixtureId: prediction.fixtureId,
      type: 'vip_tip',
      message,
      isPremium: true
    });
  }

  // ─────────────────────────────────────────
  // Récap prédictions journalières
  // ─────────────────────────────────────────
  async sendDailySummary(predictions) {
    if (!predictions.length) return;

    let freeMessage = `🌅 *PRÉDICTIONS DU JOUR*\n\n`;
    let premiumMessage = `👑 *PRÉDICTIONS VIP DU JOUR*\n\n`;

    for (const pred of predictions.slice(0, 5)) {
      const { homeTeam, awayTeam } = pred.match;
      const { winner, confidence, probabilities } = pred.prediction;
      const winnerName = winner === 'home' ? homeTeam.name : winner === 'away' ? awayTeam.name : 'Nul';
      const emoji = confidence >= 70 ? '🔥' : confidence >= 55 ? '✅' : '⚠️';

      freeMessage += `${emoji} *${homeTeam.name}* vs *${awayTeam.name}*\n`;
      freeMessage += `   → Favori: *${winnerName}* (${confidence}%)\n\n`;

      premiumMessage += `👑 *${homeTeam.name}* vs *${awayTeam.name}*\n`;
      premiumMessage += `   → Score: *${pred.prediction.predictedScore.home}-${pred.prediction.predictedScore.away}*\n`;
      premiumMessage += `   → BTTS: ${pred.prediction.btts ? '✅ Oui' : '❌ Non'} | +2.5: ${pred.prediction.over25 ? '✅' : '❌'}\n\n`;
    }

    freeMessage += `\n🔓 *Détails complets* → /premium`;

    await this.broadcast(freeMessage);
    await this.broadcast(premiumMessage, { premiumOnly: true });
  }

  // ─────────────────────────────────────────
  // Helpers visuels
  // ─────────────────────────────────────────
  _confidenceBar(confidence) {
    if (confidence >= 70) return '🔥🔥🔥';
    if (confidence >= 55) return '✅✅';
    return '⚠️';
  }
}

function probBar(pct) {
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`;
}

module.exports = new NotificationService();
