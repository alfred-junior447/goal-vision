require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { registerUser, requireAdmin, loadUser } = require('./middlewares/auth');
const handlers = require('./commands/handlers');
const notificationService = require('./services/notificationService');
const paymentService = require('./services/paymentService');
const { startCronJobs } = require('./services/cronJobs');
const { createWebhookServer } = require('./services/webhookServer');
const { CB } = require('../config/constants');
const User = require('./models/User');

// ═══════════════════════════════════════════════════════
// Connexion MongoDB
// ═══════════════════════════════════════════════════════
async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info('✅ MongoDB connecté');
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════
// Initialiser le bot
// ═══════════════════════════════════════════════════════
async function startBot() {
  await connectDatabase();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // Middleware session (mémoire simple)
  const sessionData = new Map();
  bot.use(async (ctx, next) => {
    const key = `${ctx.from?.id}:${ctx.chat?.id}`;
    if (!sessionData.has(key)) sessionData.set(key, {});
    ctx.session = sessionData.get(key);
    await next();
    sessionData.set(key, ctx.session);
  });

  // Middlewares globaux
  bot.use(registerUser);
  bot.use(loadUser);

  // ── Commandes de base ────────────────────────────────
  bot.start(handlers.handleStart);
  bot.command('help', handlers.handleStart);
  bot.command('matchs', handlers.handleMatchesToday);
  bot.command('live', handlers.handleLiveScores);
  bot.command('premium', handlers.handlePremiumInfo);
  bot.command('compte', handlers.handleMyAccount);
  bot.command('stats', handlers.handleTeamStatsPrompt);

  // Vérification paiement MTN/Orange (polling manuel)
  bot.command('verifier_paiement', async (ctx) => {
    const session = ctx.session;
    if (!session?.pendingPayment) {
      return ctx.reply('❌ Aucun paiement en attente trouvé.');
    }
    const { referenceId, plan, method } = session.pendingPayment;

    await ctx.reply('🔍 Vérification du paiement...');

    if (method === 'mtn_momo') {
      const status = await paymentService.checkMtnPaymentStatus(referenceId);
      if (status.status === 'SUCCESSFUL') {
        await paymentService.activatePremiumForUser(ctx.from.id, plan, method, referenceId);
        delete session.pendingPayment;
        const { PREMIUM_PLANS } = require('../config/constants');
        return ctx.replyWithMarkdown(
          `✅ *Paiement confirmé!* 🎉\n\n` +
          `👑 Premium *${PREMIUM_PLANS[plan].name}* activé!\n\nTapez /start pour profiter de vos avantages.`
        );
      } else if (status.status === 'FAILED') {
        return ctx.reply('❌ Paiement échoué ou annulé. Réessayez avec /premium');
      } else {
        return ctx.reply('⏳ Paiement toujours en attente. Confirmez sur votre téléphone puis retapez /verifier_paiement');
      }
    }
  });

  // ── Commandes admin ──────────────────────────────────
  bot.command('broadcast', requireAdmin, handlers.handleAdminBroadcast);
  bot.command('adminstats', requireAdmin, handlers.handleAdminStats);

  bot.command('addpremium', requireAdmin, async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply('Usage: /addpremium <telegramId> <plan>');
    const [, targetId, plan] = args;
    try {
      await paymentService.activatePremiumForUser(parseInt(targetId), plan, 'admin', 'ADMIN_GRANT');
      const { PREMIUM_PLANS } = require('../config/constants');
      await ctx.reply(`✅ Premium ${PREMIUM_PLANS[plan]?.name} activé pour l'utilisateur ${targetId}`);
      await bot.telegram.sendMessage(
        parseInt(targetId),
        `👑 *Votre accès Premium a été activé!*\n\nTapez /start pour en profiter 🎉`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    } catch (err) {
      ctx.reply(`❌ Erreur: ${err.message}`);
    }
  });

  // ── Callback queries ────────────────────────────────
  bot.action(CB.MATCHES_TODAY, handlers.handleMatchesToday);
  bot.action(CB.LIVE_SCORES, handlers.handleLiveScores);
  bot.action(CB.MATCHES_LEAGUE, handlers.handleLeagueSelector);
  bot.action(CB.TEAM_STATS, handlers.handleTeamStatsPrompt);
  bot.action(CB.PREMIUM_INFO, handlers.handlePremiumInfo);
  bot.action(CB.MY_ACCOUNT, handlers.handleMyAccount);
  bot.action(CB.TOGGLE_NOTIF, handlers.handleToggleNotifications);
  bot.action('menu', handlers.handleStart);

  // Sélecteur de ligue
  bot.action(/^league:(\d+)$/, async (ctx) => {
    const leagueId = ctx.match[1];
    await ctx.answerCbQuery();
    const fixtures = await require('./services/apiFootball').getFixturesToday(leagueId);
    const msg = require('./utils/formatters').formatMatchesList(fixtures);
    return ctx.replyWithMarkdown(msg);
  });

  // Achat premium
  bot.action(/^buy_premium:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handlers.handleBuyPremium(ctx, ctx.match[1]);
  });

  // Paiement Stars
  bot.action(/^pay_stars:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handlers.handlePayStars(ctx, ctx.match[1]);
  });

  // Paiement MTN
  bot.action(/^pay_mtn:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handlers.handlePayMtn(ctx, ctx.match[1]);
  });

  // Paiement Orange
  bot.action(/^pay_orange:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handlers.handlePayOrange(ctx, ctx.match[1]);
  });

  // Toggle notifications
  bot.action(/^notif:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user) {
      user.notifications[key] = !user.notifications[key];
      await user.save();
    }
    return handlers.handleToggleNotifications(ctx);
  });

  // Stats équipe par ID
  bot.action(/^teamstats:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return handlers.handleShowTeamStats(ctx, parseInt(ctx.match[1]), parseInt(ctx.match[2]));
  });

  // ── Prédictions via commande /pred_XXXXXXX ──────────
  bot.hears(/^\/pred_(\d+)$/, async (ctx) => {
    return handlers.handlePredictionById(ctx, parseInt(ctx.match[1]));
  });

  // ── Gestion des paiements Stars ──────────────────────
  bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on('successful_payment', async (ctx) => {
    try {
      const payload = JSON.parse(ctx.message.successful_payment.invoice_payload);
      if (payload.type === 'premium') {
        const user = await paymentService.activatePremiumForUser(
          ctx.from.id,
          payload.plan,
          'stars',
          `STARS_${ctx.from.id}_${Date.now()}`
        );
        const { PREMIUM_PLANS } = require('../config/constants');
        await ctx.replyWithMarkdown(
          `⭐ *Paiement Stars confirmé!* 🎉\n\n` +
          `👑 Premium *${PREMIUM_PLANS[payload.plan].name}* activé!\n\n` +
          `Profitez de toutes vos fonctionnalités VIP! Tapez /start`
        );
      }
    } catch (err) {
      logger.error(`Successful payment handler: ${err.message}`);
    }
  });

  // ── Messages texte (recherche équipe, numéros de tel) ─
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const session = ctx.session || {};

    // Si on attend un numéro de téléphone pour paiement mobile
    if (session.awaitingPhone) {
      const { method, plan } = session.awaitingPhone;
      const phoneNumber = text.trim().replace(/\s+/g, '');
      delete session.awaitingPhone;

      if (!/^6[5-9]\d{7}$/.test(phoneNumber) && !/^6[0-4]\d{7}$/.test(phoneNumber)) {
        return ctx.reply('❌ Numéro invalide. Format: 6XXXXXXXX (ex: 651234567)');
      }

      try {
        if (method === 'mtn_momo') {
          const result = await paymentService.initiateMtnPayment(ctx.from.id, plan, phoneNumber);
          session.pendingPayment = { referenceId: result.referenceId, plan, method };
          const instructions = paymentService.buildPaymentInstructions(method, plan, phoneNumber);
          return ctx.replyWithMarkdown(instructions);
        }

        if (method === 'orange_money') {
          const result = await paymentService.initiateOrangePayment(ctx.from.id, plan, phoneNumber);
          if (result.paymentUrl) {
            const { Markup } = require('telegraf');
            return ctx.replyWithMarkdown(
              `🟠 *Paiement Orange Money*\n\nCliquez pour payer:`,
              Markup.inlineKeyboard([
                [Markup.button.url('💳 Payer maintenant', result.paymentUrl)]
              ])
            );
          }
        }
      } catch (err) {
        return ctx.reply(`❌ ${err.message}`);
      }
    }

    // Recherche d'équipe (si contexte de recherche)
    if (session.awaitingTeamSearch) {
      delete session.awaitingTeamSearch;
      return handlers.handleTeamSearch(ctx, text);
    }

    // Commande /stats sans argument — activer recherche
    if (!text.startsWith('/')) {
      session.awaitingTeamSearch = true;
      return handlers.handleTeamSearch(ctx, text);
    }
  });

  // ── Erreurs globales ─────────────────────────────────
  bot.catch((err, ctx) => {
    logger.error(`Bot error for ${ctx.updateType}: ${err.message}`);
    if (ctx.reply) {
      ctx.reply('❌ Une erreur est survenue. Réessayez ou tapez /start').catch(() => {});
    }
  });

  // ══════════════════════════════════════════════════════
  // Initialiser les services
  // ══════════════════════════════════════════════════════
  notificationService.setBot(bot);
  startCronJobs();

  // ══════════════════════════════════════════════════════
  // Démarrer le bot (Webhook en prod, Long Polling en dev)
  // ══════════════════════════════════════════════════════
  const PORT = process.env.PORT || 3000;
  const WEBHOOK_URL = process.env.WEBHOOK_URL;
  const app = createWebhookServer(bot);

  if (process.env.NODE_ENV === 'production' && WEBHOOK_URL) {
    const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
    const fullWebhookUrl = `${WEBHOOK_URL}${webhookPath}`;

    await bot.telegram.setWebhook(fullWebhookUrl);
    logger.info(`🔗 Webhook configuré: ${fullWebhookUrl}`);

    app.listen(PORT, () => {
      logger.info(`🚀 Serveur démarré sur le port ${PORT}`);
      logger.info(`⚽ Football Prediction Bot actif!`);
    });
  } else {
    // Mode développement: Long Polling
    app.listen(PORT, () => {
      logger.info(`🌐 Serveur health check sur le port ${PORT}`);
    });

    await bot.telegram.deleteWebhook();
    bot.launch();
    logger.info('🚀 Bot démarré en mode Long Polling (développement)');
  }

  // Arrêt propre
  process.once('SIGINT', () => {
    logger.info('SIGINT reçu - Arrêt...');
    bot.stop('SIGINT');
    mongoose.connection.close();
  });

  process.once('SIGTERM', () => {
    logger.info('SIGTERM reçu - Arrêt...');
    bot.stop('SIGTERM');
    mongoose.connection.close();
  });

  return bot;
}

startBot().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
