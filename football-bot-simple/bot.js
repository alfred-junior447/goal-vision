// ⚽ Football Prediction Bot — Version simplifiée
// Backend : fichier JSON (aucune base de données)
// Données : football-data.org (gratuit à vie : 5 grands championnats + C1)
// Paiement : Telegram Stars (automatique) + Mobile Money (validation admin)
// Dépendances : telegraf, axios, dotenv — c'est tout !

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ────────────────────────────────
// CONFIGURATION
// ────────────────────────────────
// Codes compétitions football-data.org (toutes gratuites à vie)
const LEAGUES = {
  PL: '🏴 Premier League',
  PD: '🇪🇸 La Liga',
  SA: '🇮🇹 Serie A',
  BL1: '🇩🇪 Bundesliga',
  FL1: '🇫🇷 Ligue 1',
  CL: '🏆 Ligue des Champions',
};

const PLANS = {
  semaine: { label: '7 jours', stars: 150, momo: 2000, days: 7 },
  mois: { label: '30 jours', stars: 500, momo: 6500, days: 30 },
  annee: { label: '1 an', stars: 4500, momo: 55000, days: 365 },
};

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean);
const MTN_NUMBER = process.env.MTN_NUMBER || '';
const ORANGE_NUMBER = process.env.ORANGE_NUMBER || '';
const TZ = process.env.TIMEZONE || 'Africa/Douala';
const DB_FILE = path.join(__dirname, 'data.json');
const isAdmin = (id) => ADMIN_IDS.includes(id);

// ────────────────────────────────
// "BASE DE DONNÉES" — un simple fichier JSON
// ────────────────────────────────
let db = { users: {}, pending: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  db.users = db.users || {};
  db.pending = db.pending || {};
} catch (e) { /* premier lancement : fichier absent */ }

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(id) {
  id = String(id);
  if (!db.users[id]) {
    db.users[id] = { name: '', premium: null, until: null, joined: new Date().toISOString() };
    saveDB();
  }
  return db.users[id];
}

function isPremium(user) {
  return !!user.premium && !!user.until && new Date(user.until) > new Date();
}

function grantPremium(id, plan) {
  const p = PLANS[plan];
  if (!p) return false;
  const user = getUser(id);
  const base = isPremium(user) ? new Date(user.until) : new Date();
  user.premium = plan;
  user.until = new Date(base.getTime() + p.days * 86400000).toISOString();
  saveDB();
  return true;
}

// ────────────────────────────────
// API football-data.org v4 (avec mini-cache 5 min)
// Compte gratuit : 10 requêtes/min, 5 grands championnats + C1 inclus à vie
// ────────────────────────────────
const api = axios.create({
  baseURL: 'https://api.football-data.org/v4',
  headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY },
  timeout: 10000,
});

const apiCache = new Map();
async function apiGet(url) {
  const hit = apiCache.get(url);
  if (hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.data;
  const res = await api.get(url);
  apiCache.set(url, { t: Date.now(), data: res.data });
  return res.data;
}

// Matchs du jour : 1 seule requête si possible, sinon 1 par compétition
async function getTodayMatches() {
  const d = new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  try {
    const data = await apiGet('/matches?dateFrom=' + d + '&dateTo=' + d);
    const list = (data.matches || []).filter((m) => LEAGUES[m.competition.code]);
    if (list.length) return list;
  } catch (e) { console.error('getTodayMatches /matches :', e.message); }
  // Repli : une requête par compétition
  const results = [];
  for (const code of Object.keys(LEAGUES)) {
    try {
      const data = await apiGet('/competitions/' + code + '/matches?dateFrom=' + d + '&dateTo=' + d);
      for (const m of data.matches || []) results.push(m);
    } catch (e) { console.error('getTodayMatches ' + code + ' :', e.message); }
  }
  return results;
}

async function getMatchById(id) {
  try {
    const data = await apiGet('/matches/' + id);
    return data;
  } catch (e) {
    return null;
  }
}

// Derniers matchs terminés d'une équipe
async function getTeamFinishedMatches(teamId) {
  try {
    const data = await apiGet('/teams/' + teamId + '/matches?status=FINISHED');
    return data.matches || [];
  } catch (e) {
    return [];
  }
}

// ────────────────────────────────
// OUTILS
// ────────────────────────────────
function esc(s) {
  return String(s || '').replace(/([_*\[])/g, '\\$1');
}

function matchTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function scoreOf(m) {
  const ft = m.score && m.score.fullTime;
  if (ft && (ft.home !== null || ft.away !== null)) return ft.home + '-' + ft.away;
  return '0-0';
}

function menuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📅 Matchs du jour', 'matchs'), Markup.button.callback('⚡ En direct', 'live')],
    [Markup.button.callback('👑 Premium', 'premium'), Markup.button.callback('👤 Mon compte', 'compte')],
  ]);
}

