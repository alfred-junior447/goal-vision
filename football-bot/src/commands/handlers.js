const { Markup } = require('telegraf');
const apiFootball = require('../services/apiFootball');
const predictionEngine = require('../services/predictionEngine');
const paymentService = require('../services/paymentService');
const User = require('../models/User');
const Prediction = require('../models/Prediction');
const { formatMatchesList, formatPredictionFree, formatPredictionVip, formatTeamStats, formatLiveMatch } = require('../utils/formatters');
const { LEAGUES, PREMIUM_PLANS, PREMIUM_FEATURES, CB } = require('../../config/constants');
const logger = require('../utils/logger');

// ═══════════════════════════════════════════════════════
// /start
// ═══════════════════════════════════════════════════════
async function handleStart(ctx) {
  const name = ctx.from.first_name || 'Joueur';

  const welcomeMsg = `
⚽ *Bienvenue sur Football Predictor Bot, ${name}!*

Je suis votre assistant de prédictions football alimenté par l'IA.

🎯 *Ce que je peux faire:*
• Prédictions avec probabilités précises
• Matchs du jour en temps réel
• Statistiques détaillées des équipes
• Alertes et notifications

👑 *Membres Premium:*
• Score exact prédit
• Analyse VIP exclusive
• Alertes buts instantanées
• Both Teams To Score & Over/Under

Choisissez une option ci-dessous 👇`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Matchs aujourd\'hui', CB.MATCHES_TODAY),
      Markup.button.callback('⚡ En direct', CB.LIVE_SCORES)
    ],
    [
      Markup.button.callback('🏆 Par compétition', CB.MATCHES_LEAGUE),
      Markup.button.callback('📊 Stats équipe', CB.TEAM_STATS)
    ],
    [
      Markup.button.callback('👑 Passer Premium', CB.PREMIUM_INFO)
    ],
    [
      Markup.button.callback('👤 Mon compte', CB.MY_ACCOUNT),
      Markup.button.callback('🔔 Notifications', CB.TOGGLE_NOTIF)
    ]
  ]);

  return ctx.replyWithMarkdown(welcomeMsg, keyboard);
}

// ═══════════════════════════════════════════════════════
// /matchs — Matchs du jour
// ═══════════════════════════════════════════════════════
async function handleMatchesToday(ctx) {
  const loadingMsg = await ctx.reply('🔄 Chargement des matchs...');

  try {
    const fixtures = await apiFootball.getFixturesToday();
    const msg = formatMatchesList(fixtures);

    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Actualiser', CB.MATCHES_TODAY)],
      [Markup.button.callback('⚡ Scores en direct', CB.LIVE_SCORES)],
      [Markup.button.callback('🏆 Filtrer par ligue', CB.MATCHES_LEAGUE)]
    ]);

    return ctx.replyWithMarkdown(msg, keyboard);
  } catch (err) {
    logger.error(`handleMatchesToday: ${err.message}`);
    return ctx.reply('❌ Erreur lors du chargement des matchs. Réessayez dans quelques instants.');
  }
}

// ═══════════════════════════════════════════════════════
// /live — Scores en direct
// ═══════════════════════════════════════════════════════
async function handleLiveScores(ctx) {
  try {
    const liveFixtures = await apiFootball.getLiveFixtures();

    if (!liveFixtures.length) {
      return ctx.replyWithMarkdown('📭 *Aucun match en cours actuellement.*\n\nConsultez /matchs pour les prochains matchs.');
    }

    let msg = `⚡ *SCORES EN DIRECT* (${liveFixtures.length} matchs)\n\n`;
    for (const f of liveFixtures.slice(0, 10)) {
      msg += formatLiveMatch(f) + '\n\n';
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Actualiser', CB.LIVE_SCORES)]
    ]);

    return ctx.replyWithMarkdown(msg, keyboard);
  } catch (err) {
    return ctx.reply('❌ Erreur lors du chargement des scores en direct.');
  }
}

