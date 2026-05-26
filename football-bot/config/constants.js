module.exports = {
  // Ligues suivies (IDs API-Football)
  LEAGUES: {
    39:  { name: 'Premier League',     flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'England'  },
    140: { name: 'La Liga',            flag: '🇪🇸', country: 'Spain'    },
    135: { name: 'Serie A',            flag: '🇮🇹', country: 'Italy'    },
    78:  { name: 'Bundesliga',         flag: '🇩🇪', country: 'Germany'  },
    61:  { name: 'Ligue 1',            flag: '🇫🇷', country: 'France'   },
    2:   { name: 'Champions League',   flag: '⭐', country: 'Europe'   },
    3:   { name: 'Europa League',      flag: '🟠', country: 'Europe'   },
    529: { name: 'Coupe du Cameroun',  flag: '🇨🇲', country: 'Cameroon' },
    530: { name: 'MTN Elite One',      flag: '🇨🇲', country: 'Cameroon' }
  },

  // Plans premium
  PREMIUM_PLANS: {
    weekly: {
      name: '1 Semaine',
      days: 7,
      prices: {
        stars: 150,            // Telegram Stars
        orange_money: 2000,   // XAF
        mtn_momo: 2000        // XAF
      },
      emoji: '⚡'
    },
    monthly: {
      name: '1 Mois',
      days: 30,
      prices: {
        stars: 500,
        orange_money: 6500,
        mtn_momo: 6500
      },
      emoji: '🔥'
    },
    yearly: {
      name: '1 An',
      days: 365,
      prices: {
        stars: 4500,
        orange_money: 55000,
        mtn_momo: 55000
      },
      emoji: '👑'
    }
  },

  // Avantages premium
  PREMIUM_FEATURES: [
    '🎯 Prédictions avancées avec IA',
    '⚽ Score probable (ex: 2-1)',
    '📊 Statistiques détaillées H2H',
    '🔔 Alertes VIP en temps réel',
    '💡 Analyse tactique exclusive',
    '📈 Both Teams To Score + Over/Under',
    '🏆 Accès toutes les ligues',
    '⚡ Notifications de buts instantanées'
  ],

  // Seuils de confiance
  CONFIDENCE_LEVELS: {
    HIGH: { min: 70, label: '🔥 Haute confiance',    emoji: '🔥' },
    MED:  { min: 55, label: '✅ Confiance moyenne',  emoji: '✅' },
    LOW:  { min: 0,  label: '⚠️ Incertain',          emoji: '⚠️' }
  },

  // Callbacks
  CB: {
    MATCHES_TODAY:   'matches_today',
    MATCHES_LEAGUE:  'matches_league',
    TEAM_STATS:      'team_stats',
    PREDICTION:      'prediction',
    PREMIUM_INFO:    'premium_info',
    BUY_PREMIUM:     'buy_premium',
    PAY_STARS:       'pay_stars',
    PAY_ORANGE:      'pay_orange',
    PAY_MTN:         'pay_mtn',
    MY_ACCOUNT:      'my_account',
    TOGGLE_NOTIF:    'toggle_notif',
    FAVORITES:       'favorites',
    LIVE_SCORES:     'live_scores'
  }
};