// ────────────────────────────────
// MOTEUR DE PRÉDICTION
// Basé sur les 5 derniers matchs de chaque équipe
// ────────────────────────────────
function analyzeLastMatches(teamId, matches) {
  let points = 0, scored = 0, conceded = 0, n = 0;
  for (const m of matches.slice(-5)) {
    const isHome = m.homeTeam.id === teamId;
    const ft = m.score.fullTime;
    if (!ft || ft.home === null || ft.away === null) continue;
    const gf = isHome ? ft.home : ft.away;
    const ga = isHome ? ft.away : ft.home;
    points += gf > ga ? 3 : (gf === ga ? 1 : 0);
    scored += gf;
    conceded += ga;
    n++;
  }
  return {
    points,
    attack: n ? scored / n : 1.2,   // buts marqués / match
    defense: n ? conceded / n : 1.2, // buts encaissés / match
  };
}

function predict(homeStats, awayStats) {
  const homeAdvantage = 0.2;
  const hStrength = homeStats.attack / Math.max(awayStats.defense, 0.5) + homeAdvantage;
  const aStrength = awayStats.attack / Math.max(homeStats.defense, 0.5);
  const formDiff = (homeStats.points - awayStats.points) / 15;

  const rawH = hStrength + formDiff * 0.3;
  const rawA = aStrength - formDiff * 0.3;
  const rawD = 1.0;
  const total = rawH + rawA + rawD;

  let pH = Math.round((rawH / total) * 100);
  let pA = Math.round((rawA / total) * 100);
  let pD = 100 - pH - pA;
  pH = Math.min(85, Math.max(10, pH));
  pA = Math.min(85, Math.max(10, pA));
  pD = 100 - pH - pA;

  const expH = Math.max(0.3, (homeStats.attack * awayStats.defense / 1.35) * 1.1);
  const expA = Math.max(0.3, (awayStats.attack * homeStats.defense / 1.35) * 0.9);
  const score = { home: Math.round(expH), away: Math.round(expA) };
  const over25 = expH + expA > 2.5;
  const btts = expH >= 1 && expA >= 1;

  let winner = 'X (nul)';
  if (pH >= pA && pH >= pD) winner = '1 (domicile)';
  else if (pA > pH && pA > pD) winner = '2 (extérieur)';

  return { pH, pD, pA, score, over25, btts, winner };
}

async function buildPrediction(match) {
  const [homeMatches, awayMatches] = await Promise.all([
    getTeamFinishedMatches(match.homeTeam.id),
    getTeamFinishedMatches(match.awayTeam.id),
  ]);
  const homeStats = analyzeLastMatches(match.homeTeam.id, homeMatches);
  const awayStats = analyzeLastMatches(match.awayTeam.id, awayMatches);
  return predict(homeStats, awayStats);
}

// ────────────────────────────────
// COMMANDES
// ────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
  const user = getUser(ctx.from.id);
  user.name = ctx.from.first_name || '';
  saveDB();
  const msg =
    '⚽ *Bienvenue ' + esc(ctx.from.first_name || '') + ' !*\n\n' +
    'Ton bot de pronostics foot :\n\n' +
    '📅 /matchs — Matchs du jour\n' +
    '⚡ /live — Scores en direct\n' +
    '🔮 Clique sur /pred_XXX sous un match pour la prédiction\n' +
    '👑 /premium — Passer VIP\n' +
    '👤 /compte — Mon profil';
  return ctx.replyWithMarkdown(msg, menuKeyboard());
});
bot.command('help', (ctx) => ctx.reply(
  '📅 /matchs\n⚡ /live\n👑 /premium\n👤 /compte\n🔮 /pred_XXX (XXX = ID du match affiché dans /matchs)'
));

