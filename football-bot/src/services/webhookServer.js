const express = require('express');
const User = require('../models/User');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');

function createWebhookServer(bot) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─────────────────────────────────────────
  // Health check (requis pour Render keepalive)
  // ─────────────────────────────────────────
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Football Prediction Bot',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime() });
  });

  // ─────────────────────────────────────────
  // Webhook Telegram
  // ─────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
    app.use(webhookPath, (req, res, next) => {
      bot.webhookCallback(webhookPath)(req, res, next);
    });
    logger.info(`Telegram webhook configuré sur ${webhookPath}`);
  }

  // ─────────────────────────────────────────
  // Webhook MTN MoMo callback
  // ─────────────────────────────────────────
  app.post('/webhook/mtn', async (req, res) => {
    try {
      const { referenceId, status } = req.body;
      logger.info(`MTN callback: ${referenceId} → ${status}`);

      if (status === 'SUCCESSFUL') {
        // Parser le referenceId: MTN_telegramId_plan_timestamp
        const parts = referenceId.split('_');
        if (parts.length >= 3 && parts[0] === 'MTN') {
          const telegramId = parseInt(parts[1]);
          const plan = parts[2];

          const user = await paymentService.activatePremiumForUser(
            telegramId, plan, 'mtn_momo', referenceId
          );

          // Notifier l'utilisateur
          const planName = require('../../config/constants').PREMIUM_PLANS[plan]?.name;
          await bot.telegram.sendMessage(
            telegramId,
            `✅ *Paiement MTN MoMo confirmé!*\n\n👑 Votre accès Premium *${planName}* est maintenant actif!\n\nTapez /start pour commencer à profiter de vos avantages VIP 🎉`,
            { parse_mode: 'Markdown' }
          );

          logger.info(`Premium activé via MTN: user ${telegramId}, plan ${plan}`);
        }
      }

      res.json({ status: 'received' });
    } catch (err) {
      logger.error(`MTN webhook error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────
  // Webhook Orange Money
  // ─────────────────────────────────────────
  app.post('/webhook/orange/notify', async (req, res) => {
    try {
      const { order_id, status, amount } = req.body;
      logger.info(`Orange callback: ${order_id} → ${status}`);

      if (status === 'SUCCESS') {
        const parts = order_id.split('_');
        if (parts[0] === 'ORG') {
          const telegramId = parseInt(parts[1]);
          const plan = parts[2];

          await paymentService.activatePremiumForUser(
            telegramId, plan, 'orange_money', order_id
          );

          const planName = require('../../config/constants').PREMIUM_PLANS[plan]?.name;
          await bot.telegram.sendMessage(
            telegramId,
            `✅ *Paiement Orange Money confirmé!*\n\n👑 Votre accès Premium *${planName}* est maintenant actif!\n\nTapez /start pour profiter de vos avantages VIP 🎉`,
            { parse_mode: 'Markdown' }
          );
        }
      }

      res.json({ status: 'ok' });
    } catch (err) {
      logger.error(`Orange webhook error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/webhook/orange/return', (req, res) => {
    res.send('✅ Paiement Orange Money reçu! Retournez sur Telegram pour confirmer.');
  });

  app.get('/webhook/orange/cancel', (req, res) => {
    res.send('❌ Paiement annulé. Retournez sur Telegram.');
  });

  return app;
}

module.exports = { createWebhookServer };
