/**
 * Probe Google authorize endpoint with candidate redirect URIs.
 * 302 -> URI is registered for this client; 400 redirect_uri_mismatch -> not registered.
 */
const CLIENT_ID = '22873135381-rha5u0opkhc4q8ja1a0a91mq8m6emfbi.apps.googleusercontent.com';

const CANDIDATES = [
  'https://acquisition.space-z.ai/api/auth/callback/google',
  'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai/api/auth/callback/google',
  'https://acquisition.space-z.ai/api/auth/google/callback',
  'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai/api/auth/google/callback',
  'http://localhost:3000/api/auth/callback/google',
];

for (const uri of CANDIDATES) {
  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(uri)}&response_type=code` +
    `&scope=openid%20email%20profile&state=probe`;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    console.log(
      res.status === 302 || res.status === 307
        ? `REGISTERED   ${uri}`
        : `NOT-REGISTERED (${res.status})  ${uri}  ${loc.slice(0, 60) ? '-> ' + loc.slice(0, 80) : ''}`
    );
  } catch (e) {
    console.log(`ERROR  ${uri}  ${e.message}`);
  }
}