// ── Matchs du jour ──
async function handleMatches(ctx) {
  if (ctx.answerCbQuery) ctx.answerCbQuery().catch(() => {});
  const wait = await ctx.reply('🔄 Chargement...');
  try {
    const list = (await getTodayMatches()).slice(0, 10);
    if (!list.length) {
      await ctx.reply('📭 Aucun match aujourd\'hui dans les grandes compétitions.');
    } else {
      let msg = '⚽ *MATCHS DU JOUR*\n\n';
      for (const m of list) {
        let time;
        if (m.status === 'IN_PLAY' || m.status === 'PAUSED') time = '🔴 ' + scoreOf(m);
        else if (m.status === 'FINISHED') time = 'FT ' + scoreOf(m);
        else time = matchTime(m.utcDate);
        msg += (LEAGUES[m.competition.code] || m.competition.name) + '\n' +
          esc(m.homeTeam.name) + ' vs ' + esc(m.awayTeam.name) + ' — ' + time + '\n' +
          '🔮 /pred_' + m.id + '\n\n';
      }
      await ctx.replyWithMarkdown(msg);
    }
  } catch (e) {
    console.error('handleMatches:', e.message);
    await ctx.reply('❌ Erreur lors du chargement des matchs. Réessaie plus tard.');
  }
  ctx.deleteMessage(wait.message_id).catch(() => {});
}
bot.command('matchs', handleMatches);
bot.action('matchs', handleMatches);

