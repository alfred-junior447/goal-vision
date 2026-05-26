const axios = require('axios');
const logger = require('../utils/logger');

class ApiFootballService {
  constructor() {
    this.client = axios.create({
      baseURL: `https://${process.env.API_FOOTBALL_HOST}`,
      headers: {
        'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
        'x-rapidapi-host': process.env.API_FOOTBALL_HOST
      },
      timeout: 10000
    });

    // Cache simple en mémoire
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  _cacheKey(endpoint, params) {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  _fromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  _toCache(key, data) {
    this.cache.set(key, { data, time: Date.now() });
  }

  async get(endpoint, params = {}) {
    const key = this._cacheKey(endpoint, params);
    const cached = this._fromCache(key);
    if (cached) return cached;

    try {
      const res = await this.client.get(endpoint, { params });
      const data = res.data;
      this._toCache(key, data);
      return data;
    } catch (err) {
      logger.error(`API-Football error [${endpoint}]: ${err.message}`);
      throw err;
    }
  }

  // ── Matchs du jour ──────────────────────────────────
  async getFixturesToday(leagueId = null) {
    const today = new Date().toISOString().split('T')[0];
    const params = { date: today, timezone: process.env.TIMEZONE || 'Africa/Douala' };
    if (leagueId) params.league = leagueId;

    const data = await this.get('/fixtures', params);
    return data.response || [];
  }

  // ── Matchs en direct ────────────────────────────────
  async getLiveFixtures() {
    const data = await this.get('/fixtures', { live: 'all' });
    return data.response || [];
  }

  // ── Fixture par ID ───────────────────────────────────
  async getFixtureById(fixtureId) {
    const data = await this.get('/fixtures', { id: fixtureId });
    return data.response?.[0] || null;
  }

  // ── Stats d'une équipe ───────────────────────────────
  async getTeamStatistics(teamId, leagueId, season = 2024) {
    const data = await this.get('/teams/statistics', {
      team: teamId,
      league: leagueId,
      season
    });
    return data.response || null;
  }

  // ── Infos équipe ─────────────────────────────────────
  async getTeamInfo(teamId) {
    const data = await this.get('/teams', { id: teamId });
    return data.response?.[0] || null;
  }

  // ── Recherche équipe ─────────────────────────────────
  async searchTeam(name) {
    const data = await this.get('/teams', { search: name });
    return data.response || [];
  }

  // ── Head-to-Head ─────────────────────────────────────
  async getH2H(team1Id, team2Id, last = 10) {
    const data = await this.get('/fixtures/headtohead', {
      h2h: `${team1Id}-${team2Id}`,
      last
    });
    return data.response || [];
  }

  // ── Forme récente d'une équipe ───────────────────────
  async getTeamLastFixtures(teamId, last = 5) {
    const data = await this.get('/fixtures', { team: teamId, last });
    return data.response || [];
  }

  // ── Stats d'un match (mi-temps/fin) ─────────────────
  async getFixtureStats(fixtureId) {
    const data = await this.get('/fixtures/statistics', { fixture: fixtureId });
    return data.response || [];
  }

  // ── Classement de ligue ──────────────────────────────
  async getStandings(leagueId, season = 2024) {
    const data = await this.get('/standings', { league: leagueId, season });
    return data.response?.[0]?.league?.standings?.[0] || [];
  }

  // ── Forme récente (W/D/L string) ────────────────────
  async getTeamForm(teamId, last = 5) {
    const fixtures = await this.getTeamLastFixtures(teamId, last);
    return fixtures.map(f => {
      const { home, away } = f.teams;
      const { home: hg, away: ag } = f.goals;
      const isHome = home.id === teamId;
      if (hg === ag) return 'D';
      if ((isHome && hg > ag) || (!isHome && ag > hg)) return 'W';
      return 'L';
    }).join('');
  }
}

module.exports = new ApiFootballService();
