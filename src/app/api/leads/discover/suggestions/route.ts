import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';

// GET /api/leads/discover/suggestions?niche=dental&country=USA
// ACCOUNT ISOLATION + COST CONTROL: this endpoint spends LLM tokens, so it
// must never be reachable without an authenticated session (previously it
// was fully public and could be called by anyone, unthrottled).
export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
  try {
    const { searchParams } = new URL(request.url);
    const niche = searchParams.get('niche');
    const country = searchParams.get('country');

    if (!niche || !country) {
      return NextResponse.json(
        { error: 'Both niche and country query parameters are required' },
        { status: 400 }
      );
    }

    // Use LLM to generate contextually relevant business type suggestions
    const zai = await import('z-ai-web-dev-sdk');
    const client = await zai.default.create();

    const response = await client.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a business discovery assistant. Given a business niche and country, suggest 5 specific business types or categories that would be excellent targets for B2B client acquisition in that niche+country combination. Return ONLY a JSON array of 5 strings, no other text. Each string should be a specific business type name (2-4 words). Be creative and specific to the niche and country context.`,
        },
        {
          role: 'user',
          content: `Suggest 5 business types for niche="${niche}" in country="${country}". Return only a JSON array of 5 strings.`,
        },
      ],
      thinking: { type: 'disabled' },
    });

    const content = response.choices?.[0]?.message?.content || '';
    
    // Try to parse the LLM response as JSON array
    let suggestions: string[] = [];
    try {
      // Try to extract JSON array from the response
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: use predefined suggestions
    }

    // Fallback suggestions if LLM parsing failed
    if (!suggestions.length || suggestions.length < 3) {
      const nicheLower = niche.toLowerCase();
      const fallbackMap: Record<string, string[]> = {
        dental: ['Cosmetic Dentistry Clinic', 'Pediatric Dental Office', 'Orthodontic Practice', 'Emergency Dental Care', 'Family Dentistry Center'],
        restaurant: ['Fine Dining Restaurant', 'Quick Service Chain', 'Farm-to-Table Bistro', 'Ethnic Cuisine Restaurant', 'Casual Dining Group'],
        'real estate': ['Luxury Property Agency', 'Commercial Real Estate Firm', 'Property Management Company', 'Real Estate Investment Group', 'Residential Brokerage'],
        fitness: ['Boutique Fitness Studio', 'CrossFit Gym', 'Yoga & Wellness Center', 'Personal Training Facility', 'Corporate Wellness Provider'],
        salon: ['Premium Hair Salon', 'Nail & Beauty Lounge', 'Barbershop Chain', 'Spa & Wellness Retreat', 'Organic Beauty Studio'],
        'e-commerce': ['Direct-to-Consumer Brand', 'Marketplace Platform', 'Subscription Box Service', 'Niche Online Retailer', 'Dropshipping Enterprise'],
        healthcare: ['Private Medical Practice', 'Telehealth Platform', 'Specialist Clinic', 'Diagnostic Imaging Center', 'Rehabilitation Facility'],
        legal: ['Corporate Law Firm', 'Personal Injury Practice', 'Immigration Law Office', 'Intellectual Property Firm', 'Family Law Practice'],
        automotive: ['Auto Dealership Group', 'Car Detailing Service', 'Auto Repair Chain', 'Electric Vehicle Service', 'Auto Parts Distributor'],
        education: ['Online Learning Platform', 'Test Prep Academy', 'Professional Certification Institute', 'Language School', 'Coding Bootcamp'],
        construction: ['General Contracting Firm', 'Specialty Trade Contractor', 'Architecture & Design Studio', 'Green Building Company', 'Construction Management Group'],
        hospitality: ['Boutique Hotel Group', 'Resort & Spa Chain', 'Bed & Breakfast Network', 'Event Venue Company', 'Vacation Rental Management'],
      };

      suggestions = fallbackMap[nicheLower] || [
        `${niche} Consulting Firm`,
        `${niche} Service Provider`,
        `${niche} Technology Company`,
        `${niche} Management Group`,
        `Premium ${niche} Solutions`,
      ];
    }

    // Ensure exactly 5 suggestions
    suggestions = suggestions.slice(0, 5);
    while (suggestions.length < 5) {
      suggestions.push(`${niche} Business Type ${suggestions.length + 1}`);
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    
    // Graceful fallback
    const niche = new URL(request.url).searchParams.get('niche') || 'Business';
    const fallbackSuggestions = [
      `${niche} Consulting Firm`,
      `${niche} Service Provider`,
      `${niche} Technology Company`,
      `${niche} Management Group`,
      `Premium ${niche} Solutions`,
    ];

    return NextResponse.json({ suggestions: fallbackSuggestions });
    }
  });
}
