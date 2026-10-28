// GET /api/connected-accounts/catalog — static catalog of supported provider kinds
// Reports accurate provider availability (including provider_blocked for LinkedIn/Instagram).
import { NextResponse } from 'next/server';

export async function GET() {
  // Static catalog — NO secrets, NO runtime credentials. Pure declarative UI scaffold.
  return NextResponse.json({
    aiProviders: [
      { id: 'z-ai', label: 'Z-AI', description: 'Built-in platform AI (glm-4-plus, glm-4.6, glm-4-flash).', configurableByUser: false, configuredByServer: true, capabilities: ['ai.chat', 'ai.embeddings', 'ai.models.list'] },
      { id: 'openai', label: 'OpenAI', description: 'GPT-4o / GPT-4 Turbo / GPT-3.5 via OpenAI API.', configurableByUser: true, capabilities: ['ai.chat', 'ai.models.discover', 'ai.embeddings'] },
      { id: 'anthropic', label: 'Anthropic', description: 'Claude 3.5 / 3 Opus / Sonnet / Haiku.', configurableByUser: true, capabilities: ['ai.chat', 'ai.models.discover'] },
      { id: 'gemini', label: 'Google Gemini', description: 'Gemini 1.5 Pro / Flash via Google AI Studio.', configurableByUser: true, capabilities: ['ai.chat', 'ai.models.discover', 'ai.embeddings'] },
      { id: 'deepseek', label: 'DeepSeek', description: 'DeepSeek-V3 / DeepSeek-R1 reasoning models.', configurableByUser: true, capabilities: ['ai.chat', 'ai.models.discover'] },
      { id: 'openrouter', label: 'OpenRouter', description: 'Unified gateway to 200+ models.', configurableByUser: true, capabilities: ['ai.chat', 'ai.models.discover'] },
      { id: 'local', label: 'Local / Custom', description: 'Self-hosted OpenAI-compatible endpoint (Ollama, LM Studio, vLLM).', configurableByUser: true, capabilities: ['ai.chat', 'ai.models.discover'] },
    ],
    businessAccounts: [
      { id: 'gmail-smtp', label: 'Gmail (SMTP)', description: 'Send via Gmail SMTP using App Password.', configurableByUser: true, capabilities: ['email.send', 'email.reply', 'email.verify', 'email.draft', 'email.inspect'] },
      { id: 'hostinger-mail', label: 'Hostinger Mail (SMTP)', description: 'Send via Hostinger SMTP business mailbox.', configurableByUser: true, capabilities: ['email.send', 'email.reply', 'email.verify', 'email.draft', 'email.inspect'] },
      { id: 'gmail-oauth', label: 'Gmail (OAuth)', description: 'Full Gmail API integration (send + inbox sync + reply tracking).', configurableByUser: true, requiresOAuth: true, capabilities: ['email.send', 'email.reply', 'email.read', 'email.search', 'email.thread', 'email.mailbox'] },
    ],
    humanChannels: [
      { id: 'telegram', label: 'Telegram', description: 'Telegram Bot API for notifications and human escalation.', configurableByUser: true, requiresOAuth: false, capabilities: ['chat.send', 'chat.sendAction', 'chat.receive'] },
      { id: 'whatsapp-meta', label: 'WhatsApp (Meta Cloud API)', description: 'WhatsApp Business Cloud API for templated + session messages.', configurableByUser: true, requiresOAuth: false, capabilities: ['chat.send', 'chat.receive'] },
      { id: 'whatsapp-twilio', label: 'WhatsApp (Twilio)', description: 'WhatsApp via Twilio Business Profile.', configurableByUser: true, requiresOAuth: false, capabilities: ['chat.send', 'chat.receive'] },
      {
        id: 'linkedin',
        label: 'LinkedIn',
        description: 'LinkedIn direct messaging requires Partner Program API access not available to this application.',
        configurableByUser: false,
        status: 'provider_blocked',
        reason: 'LinkedIn Messaging API requires LinkedIn Partner Program approval (Marketing API Partner or Sales Navigator API). Not available to standard OAuth apps. Use InMail via the LinkedIn Sales Navigator product, or contact the lead via a connected email/WhatsApp channel.',
        capabilities: [],
      },
      {
        id: 'instagram',
        label: 'Instagram',
        description: 'Instagram direct messaging requires Facebook App with instagram_manage_messages permission + App Review approval + Instagram Professional Account.',
        configurableByUser: false,
        status: 'provider_blocked',
        reason: 'Instagram Messaging API requires: (1) Instagram Professional Account, (2) Facebook App with instagram_manage_messages permission, (3) Meta App Review approval, (4) recipient-initiated conversation (24-hour messaging window). None are currently configured. Use a connected email/WhatsApp channel instead.',
        capabilities: [],
      },
    ],
  });
}
