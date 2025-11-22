// Monad ecosystem projects data with engagement tasks
// Each project is a planet in the galaxy

export interface Task {
  id: string;
  title: string;
  description: string;
  type: 'social' | 'defi' | 'nft' | 'gaming' | 'other';
  url?: string; // External URL for task (if applicable)
  inAppRoute?: string; // In-app route (for EmpowerTours features)
  toursReward: number; // Fixed TOURS reward per task
}

export interface Project {
  id: string;
  name: string;
  description: string;
  category: 'defi' | 'nft' | 'gaming' | 'social' | 'infrastructure' | 'wallet';
  logo?: string;
  website?: string;
  twitter?: string;
  farcasterUrl?: string;
  isEmpowerTours?: boolean; // Special flag for in-app navigation
  color: string; // Planet color
  size: number; // Planet size (0.5 - 2)
  orbitRadius: number; // Distance from center
  orbitSpeed: number; // Orbit animation speed
  tasks: Task[];
}

export const TOURS_REWARD_PER_TASK = 10; // Fixed 10 TOURS per task

export const monadProjects: Project[] = [
  // EmpowerTours - Special in-app project
  {
    id: 'empowertours',
    name: 'EmpowerTours',
    description: 'Travel, collect passport stamps, mint music NFTs, and explore the world with EmpowerTours!',
    category: 'nft',
    logo: '/images/icon.png',
    website: 'https://fcempowertours.app',
    farcasterUrl: 'https://warpcast.com/empowertours',
    isEmpowerTours: true,
    color: '#7e22ce', // Purple - matching accent color
    size: 1.5,
    orbitRadius: 3,
    orbitSpeed: 0.5,
    tasks: [
      {
        id: 'et-passport',
        title: 'Mint Your First Passport',
        description: 'Collect a digital passport stamp for any country',
        type: 'nft',
        inAppRoute: '/passport',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'et-discover',
        title: 'Discover Music',
        description: 'Browse the music library and listen to tracks',
        type: 'nft',
        inAppRoute: '/discover',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'et-beatmatch',
        title: 'Play Beat Match',
        description: 'Test your music knowledge with the Beat Match game',
        type: 'gaming',
        inAppRoute: '/beat-match',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'et-swap',
        title: 'Swap Tokens',
        description: 'Swap MON for TOURS or vice versa',
        type: 'defi',
        inAppRoute: '/swap',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'et-staking',
        title: 'Stake Your Passport',
        description: 'Stake your passport NFT to earn rewards',
        type: 'defi',
        inAppRoute: '/staking',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Monad - Core infrastructure
  {
    id: 'monad',
    name: 'Monad',
    description: 'The fastest EVM-compatible L1 blockchain with parallel execution',
    category: 'infrastructure',
    website: 'https://monad.xyz',
    twitter: 'https://twitter.com/moaboringmonad',
    color: '#836EF9', // Monad purple
    size: 2,
    orbitRadius: 0,
    orbitSpeed: 0,
    tasks: [
      {
        id: 'monad-follow',
        title: 'Follow Monad on Twitter',
        description: 'Stay updated with the latest Monad news',
        type: 'social',
        url: 'https://twitter.com/moaboringmonad',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'monad-discord',
        title: 'Join Monad Discord',
        description: 'Connect with the Monad community',
        type: 'social',
        url: 'https://discord.gg/monad',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Kuru
  {
    id: 'kuru',
    name: 'Kuru',
    description: 'The leading DEX on Monad with deep liquidity',
    category: 'defi',
    website: 'https://kuru.io',
    twitter: 'https://twitter.com/kaboringmonad',
    color: '#00D4AA',
    size: 1.2,
    orbitRadius: 5,
    orbitSpeed: 0.3,
    tasks: [
      {
        id: 'kuru-follow',
        title: 'Follow Kuru on Twitter',
        description: 'Keep up with Kuru updates',
        type: 'social',
        url: 'https://twitter.com/KuruExchange',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'kuru-visit',
        title: 'Visit Kuru Website',
        description: 'Explore Kuru DEX features',
        type: 'defi',
        url: 'https://kuru.io',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Pyth Network
  {
    id: 'pyth',
    name: 'Pyth Network',
    description: 'First-party financial oracle network delivering real-time market data',
    category: 'infrastructure',
    website: 'https://pyth.network',
    twitter: 'https://twitter.com/PythNetwork',
    color: '#E6DAFE',
    size: 1.1,
    orbitRadius: 6,
    orbitSpeed: 0.25,
    tasks: [
      {
        id: 'pyth-follow',
        title: 'Follow Pyth on Twitter',
        description: 'Stay updated with Pyth Network',
        type: 'social',
        url: 'https://twitter.com/PythNetwork',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'pyth-docs',
        title: 'Read Pyth Documentation',
        description: 'Learn about Pyth price feeds',
        type: 'other',
        url: 'https://docs.pyth.network',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Ambient Finance
  {
    id: 'ambient',
    name: 'Ambient Finance',
    description: 'Concentrated liquidity DEX with single-sided liquidity',
    category: 'defi',
    website: 'https://ambient.finance',
    twitter: 'https://twitter.com/ambient_finance',
    color: '#FF6B6B',
    size: 1.0,
    orbitRadius: 7,
    orbitSpeed: 0.2,
    tasks: [
      {
        id: 'ambient-follow',
        title: 'Follow Ambient on Twitter',
        description: 'Keep up with Ambient Finance',
        type: 'social',
        url: 'https://twitter.com/ambient_finance',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'ambient-app',
        title: 'Try Ambient App',
        description: 'Explore the Ambient DEX',
        type: 'defi',
        url: 'https://ambient.finance',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Wormhole
  {
    id: 'wormhole',
    name: 'Wormhole',
    description: 'Cross-chain messaging protocol connecting Monad to other chains',
    category: 'infrastructure',
    website: 'https://wormhole.com',
    twitter: 'https://twitter.com/waboringmonad',
    color: '#00BFFF',
    size: 1.3,
    orbitRadius: 8,
    orbitSpeed: 0.15,
    tasks: [
      {
        id: 'wormhole-follow',
        title: 'Follow Wormhole on Twitter',
        description: 'Stay updated with Wormhole',
        type: 'social',
        url: 'https://twitter.com/wormhole',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'wormhole-bridge',
        title: 'Explore Wormhole Bridge',
        description: 'Learn about cross-chain bridging',
        type: 'other',
        url: 'https://wormhole.com',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Monad Pad
  {
    id: 'monadpad',
    name: 'Monad Pad',
    description: 'Premier launchpad for new projects on Monad',
    category: 'defi',
    website: 'https://monadpad.xyz',
    twitter: 'https://twitter.com/MonadPad',
    color: '#FFD700',
    size: 1.1,
    orbitRadius: 9,
    orbitSpeed: 0.12,
    tasks: [
      {
        id: 'monadpad-follow',
        title: 'Follow MonadPad on Twitter',
        description: 'Get launch alerts',
        type: 'social',
        url: 'https://twitter.com/MonadPad',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'monadpad-visit',
        title: 'Visit MonadPad',
        description: 'Check upcoming launches',
        type: 'defi',
        url: 'https://monadpad.xyz',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // aPriori
  {
    id: 'apriori',
    name: 'aPriori',
    description: 'MEV infrastructure and liquid staking on Monad',
    category: 'defi',
    website: 'https://apriori.finance',
    twitter: 'https://twitter.com/apriaboringmonad',
    color: '#9B59B6',
    size: 1.0,
    orbitRadius: 10,
    orbitSpeed: 0.1,
    tasks: [
      {
        id: 'apriori-follow',
        title: 'Follow aPriori on Twitter',
        description: 'Learn about MEV on Monad',
        type: 'social',
        url: 'https://twitter.com/apriori_tech',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Nad.fun
  {
    id: 'nadfun',
    name: 'Nad.fun',
    description: 'Fun token launchpad and trading platform',
    category: 'defi',
    website: 'https://nad.fun',
    twitter: 'https://twitter.com/naddotfun',
    color: '#FF69B4',
    size: 0.9,
    orbitRadius: 11,
    orbitSpeed: 0.08,
    tasks: [
      {
        id: 'nadfun-follow',
        title: 'Follow Nad.fun on Twitter',
        description: 'Discover fun tokens',
        type: 'social',
        url: 'https://twitter.com/naddotfun',
        toursReward: TOURS_REWARD_PER_TASK,
      },
      {
        id: 'nadfun-explore',
        title: 'Explore Nad.fun',
        description: 'Browse tokens and trends',
        type: 'defi',
        url: 'https://nad.fun',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Narwhal Finance
  {
    id: 'narwhal',
    name: 'Narwhal Finance',
    description: 'Perpetual DEX with deep liquidity on Monad',
    category: 'defi',
    website: 'https://narwhal.finance',
    twitter: 'https://twitter.com/NarwhalFinance',
    color: '#1E90FF',
    size: 1.1,
    orbitRadius: 12,
    orbitSpeed: 0.07,
    tasks: [
      {
        id: 'narwhal-follow',
        title: 'Follow Narwhal on Twitter',
        description: 'Stay updated on perps trading',
        type: 'social',
        url: 'https://twitter.com/NarwhalFinance',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Molandak
  {
    id: 'molandak',
    name: 'Molandak',
    description: 'The beloved Monad mascot NFT collection',
    category: 'nft',
    website: 'https://molandak.com',
    twitter: 'https://twitter.com/Molandak',
    color: '#8B4513',
    size: 0.8,
    orbitRadius: 4,
    orbitSpeed: 0.4,
    tasks: [
      {
        id: 'molandak-follow',
        title: 'Follow Molandak on Twitter',
        description: 'Join the Molandak community',
        type: 'social',
        url: 'https://twitter.com/Molandak',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
  // Chog
  {
    id: 'chog',
    name: 'Chog',
    description: 'Community-driven memecoin on Monad',
    category: 'social',
    twitter: 'https://twitter.com/chaboringmonad',
    color: '#32CD32',
    size: 0.7,
    orbitRadius: 4.5,
    orbitSpeed: 0.45,
    tasks: [
      {
        id: 'chog-follow',
        title: 'Follow Chog on Twitter',
        description: 'Join the Chog army',
        type: 'social',
        url: 'https://twitter.com/chogcoin',
        toursReward: TOURS_REWARD_PER_TASK,
      },
    ],
  },
];

// Get all unique categories
export const categories = [...new Set(monadProjects.map(p => p.category))];

// Get project by ID
export function getProjectById(id: string): Project | undefined {
  return monadProjects.find(p => p.id === id);
}

// Get all tasks across all projects
export function getAllTasks(): { project: Project; task: Task }[] {
  return monadProjects.flatMap(project =>
    project.tasks.map(task => ({ project, task }))
  );
}

// Calculate total possible TOURS rewards
export function getTotalPossibleRewards(): number {
  return getAllTasks().reduce((sum, { task }) => sum + task.toursReward, 0);
}