// ── Scores en direct ──
async function handleLive(ctx) {
  if (ctx.answerCbQuery) ctx.answerCbQuery().catch(() => {});
  const wait = await ctx.reply('🔄 Chargement...');
  try {
    const list = (await getTodayMatches())
      .filter((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
      .slice(0, 12);
    if (!list.length) {
      await ctx.reply('📭 Aucun match en cours. Tape /matchs pour les prochains.\n(Le plan gratuit peut avoir un léger retard sur les scores en direct.)');
    } else {
      let msg = '⚡ *EN DIRECT*\n\n';
      for (const m of list) {
        msg += (LEAGUES[m.competition.code] || m.competition.name) + '\n' +
          esc(m.homeTeam.name) + ' ' + scoreOf(m) + ' ' + esc(m.awayTeam.name) + ' (' + m.score.minuteOrStatus || '...' + ')\n\n';
      }
      await ctx.replyWithMarkdown(msg);
    }
  } catch (e) {
    console.error('handleLive:', e.message);
    await ctx.reply('❌ Erreur lors du chargement des scores.');
  }
  ctx.deleteMessage(wait.message_id).catch(() => {});
}
bot.command('live', handleLive);
bot.action('live', handleLive);

// ── Prédiction d'un match : /pred_123456 ──
bot.hears(/^\/pred_(\d+)$/, async (ctx) => {
  const wait = await ctx.reply('🔮 Calcul de la prédiction...');
  try {
    const m = await getMatchById(ctx.match[1]);
    if (!m) {
      await ctx.reply('❌ Match introuvable.');
    } else {
      const p = await buildPrediction(m);
      const premium = isPremium(getUser(ctx.from.id));
      let msg =
        '🔮 *PRÉDICTION*\n' + (LEAGUES[m.competition.code] || m.competition.name) + '\n' +
        esc(m.homeTeam.name) + ' vs ' + esc(m.awayTeam.name) + ' — ' + matchTime(m.utcDate) + '\n\n' +
        '1 : ' + p.pH + '%   X : ' + p.pD + '%   2 : ' + p.pA + '%\n' +
        '👉 Pronostic : *' + p.winner + '*\n';
      if (premium) {
        msg +=
          '\n👑 *Analyse VIP*\n' +
          '🎯 Score probable : ' + p.score.home + ' - ' + p.score.away + '\n' +
          '📊 Plus de 2,5 buts : ' + (p.over25 ? '✅ Oui' : '❌ Non') + '\n' +
          '🥅 Les 2 équipes marquent : ' + (p.btts ? '✅ Oui' : '❌ Non');
      } else {
        msg += '\n👑 *VIP* : score exact, +2,5 buts, BTTS...\nTape /premium pour débloquer 🔓';
      }
      await ctx.replyWithMarkdown(msg);
    }
  } catch (e) {
    console.error('prediction:', e.message);
    await ctx.reply('❌ Erreur lors du calcul. Réessaie plus tard.');
  }
  ctx.deleteMessage(wait.message_id).catch(() => {});
});

// ── Premium : offres + paiement ──
function premiumMessage() {
  let msg = '👑 *PASSER PREMIUM*\n\n';
  for (const key of Object.keys(PLANS)) {
    const p = PLANS[key];
    msg += '⭐ ' + p.label + ' : ' + p.stars + ' Stars — ou ' + p.momo + ' FCFA\n';
  }
  msg += '\n✅ VIP = score exact, +2,5 buts, BTTS\n\n';
  if (MTN_NUMBER) msg += '💛 MTN MoMo : ' + MTN_NUMBER + '\n';
  if (ORANGE_NUMBER) msg += '🟠 Orange Money : ' + ORANGE_NUMBER + '\n';
  if (MTN_NUMBER || ORANGE_NUMBER) {
    msg += '\nAprès paiement Mobile Money, envoie :\n/preuve <ID transaction> <semaine|mois|annee>';
  }
  return msg;
}

function premiumKeyboard() {
  return Markup.inlineKeyboard(
    Object.keys(PLANS).map((key) => [
      Markup.button.callback('⭐ ' + PLANS[key].label + ' (' + PLANS[key].stars + '★)', 'pay_stars:' + key),
    ])
  );
}

bot.command('premium', (ctx) => ctx.replyWithMarkdown(premiumMessage(), premiumKeyboard()));
bot.action('premium', (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  return ctx.replyWithMarkdown(premiumMessage(), premiumKeyboard());
});

// ── Paiement Telegram Stars (100% automatique) ──
bot.action(/^pay_stars:(\w+)$/, (ctx) => {
  const plan = PLANS[ctx.match[1]];
  if (!plan) return ctx.answerCbQuery('Plan invalide');
  return ctx.replyWithInvoice({
    title: 'Premium ' + plan.label,
    description: 'Accès VIP aux pronostics complets pendant ' + plan.label,
    payload: 'premium:' + ctx.match[1],
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Premium ' + plan.label, amount: plan.stars }],
  });
});

bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('successful_payment', (ctx) => {
  const plan = ctx.message.successful_payment.invoice_payload.split(':')[1];
  if (grantPremium(ctx.from.id, plan)) {
    return ctx.replyWithMarkdown(
      '✅ *Paiement Stars confirmé !*\n👑 Premium ' + PLANS[plan].label + ' activé 🎉\n\nTape /start'
    );
  }
});

// ── Paiement Mobile Money (validation manuelle par l'admin) ──
bot.command('preuve', (ctx) => {
  const parts = ctx.message.text.split(/\s+/);
  const ref = parts[1];
  const plan = parts[2];
  if (!ref || !PLANS[plan]) {
    return ctx.reply('Usage : /preuve <ID transaction> <semaine|mois|annee>');
  }
  db.pending[ref] = {
    user: ctx.from.id,
    plan: plan,
    name: ctx.from.first_name || '',
    date: new Date().toISOString(),
  };
  saveDB();
  for (const adminId of ADMIN_IDS) {
    bot.telegram.sendMessage(
      adminId,
      '💳 *Nouveau paiement à vérifier*\n\n' +
        'De : ' + esc(ctx.from.first_name) + ' (' + ctx.from.id + ')\n' +
        'Plan : ' + PLANS[plan].label + '\n' +
        'Réf : ' + esc(ref) + '\n\n' +
        '/valider ' + ref + '\n/refuser ' + ref,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
  return ctx.reply('✅ Preuve reçue ! Un admin va valider ton paiement sous peu. ⏳');
});

bot.command('valider', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const ref = ctx.message.text.split(/\s+/)[1];
  const p = db.pending[ref];
  if (!p) return ctx.reply('❌ Référence inconnue. /paiements pour la liste.');
  delete db.pending[ref];
  grantPremium(p.user, p.plan);
  saveDB();
  bot.telegram.sendMessage(
    p.user,
    '👑 *Premium activé !* Merci pour ta confiance 🎉\n\nTape /start',
    { parse_mode: 'Markdown' }
  ).catch(() => {});
  return ctx.reply('✅ Premium ' + PLANS[p.plan].label + ' activé pour ' + p.user);
});

bot.command('refuser', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const ref = ctx.message.text.split(/\s+/)[1];
  const p = db.pending[ref];
  if (!p) return ctx.reply('❌ Référence inconnue.');
  delete db.pending[ref];
  saveDB();
  bot.telegram.sendMessage(p.user, '❌ Ton paiement n\'a pas pu être validé. Vérifie la référence ou contacte un admin.').catch(() => {});
  return ctx.reply('🗑 Paiement refusé.');
});

bot.command('paiements', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const refs = Object.keys(db.pending);
  if (!refs.length) return ctx.reply('📭 Aucun paiement en attente.');
  let msg = '💳 *Paiements en attente*\n\n';
  for (const ref of refs) {
    const p = db.pending[ref];
    msg += esc(p.name) + ' (' + p.user + ') — ' + PLANS[p.plan].label + '\n' +
      'Réf : ' + esc(ref) + '\n/valider ' + ref + '\n\n';
  }
  return ctx.replyWithMarkdown(msg);
});

// ── Commandes admin ──
bot.command('addpremium', (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const parts = ctx.message.text.split(/\s+/);
  if (grantPremium(Number(parts[1]), parts[2])) {
    bot.telegram.sendMessage(Number(parts[1]), '👑 *Premium activé par un admin !* 🎉', { parse_mode: 'Markdown' }).catch(() => {});
    return ctx.reply('✅ Premium ' + PLANS[parts[2]].label + ' activé pour ' + parts[1]);
  }
  return ctx.reply('Usage : /addpremium <telegramId> <semaine|mois|annee>');
});

bot.command('broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply('Usage : /broadcast <message>');
  const ids = Object.keys(db.users);
  for (const id of ids) {
    await bot.telegram.sendMessage(id, text).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
  }
  return ctx.reply('📣 Envoyé à ' + ids.length + ' utilisateurs.');
});