// ═══════════════════════════════════════════════════════
// Prédiction par ID fixture (/pred_XXXXXXX)
// ═══════════════════════════════════════════════════════
async function handlePredictionById(ctx, fixtureId) {
  const loadingMsg = await ctx.reply('🔮 Calcul de la prédiction en cours...');

  try {
    const fixture = await apiFootball.getFixtureById(fixtureId);
    if (!fixture) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
      return ctx.reply('❌ Match introuvable.');
    }

    const prediction = await predictionEngine.generatePrediction(fixture);
    if (!prediction) {
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
      return ctx.reply('❌ Impossible de générer la prédiction pour ce match.');
    }

    // Vérifier si premium
    const user = await User.findOne({ telegramId: ctx.from.id });
    const isPremium = user?.isPremium && user?.premiumExpiry && new Date() < user.premiumExpiry;

    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    let msg, keyboard;

    if (isPremium) {
      msg = formatPredictionVip(prediction);
      keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Actualiser', `${CB.PREDICTION}:${fixtureId}`)],
        [Markup.button.callback('📊 Stats équipes', `${CB.TEAM_STATS}:${fixture.teams.home.id}`)],
        [Markup.button.callback('🏠 Menu principal', 'menu')]
      ]);
    } else {
      msg = formatPredictionFree(prediction);
      keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👑 Voir analyse VIP complète', CB.PREMIUM_INFO)],
        [Markup.button.callback('🔄 Actualiser', `${CB.PREDICTION}:${fixtureId}`)],
        [Markup.button.callback('🏠 Menu principal', 'menu')]
      ]);
    }

    // Incrémenter stats
    if (user) {
      await User.updateOne({ telegramId: ctx.from.id }, { $inc: { 'stats.predictionsViewed': 1 } });
    }

    return ctx.replyWithMarkdown(msg, keyboard);
  } catch (err) {
    logger.error(`handlePredictionById ${fixtureId}: ${err.message}`);
    return ctx.reply('❌ Erreur lors de la génération de la prédiction.');
  }
}

// ═══════════════════════════════════════════════════════
// Sélecteur de ligue
// ═══════════════════════════════════════════════════════
async function handleLeagueSelector(ctx) {
  const buttons = Object.entries(LEAGUES).map(([id, info]) => [
    Markup.button.callback(`${info.flag} ${info.name}`, `league:${id}`)
  ]);
  buttons.push([Markup.button.callback('🔙 Retour', 'menu')]);

  return ctx.replyWithMarkdown(
    '🏆 *Choisissez une compétition:*',
    Markup.inlineKeyboard(buttons)
  );
}

// ═══════════════════════════════════════════════════════
// Stats équipe (recherche)
// ═══════════════════════════════════════════════════════
async function handleTeamStatsPrompt(ctx) {
  await ctx.reply('🔍 Entrez le nom de l\'équipe:\n(ex: Barcelona, PSG, Canon Yaoundé)');
  // La réponse sera traitée dans le handler de texte
}

async function handleTeamSearch(ctx, teamName) {
  const loadingMsg = await ctx.reply(`🔍 Recherche de "${teamName}"...`);

  try {
    const teams = await apiFootball.searchTeam(teamName);

    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});

    if (!teams.length) {
      return ctx.reply(`❌ Aucune équipe trouvée pour "${teamName}"`);
    }

    if (teams.length === 1) {
      return handleShowTeamStats(ctx, teams[0].team.id, 39);
    }

    // Proposer les équipes trouvées
    const buttons = teams.slice(0, 5).map(t => [
      Markup.button.callback(
        `${t.team.name} (${t.team.country})`,
        `teamstats:${t.team.id}:${t.seasons?.[0]?.league?.id || 39}`
      )
    ]);

    return ctx.replyWithMarkdown(
      `🔍 *Équipes trouvées:*`,
      Markup.inlineKeyboard(buttons)
    );
  } catch (err) {
    return ctx.reply('❌ Erreur lors de la recherche. Réessayez.');
  }
}

async function handleShowTeamStats(ctx, teamId, leagueId = 39) {
  const loading = await ctx.reply('📊 Chargement des statistiques...');

  try {
    const [teamInfo, stats] = await Promise.all([
      apiFootball.getTeamInfo(teamId),
      apiFootball.getTeamStatistics(teamId, leagueId)
    ]);

    const teamName = teamInfo?.team?.name || 'Équipe';
    const msg = formatTeamStats(stats, teamName);

    await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

    return ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Menu', 'menu')]
    ]));
  } catch (err) {
    return ctx.reply('❌ Erreur lors du chargement des statistiques.');
  }
}

