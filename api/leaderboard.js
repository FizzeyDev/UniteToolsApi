// api/leaderboard.js
// Upstash Redis via API REST — aucune dépendance npm requise
// Env vars à ajouter manuellement dans Vercel (Project Settings → Environment Variables) :
//   KV_REST_API_URL   → ex: https://xxxx.upstash.io
//   KV_REST_API_TOKEN → le token Upstash

const ALLOWED_ORIGINS = [
  'https://unite-tools.com',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
];

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `ws_leaderboard_${y}${m}${day}`;
}

async function upstash(command) {
  const url  = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const res = await fetch(`${url}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = todayKey();

  // ── GET : top 10 ───────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // ZRANGE key 0 9 WITHSCORES — retourne [member, score, member, score, ...]
    const raw = await upstash(['ZRANGE', key, '0', '9', 'WITHSCORES']);

    const entries = [];
    if (Array.isArray(raw)) {
      for (let i = 0; i < raw.length; i += 2) {
        entries.push({ pseudo: raw[i], time: parseInt(raw[i + 1], 10) });
      }
    }

    return res.status(200).json({ date: key, entries });
  }

  // ── POST : soumettre un score ───────────────────────────────────────────
  if (req.method === 'POST') {
    const { pseudo, time } = req.body;

    if (!pseudo || typeof time !== 'number' || time <= 0) {
      return res.status(400).json({ error: 'Champs invalides' });
    }

    const safePseudo = pseudo.trim().slice(0, 20).replace(/[<>"']/g, '');
    if (!safePseudo) return res.status(400).json({ error: 'Pseudo invalide' });

    // Vérifie si le joueur a déjà un meilleur score
    const existing = await upstash(['ZSCORE', key, safePseudo]);
    if (existing !== null && parseInt(existing, 10) <= time) {
      return res.status(200).json({ status: 'no_update', best: parseInt(existing, 10) });
    }

    // Supprime l'ancien si besoin, puis ajoute
    if (existing !== null) await upstash(['ZREM', key, safePseudo]);
    await upstash(['ZADD', key, String(time), safePseudo]);

    // Expire après 48h
    await upstash(['EXPIRE', key, '172800']);

    return res.status(200).json({ status: 'ok', pseudo: safePseudo, time });
  }

  return res.status(405).end();
}