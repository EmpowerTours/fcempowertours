// lib/gemini.ts
export async function generateCountryPassportSVG(country: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }

  const prompt = `
    Generate an SVG string for a digital passport design representing ${country}.
    Include country-specific symbols (e.g., for USA: eagle and stars, France: Eiffel Tower, Japan: cherry blossoms and red sun).
    Use a rectangular passport shape (300x200px), vibrant colors, and simple vector shapes.
    Return only the raw SVG code starting with <svg> and ending with </svg>.
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinkingBudget: 0 }, // Disable thinking for speed
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const svg = data.candidates[0].content.parts[0].text.trim();

    if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
      throw new Error('Invalid SVG generated');
    }

    return svg;
  } catch (error) {
    console.error('SVG generation failed:', error);
    // Fallback SVG for a generic passport
    return `
      <svg width="300" height="200" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        <rect width="300" height="200" fill="#1e3a8a" rx="10"/>
        <text x="20" y="100" fill="white" font-size="20" font-family="Arial">Passport - ${country}</text>
      </svg>
    `;
  }
}
