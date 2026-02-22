'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import './turbo.css';

/* ── Data ── */

const PHASES = [
  {
    num: '01',
    months: '1 – 4',
    title: 'Foundations',
    accent: '#06b6d4',
    items: [
      'Web3 fundamentals & Monad ecosystem',
      'Product discovery & validation',
      'Smart contract development basics',
      'Team formation & culture building',
    ],
  },
  {
    num: '02',
    months: '5 – 8',
    title: 'Build & Ship',
    accent: '#8b5cf6',
    items: [
      'MVP development sprints',
      'User acquisition strategies',
      'Tokenomics & governance design',
      'Technical architecture reviews',
    ],
  },
  {
    num: '03',
    months: '9 – 12',
    title: 'Scale & Demo',
    accent: '#f59e0b',
    items: [
      'Growth hacking & metrics',
      'Pitch deck refinement',
      'Demo Day preparation',
      'NITRO application coaching',
    ],
  },
] as const;

const FAQS = [
  {
    q: 'Who is TURBO for?',
    a: 'Aspiring Web3 founders in Latin America who want structured mentorship, community, and a path to building real products. Whether you\'re a developer, designer, or business mind — if you want to build on Monad, TURBO is your launchpad.',
  },
  {
    q: 'What happens after the 12 months?',
    a: 'Graduates will be well-prepared to apply for Monad\'s NITRO, which provides $500,000 USD per team. TURBO gives you the skills, portfolio, and network to stand out.',
  },
  {
    q: 'How do I become a TURBO candidate?',
    a: 'Step 1: Register on Bybit using referral code BPYPARJ. Step 2: Join the EmpowerToursEdu Telegram channel. Step 3: Fill out the application form on this page.',
  },
  {
    q: 'Is TURBO only in Spanish?',
    a: 'Primary content is in Spanish with English resources available. Mentorship sessions can be in either language. We believe in building bridges between LATAM and global Web3.',
  },
  {
    q: 'What\'s the difference between TURBO and NITRO?',
    a: 'TURBO is the training ground. NITRO is the destination. TURBO (by EmpowerTours) builds your skills and community over 12 months. NITRO (by Monad) is a 3-month elite program with $500K USD for 15 selected teams.',
  },
  {
    q: 'Do I need coding experience?',
    a: 'No. TURBO is designed to take you from zero to builder. With AI-powered vibe coding, anyone with drive can build real products. We\'ll teach you everything you need.',
  },
  {
    q: 'How does on-chain governance work?',
    a: 'All funds and Graduating Founder selection are managed by audited smart contracts on Monad. For Cohort 1, the admin selects Graduating Founders directly. Starting Cohort 2, past winners form a voting council that proposes and votes on future Graduating Founder slates — giving the community progressive ownership.',
  },
  {
    q: 'What is the Founders Council?',
    a: 'Every Graduating Founder selected from a cohort is automatically added to the Founders Council. Council members can propose new Graduating Founder slates, vote on proposals, and help shape future cohorts. The council grows with every cohort, decentralizing governance over time.',
  },
  {
    q: 'Is the "Founder" membership tier required to be selected?',
    a: 'No. The "Founder" tier is a membership level — the highest tier with the most perks and largest pool contribution. Any member from any tier (Explorer, Builder, or Founder) can be nominated as a Graduating Founder. Selection is based on what you build, not which tier you pay for.',
  },
];

const CONTRACTS = {
  cohort: '0xEae06514a0d3daf610cC0778B27f387018521Ab5',
  governance: '0x9e7A91D9F891373DD0846f443E4484EfA12c4899',
};

