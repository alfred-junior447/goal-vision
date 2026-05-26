const cron = require('node-cron');
const moment = require('moment-timezone');
const apiFootball = require('../services/apiFootball');
const predictionEngine = require('../services/predictionEngine');
const notificationService = require('../services/notificationService');
const Prediction = require('../models/Prediction');
const logger = require('../utils/logger');

const TZ = process.env.TIMEZONE || 'Africa/Douala';

function startCronJobs() {
  logger.info('🕐 Démarrage des tâches planifiées...');

  // ─────────────────────────────────────────────────────
  // Prédictions quotidiennes — 7h00 (heure locale)
  // ─────────────────────────────────────────────────────
  cron.schedule('0 7 * * *', async () => {
    logger.info('📅 Cron: Génération des prédictions du jour');
    try {
      const fixtures = await apiFootball.getFixturesToday();
      const predictions = [];

      for (const fixture of fixtures.slice(0, 20)) {
        if (['NS', 'TBD'].includes(fixture.fixture.status.short)) {
          const pred = await predictionEngine.generatePrediction(fixture);
          if (pred) predictions.push(pred);
        }
      }

      if (predictions.length > 0) {
        await notificationService.sendDailySummary(predictions);
        logger.info(`✅ ${predictions.length} prédictions générées et envoyées`);
      }
    } catch (err) {
      logger.error(`Cron daily predictions: ${err.message}`);
    }
  }, { timezone: TZ });

  // ─────────────────────────────────────────────────────
  // Alertes VIP avant les matchs — toutes les heures
  // ─────────────────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const fixtures = await apiFootball.getFixturesToday();
      const now = moment().tz(TZ);

      for (const fixture of fixtures) {
        const kickoff = moment(fixture.fixture.date).tz(TZ);
        const minutesUntil = kickoff.diff(now, 'minutes');

        // Alerte 30 minutes avant le coup d'envoi
        if (minutesUntil > 25 && minutesUntil <= 35) {
          const pred = await Prediction.findOne({ fixtureId: fixture.fixture.id });
          if (pred) {
            const home = fixture.teams.home.name;
            const away = fixture.teams.away.name;
            const vipMsg = `
🔔 *MATCH DANS 30 MIN* ⏳

⚽ *${home}* vs *${away}*
🏆 ${fixture.league.name}
⏰ Coup d'envoi: ${kickoff.format('HH:mm')}`;

            await notificationService.sendVipAlert(pred, vipMsg);
          }
        }
      }
    } catch (err) {
      logger.error(`Cron VIP alerts: ${err.message}`);
    }
  }, { timezone: TZ });

  // ─────────────────────────────────────────────────────
  // Surveillance des scores en direct — toutes les 5 min
  // ─────────────────────────────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const liveFixtures = await apiFootball.getLiveFixtures();

      for (const fixture of liveFixtures) {
        // Alerte début de match (1H commencé depuis peu)
        if (fixture.fixture.status.short === '1H' && fixture.fixture.status.elapsed <= 5) {
          await notificationService.sendMatchStartAlert(fixture);
        }

        // Mettre à jour résultats si le match est terminé
        if (fixture.fixture.status.short === 'FT') {
          await predictionEngine.updateResults(fixture.fixture.id);
        }
      }
    } catch (err) {
      logger.error(`Cron live scores: ${err.message}`);
    }
  }, { timezone: TZ });

  // ─────────────────────────────────────────────────────
  // Pré-génération des prédictions — 23h00 (veille)
  // ─────────────────────────────────────────────────────
  cron.schedule('0 23 * * *', async () => {
    logger.info('📊 Cron: Pré-génération prédictions demain');
    try {
      // Pré-générer pour le lendemain (cache chaud)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const res = await apiFootball.get('/fixtures', {
        date: dateStr,
        timezone: TZ
      });

      const fixtures = res.response || [];
      let count = 0;
      for (const fixture of fixtures.slice(0, 15)) {
        await predictionEngine.generatePrediction(fixture);
        count++;
      }
      logger.info(`✅ ${count} prédictions pré-générées pour demain`);
    } catch (err) {
      logger.error(`Cron pre-generate: ${err.message}`);
    }
  }, { timezone: TZ });

  // ─────────────────────────────────────────────────────
  // Nettoyage cache API — toutes les heures
  // ─────────────────────────────────────────────────────
  cron.schedule('30 * * * *', () => {
    const now = Date.now();
    let cleared = 0;
    for (const [key, entry] of apiFootball.cache.entries()) {
      if (now - entry.time > apiFootball.CACHE_TTL) {
        apiFootball.cache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) logger.debug(`🧹 Cache nettoyé: ${cleared} entrées supprimées`);
  }, { timezone: TZ });

  logger.info('✅ Tâches planifiées actives');
}

module.exports = { startCronJobs };
