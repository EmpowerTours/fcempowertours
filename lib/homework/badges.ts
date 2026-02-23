import { MILESTONE_BONUSES } from './rewards';

interface BadgeConfig {
  week: number;
  title: string;
  subtitle: string;
  icon: string;
  gradient: [string, string];
}

const BADGE_CONFIGS: Record<number, BadgeConfig> = {
  8: {
    week: 8,
    title: 'Dev Foundations',
    subtitle: 'Phase 1 Complete',
    icon: '\u{1F4BB}', // laptop
    gradient: ['#06b6d4', '#0891b2'],
  },
  20: {
    week: 20,
    title: 'Web3 Builder',
    subtitle: 'Phase 2 Complete',
    icon: '\u{26D3}', // chains
    gradient: ['#8b5cf6', '#7c3aed'],
  },
  36: {
    week: 36,
    title: 'Full-Stack Dev',
    subtitle: 'Phase 3 Complete',
    icon: '\u{1F680}', // rocket
    gradient: ['#f59e0b', '#d97706'],
  },
  52: {
    week: 52,
    title: 'TURBO Graduate',
    subtitle: 'All 52 Weeks Complete',
    icon: '\u{1F393}', // graduation cap
    gradient: ['#22c55e', '#16a34a'],
  },
};

export function generateBadgeSVG(
  week: number,
  memberName: string,
  completedAt: string
): string | null {
  const config = BADGE_CONFIGS[week];
  if (!config) return null;

  const bonus = MILESTONE_BONUSES[week] || 0;
  const date = new Date(completedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return `<svg width="400" height="500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${config.gradient[0]};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${config.gradient[1]};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="shineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0);stop-opacity:0" />
      <stop offset="50%" style="stop-color:rgba(255,255,255,0.1);stop-opacity:1" />
      <stop offset="100%" style="stop-color:rgba(255,255,255,0);stop-opacity:0" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="400" height="500" fill="url(#bgGrad)" rx="20"/>

  <!-- Shine overlay -->
  <rect width="400" height="500" fill="url(#shineGrad)" rx="20" opacity="0.3"/>

  <!-- Inner border -->
  <rect x="12" y="12" width="376" height="476" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" rx="16"/>

  <!-- TURBO header -->
  <text x="200" y="55" font-family="Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.7)" text-anchor="middle" font-weight="bold" letter-spacing="4">
    TURBO COHORT 1
  </text>

  <!-- Decorative line -->
  <line x1="80" y1="70" x2="320" y2="70" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>

  <!-- Badge icon -->
  <text x="200" y="170" font-size="80" text-anchor="middle">
    ${config.icon}
  </text>

  <!-- Badge title -->
  <text x="200" y="230" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle">
    ${config.title}
  </text>

  <!-- Subtitle -->
  <text x="200" y="262" font-family="Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.8)" text-anchor="middle">
    ${config.subtitle}
  </text>

  <!-- Week badge -->
  <rect x="140" y="280" width="120" height="36" fill="rgba(0,0,0,0.3)" rx="18"/>
  <text x="200" y="304" font-family="Arial, sans-serif" font-size="16" fill="white" text-anchor="middle" font-weight="bold">
    Week ${week}
  </text>

  <!-- Divider -->
  <line x1="60" y1="340" x2="340" y2="340" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>

  <!-- Member name -->
  <text x="200" y="375" font-family="Arial, sans-serif" font-size="18" fill="white" text-anchor="middle">
    ${escapeXml(memberName)}
  </text>

  <!-- Completion date -->
  <text x="200" y="400" font-family="Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.6)" text-anchor="middle">
    Completed ${date}
  </text>

  <!-- Bonus reward -->
  <rect x="120" y="420" width="160" height="30" fill="rgba(255,255,255,0.15)" rx="15"/>
  <text x="200" y="441" font-family="Arial, sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="bold">
    +${bonus} TOURS Bonus
  </text>

  <!-- Footer -->
  <text x="200" y="480" font-family="Arial, sans-serif" font-size="10" fill="rgba(255,255,255,0.4)" text-anchor="middle">
    EmpowerTours on Monad
  </text>
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function svgToDataURI(svg: string): string {
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

export const MILESTONE_WEEKS = [8, 20, 36, 52];

export function isMilestoneWeek(week: number): boolean {
  return MILESTONE_WEEKS.includes(week);
}