const GOV_FLOW = [
  {
    num: '01',
    color: '#06b6d4',
    title: 'Propose',
    desc: 'A council member submits a Graduating Founder slate — members from any tier — with proposed funding amounts.',
    icon: 'M12 4v16m-8-8h16',
  },
  {
    num: '02',
    color: '#8b5cf6',
    title: 'Vote',
    desc: 'Council members vote yes or no over a 7-day voting period. 60% quorum required.',
    icon: 'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    num: '03',
    color: '#f59e0b',
    title: 'Execute',
    desc: 'If passed, anyone can execute. Funds distribute on-chain. New Graduating Founders join the council.',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
];

const STEPS = [
  {
    num: '01',
    color: '#f59e0b',
    title: 'Register on Bybit',
    desc: 'Create your Bybit account using our referral code to become a TURBO candidate.',
    cta: 'Use code: BPYPARJ',
    link: '#',
  },
  {
    num: '02',
    color: '#06b6d4',
    title: 'Join Telegram',
    desc: 'Enter the EmpowerToursEdu channel — your hub for updates, community, and resources.',
    cta: 'Join channel',
    link: 'https://t.me/+D2lwIqbJT1tmZTMx',
  },
  {
    num: '03',
    color: '#8b5cf6',
    title: 'Apply below',
    desc: 'Fill out the application form and tell us what you want to build. We\'ll take it from there.',
    cta: 'Scroll to apply',
    link: '#apply',
  },
];

/* ── Scroll reveal hook ── */

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('visible');
          obs.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── Check icon ── */

function Check({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Label ── */

function Label({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="syne inline-block text-[11px] font-semibold tracking-[0.15em] uppercase mb-6"
      style={{ color }}
    >
      {children}
    </span>
  );
}

/* ── Page ── */

export default function TurboPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', email: '', twitter: '', bybit: '', why: '', tier: 'builder' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [boost, setBoost] = useState(0);

  // On-chain payment state
  const [payStep, setPayStep] = useState<'idle' | 'paying' | 'success' | 'error'>('idle');
  const [payError, setPayError] = useState('');
  const [payResult, setPayResult] = useState<{ txHash: string; amount: string } | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [safeInfo, setSafeInfo] = useState<{ safeAddress: string; wmonBalance: string; isFunded: boolean } | null>(null);
  const [loadingSafe, setLoadingSafe] = useState(false);
  const [nftCard, setNftCard] = useState<{ svgDataUri: string; name: string; tokenId: number } | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [memberData, setMemberData] = useState<{
    tier: string; tierId: number; monthsPaid: number; totalPaid: string;
    lastPaymentTime: number; isFounder: boolean; tokenId: number;
  } | null>(null);
  const [tierPrices, setTierPrices] = useState<{ explorer: string; builder: string; founder: string } | null>(null);
  const [copiedField, setCopiedField] = useState('');

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };
  const [loadingMember, setLoadingMember] = useState(false);
  const [selectedPayTier, setSelectedPayTier] = useState(form.tier);
  const [upgradeStep, setUpgradeStep] = useState<'idle' | 'upgrading' | 'success' | 'error'>('idle');
  const [upgradeError, setUpgradeError] = useState('');

  const fetchSafeInfo = async (address: string) => {
    if (!address) return;
    setLoadingSafe(true);
    try {
      const res = await fetch(`/api/user-safe?address=${address}`);
      const data = await res.json();
      if (data.success) {
        setSafeInfo({
          safeAddress: data.safeAddress,
          wmonBalance: data.wmonBalance || '0',
          isFunded: data.isFunded,
        });
      }
    } catch {
      // Safe info fetch failed silently
    } finally {
      setLoadingSafe(false);
    }
  };

  const fetchMemberData = async (address: string) => {
    setLoadingMember(true);
    try {
      const res = await fetch(`/api/turbo/pay?address=${address}`);
      const data = await res.json();
      if (data.success && data.member) {
        setMemberData(data.member);
        setTierPrices(data.tierPrices);
        // Set selected tier to current tier for returning members
        if (data.member.tierId > 0) {
          const tierNames = ['', 'explorer', 'builder', 'founder'];
          setSelectedPayTier(tierNames[data.member.tierId]);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMember(false);
    }
  };

  const handleUpgradeTier = async (newTier: string) => {
    if (!walletAddress) return;
    setUpgradeStep('upgrading');
    setUpgradeError('');
    try {
      const res = await fetch('/api/turbo/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: walletAddress, newTier }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUpgradeError(data.error || 'Upgrade failed');
        setUpgradeStep('error');
      } else {
        setUpgradeStep('success');
        setSelectedPayTier(newTier);
        // Refresh member data and NFT card after upgrade
        await fetchMemberData(walletAddress);
        fetchNftCard(walletAddress);
      }
    } catch {
      setUpgradeError('Network error');
      setUpgradeStep('error');
    }
  };

  const fetchNftCard = async (address: string) => {
    setLoadingCard(true);
    try {
      // Get member info to find tokenId
      const memberRes = await fetch(`/api/turbo/pay?address=${address}`);
      const memberData = await memberRes.json();
      if (!memberData.success || !memberData.member?.tokenId) return;

      const tokenId = memberData.member.tokenId;

      // Fetch tokenURI from contract via RPC
      const rpcRes = await fetch('https://rpc.monad.xyz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{
            to: CONTRACTS.cohort,
            // tokenURI(uint256) selector = 0xc87b56dd
            data: '0xc87b56dd' + tokenId.toString(16).padStart(64, '0'),
          }, 'latest'],
        }),
      });
      const rpcData = await rpcRes.json();
      if (!rpcData.result || rpcData.result === '0x') return;

      // Decode ABI-encoded string response
      const hex = rpcData.result.slice(2); // remove 0x
      const offset = parseInt(hex.slice(0, 64), 16) * 2;
      const length = parseInt(hex.slice(offset, offset + 64), 16);
      const strHex = hex.slice(offset + 64, offset + 64 + length * 2);
      const dataUri = new TextDecoder().decode(
        new Uint8Array(strHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)))
      );

      // dataUri = "data:application/json;base64,..."
      const jsonB64 = dataUri.replace('data:application/json;base64,', '');
      const metadata = JSON.parse(atob(jsonB64));

      setNftCard({
        svgDataUri: metadata.image, // "data:image/svg+xml;base64,..."
        name: metadata.name,
        tokenId,
      });
    } catch (err) {
      console.error('[TurboCard] Failed to fetch NFT card:', err);
    } finally {
      setLoadingCard(false);
    }
  };

  const handlePayment = async () => {
    if (!walletAddress) {
      setPayError('Enter your wallet address first');
      return;
    }
    setPayStep('paying');
    setPayError('');
    try {
      const res = await fetch('/api/turbo/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: walletAddress, tier: form.tier }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPayError(data.error || 'Payment failed');
        setPayStep('error');
      } else {
        setPayResult({ txHash: data.paymentTxHash, amount: data.amount });
        setPayStep('success');
        // Fetch the NFT card and member data after successful payment
        fetchNftCard(walletAddress);
        fetchMemberData(walletAddress);
      }
    } catch {
      setPayError('Network error. Please try again.');
      setPayStep('error');
    }
  };

  useEffect(() => {
    document.body.style.backgroundColor = '#060608';
    return () => { document.body.style.backgroundColor = ''; };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      setBoost(Math.min(Math.max(pct, 0), 1));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="turbo-page">
      {/* Scroll progress */}
      <div className="boost-bar">
        <div className="boost-fill" style={{ height: `${boost * 100}%` }} />
      </div>

      {/* ════════ HERO ════════ */}
      <header className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        <div className="orb" style={{ width: 500, height: 500, background: '#06b6d4', opacity: 0.08, top: '-5%', left: '15%' }} />
        <div className="orb" style={{ width: 400, height: 400, background: '#8b5cf6', opacity: 0.06, bottom: '5%', right: '10%' }} />

        <div className="relative z-10 text-center max-w-4xl mx-auto">
          <p className="syne hero-enter hero-enter-d1 text-[11px] tracking-[0.4em] uppercase text-zinc-600 font-semibold mb-8">
            by EmpowerTours
          </p>

          <h1
            className="syne hero-enter hero-enter-d2 font-extrabold leading-[0.9] mb-6"
            style={{ fontSize: 'clamp(4.5rem, 14vw, 12rem)' }}
          >
            <span className="gt">TURBO</span>
          </h1>

          <p className="hero-enter hero-enter-d3 text-lg md:text-xl text-zinc-500 mb-10 max-w-md mx-auto">
            The launchpad to <span className="syne font-bold text-purple-400">NITRO</span>.
            <br />
            <span className="text-zinc-600">Train. Build. Fund.</span>
          </p>

          {/* Stats */}
          <div className="hero-enter hero-enter-d4 flex flex-wrap justify-center gap-10 md:gap-16 mb-12">
            {[
              { v: '12', l: 'Months' },
              { v: 'LATAM', l: 'First' },
              { v: 'AI', l: 'Powered' },
              { v: '$500K', l: 'USD via NITRO' },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <div className="syne text-2xl md:text-3xl font-bold gt">{s.v}</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-zinc-700 mt-1">{s.l}</div>
              </div>
            ))}
          </div>

          <div className="hero-enter hero-enter-d4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#register" className="cta-primary">Get Started</a>
            <a href="#about" className="cta-secondary">Learn More</a>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-zinc-800 flex flex-col items-center gap-2">
          <div className="w-px h-10 bg-gradient-to-b from-zinc-700/50 to-transparent" />
        </div>
      </header>

      {/* ════════ ABOUT ════════ */}
      <section id="about" className="py-28 md:py-36 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <Label color="#06b6d4">What is TURBO</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-8">
              Your <span className="gt">12-month</span> runway<br className="hidden md:block" />
              to Web3 mastery.
            </h2>
          </Reveal>

          <Reveal delay={100}>
            <div className="grid md:grid-cols-2 gap-8 text-zinc-400 text-[15px] leading-relaxed mb-14">
              <p>
                TURBO is EmpowerTours&apos; intensive 12-month program designed for aspiring Web3 founders in Latin America. Go from idea to product — with mentorship, community, and real support behind you.
              </p>
              <p>
                The end goal? Graduates emerge ready to apply for Monad&apos;s{' '}
                <span className="text-purple-400 font-medium">NITRO</span>,
                which awards <span className="text-amber-400 font-medium">$500,000 USD</span> per team. TURBO is the training ground. NITRO is the destination.
              </p>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { title: 'Community-powered', desc: 'A collective of builders funding and supporting each other', color: '#06b6d4' },
                { title: 'NITRO-aligned', desc: 'Curriculum mirrors what NITRO selectors look for', color: '#8b5cf6' },
                { title: 'LATAM-first', desc: 'Built for Latin American founders, taught in Spanish & English', color: '#f59e0b' },
              ].map((item) => (
                <div key={item.title} className="p-5 rounded-xl border border-zinc-800/60 bg-zinc-900/20">
                  <div className="w-2 h-2 rounded-full mb-4" style={{ background: item.color }} />
                  <div className="syne font-bold text-white text-sm mb-1">{item.title}</div>
                  <div className="text-xs text-zinc-500 leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ PROGRAM STRUCTURE ════════ */}
      <section className="py-28 md:py-36 px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <Label color="#8b5cf6">Program Structure</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-14">
              Three phases. <span className="gt">One trajectory.</span>
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {PHASES.map((phase, i) => (
              <Reveal key={phase.num} delay={i * 120}>
                <div className="phase-card" style={{ '--accent-color': phase.accent } as React.CSSProperties}>
                  <div className="syne text-[10px] tracking-[0.2em] uppercase text-zinc-600 mb-1">
                    Months {phase.months}
                  </div>
                  <div className="flex items-baseline gap-3 mb-5">
                    <span className="syne text-4xl font-extrabold" style={{ color: phase.accent, opacity: 0.15 }}>
                      {phase.num}
                    </span>
                    <h3 className="syne text-xl font-bold text-white">{phase.title}</h3>
                  </div>
                  <ul className="space-y-2.5">
                    {phase.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[13px] text-zinc-400">
                        <div className="w-1 h-1 rounded-full mt-2 flex-shrink-0" style={{ background: phase.accent }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ TIERED PRICING ════════ */}
      <section className="py-28 md:py-36 px-6">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <Label color="#f59e0b">Membership Tiers</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
              Choose your <span className="gt">level.</span>
            </h2>
            <p className="text-zinc-500 text-[15px] mb-4 max-w-lg">
              Every tier gets you closer to NITRO. Your monthly contribution fuels the community pool that funds Graduating Founders.
            </p>
            <p className="text-zinc-600 text-[13px] mb-14 max-w-lg">
              Any member from any tier can be nominated as a Graduating Founder. The &quot;Founder&quot; tier is a membership level — not a requirement for selection.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {/* Explorer */}
            <Reveal delay={0}>
              <div className="tier-card">
                <div className="w-2 h-2 rounded-full mb-4" style={{ background: '#06b6d4' }} />
                <div className="syne text-[10px] tracking-[0.2em] uppercase text-zinc-600 mb-1">Tier 1</div>
                <h3 className="syne text-xl font-bold text-white mb-1">Explorer</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="syne text-3xl font-extrabold" style={{ color: '#06b6d4' }}>$50</span>
                  <span className="text-zinc-600 text-sm">MXN/mo</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    'Telegram channel access',
                    'Weekly workshops',
                    'Monthly AMAs',
                    'Community resources',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] text-zinc-400">
                      <Check color="#06b6d4" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a href="#apply" className="cta-secondary w-full mt-8 text-center">Join as Explorer</a>
              </div>
            </Reveal>

            {/* Builder */}
            <Reveal delay={120}>
              <div className="tier-card popular">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="syne text-[9px] font-bold tracking-[0.15em] uppercase bg-purple-500 text-black px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full mb-4" style={{ background: '#8b5cf6' }} />
                <div className="syne text-[10px] tracking-[0.2em] uppercase text-zinc-600 mb-1">Tier 2</div>
                <h3 className="syne text-xl font-bold text-white mb-1">Builder</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="syne text-3xl font-extrabold" style={{ color: '#8b5cf6' }}>$200</span>
                  <span className="text-zinc-600 text-sm">MXN/mo</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    'Everything in Explorer',
                    'Discord channel access',
                    '1:1 mentorship sessions',
                    'Code reviews & feedback',
                    'Priority NITRO prep',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] text-zinc-400">
                      <Check color="#8b5cf6" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a href="#apply" className="cta-primary w-full mt-8 text-center">Join as Builder</a>
              </div>
            </Reveal>

            {/* Founder */}
            <Reveal delay={240}>
              <div className="tier-card">
                <div className="w-2 h-2 rounded-full mb-4" style={{ background: '#f59e0b' }} />
                <div className="syne text-[10px] tracking-[0.2em] uppercase text-zinc-600 mb-1">Tier 3 &middot; Membership Tier</div>
                <h3 className="syne text-xl font-bold text-white mb-1">Founder</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="syne text-3xl font-extrabold" style={{ color: '#f59e0b' }}>$500</span>
                  <span className="text-zinc-600 text-sm">MXN/mo</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {[
                    'Everything in Builder',
                    'VC introductions',
                    'Early access to partnerships',
                    'NITRO application support',
                    'Private Founder-tier group chat',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[13px] text-zinc-400">
                      <Check color="#f59e0b" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a href="#apply" className="cta-secondary w-full mt-8 text-center">Join as Founder</a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ TURBO → NITRO ════════ */}
      <section className="py-28 md:py-36 px-6 relative overflow-hidden">
        <div className="orb" style={{ width: 600, height: 300, background: '#8b5cf6', opacity: 0.04, top: '30%', left: '50%', transform: 'translateX(-50%)' }} />

        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <Label color="#06b6d4">The Pipeline</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-14">
              From <span className="gt">TURBO</span> to <span className="text-purple-400">NITRO</span>.
            </h2>
          </Reveal>

          <Reveal delay={150}>
            <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-stretch">
              <div className="pipeline-box" style={{ borderColor: 'rgba(6,182,212,0.15)' }}>
                <div className="syne text-2xl font-extrabold gt mb-1">TURBO</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-zinc-600 mb-5">By EmpowerTours</div>
                <ul className="space-y-2 text-[13px] text-zinc-400">
                  <li>12-month program</li>
                  <li>Community-funded</li>
                  <li>Mentorship + community</li>
                  <li>LATAM-focused</li>
                </ul>
              </div>

              <div className="hidden md:flex flex-col items-center justify-center gap-1 px-2">
                <div className="text-[9px] tracking-[0.15em] uppercase text-zinc-700 syne">Graduate</div>
                <svg width="40" height="16" viewBox="0 0 40 16" fill="none">
                  <path d="M0 8h32M28 3l6 5-6 5" stroke="#52525b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-[9px] tracking-[0.15em] uppercase text-zinc-700 syne">Apply</div>
              </div>

              <div className="pipeline-box" style={{ borderColor: 'rgba(139,92,246,0.15)' }}>
                <div className="syne text-2xl font-extrabold text-purple-400 mb-1">NITRO</div>
                <div className="text-[10px] tracking-[0.2em] uppercase text-zinc-600 mb-5">By Monad</div>
                <ul className="space-y-2 text-[13px] text-zinc-400">
                  <li>3-month elite program</li>
                  <li className="text-amber-400 font-medium">$500,000 USD per team</li>
                  <li>15 selected teams worldwide</li>
                  <li>Top-tier VC access</li>
                </ul>
              </div>
            </div>
          </Reveal>

          <Reveal delay={250}>
            <div className="mt-8 p-4 rounded-xl border border-zinc-800/40 bg-zinc-900/10 text-center">
              <p className="text-[12px] text-zinc-600 leading-relaxed max-w-lg mx-auto">
                <span className="syne font-semibold text-zinc-500">Important:</span> Becoming a TURBO Founder does not guarantee NITRO selection. NITRO is a completely separate program run by Monad with its own independent application and selection process. TURBO prepares you to be a strong candidate.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ FUNDING MODEL ════════ */}
      <section className="py-28 md:py-36 px-6 relative overflow-hidden">
        <div className="orb" style={{ width: 500, height: 300, background: '#f59e0b', opacity: 0.03, top: '20%', right: '10%' }} />

        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <Label color="#f59e0b">Funding Model</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
              Community-powered <span className="gt">capital.</span>
            </h2>
            <p className="text-zinc-500 text-[15px] mb-14 max-w-xl">
              TURBO is not venture-backed. It&apos;s collectively funded by its own members. Every monthly payment feeds the Founders Club pool.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="p-8 md:p-12 rounded-2xl border border-zinc-800/60 bg-zinc-900/20 text-center">
              <div className="syne text-5xl md:text-7xl font-extrabold gt mb-3">500,000</div>
              <div className="syne text-lg md:text-xl font-bold text-zinc-400 mb-8">MXN Graduating Founders Pool</div>

              <div className="grid sm:grid-cols-3 gap-6 text-center mb-10">
                <div>
                  <div className="syne text-2xl font-bold text-white">340</div>
                  <div className="text-[11px] tracking-[0.12em] uppercase text-zinc-600 mt-1">Members contribute</div>
                </div>
                <div>
                  <div className="syne text-2xl font-bold text-white">12</div>
                  <div className="text-[11px] tracking-[0.12em] uppercase text-zinc-600 mt-1">Months of payments</div>
                </div>
                <div>
                  <div className="syne text-2xl font-bold text-white">~5</div>
                  <div className="text-[11px] tracking-[0.12em] uppercase text-zinc-600 mt-1">Selected to graduate</div>
                </div>
              </div>

              <div className="max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-2 flex-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: '95%', background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)' }} />
                  </div>
                  <span className="syne text-[11px] font-bold text-zinc-500">95%</span>
                </div>
                <div className="flex justify-between text-[10px] tracking-[0.1em] uppercase text-zinc-700">
                  <span>Community Pool</span>
                  <span>5% Treasury</span>
                </div>
              </div>

              <p className="text-[13px] text-zinc-600 mt-8 max-w-sm mx-auto leading-relaxed">
                Each Graduating Founder receives ~100,000 MXN from the community pool to launch their project. Any member from any tier can be selected.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ GOVERNANCE ════════ */}
      <section id="governance" className="py-28 md:py-36 px-6 relative overflow-hidden">
        <div className="orb" style={{ width: 500, height: 300, background: '#06b6d4', opacity: 0.04, top: '10%', left: '5%' }} />
        <div className="orb" style={{ width: 400, height: 300, background: '#8b5cf6', opacity: 0.03, bottom: '10%', right: '5%' }} />

        <div className="max-w-5xl mx-auto relative z-10">
          <Reveal>
            <Label color="#06b6d4">On-Chain Governance</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
              Community-owned <span className="gt">decisions.</span>
            </h2>
            <p className="text-zinc-500 text-[15px] mb-14 max-w-xl">
              TURBO is governed by smart contracts on Monad. Graduating Founder selection progressively decentralizes through a growing council of past winners.
            </p>
          </Reveal>

          {/* Architecture diagram */}
          <Reveal delay={100}>
            <div className="gov-arch mb-12">
              <div className="grid md:grid-cols-3 gap-4 items-stretch">
                {/* Cohort 1 */}
                <div className="gov-card">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} />
                    <span className="syne text-[10px] tracking-[0.15em] uppercase text-zinc-600 font-semibold">Cohort 1</span>
                  </div>
                  <h3 className="syne text-lg font-bold text-white mb-2">Admin Selection</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed mb-4">
                    Earvin selects ~5 Graduating Founders directly from any tier. Selected members are automatically added to the Founders Council.
                  </p>
                  <div className="gov-flow-badge" style={{ background: '#06b6d410', borderColor: '#06b6d420', color: '#06b6d4' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Direct Selection
                  </div>
                </div>

                {/* Arrow */}
                <div className="hidden md:flex flex-col items-center justify-center gap-2">
                  <div className="text-[9px] tracking-[0.15em] uppercase text-zinc-700 syne font-semibold">Council grows</div>
                  <svg width="60" height="16" viewBox="0 0 60 16" fill="none">
                    <path d="M0 8h50M46 3l8 5-8 5" stroke="#52525b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="text-[9px] tracking-[0.15em] uppercase text-zinc-700 syne font-semibold">Each cohort</div>
                </div>

                {/* Cohort 2+ */}
                <div className="gov-card" style={{ borderColor: 'rgba(139, 92, 246, 0.15)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />
                    <span className="syne text-[10px] tracking-[0.15em] uppercase text-zinc-600 font-semibold">Cohort 2+</span>
                  </div>
                  <h3 className="syne text-lg font-bold text-white mb-2">Council Governance</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed mb-4">
                    Past Graduating Founders propose and vote on new Graduating Founder slates. 60% quorum, 7-day voting period. Admin retains emergency veto.
                  </p>
                  <div className="gov-flow-badge" style={{ background: '#8b5cf610', borderColor: '#8b5cf620', color: '#8b5cf6' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                    Council Votes
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Governance flow steps */}
          <Reveal delay={200}>
            <div className="mb-12">
              <h3 className="syne text-lg font-bold text-white mb-6">How Proposals Work</h3>
              <div className="grid md:grid-cols-3 gap-5">
                {GOV_FLOW.map((step, i) => (
                  <div key={step.num} className="gov-step-card" style={{ '--accent-color': step.color } as React.CSSProperties}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="gov-step-icon" style={{ background: `${step.color}12`, borderColor: `${step.color}25` }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={step.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={step.icon} />
                        </svg>
                      </div>
                      <div>
                        <span className="syne text-[10px] tracking-[0.15em] uppercase text-zinc-600 font-semibold">Step {step.num}</span>
                        <h4 className="syne text-sm font-bold text-white">{step.title}</h4>
                      </div>
                    </div>
                    <p className="text-[13px] text-zinc-500 leading-relaxed">{step.desc}</p>
                    {i < GOV_FLOW.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-3 text-zinc-800">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M8 3l3 3-3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Key governance parameters */}
          <Reveal delay={300}>
            <div className="grid sm:grid-cols-4 gap-4 mb-12">
              {[
                { value: '60%', label: 'Quorum', desc: 'Council must participate' },
                { value: '7d', label: 'Voting Period', desc: 'Time to cast votes' },
                { value: '10', label: 'Max Slate', desc: 'Founders per proposal' },
                { value: '5%', label: 'Treasury Fee', desc: 'Ops & sustainability' },
              ].map((param) => (
                <div key={param.label} className="text-center p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/20">
                  <div className="syne text-2xl font-extrabold gt">{param.value}</div>
                  <div className="syne text-[11px] font-bold text-zinc-400 mt-1">{param.label}</div>
                  <div className="text-[10px] text-zinc-700 mt-0.5">{param.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Contract addresses */}
          <Reveal delay={400}>
            <div className="p-6 rounded-2xl border border-zinc-800/60 bg-zinc-900/20">
              <h3 className="syne text-sm font-bold text-white mb-4">Verified Contracts on Monad</h3>
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-zinc-900/40">
                  <div>
                    <div className="syne text-[11px] font-semibold text-zinc-400">TurboCohortV6</div>
                    <div className="text-[10px] text-zinc-600">Membership, payments, pool, soulbound NFTs</div>
                  </div>
                  <a
                    href={`https://monadscan.com/address/${CONTRACTS.cohort}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-cyan-500/70 hover:text-cyan-400 transition-colors break-all"
                  >
                    {CONTRACTS.cohort}
                  </a>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-zinc-900/40">
                  <div>
                    <div className="syne text-[11px] font-semibold text-zinc-400">TurboGovernance</div>
                    <div className="text-[10px] text-zinc-600">Council voting, proposals, admin passthrough</div>
                  </div>
                  <a
                    href={`https://monadscan.com/address/${CONTRACTS.governance}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-purple-500/70 hover:text-purple-400 transition-colors break-all"
                  >
                    {CONTRACTS.governance}
                  </a>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                  Ownable2Step
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                  ReentrancyGuard
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                  SafeERC20
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                  EnumerableSet
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500/60"></span>
                  Soulbound NFTs
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ HOW TO REGISTER ════════ */}
      <section id="register" className="py-28 md:py-36 px-6">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <Label color="#f59e0b">How to Join</Label>
            <h2 className="syne text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
              Three steps to <span className="gt">get started.</span>
            </h2>
            <p className="text-zinc-500 text-[15px] mb-14 max-w-lg">
              Becoming a TURBO candidate is simple. Complete these steps and you&apos;re in the pipeline.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {STEPS.map((step, i) => (
              <Reveal key={step.num} delay={i * 120}>
                <div className="phase-card" style={{ '--accent-color': step.color } as React.CSSProperties}>
                  <span className="syne text-4xl font-extrabold" style={{ color: step.color, opacity: 0.15 }}>
                    {step.num}
                  </span>
                  <h3 className="syne text-lg font-bold text-white mt-2 mb-3">{step.title}</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed mb-5">{step.desc}</p>
                  <a
                    href={step.link}
                    target={step.link.startsWith('http') ? '_blank' : undefined}
                    rel={step.link.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="inline-block syne text-[11px] font-bold tracking-[0.08em] uppercase py-2 px-4 rounded-lg transition-all duration-200 hover:brightness-110"
                    style={{ background: `${step.color}15`, color: step.color }}
                  >
                    {step.cta}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ FAQ ════════ */}
      <section className="py-28 md:py-36 px-6">
        <div className="max-w-2xl mx-auto">
          <Reveal>
            <Label color="#71717a">FAQ</Label>
            <h2 className="syne text-3xl md:text-4xl font-bold text-white mb-10">
              Got questions?
            </h2>
          </Reveal>

          <div className="space-y-2">
            {FAQS.map((faq, i) => (
              <Reveal key={i} delay={i * 60}>
                <div className="faq-item">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-4 p-5 text-left bg-transparent border-none cursor-pointer"
                  >
                    <span className="syne font-semibold text-[14px] text-zinc-300">{faq.q}</span>
                    <svg
                      width="16" height="16" viewBox="0 0 16 16" fill="none"
                      className="flex-shrink-0 transition-transform duration-300"
                      style={{ transform: openFaq === i ? 'rotate(45deg)' : 'none' }}
                    >
                      <path d="M8 3v10M3 8h10" stroke="#52525b" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  <div className={`faq-answer ${openFaq === i ? 'open' : ''}`}>
                    <p className="text-[13px] text-zinc-500 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="divider mx-6" />

      {/* ════════ APPLY ════════ */}
      <section id="apply" className="py-28 md:py-36 px-6 relative">
        <div className="orb" style={{ width: 400, height: 400, background: '#06b6d4', opacity: 0.04, bottom: 0, left: '50%', transform: 'translateX(-50%)' }} />

        <div className="max-w-lg mx-auto relative z-10">
          <Reveal>
            <div className="text-center mb-10">
              <Label color="#06b6d4">Apply</Label>
              <h2 className="syne text-3xl md:text-4xl font-bold text-white mb-3">
                Ready to go <span className="gt">full throttle?</span>
              </h2>
              <p className="text-zinc-600 text-sm">Cohort 1 applications are open. Limited spots.</p>
            </div>
          </Reveal>

          {submitted ? (
            <Reveal>
              <div className="text-center p-6 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.03] mb-6">
                <div className="syne text-xl font-bold gt mb-2">Application Received</div>
                <p className="text-zinc-500 text-sm">
                  We&apos;ll review your application and get back to you within 48 hours.
                </p>
              </div>

              {/* ── Member Dashboard ── */}
              <div className="space-y-5">

                {/* Wallet Connect */}
                <div className="p-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/20">
                  <div className="syne text-sm font-bold text-white mb-3">Your Wallet</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="0x..."
                      className="flex-1"
                    />
                    {walletAddress && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(walletAddress, 'wallet')}
                        className="cta-secondary text-[11px] px-2 whitespace-nowrap"
                        title="Copy address"
                      >
                        {copiedField === 'wallet' ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        fetchSafeInfo(walletAddress);
                        fetchMemberData(walletAddress);
                        fetchNftCard(walletAddress);
                      }}
                      disabled={loadingSafe || loadingMember || !walletAddress}
                      className="cta-secondary text-[11px] px-3 whitespace-nowrap"
                      style={{ opacity: loadingSafe || !walletAddress ? 0.5 : 1 }}
                    >
                      {loadingSafe || loadingMember ? '...' : 'Load Status'}
                    </button>
                  </div>

                  {safeInfo && (
                    <div className="mt-3 p-3 rounded-lg border border-zinc-800/40 bg-zinc-900/30 text-[12px]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-zinc-600">Safe Address</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(safeInfo.safeAddress, 'safe')}
                          className="flex items-center gap-1.5 text-zinc-400 font-mono text-[10px] hover:text-cyan-400 transition-colors cursor-pointer bg-transparent border-none p-0"
                          title="Click to copy full address"
                        >
                          {safeInfo.safeAddress.slice(0, 6)}...{safeInfo.safeAddress.slice(-4)}
                          <span className="text-[9px]">{copiedField === 'safe' ? '\u2713' : '\u2398'}</span>
                        </button>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="text-zinc-600">WMON Balance</span>
                        <span className="text-zinc-400">{safeInfo.wmonBalance} WMON</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-600">Status</span>
                        <span className={safeInfo.isFunded ? 'text-green-400' : 'text-amber-400'}>
                          {safeInfo.isFunded ? 'Funded' : 'Needs funding'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment Tracker — 12 month progress */}
                {memberData && memberData.tierId > 0 && (
                  <div className="p-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="syne text-sm font-bold text-white">Payment Tracker</div>
                      <div className="syne text-[11px] font-bold" style={{
                        color: memberData.tier === 'Explorer' ? '#06b6d4' : memberData.tier === 'Builder' ? '#8b5cf6' : '#f59e0b'
                      }}>
                        {memberData.tier}
                      </div>
                    </div>

                    {/* 12-month progress bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] tracking-[0.12em] uppercase text-zinc-600">Payments</span>
                        <span className="syne text-[12px] font-bold" style={{
                          color: memberData.tier === 'Explorer' ? '#06b6d4' : memberData.tier === 'Builder' ? '#8b5cf6' : '#f59e0b'
                        }}>
                          {memberData.monthsPaid}/12
                        </span>
                      </div>
                      <div className="payment-track">
                        {Array.from({ length: 12 }).map((_, i) => {
                          const paid = i < memberData.monthsPaid;
                          const tierColor = memberData.tier === 'Explorer' ? '#06b6d4' : memberData.tier === 'Builder' ? '#8b5cf6' : '#f59e0b';
                          return (
                            <div
                              key={i}
                              className="payment-bar"
                              style={{
                                background: paid ? tierColor : '#1c1c22',
                                boxShadow: paid ? `0 0 8px ${tierColor}30` : 'none',
                              }}
                              title={`Month ${i + 1}${paid ? ' - Paid' : ' - Unpaid'}`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div className="text-center p-2 rounded-lg bg-zinc-900/40">
                        <div className="syne text-sm font-bold text-white">{memberData.totalPaid}</div>
                        <div className="text-[9px] text-zinc-700 uppercase tracking-wider">WMON Paid</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-zinc-900/40">
                        <div className="syne text-sm font-bold text-white">{12 - memberData.monthsPaid}</div>
                        <div className="text-[9px] text-zinc-700 uppercase tracking-wider">Remaining</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-zinc-900/40">
                        <div className="syne text-sm font-bold text-white">
                          {memberData.monthsPaid >= 12 ? (
                            <span className="text-green-400">Complete</span>
                          ) : memberData.lastPaymentTime > 0 ? (
                            (() => {
                              const nextDue = (memberData.lastPaymentTime + 25 * 86400) * 1000;
                              const now = Date.now();
                              if (now >= nextDue) return <span className="text-amber-400">Due</span>;
                              const days = Math.ceil((nextDue - now) / 86400000);
                              return `${days}d`;
                            })()
                          ) : '—'}
                        </div>
                        <div className="text-[9px] text-zinc-700 uppercase tracking-wider">Next Due</div>
                      </div>
                    </div>

                    {memberData.isFounder && (
                      <div className="mt-3 p-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.03] text-center">
                        <span className="syne text-[11px] font-bold text-amber-400">Graduating Founder</span>
                      </div>
                    )}
                  </div>
                )}

                {/* NFT Card */}
                {(nftCard || loadingCard) && (
                  <div className="nft-card-wrapper">
                    {loadingCard ? (
                      <div className="flex flex-col items-center justify-center py-10">
                        <div className="nft-card-spinner mb-3" />
                        <p className="text-zinc-600 text-xs syne">Loading your membership card...</p>
                      </div>
                    ) : nftCard ? (
                      <div className="nft-card-reveal text-center">
                        <img src={nftCard.svgDataUri} alt={nftCard.name} className="nft-card-img mx-auto" />
                        <div className="mt-4">
                          <div className="syne text-sm font-bold text-white">{nftCard.name}</div>
                          <div className="text-[10px] text-zinc-600 mt-0.5">Soulbound &middot; Non-transferable &middot; On-chain SVG</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Tier Selector + Upgrade */}
                <div className="p-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/20">
                  <div className="syne text-sm font-bold text-white mb-1">
                    {memberData && memberData.tierId > 0 ? 'Tier & Payment' : 'Select Tier & Pay'}
                  </div>
                  <p className="text-zinc-600 text-[11px] mb-4">
                    {memberData && memberData.tierId > 0
                      ? 'Make your next payment or upgrade your tier.'
                      : 'Choose your tier and make your first WMON payment to join.'}
                  </p>

                  {/* Tier selector */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {([
                      { value: 'explorer', label: 'Explorer', color: '#06b6d4', id: 1 },
                      { value: 'builder', label: 'Builder', color: '#8b5cf6', id: 2 },
                      { value: 'founder', label: 'Founder', color: '#f59e0b', id: 3 },
                    ] as const).map((t) => {
                      const isCurrent = memberData && memberData.tierId === t.id;
                      const isLower = memberData && memberData.tierId > 0 && t.id < memberData.tierId;
                      const isSelected = selectedPayTier === t.value;
                      const price = tierPrices ? tierPrices[t.value as keyof typeof tierPrices] : null;

                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => {
                            if (isLower) return; // can't downgrade
                            setSelectedPayTier(t.value);
                          }}
                          disabled={!!isLower}
                          className="p-3 rounded-xl border text-center transition-all duration-200 relative"
                          style={{
                            borderColor: isSelected ? t.color : isCurrent ? `${t.color}40` : 'rgba(63,63,70,0.3)',
                            background: isSelected ? `${t.color}08` : 'transparent',
                            opacity: isLower ? 0.35 : 1,
                            cursor: isLower ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {isCurrent && (
                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] syne font-bold tracking-wider uppercase px-2 py-0.5 rounded-full"
                              style={{ background: `${t.color}20`, color: t.color }}>
                              Current
                            </span>
                          )}
                          <div className="syne text-xs font-bold text-white">{t.label}</div>
                          {price && (
                            <div className="text-[10px] mt-0.5" style={{ color: isSelected ? t.color : '#71717a' }}>
                              {price} <span className="text-zinc-700">WMON</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Upgrade button (if selecting a higher tier than current) */}
                  {memberData && memberData.tierId > 0 && (() => {
                    const tierIds: Record<string, number> = { explorer: 1, builder: 2, founder: 3 };
                    const selectedId = tierIds[selectedPayTier] || 0;
                    if (selectedId > memberData.tierId) {
                      return (
                        <div className="mb-4">
                          <button
                            type="button"
                            onClick={() => handleUpgradeTier(selectedPayTier)}
                            disabled={upgradeStep === 'upgrading'}
                            className="w-full py-3 px-4 rounded-xl border text-center syne text-[12px] font-bold tracking-[0.06em] uppercase transition-all cursor-pointer"
                            style={{
                              borderColor: selectedPayTier === 'builder' ? '#8b5cf620' : '#f59e0b20',
                              background: selectedPayTier === 'builder' ? '#8b5cf608' : '#f59e0b08',
                              color: selectedPayTier === 'builder' ? '#8b5cf6' : '#f59e0b',
                              opacity: upgradeStep === 'upgrading' ? 0.6 : 1,
                            }}
                          >
                            {upgradeStep === 'upgrading' ? 'Upgrading...' : `Upgrade to ${selectedPayTier.charAt(0).toUpperCase() + selectedPayTier.slice(1)}`}
                          </button>
                          {upgradeStep === 'success' && (
                            <p className="text-green-400 text-[11px] text-center mt-2">Tier upgraded! Your NFT card has been updated.</p>
                          )}
                          {upgradeError && (
                            <p className="text-red-400 text-[11px] text-center mt-2">{upgradeError}</p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Pay button */}
                  {payError && (
                    <div className="text-red-400 text-sm text-center p-3 rounded-lg bg-red-500/5 border border-red-500/10 mb-3">
                      {payError}
                    </div>
                  )}

                  {payStep === 'success' && payResult ? (
                    <div className="text-center p-4 rounded-xl border border-green-500/15 bg-green-500/[0.03]">
                      <div className="syne text-sm font-bold text-green-400 mb-1">Payment Confirmed</div>
                      <p className="text-zinc-500 text-[11px] mb-3">{payResult.amount} WMON paid.</p>
                      <a
                        href={`https://monadscan.com/tx/${payResult.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-[10px] syne font-bold tracking-[0.08em] uppercase py-1.5 px-3 rounded-lg bg-green-500/10 text-green-400 hover:brightness-110 transition-all"
                      >
                        View on MonadScan
                      </a>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handlePayment}
                        disabled={payStep === 'paying' || !walletAddress}
                        className="cta-primary w-full"
                        style={{ opacity: payStep === 'paying' || !walletAddress ? 0.6 : 1 }}
                      >
                        {payStep === 'paying' ? 'Processing...' : memberData && memberData.monthsPaid > 0 ? 'Make Next Payment' : 'Make First Payment'}
                      </button>
                      <p className="text-center text-[10px] text-zinc-800 mt-2">
                        Approve + pay via your Safe on Monad. Requires WMON.
                      </p>
                    </>
                  )}
                </div>

              </div>
            </Reveal>
          ) : (
            <Reveal delay={100}>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                setError('');
                try {
                  const res = await fetch('/api/turbo/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(form),
                  });
                  const data = await res.json();
                  if (!res.ok || !data.success) {
                    setError(data.error || 'Something went wrong. Please try again.');
                  } else {
                    setSubmitted(true);
                  }
                } catch {
                  setError('Network error. Please check your connection and try again.');
                } finally {
                  setLoading(false);
                }
              }} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] tracking-[0.12em] uppercase text-zinc-600 mb-2 syne font-semibold">Name</label>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
                  </div>
                  <div>
                    <label className="block text-[11px] tracking-[0.12em] uppercase text-zinc-600 mb-2 syne font-semibold">Email</label>
                    <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] tracking-[0.12em] uppercase text-zinc-600 mb-2 syne font-semibold">Twitter / X</label>
                    <input type="text" value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} placeholder="@handle" />
                  </div>
                  <div>
                    <label className="block text-[11px] tracking-[0.12em] uppercase text-zinc-600 mb-2 syne font-semibold">Bybit UID</label>
                    <input type="text" required value={form.bybit} onChange={(e) => setForm({ ...form, bybit: e.target.value })} placeholder="Your Bybit UID" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] tracking-[0.12em] uppercase text-zinc-600 mb-2 syne font-semibold">Why TURBO?</label>
                  <textarea required rows={3} value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })}
                    placeholder="What are you building and why is TURBO the right fit..." style={{ resize: 'none' }} />
                </div>

                {/* Tier selection */}
                <div>
                  <label className="block text-[11px] tracking-[0.12em] uppercase text-zinc-600 mb-3 syne font-semibold">Select your tier</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { value: 'explorer', label: 'Explorer', price: '$50', color: '#06b6d4' },
                      { value: 'builder', label: 'Builder', price: '$200', color: '#8b5cf6' },
                      { value: 'founder', label: 'Founder', price: '$500', color: '#f59e0b' },
                    ] as const).map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, tier: t.value })}
                        className="p-3 rounded-xl border text-center transition-all duration-200"
                        style={{
                          borderColor: form.tier === t.value ? t.color : 'rgba(63,63,70,0.3)',
                          background: form.tier === t.value ? `${t.color}08` : 'transparent',
                        }}
                      >
                        <div className="syne text-xs font-bold text-white">{t.label}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: form.tier === t.value ? t.color : '#71717a' }}>
                          {t.price} <span className="text-zinc-700">MXN/mo</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="text-red-400 text-sm text-center p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="cta-primary w-full mt-2" style={{ opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Submitting...' : 'Submit Application'}
                </button>

                <p className="text-center text-[11px] text-zinc-800">Rolling admissions. Cohort 1 starts soon.</p>
              </form>
            </Reveal>
          )}
        </div>
      </section>

      {/* ════════ FOOTER ════════ */}
      <footer className="py-12 px-6 border-t border-zinc-900/50">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="syne text-sm font-bold gt">TURBO</span>
            <span className="text-zinc-800 text-xs">by EmpowerTours</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-zinc-800">
            <span>Powered by Monad</span>
            <span className="w-px h-2.5 bg-zinc-900" />
            <span>&copy; 2026 EmpowerTours</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