// ═══════════════════════════════════════════════════════
// /premium — Page offres
// ═══════════════════════════════════════════════════════
async function handlePremiumInfo(ctx) {
  const user = ctx.dbUser;
  const isPremium = user?.isPremium && user?.premiumExpiry && new Date() < user.premiumExpiry;

  if (isPremium) {
    const expiry = user.premiumExpiry.toLocaleDateString('fr-FR');
    return ctx.replyWithMarkdown(
      `👑 *Vous êtes déjà membre Premium!*\n\n` +
      `📅 Expiration: *${expiry}*\n` +
      `📦 Plan: *${PREMIUM_PLANS[user.premiumPlan]?.name || user.premiumPlan}*\n\n` +
      `Profitez de toutes vos fonctionnalités VIP! 🎉`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Menu principal', 'menu')]
      ])
    );
  }

  const featuresText = PREMIUM_FEATURES.map(f => `  ${f}`).join('\n');

  let msg = `
👑 *FOOTBALL BOT PREMIUM*

*Accédez à l'analyse football de niveau professionnel:*

${featuresText}

━━━━━━━━━━━━━━━━━━
💎 *Choisissez votre plan:*

⚡ *Semaine* — ${PREMIUM_PLANS.weekly.prices.stars}⭐ | ${PREMIUM_PLANS.weekly.prices.mtn_momo.toLocaleString()} FCFA
🔥 *Mois* — ${PREMIUM_PLANS.monthly.prices.stars}⭐ | ${PREMIUM_PLANS.monthly.prices.mtn_momo.toLocaleString()} FCFA
👑 *Année* — ${PREMIUM_PLANS.yearly.prices.stars}⭐ | ${PREMIUM_PLANS.yearly.prices.mtn_momo.toLocaleString()} FCFA`;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ 1 Semaine', `${CB.BUY_PREMIUM}:weekly`),
      Markup.button.callback('🔥 1 Mois', `${CB.BUY_PREMIUM}:monthly`)
    ],
    [
      Markup.button.callback('👑 1 An (Meilleure offre)', `${CB.BUY_PREMIUM}:yearly`)
    ],
    [Markup.button.callback('🔙 Retour', 'menu')]
  ]);

  return ctx.replyWithMarkdown(msg, keyboard);
}

// ═══════════════════════════════════════════════════════
// Choisir méthode de paiement
// ═══════════════════════════════════════════════════════
async function handleBuyPremium(ctx, plan) {
  const planData = PREMIUM_PLANS[plan];
  if (!planData) return ctx.reply('❌ Plan invalide');

  const msg = `
${planData.emoji} *Premium ${planData.name}*

Choisissez votre mode de paiement:

⭐ *Telegram Stars* — ${planData.prices.stars} Stars
  Paiement direct via Telegram

💛 *MTN Mobile Money* — ${planData.prices.mtn_momo.toLocaleString()} FCFA
  Paiement depuis votre téléphone

🟠 *Orange Money* — ${planData.prices.orange_money.toLocaleString()} FCFA
  Paiement Orange Cameroun`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`⭐ Payer avec Stars (${planData.prices.stars}★)`, `${CB.PAY_STARS}:${plan}`)],
    [Markup.button.callback(`💛 MTN MoMo (${planData.prices.mtn_momo.toLocaleString()} FCFA)`, `${CB.PAY_MTN}:${plan}`)],
    [Markup.button.callback(`🟠 Orange Money (${planData.prices.orange_money.toLocaleString()} FCFA)`, `${CB.PAY_ORANGE}:${plan}`)],
    [Markup.button.callback('🔙 Retour', CB.PREMIUM_INFO)]
  ]);

  return ctx.replyWithMarkdown(msg, keyboard);
}

// ═══════════════════════════════════════════════════════
// Paiement Telegram Stars
// ═══════════════════════════════════════════════════════
async function handlePayStars(ctx, plan) {
  try {
    const invoice = paymentService.createStarsInvoice(plan);
    await ctx.replyWithInvoice({
      ...invoice,
      provider_token: '' // Vide pour Stars
    });
  } catch (err) {
    logger.error(`PayStars error: ${err.message}`);
    return ctx.reply('❌ Erreur lors de la création de la facture. Réessayez.');
  }
}

// ═══════════════════════════════════════════════════════
// Paiement MTN MoMo
// ═══════════════════════════════════════════════════════
async function handlePayMtn(ctx, plan) {
  await ctx.reply(
    `💛 *Paiement MTN Mobile Money*\n\nEntrez votre numéro MTN (format: 6XXXXXXXX):`,
    { parse_mode: 'Markdown' }
  );
  // Stocker l'état en attente du numéro
  ctx.session = ctx.session || {};
  ctx.session.awaitingPhone = { method: 'mtn_momo', plan };
}

// ═══════════════════════════════════════════════════════
// Paiement Orange Money
// ═══════════════════════════════════════════════════════
async function handlePayOrange(ctx, plan) {
  await ctx.reply(
    `🟠 *Paiement Orange Money*\n\nEntrez votre numéro Orange (format: 6XXXXXXXX):`,
    { parse_mode: 'Markdown' }
  );
  ctx.session = ctx.session || {};
  ctx.session.awaitingPhone = { method: 'orange_money', plan };
}

