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
const GH_API = `https://api.github.com/repos/${REPO}`;

async function uploadImageAsset(issueNumber, dataUrl, filename) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');

  const { Blob } = await import('buffer');
  const blob = new Blob([buffer], { type: mimeType });

  const formData = new FormData();
  formData.append('file', blob, filename);

  const res = await fetch(
    `https://uploads.github.com/repos/${REPO}/issues/${issueNumber}/assets`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`Asset upload failed (${res.status}):`, err);
    return null;
  }

  const data = await res.json();
  return data.url ?? null;
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

  // 1. Créer l'issue sans images d'abord
  const createRes = await fetch(`${GH_API}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `[Feedback] ${title}`,
      body,
      labels: labels || ['feedback'],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    return res.status(500).json(err);
  }

  const issue = await createRes.json();
  const issueNumber = issue.number;

  // 2. Si pas d'images, terminé
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(200).json(issue);
  }

  // 3. Uploader chaque image sur GitHub Assets (lié à l'issue créée)
  const uploaded = await Promise.all(
    images.map(({ name, dataUrl }) => uploadImageAsset(issueNumber, dataUrl, name))
  );

  const validUrls = uploaded.filter(Boolean);

  if (validUrls.length === 0) {
    return res.status(200).json(issue);
  }

  // 4. Patcher l'issue pour intégrer les images avec leurs vraies URLs GitHub
  const imagesMarkdown = validUrls.map((url, i) => `![screenshot-${i + 1}](${url})`).join('\n\n');
  const updatedBody = `${body}\n\n---\n\n### 📎 Screenshots\n\n${imagesMarkdown}`;

  await fetch(`${GH_API}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ body: updatedBody }),
  });

  return res.status(200).json(issue);
}