const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  username: String,
  firstName: String,
  lastName: String,
  languageCode: { type: String, default: 'fr' },

  // Système Premium
  isPremium: { type: Boolean, default: false },
  premiumExpiry: { type: Date, default: null },
  premiumPlan: {
    type: String,
    enum: ['free', 'weekly', 'monthly', 'yearly'],
    default: 'free'
  },

  // Alertes & Notifications
  notifications: {
    matchStart: { type: Boolean, default: true },
    goals: { type: Boolean, default: true },
    vipAlerts: { type: Boolean, default: false },
    dailyPredictions: { type: Boolean, default: true }
  },

  // Équipes favorites
  favoriteTeams: [{ type: Number }],
  favoriteLeagues: [{ type: Number }],

  // Statistiques utilisateur
  stats: {
    predictionsViewed: { type: Number, default: 0 },
    correctPredictions: { type: Number, default: 0 },
    totalPredictions: { type: Number, default: 0 }
  },

  // Paiements
  payments: [{
    paymentId: String,
    method: { type: String, enum: ['stars', 'orange_money', 'mtn_momo'] },
    amount: Number,
    currency: String,
    plan: String,
    status: { type: String, enum: ['pending', 'completed', 'failed'] },
    createdAt: { type: Date, default: Date.now }
  }],

  // Tokens de référence
  referralCode: String,
  referredBy: { type: Number, default: null },
  referralCount: { type: Number, default: 0 },

  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now }
});

// Méthodes virtuelles
userSchema.virtual('isPremiumActive').get(function () {
  if (!this.isPremium) return false;
  if (!this.premiumExpiry) return false;
  return new Date() < this.premiumExpiry;
});

userSchema.methods.activatePremium = async function (plan, paymentData) {
  const durations = {
    weekly: 7,
    monthly: 30,
    yearly: 365
  };
  const days = durations[plan] || 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);

  this.isPremium = true;
  this.premiumExpiry = expiry;
  this.premiumPlan = plan;
  this.notifications.vipAlerts = true;

  if (paymentData) {
    this.payments.push(paymentData);
  }

  return this.save();
};

module.exports = mongoose.model('User', userSchema);
