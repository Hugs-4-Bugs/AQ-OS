import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

const files = [
  { path: '/tmp/ss1.png', label: 'Screenshot 1 (7:21:40 AM)' },
  { path: '/tmp/ss2.png', label: 'Screenshot 2 (7:22:00 AM)' },
  { path: '/tmp/ss3.png', label: 'Screenshot 3 (7:22:10 AM)' },
  { path: '/tmp/ss4.png', label: 'Screenshot 4 (7:24:53 AM)' },
];

async function analyzeImage(imagePath, label) {
  try {
    const zai = await ZAI.create();
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:image/png;base64,${base64Image}`;

    const response = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this screenshot in detail. Describe everything you see: any error messages, UI elements, blank pages, browser state, URL bars, console errors, or any issues visible. Be very specific about any error text, status codes, or problem indicators.' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    });

    const reply = response.choices?.[0]?.message?.content;
    console.log(`\n=== ${label} ===`);
    console.log(reply ?? JSON.stringify(response, null, 2));
  } catch (err) {
    console.error(`\n=== ${label} ===`);
    console.error('Failed:', err?.message || err);
  }
}

for (const f of files) {
  await analyzeImage(f.path, f.label);
}
