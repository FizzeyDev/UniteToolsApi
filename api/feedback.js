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

async function uploadImageToGitHub(dataUrl, filename) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;

  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');

  // GitHub Assets API — upload via multipart form
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob, filename);

  const res = await fetch(
    'https://uploads.github.com/repos/FizzeyDev/UniteTools/issues/assets',
    {
      method: 'POST',
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      },
      body: formData,
    }
  );

  if (!res.ok) return null;
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

  let finalBody = body;

  if (Array.isArray(images) && images.length > 0) {
    const uploaded = await Promise.all(
      images.map(async ({ name, dataUrl }) => {
        const url = await uploadImageToGitHub(dataUrl, name);
        return { name, url };
      })
    );

    const imagesSection = uploaded
      .filter(img => img.url)
      .map(img => `![${img.name}](${img.url})`)
      .join('\n\n');

    if (imagesSection) {
      finalBody += `\n\n---\n\n### 📎 Screenshots\n\n${imagesSection}`;
    }
  }

  const response = await fetch('https://api.github.com/repos/FizzeyDev/UniteTools/issues', {
    method: 'POST',
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: `[Feedback] ${title}`,
      body: finalBody,
      labels: labels || ['feedback']
    })
  });

  const data = await response.json();
  return res.status(response.ok ? 200 : 500).json(data);
}