// ═══════════════════════════════════════════════════════
// Mon compte
// ═══════════════════════════════════════════════════════
async function handleMyAccount(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) return ctx.reply('❌ Compte introuvable. Tapez /start');

  const isPremium = user.isPremium && user.premiumExpiry && new Date() < user.premiumExpiry;
  const expiry = user.premiumExpiry ? user.premiumExpiry.toLocaleDateString('fr-FR') : 'N/A';
  const accuracy = user.stats.totalPredictions > 0
    ? Math.round(user.stats.correctPredictions / user.stats.totalPredictions * 100) + '%'
    : 'N/A';

  const msg = `
👤 *Mon Compte*

📛 Nom: *${user.firstName || 'N/A'} ${user.lastName || ''}*
🆔 ID: \`${user.telegramId}\`
📅 Membre depuis: *${user.createdAt.toLocaleDateString('fr-FR')}*

${isPremium ? `👑 *PREMIUM actif* jusqu'au ${expiry}` : '🔓 Compte gratuit'}
📦 Plan: *${PREMIUM_PLANS[user.premiumPlan]?.name || 'Gratuit'}*

📊 *Statistiques:*
👁️ Prédictions consultées: ${user.stats.predictionsViewed}
🎯 Précision: ${accuracy}

🔔 *Notifications:*
${user.notifications.dailyPredictions ? '✅' : '❌'} Prédictions quotidiennes
${user.notifications.matchStart ? '✅' : '❌'} Début de matchs
${user.notifications.vipAlerts ? '✅' : '❌'} Alertes VIP

🎁 Code de parrainage: \`${user.referralCode}\`
👥 Parrainages: ${user.referralCount}`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔔 Gérer notifications', CB.TOGGLE_NOTIF)],
    [isPremium
      ? Markup.button.callback('🔄 Renouveler Premium', CB.PREMIUM_INFO)
      : Markup.button.callback('👑 Passer Premium', CB.PREMIUM_INFO)
    ],
    [Markup.button.callback('🏠 Menu', 'menu')]
  ]);

  return ctx.replyWithMarkdown(msg, keyboard);
}

// ═══════════════════════════════════════════════════════
// Notifications toggle
// ═══════════════════════════════════════════════════════
async function handleToggleNotifications(ctx) {
  const user = await User.findOne({ telegramId: ctx.from.id });

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(
      `${user?.notifications?.dailyPredictions ? '✅' : '❌'} Prédictions quotidiennes`,
      'notif:dailyPredictions'
    )],
    [Markup.button.callback(
      `${user?.notifications?.matchStart ? '✅' : '❌'} Début de matchs`,
      'notif:matchStart'
    )],
    [Markup.button.callback(
      `${user?.notifications?.goals ? '✅' : '❌'} Alertes buts`,
      'notif:goals'
    )],
    [Markup.button.callback('🔙 Retour', CB.MY_ACCOUNT)]
  ]);

  return ctx.replyWithMarkdown('🔔 *Gérer mes notifications:*', keyboard);
}

// ═══════════════════════════════════════════════════════
// Admin: broadcast message
// ═══════════════════════════════════════════════════════
async function handleAdminBroadcast(ctx) {
  const text = ctx.message.text.replace('/broadcast ', '').trim();
  if (!text) return ctx.reply('Usage: /broadcast <message>');

  const notifService = require('../services/notificationService');
  await notifService.broadcast(text);

  const count = await User.countDocuments({ isBlocked: false });
  return ctx.reply(`✅ Message envoyé à ~${count} utilisateurs.`);
}

// ═══════════════════════════════════════════════════════
// Admin: stats globales
// ═══════════════════════════════════════════════════════
async function handleAdminStats(ctx) {
  const [totalUsers, premiumUsers, predictionsCount] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isPremium: true, premiumExpiry: { $gt: new Date() } }),
    Prediction.countDocuments()
  ]);

  return ctx.replyWithMarkdown(`
📊 *Statistiques Admin*

👥 Utilisateurs total: *${totalUsers}*
👑 Membres premium actifs: *${premiumUsers}*
🔮 Prédictions générées: *${predictionsCount}*
📅 Date: *${new Date().toLocaleString('fr-FR')}*`);
}

module.exports = {
  handleStart,
  handleMatchesToday,
  handleLiveScores,
  handlePredictionById,
  handleLeagueSelector,
  handleTeamStatsPrompt,
  handleTeamSearch,
  handleShowTeamStats,
  handlePremiumInfo,
  handleBuyPremium,
  handlePayStars,
  handlePayMtn,
  handlePayOrange,
  handleMyAccount,
  handleToggleNotifications,
  handleAdminBroadcast,
  handleAdminStats
};
