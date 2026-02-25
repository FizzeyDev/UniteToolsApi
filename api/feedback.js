javascriptconst ALLOWED_ORIGINS = [
  'https://unite-tools.com',
  'http://127.0.0.1:5500',
  'http://localhost:5500'
];

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { title, body, labels } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Champs manquants' });

  const response = await fetch('https://api.github.com/repos/FizzeyDev/UniteTools/issues', {
    method: 'POST',
    headers: {
      'Authorization': `token ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: `[Feedback] ${title}`,
      body,
      labels: labels || ['feedback']
    })
  });

  const data = await response.json();
  return res.status(response.ok ? 200 : 500).json(data);
}