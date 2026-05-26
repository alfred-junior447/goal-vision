const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  fixtureId: { type: Number, required: true, index: true },
  type: {
    type: String,
    enum: ['match_start', 'goal', 'halftime', 'fulltime', 'vip_tip', 'daily_prediction'],
    required: true
  },
  message: { type: String, required: true },
  isPremium: { type: Boolean, default: false },
  sentTo: [{ type: Number }], // telegramIds
  sentAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed }
});

module.exports = mongoose.model('Alert', alertSchema);
