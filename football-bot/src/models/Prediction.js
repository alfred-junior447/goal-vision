const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  fixtureId: { type: Number, required: true, unique: true, index: true },

  // Infos match
  match: {
    homeTeam: { id: Number, name: String, logo: String },
    awayTeam: { id: Number, name: String, logo: String },
    league: { id: Number, name: String, country: String, logo: String },
    date: Date,
    status: { type: String, default: 'NS' },
    score: {
      home: { type: Number, default: null },
      away: { type: Number, default: null }
    }
  },

  // Prédictions calculées
  prediction: {
    winner: { type: String, enum: ['home', 'away', 'draw', null], default: null },
    confidence: { type: Number, min: 0, max: 100 },
    probabilities: {
      home: { type: Number, min: 0, max: 100 },
      draw: { type: Number, min: 0, max: 100 },
      away: { type: Number, min: 0, max: 100 }
    },
    // Score probable (VIP)
    predictedScore: {
      home: { type: Number, default: null },
      away: { type: Number, default: null }
    },
    btts: { type: Boolean, default: null },   // Both Teams To Score
    over25: { type: Boolean, default: null }, // Over 2.5 goals
    trend: { type: String, enum: ['strong_home', 'home', 'balanced', 'away', 'strong_away'] }
  },

  // Analyse statistique
  analysis: {
    formHome: String,
    formAway: String,
    h2hSummary: String,
    keyFactors: [String],
    vipInsight: String  // Analyse exclusive premium
  },

  // Résultat réel (pour calcul accuracy)
  result: {
    winner: { type: String, enum: ['home', 'away', 'draw', null], default: null },
    correct: { type: Boolean, default: null }
  },

  isPremiumOnly: { type: Boolean, default: false },
  generatedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

predictionSchema.index({ 'match.date': 1 });
predictionSchema.index({ 'match.league.id': 1 });

module.exports = mongoose.model('Prediction', predictionSchema);