// ── Mon compte ──
function accountMessage(ctx) {
  const user = getUser(ctx.from.id);
  let msg = '👤 *Mon compte*\n\nID : ' + ctx.from.id + '\n';
  if (isPremium(user)) {
    msg += '👑 Premium : ' + PLANS[user.premium].label + '\n' +
      '⏰ Expire le : ' + new Date(user.until).toLocaleDateString('fr-FR');
  } else {
    msg += 'Plan gratuit — tape /premium pour passer VIP 👑';
  }
  return msg;
}
bot.command('compte', (ctx) => ctx.replyWithMarkdown(accountMessage(ctx), menuKeyboard()));
bot.action('compte', (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  return ctx.replyWithMarkdown(accountMessage(ctx), menuKeyboard());
});
bot.action('menu', (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  return ctx.replyWithMarkdown('🏠 *Menu principal*', menuKeyboard());
});

// ────────────────────────────────
// DÉMARRAGE
// ────────────────────────────────
// Mini serveur HTTP : utile pour l'hébergement (Render) et le ping anti-sommeil
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot actif ✅');
}).listen(port, () => console.log('Health check : http://localhost:' + port));

bot.catch((err) => {
  console.error('Erreur bot :', err.message);
});

bot.launch().then(() => console.log('🚀 Bot démarré (mode polling) !'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
