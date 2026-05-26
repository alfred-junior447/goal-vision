const moment = require('moment-timezone');
const { LEAGUES, CONFIDENCE_LEVELS } = require('../../config/constants');

const TZ = process.env.TIMEZONE || 'Africa/Douala';

// ─────────────────────────────────────────────────────
// Barre de probabilité visuelle
// ─────────────────────────────────────────────────────
function probBar(pct) {
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `${bar} *${pct}%*`;
}

// ─────────────────────────────────────────────────────
// Emoji de confiance
// ─────────────────────────────────────────────────────
function confidenceEmoji(confidence) {
  if (confidence >= 70) return '🔥';
  if (confidence >= 55) return '✅';
  return '⚠️';
}

// ─────────────────────────────────────────────────────
// Emoji forme
// ─────────────────────────────────────────────────────
function formEmoji(letter) {
  return { W: '🟢', D: '🟡', L: '🔴' }[letter] || '⚪';
}

function formatForm(formStr) {
  if (!formStr) return 'N/A';
  return formStr.split('').map(formEmoji).join(' ');
}

// ─────────────────────────────────────────────────────
// Formater liste des matchs du jour
// ─────────────────────────────────────────────────────
function formatMatchesList(fixtures, leagueName = null) {
  if (!fixtures.length) return '📭 Aucun match trouvé pour aujourd\'hui.';

  // Grouper par ligue
  const grouped = {};
  for (const f of fixtures) {
    const lid = f.league.id;
    const lname = LEAGUES[lid]?.name || f.league.name;
    if (!grouped[lname]) grouped[lname] = [];
    grouped[lname].push(f);
  }

  let msg = `📅 *Matchs du ${moment().tz(TZ).format('DD/MM/YYYY')}*\n\n`;

  for (const [league, matches] of Object.entries(grouped)) {
    const info = Object.values(LEAGUES).find(l => l.name === league);
    msg += `${info?.flag || '🏆'} *${league}*\n`;

    for (const m of matches) {
      const time = moment(m.fixture.date).tz(TZ).format('HH:mm');
      const status = m.fixture.status.short;

      let scoreStr = '';
      if (['1H', '2H', 'HT', 'FT', 'ET', 'P'].includes(status)) {
        scoreStr = ` *${m.goals.home ?? 0}-${m.goals.away ?? 0}*`;
        if (status === 'FT') scoreStr += ' ✅';
        else scoreStr += ` ⚡${m.fixture.status.elapsed}'`;
      }

      msg += `  ⏰ ${time} │ ${m.teams.home.name}${scoreStr} vs ${m.teams.away.name}\n`;
      msg += `  └ /pred_${m.fixture.id}\n`;
    }
    msg += '\n';
  }

  return msg;
}

// ─────────────────────────────────────────────────────
// Formater une prédiction (version free)
// ─────────────────────────────────────────────────────
function formatPredictionFree(prediction) {
  const { match, prediction: pred, analysis } = prediction;
  const { homeTeam, awayTeam, league, date } = match;
  const { winner, confidence, probabilities } = pred;

  const winnerName = winner === 'home' ? homeTeam.name
    : winner === 'away' ? awayTeam.name : '🤝 Match nul';

  const confEmoji = confidenceEmoji(confidence);
  const dateStr = moment(date).tz(TZ).format('DD/MM à HH:mm');

  let msg = `
⚽ *PRÉDICTION*

🏆 ${league.name}
📅 ${dateStr}

🏠 *${homeTeam.name}*
✈️ *${awayTeam.name}*

━━━━━━━━━━━━━━━━━━
📊 *Probabilités*
🏠 Victoire domicile
${probBar(probabilities.home)}

🤝 Match nul
${probBar(probabilities.draw)}

✈️ Victoire extérieur
${probBar(probabilities.away)}
━━━━━━━━━━━━━━━━━━

${confEmoji} *Pronostic: ${winnerName}*
📈 Confiance: *${confidence}%*

📋 *Forme récente:*
🏠 ${homeTeam.name}: ${formatForm(analysis.formHome)}
✈️ ${awayTeam.name}: ${formatForm(analysis.formAway)}

🔒 *Score exact, BTTS, Over/Under, Analyse VIP*
→ Disponibles avec /premium 👑`;

  return msg;
}

