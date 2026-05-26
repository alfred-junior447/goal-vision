const axios = require('axios');
const logger = require('../utils/logger');
const User = require('../models/User');
const { PREMIUM_PLANS } = require('../../config/constants');

class PaymentService {

  // ═══════════════════════════════════════════
  // TELEGRAM STARS (intégré nativement)
  // ═══════════════════════════════════════════

  createStarsInvoice(plan) {
    const planData = PREMIUM_PLANS[plan];
    if (!planData) throw new Error('Plan invalide');

    return {
      title: `⭐ Premium ${planData.name}`,
      description: `Accédez aux prédictions VIP pour ${planData.name}`,
      payload: JSON.stringify({ type: 'premium', plan, method: 'stars' }),
      currency: 'XTR',
      prices: [{ label: `Premium ${planData.name}`, amount: planData.prices.stars }]
    };
  }

  // ═══════════════════════════════════════════
  // MTN MOBILE MONEY (Cameroun)
  // ═══════════════════════════════════════════

  async initiateMtnPayment(telegramId, plan, phoneNumber) {
    const planData = PREMIUM_PLANS[plan];
    if (!planData) throw new Error('Plan invalide');

    const referenceId = `MTN_${telegramId}_${plan}_${Date.now()}`;

    try {
      // Step 1: Créer un token Bearer MTN
      const tokenRes = await axios.post(
        `${process.env.MTN_API_URL}/collection/token/`,
        {},
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.MTN_API_KEY}:${process.env.MTN_API_SECRET || ''}`).toString('base64')}`,
            'Ocp-Apim-Subscription-Key': process.env.MTN_SUBSCRIPTION_KEY
          }
        }
      );
      const bearerToken = tokenRes.data.access_token;

      // Step 2: Request to Pay
      await axios.post(
        `${process.env.MTN_API_URL}/collection/v1_0/requesttopay`,
        {
          amount: String(planData.prices.mtn_momo),
          currency: 'XAF',
          externalId: referenceId,
          payer: { partyIdType: 'MSISDN', partyId: phoneNumber },
          payerMessage: `Football Bot Premium - ${planData.name}`,
          payeeNote: `Premium ${plan} pour utilisateur ${telegramId}`
        },
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'X-Reference-Id': referenceId,
            'X-Target-Environment': process.env.NODE_ENV === 'production' ? 'mtncameroon' : 'sandbox',
            'Ocp-Apim-Subscription-Key': process.env.MTN_SUBSCRIPTION_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      return { referenceId, status: 'pending', amount: planData.prices.mtn_momo };
    } catch (err) {
      logger.error(`MTN payment error: ${err.message}`);
      throw new Error('Erreur lors de l\'initiation du paiement MTN. Veuillez réessayer.');
    }
  }

  async checkMtnPaymentStatus(referenceId) {
    try {
      const tokenRes = await axios.post(
        `${process.env.MTN_API_URL}/collection/token/`,
        {},
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.MTN_API_KEY}:`).toString('base64')}`,
            'Ocp-Apim-Subscription-Key': process.env.MTN_SUBSCRIPTION_KEY
          }
        }
      );
      const bearerToken = tokenRes.data.access_token;

      const statusRes = await axios.get(
        `${process.env.MTN_API_URL}/collection/v1_0/requesttopay/${referenceId}`,
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'X-Target-Environment': process.env.NODE_ENV === 'production' ? 'mtncameroon' : 'sandbox',
            'Ocp-Apim-Subscription-Key': process.env.MTN_SUBSCRIPTION_KEY
          }
        }
      );

      return statusRes.data; // { status: 'SUCCESSFUL' | 'FAILED' | 'PENDING' }
    } catch (err) {
      logger.error(`MTN status check error: ${err.message}`);
      return { status: 'FAILED' };
    }
  }

  // ═══════════════════════════════════════════
  // ORANGE MONEY (Cameroun)
  // ═══════════════════════════════════════════

  async initiateOrangePayment(telegramId, plan, phoneNumber) {
    const planData = PREMIUM_PLANS[plan];
    if (!planData) throw new Error('Plan invalide');

    const orderId = `ORG_${telegramId}_${plan}_${Date.now()}`;

    try {
      // Orange Money Web Payment API
      const res = await axios.post(
        `${process.env.ORANGE_API_URL}/webpayment`,
        {
          merchant_key: process.env.ORANGE_API_KEY,
          currency: 'XAF',
          order_id: orderId,
          amount: planData.prices.orange_money,
          return_url: `${process.env.WEBHOOK_URL}/webhook/orange/return`,
          cancel_url: `${process.env.WEBHOOK_URL}/webhook/orange/cancel`,
          notif_url: `${process.env.WEBHOOK_URL}/webhook/orange/notify`,
          lang: 'fr',
          reference: `Football Bot Premium ${planData.name}`,
          customer_msisdn: phoneNumber
        }
      );

      return {
        paymentUrl: res.data.payment_url,
        orderId,
        status: 'pending'
      };
    } catch (err) {
      logger.error(`Orange Money error: ${err.message}`);
      throw new Error('Erreur Orange Money. Veuillez réessayer ou utiliser MTN.');
    }
  }

  // ═══════════════════════════════════════════
  // Activer premium après paiement confirmé
  // ═══════════════════════════════════════════

  async activatePremiumForUser(telegramId, plan, method, paymentRef) {
    const user = await User.findOne({ telegramId });
    if (!user) throw new Error('Utilisateur non trouvé');

    const planData = PREMIUM_PLANS[plan];
    await user.activatePremium(plan, {
      paymentId: paymentRef,
      method,
      amount: planData.prices[method] || 0,
      currency: method === 'stars' ? 'XTR' : 'XAF',
      plan,
      status: 'completed'
    });

    logger.info(`Premium activated: user ${telegramId}, plan ${plan}, method ${method}`);
    return user;
  }

  // ═══════════════════════════════════════════
  // Message de confirmation de paiement
  // ═══════════════════════════════════════════

  buildPaymentInstructions(method, plan, phoneNumber = null) {
    const planData = PREMIUM_PLANS[plan];
    const amount = planData.prices[method];

    if (method === 'mtn_momo') {
      return `
💛 *Paiement MTN Mobile Money*

📱 Numéro à débiter: \`${phoneNumber || 'Votre numéro MTN'}\`
💰 Montant: *${amount.toLocaleString()} FCFA*
📦 Plan: *${planData.name}*

*Étapes:*
1️⃣ Vous allez recevoir une demande de paiement sur votre téléphone
2️⃣ Confirmez avec votre code PIN MTN MoMo
3️⃣ Votre premium sera activé automatiquement ✅

⏳ Tapez /verifier_paiement après avoir confirmé`;
    }

    if (method === 'orange_money') {
      return `
🟠 *Paiement Orange Money*

📱 Numéro: \`${phoneNumber || 'Votre numéro Orange'}\`
💰 Montant: *${amount.toLocaleString()} FCFA*
📦 Plan: *${planData.name}*

*Procédure USSD:*
1️⃣ Composez *#144#
2️⃣ Sélectionnez "Paiement marchand"
3️⃣ Entrez le code marchand reçu
4️⃣ Confirmez le montant de ${amount.toLocaleString()} FCFA

⏳ Tapez /verifier_paiement après confirmation`;
    }

    return '';
  }
}

module.exports = new PaymentService();
