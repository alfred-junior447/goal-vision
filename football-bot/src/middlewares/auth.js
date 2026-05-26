const User = require('../models/User');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────
// Enregistrer/mettre à jour l'utilisateur en DB
// ─────────────────────────────────────────────────────
async function registerUser(ctx, next) {
  const tgUser = ctx.from;
  if (!tgUser) return next();

  try {
    await User.findOneAndUpdate(
      { telegramId: tgUser.id },
      {
        $set: {
          username: tgUser.username,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name,
          lastActivity: new Date()
        },
        $setOnInsert: {
          telegramId: tgUser.id,
          referralCode: `REF${tgUser.id}`,
          createdAt: new Date()
        }
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error(`registerUser error: ${err.message}`);
  }

  return next();
}

// ─────────────────────────────────────────────────────
// Vérifier si l'utilisateur est premium actif
// ─────────────────────────────────────────────────────
async function requirePremium(ctx, next) {
  const user = await User.findOne({ telegramId: ctx.from.id });
  if (!user) return ctx.reply('❌ Utilisateur non trouvé. Tapez /start');

  const isActive = user.isPremium && user.premiumExpiry && new Date() < user.premiumExpiry;

  if (!isActive) {
    return ctx.reply(
      `🔒 *Cette fonctionnalité est réservée aux membres Premium*\n\n` +
      `Accédez aux prédictions avancées, scores exacts, alertes VIP et bien plus!\n\n` +
      `👉 Tapez /premium pour voir les offres`,
      { parse_mode: 'Markdown' }
    );
  }

  ctx.dbUser = user;
  return next();
}

// ─────────────────────────────────────────────────────
// Vérifier si l'utilisateur est admin
// ─────────────────────────────────────────────────────
function requireAdmin(ctx, next) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(Number);
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('⛔ Accès refusé.');
  }
  return next();
}

// ─────────────────────────────────────────────────────
// Charger l'utilisateur dans le contexte
// ─────────────────────────────────────────────────────
async function loadUser(ctx, next) {
  try {
    ctx.dbUser = await User.findOne({ telegramId: ctx.from?.id });
  } catch (err) {
    ctx.dbUser = null;
  }
  return next();
}

module.exports = { registerUser, requirePremium, requireAdmin, loadUser };
