const apiFootball = require('./apiFootball');
const Prediction = require('../models/Prediction');
const logger = require('../utils/logger');

class PredictionEngine {

  // ─────────────────────────────────────────────────────
  // Calculer forme (points sur 5 derniers matchs)
  // ─────────────────────────────────────────────────────
  _formScore(formStr) {
    if (!formStr) return 50;
    return formStr.split('').reduce((acc, r) => {
      if (r === 'W') return acc + 3;
      if (r === 'D') return acc + 1;
      return acc;
    }, 0);
  }

  // ─────────────────────────────────────────────────────
  // Analyser H2H
  // ─────────────────────────────────────────────────────
  _analyzeH2H(h2hFixtures, homeTeamId) {
    if (!h2hFixtures.length) return { homeWins: 0, draws: 0, awayWins: 0, total: 0 };

    let homeWins = 0, draws = 0, awayWins = 0;
    const last = h2hFixtures.slice(0, 10);

    for (const f of last) {
      const { home, away } = f.teams;
      const { home: hg, away: ag } = f.goals;
      if (hg === ag) { draws++; continue; }
      const winner = hg > ag ? home.id : away.id;
      if (winner === homeTeamId) homeWins++;
      else awayWins++;
    }

    return { homeWins, draws, awayWins, total: last.length };
  }

  // ─────────────────────────────────────────────────────
  // Calculer stats d'attaque/défense
  // ─────────────────────────────────────────────────────
  _extractStatsScore(teamStats) {
    if (!teamStats) return { attack: 1.2, defense: 1.2 };

    const played = teamStats.fixtures?.played?.total || 1;
    const goalsFor = teamStats.goals?.for?.total?.total || 0;
    const goalsAgainst = teamStats.goals?.against?.total?.total || 0;

    return {
      attack: goalsFor / played,
      defense: goalsAgainst / played
    };
  }

  // ─────────────────────────────────────────────────────
  // Score de probabilité (algorithme Elo-inspired)
  // ─────────────────────────────────────────────────────
  _calculateProbabilities(homeData, awayData, h2h) {
    const { formScore: hForm, stats: hStats } = homeData;
    const { formScore: aForm, stats: aStats } = awayData;

    // Avantage terrain (domicile)
    const homeAdvantage = 0.15;

    // Score attaque vs défense adverse
    const homeStrength = (hStats.attack / Math.max(aStats.defense, 0.5)) + homeAdvantage;
    const awayStrength = (aStats.attack / Math.max(hStats.defense, 0.5));

    // Forme récente (normalisée sur 15 points max)
    const formFactor = (hForm - aForm) / 15;

    // H2H factor
    let h2hFactor = 0;
    if (h2h.total > 0) {
      h2hFactor = ((h2h.homeWins - h2h.awayWins) / h2h.total) * 0.1;
    }

    // Score brut
    let rawHome = homeStrength + formFactor * 0.3 + h2hFactor;
    let rawAway = awayStrength - formFactor * 0.2 - h2hFactor;
    let rawDraw = 1.0; // baseline

    // Normalisation
    const total = rawHome + rawAway + rawDraw;
    let probHome = Math.round((rawHome / total) * 100);
    let probAway = Math.round((rawAway / total) * 100);
    let probDraw = 100 - probHome - probAway;

    // Clamp
    probHome = Math.max(10, Math.min(85, probHome));
    probAway = Math.max(10, Math.min(85, probAway));
    probDraw = Math.max(5, Math.min(40, probDraw));

    // Re-normaliser
    const sum = probHome + probAway + probDraw;
    probHome = Math.round(probHome / sum * 100);
    probAway = Math.round(probAway / sum * 100);
    probDraw = 100 - probHome - probAway;

    return { home: probHome, draw: probDraw, away: probAway };
  }

  // ─────────────────────────────────────────────────────
  // Prédire le score probable (VIP)
  // ─────────────────────────────────────────────────────
  _predictScore(homeStats, awayStats) {
    const leagueAvg = 1.4; // Buts/équipe en moyenne

    const homeExpected = (homeStats.attack * awayStats.defense / leagueAvg) * 1.1;
    const awayExpected = (awayStats.attack * homeStats.defense / leagueAvg) * 0.9;

    return {
      home: Math.round(Math.max(0, Math.min(5, homeExpected))),
      away: Math.round(Math.max(0, Math.min(5, awayExpected)))
    };
  }

