import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';

// GET /api/settings/api-keys/docs — Get API documentation with code examples
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://api.acquisitionos.com';
    
    const docs = {
      version: '1.0.0',
      baseUrl,
      authentication: {
        type: 'Bearer Token',
        header: 'Authorization: Bearer aq_live_xxxxxxxxxxxxxxxx',
        description: 'Include your API key as a Bearer token in the Authorization header.',
        keyFormats: {
          live: 'aq_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          test: 'aq_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        },
      },
      endpoints: {
        leads: {
          list: { method: 'GET', path: '/api/leads', scope: 'leads.read', description: 'List all leads with filtering and pagination' },
          create: { method: 'POST', path: '/api/leads', scope: 'leads.write', description: 'Create a new lead' },
          get: { method: 'GET', path: '/api/leads/{id}', scope: 'leads.read', description: 'Get a specific lead' },
          search: { method: 'GET', path: '/api/leads/search?q={query}', scope: 'leads.read', description: 'Search leads' },
          export: { method: 'GET', path: '/api/leads/export', scope: 'leads.read', description: 'Export leads data' },
        },
        workflows: {
          list: { method: 'GET', path: '/api/workflows', scope: 'workflows.read', description: 'List all workflows' },
          create: { method: 'POST', path: '/api/workflows', scope: 'workflows.write', description: 'Create a workflow' },
          execute: { method: 'POST', path: '/api/workflows/{id}/execute', scope: 'workflows.write', description: 'Execute a workflow' },
        },
        analytics: {
          insights: { method: 'GET', path: '/api/insights', scope: 'analytics.read', description: 'Get business insights and analytics' },
          messaging: { method: 'GET', path: '/api/messaging/analytics', scope: 'analytics.read', description: 'Get messaging analytics' },
        },
        competitors: {
          list: { method: 'GET', path: '/api/competitor', scope: 'analytics.read', description: 'List competitor analyses' },
          analyze: { method: 'POST', path: '/api/competitor', scope: 'ai.write', description: 'Create competitor analysis' },
        },
        ai: {
          vectorSearch: { method: 'POST', path: '/api/ai/vector-search', scope: 'ai.read', description: 'Vector similarity search' },
          ragContext: { method: 'POST', path: '/api/ai/rag/context', scope: 'ai.read', description: 'Get RAG context' },
        },
      },
      examples: {
        curl: {
          listLeads: `curl -X GET "${baseUrl}/api/leads?limit=10" \\
  -H "Authorization: Bearer aq_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json"`,
          createLead: `curl -X POST "${baseUrl}/api/leads" \\
  -H "Authorization: Bearer aq_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "businessName": "Acme Corp",
    "email": "hello@acme.com",
    "niche": "SaaS",
    "country": "US"
  }'`,
          getInsights: `curl -X GET "${baseUrl}/api/insights" \\
  -H "Authorization: Bearer aq_live_YOUR_KEY_HERE"`,
        },
        javascript: {
          sdk: `// AcquisitionOS JavaScript SDK Example
const ACQ_BASE_URL = '${baseUrl}';
const ACQ_API_KEY = 'aq_live_YOUR_KEY_HERE';

const client = {
  headers: {
    'Authorization': \`Bearer \${ACQ_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  
  async listLeads(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(\`\${ACQ_BASE_URL}/api/leads?\${query}\`, { headers: this.headers });
    if (!res.ok) throw new Error(\`API Error: \${res.status}\`);
    return res.json();
  },

  async createLead(data) {
    const res = await fetch(\`\${ACQ_BASE_URL}/api/leads\`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(\`API Error: \${res.status}\`);
    return res.json();
  },

  async getInsights() {
    const res = await fetch(\`\${ACQ_BASE_URL}/api/insights\`, { headers: this.headers });
    if (!res.ok) throw new Error(\`API Error: \${res.status}\`);
    return res.json();
  },

  async analyzeCompetitor(data) {
    const res = await fetch(\`\${ACQ_BASE_URL}/api/competitor\`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(\`API Error: \${res.status}\`);
    return res.json();
  },
};

// Usage
const leads = await client.listLeads({ limit: 10, stage: 'discovered' });
const newLead = await client.createLead({ businessName: 'Acme Corp', email: 'hello@acme.com' });
const insights = await client.getInsights();`,
        },
        python: {
          sdk: `# AcquisitionOS Python SDK Example
import requests
import json

BASE_URL = "${baseUrl}"
API_KEY = "aq_live_YOUR_KEY_HERE"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

class AcquisitionOSClient:
    def __init__(self, base_url=BASE_URL, api_key=API_KEY):
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def list_leads(self, **params):
        """List leads with optional filtering."""
        response = requests.get(
            f"{self.base_url}/api/leads",
            headers=self.headers,
            params=params,
        )
        response.raise_for_status()
        return response.json()

    def create_lead(self, data):
        """Create a new lead."""
        response = requests.post(
            f"{self.base_url}/api/leads",
            headers=self.headers,
            json=data,
        )
        response.raise_for_status()
        return response.json()

    def get_insights(self):
        """Get business insights and analytics."""
        response = requests.get(
            f"{self.base_url}/api/insights",
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()

    def analyze_competitor(self, competitor_name, competitor_url, **kwargs):
        """Create a competitor analysis."""
        data = {
            "competitorName": competitor_name,
            "competitorUrl": competitor_url,
            **kwargs,
        }
        response = requests.post(
            f"{self.base_url}/api/competitor",
            headers=self.headers,
            json=data,
        )
        response.raise_for_status()
        return response.json()


# Usage
client = AcquisitionOSClient()
leads = client.list_leads(limit=10, stage="discovered")
new_lead = client.create_lead({"businessName": "Acme Corp", "email": "hello@acme.com"})
insights = client.get_insights()`,
        },
        postman: {
          collection: {
            info: { name: 'AcquisitionOS API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
            item: [
              { name: 'List Leads', request: { method: 'GET', header: [{ key: 'Authorization', value: 'Bearer aq_live_YOUR_KEY_HERE' }], url: { raw: `${baseUrl}/api/leads?limit=10`, host: [baseUrl], path: ['api', 'leads'], query: [{ key: 'limit', value: '10' }] } } },
              { name: 'Create Lead', request: { method: 'POST', header: [{ key: 'Authorization', value: 'Bearer aq_live_YOUR_KEY_HERE' }, { key: 'Content-Type', value: 'application/json' }], url: { raw: `${baseUrl}/api/leads`, host: [baseUrl], path: ['api', 'leads'] }, body: { mode: 'raw', raw: '{"businessName": "Acme Corp", "email": "hello@acme.com"}' } } },
              { name: 'Get Insights', request: { method: 'GET', header: [{ key: 'Authorization', value: 'Bearer aq_live_YOUR_KEY_HERE' }], url: { raw: `${baseUrl}/api/insights`, host: [baseUrl], path: ['api', 'insights'] } } },
              { name: 'Analyze Competitor', request: { method: 'POST', header: [{ key: 'Authorization', value: 'Bearer aq_live_YOUR_KEY_HERE' }, { key: 'Content-Type', value: 'application/json' }], url: { raw: `${baseUrl}/api/competitor`, host: [baseUrl], path: ['api', 'competitor'] }, body: { mode: 'raw', raw: '{"competitorName": "Competitor Inc", "competitorUrl": "https://competitor.com"}' } } },
            ],
            variable: [{ key: 'base_url', value: baseUrl }],
          },
        },
      },
      rateLimits: {
        default: '1,000 requests per hour per key',
        burst: 'Up to 100 requests per minute',
        headers: {
          'X-RateLimit-Limit': 'Maximum requests allowed per hour',
          'X-RateLimit-Remaining': 'Requests remaining in current window',
          'X-RateLimit-Reset': 'Unix timestamp when the rate limit window resets',
        },
      },
      errors: {
        401: { description: 'Authentication required or invalid API key', code: 'AUTH_REQUIRED' },
        403: { description: 'Insufficient scope or plan restriction', code: 'SCOPE_DENIED' },
        404: { description: 'Resource not found', code: 'NOT_FOUND' },
        429: { description: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        500: { description: 'Internal server error', code: 'INTERNAL_ERROR' },
      },
    };

    return NextResponse.json(docs);
  });
}
