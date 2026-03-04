const ALLOWED_ORIGINS = [
  'https://unite-tools.com',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const REPO = 'FizzeyDev/UniteTools';

/**
 * Upload une image base64 sur Imgur (anonyme).
 * Retourne l'URL directe publique, ou null en cas d'échec.
 */
async function uploadToImgur(dataUrl, filename) {
  // Extraire uniquement le base64 sans le préfixe data:...;base64,
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

  const res = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      'Authorization': `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64,
      type: 'base64',
      name: filename,
    }),
  });

  if (!res.ok) {
    console.error('Imgur upload failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  return data.data?.link ?? null; // ex: https://i.imgur.com/abc123.jpg
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { title, body, labels, images } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Champs manquants' });

  // 1. Uploader les images sur Imgur pour obtenir des URLs publiques
  let imagesMarkdown = '';

  if (Array.isArray(images) && images.length > 0) {
    const uploaded = await Promise.all(
      images.map(({ name, dataUrl }) => uploadToImgur(dataUrl, name))
    );

    const validUrls = uploaded.filter(Boolean);

    if (validUrls.length > 0) {
      const lines = validUrls.map((url, i) => `![screenshot-${i + 1}](${url})`).join('\n\n');
      imagesMarkdown = `\n\n---\n\n### 📎 Screenshots\n\n${lines}`;
    }
  }

  // 2. Créer l'issue GitHub avec les images déjà intégrées
  const finalBody = `${body}${imagesMarkdown}`;

  const response = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `[Feedback] ${title}`,
      body: finalBody,
      labels: labels || ['feedback'],
    }),
  });

  const data = await response.json();
  return res.status(response.ok ? 200 : 500).json(data);
}