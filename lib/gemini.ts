import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function generateCountryPassportSVG(country: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `
    Generate an SVG string for a digital passport design representing ${country}.
    Include country-specific symbols (e.g., for USA: eagle and stars, France: Eiffel Tower, Japan: cherry blossoms and red sun).
    Use a rectangular passport shape (300x200px), vibrant colors, and simple vector shapes.
    Return only the raw SVG code starting with <svg> and ending with </svg>.
  `;
  try {
    const result = await model.generateContent(prompt);
    const svg = result.response.text().trim();
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