  // ─────────────────────────────────────────────────────
  // Générer prédiction complète pour un match
  // ─────────────────────────────────────────────────────
  async generatePrediction(fixture) {
    const fixtureId = fixture.fixture.id;
    const homeTeam = fixture.teams.home;
    const awayTeam = fixture.teams.away;
    const league = fixture.league;

    try {
      // Check cache MongoDB
      const existing = await Prediction.findOne({ fixtureId });
      if (existing && (Date.now() - existing.generatedAt) < 3600000) {
        return existing;
      }

      // Récupérer données en parallèle
      const [homeStats, awayStats, h2hFixtures, homeForm, awayForm] = await Promise.all([
        apiFootball.getTeamStatistics(homeTeam.id, league.id),
        apiFootball.getTeamStatistics(awayTeam.id, league.id),
        apiFootball.getH2H(homeTeam.id, awayTeam.id, 10),
        apiFootball.getTeamForm(homeTeam.id, 5),
        apiFootball.getTeamForm(awayTeam.id, 5)
      ]);

      const hStats = this._extractStatsScore(homeStats);
      const aStats = this._extractStatsScore(awayStats);
      const hForm = this._formScore(homeForm);
      const aForm = this._formScore(awayForm);
      const h2h = this._analyzeH2H(h2hFixtures, homeTeam.id);

      const probabilities = this._calculateProbabilities(
        { formScore: hForm, stats: hStats },
        { formScore: aForm, stats: aStats },
        h2h
      );

      const predictedScore = this._predictScore(hStats, aStats);

      // Déterminer gagnant prédit
      const maxProb = Math.max(probabilities.home, probabilities.draw, probabilities.away);
      let winner = 'draw';
      let confidence = maxProb;
      if (probabilities.home === maxProb) winner = 'home';
      else if (probabilities.away === maxProb) winner = 'away';

      // Over 2.5 & BTTS
      const totalExpected = (hStats.attack + aStats.attack);
      const over25 = totalExpected > 2.5;
      const btts = hStats.attack > 1.0 && aStats.attack > 1.0;

      // Tendance
      let trend = 'balanced';
      if (probabilities.home >= 60) trend = 'strong_home';
      else if (probabilities.home >= 50) trend = 'home';
      else if (probabilities.away >= 60) trend = 'strong_away';
      else if (probabilities.away >= 50) trend = 'away';

      // Facteurs clés
      const keyFactors = [];
      if (hForm.includes('WWW')) keyFactors.push(`${homeTeam.name} en excellente forme`);
      if (aForm.includes('LLL')) keyFactors.push(`${awayTeam.name} en mauvaise passe`);
      if (h2h.homeWins > h2h.awayWins * 2) keyFactors.push(`Historique favorable à ${homeTeam.name}`);
      if (hStats.defense < 0.8) keyFactors.push(`Défense solide de ${homeTeam.name}`);
      if (totalExpected > 3) keyFactors.push('Match à haute intensité offensive attendu');

      const predictionDoc = {
        fixtureId,
        match: {
          homeTeam: { id: homeTeam.id, name: homeTeam.name, logo: homeTeam.logo },
          awayTeam: { id: awayTeam.id, name: awayTeam.name, logo: awayTeam.logo },
          league: { id: league.id, name: league.name, country: league.country, logo: league.logo },
          date: new Date(fixture.fixture.date),
          status: fixture.fixture.status.short
        },
        prediction: {
          winner,
          confidence,
          probabilities,
          predictedScore,
          btts,
          over25,
          trend
        },
        analysis: {
          formHome: homeForm || 'N/A',
          formAway: awayForm || 'N/A',
          h2hSummary: `${h2h.homeWins}V - ${h2h.draws}N - ${h2h.awayWins}D sur ${h2h.total} matchs`,
          keyFactors,
          vipInsight: this._generateVipInsight(homeTeam.name, awayTeam.name, probabilities, homeStats, awayStats)
        },
        generatedAt: new Date(),
        updatedAt: new Date()
      };

      // Sauvegarder en MongoDB
      const pred = await Prediction.findOneAndUpdate(
        { fixtureId },
        predictionDoc,
        { upsert: true, new: true }
      );

      return pred;
    } catch (err) {
      logger.error(`Prediction error for fixture ${fixtureId}: ${err.message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────
  // Insight VIP exclusif
  // ─────────────────────────────────────────────────────
  _generateVipInsight(homeName, awayName, probs, hStats, aStats) {
    const insights = [];

    if (probs.home > 60) {
      insights.push(`📍 ${homeName} est clairement favoris. Notre modèle donne ${probs.home}% de chance de victoire à domicile.`);
    } else if (probs.away > 55) {
      insights.push(`📍 Malgré le déplacement, ${awayName} semble plus solide. Ne pas sous-estimer leur force de frappe.`);
    } else {
      insights.push(`📍 Match très équilibré. Le nul est une option sérieuse (${probs.draw}%).`);
    }

    if (hStats.attack > 1.8) {
      insights.push(`⚽ ${homeName} marque en moyenne ${hStats.attack.toFixed(1)} buts/match - attendez-vous à du spectacle.`);
    }
    if (aStats.defense < 0.9) {
      insights.push(`🛡️ ${awayName} défend très bien (${aStats.defense.toFixed(1)} buts encaissés/match).`);
    }

    return insights.join(' ');
  }

  // ─────────────────────────────────────────────────────
  // Mettre à jour les résultats réels
  // ─────────────────────────────────────────────────────
  async updateResults(fixtureId) {
    const fixture = await apiFootball.getFixtureById(fixtureId);
    if (!fixture || fixture.fixture.status.short !== 'FT') return;

    const pred = await Prediction.findOne({ fixtureId });
    if (!pred) return;

    const { home: hg, away: ag } = fixture.goals;
    let actualWinner = 'draw';
    if (hg > ag) actualWinner = 'home';
    else if (ag > hg) actualWinner = 'away';

    pred.match.score = { home: hg, away: ag };
    pred.match.status = 'FT';
    pred.result = {
      winner: actualWinner,
      correct: pred.prediction.winner === actualWinner
    };
    await pred.save();
  }
}

module.exports = new PredictionEngine();