// ─────────────────────────────────────────────────────
// Formater une prédiction (version VIP premium)
// ─────────────────────────────────────────────────────
function formatPredictionVip(prediction) {
  const { match, prediction: pred, analysis } = prediction;
  const { homeTeam, awayTeam, league, date } = match;
  const { winner, confidence, probabilities, predictedScore, btts, over25 } = pred;

  const winnerName = winner === 'home' ? homeTeam.name
    : winner === 'away' ? awayTeam.name : '🤝 Match nul';

  const confEmoji = confidenceEmoji(confidence);
  const dateStr = moment(date).tz(TZ).format('DD/MM à HH:mm');

  let msg = `
👑 *PRÉDICTION VIP*

🏆 ${league.name}
📅 ${dateStr}

🏠 *${homeTeam.name}*
✈️ *${awayTeam.name}*

━━━━━━━━━━━━━━━━━━
📊 *Probabilités*
🏠 Victoire domicile
${probBar(probabilities.home)}

🤝 Match nul
${probBar(probabilities.draw)}

✈️ Victoire extérieur
${probBar(probabilities.away)}
━━━━━━━━━━━━━━━━━━

${confEmoji} *Pronostic: ${winnerName}*
📈 Confiance: *${confidence}%*

🎯 *Score probable: ${predictedScore.home} - ${predictedScore.away}*

📈 *Marchés supplémentaires:*
⚽ Les deux marquent (BTTS): ${btts ? '✅ OUI' : '❌ NON'}
🔢 Plus de 2,5 buts: ${over25 ? '✅ OUI' : '❌ NON'}

📋 *Forme récente:*
🏠 ${homeTeam.name}: ${formatForm(analysis.formHome)}
✈️ ${awayTeam.name}: ${formatForm(analysis.formAway)}

📌 *H2H:* ${analysis.h2hSummary}

${analysis.keyFactors?.length ? '🔑 *Facteurs clés:*\n' + analysis.keyFactors.map(f => `• ${f}`).join('\n') : ''}

💡 *Analyse VIP:*
_${analysis.vipInsight}_

_⚡ Alerte VIP • Football Bot Pro_`;

  return msg;
}

// ─────────────────────────────────────────────────────
// Formater statistiques équipe
// ─────────────────────────────────────────────────────
function formatTeamStats(stats, teamName) {
  if (!stats) return `❌ Statistiques non disponibles pour *${teamName}*`;

  const p = stats.fixtures?.played || {};
  const wins = stats.fixtures?.wins || {};
  const draws = stats.fixtures?.draws || {};
  const loses = stats.fixtures?.loses || {};
  const gf = stats.goals?.for || {};
  const ga = stats.goals?.against || {};

  const total = p.total || 1;
  const winRate = Math.round((wins.total || 0) / total * 100);

  return `
📊 *Statistiques: ${teamName}*
🏆 ${stats.league?.name || 'N/A'} ${stats.league?.season || ''}

━━━━━━━━━━━━━━━━━━
📋 *Matchs joués: ${total}*
🟢 Victoires: ${wins.total || 0} (${winRate}%)
🟡 Nuls: ${draws.total || 0}
🔴 Défaites: ${loses.total || 0}

⚽ *Buts marqués: ${gf.total?.total || 0}*
  Domicile: ${gf.total?.home || 0}
  Extérieur: ${gf.total?.away || 0}
  Moy/match: ${gf.average?.total || 'N/A'}

🛡️ *Buts encaissés: ${ga.total?.total || 0}*
  Domicile: ${ga.total?.home || 0}
  Extérieur: ${ga.total?.away || 0}
  Moy/match: ${ga.average?.total || 'N/A'}

📐 *Clean sheets: ${stats.clean_sheet?.total || 0}*
💥 *Failed to score: ${stats.failed_to_score?.total || 0}*
━━━━━━━━━━━━━━━━━━`;
}

// ─────────────────────────────────────────────────────
// Formater score en direct
// ─────────────────────────────────────────────────────
function formatLiveMatch(fixture) {
  const { teams, goals, fixture: fix, league } = fixture;
  const elapsed = fix.status.elapsed || '?';
  const status = fix.status.long;

  return `
⚡ *EN DIRECT*

🏆 ${league.name}
⏱️ ${elapsed}' (${status})

🏠 *${teams.home.name}*
*${goals.home ?? 0} - ${goals.away ?? 0}*
✈️ *${teams.away.name}*`;
}

module.exports = {
  formatMatchesList,
  formatPredictionFree,
  formatPredictionVip,
  formatTeamStats,
  formatLiveMatch,
  formatForm,
  confidenceEmoji,
  probBar
};
