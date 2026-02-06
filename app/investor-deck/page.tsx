'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function InvestorDeck() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 11;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setCurrentSlide(s => Math.min(s + 1, totalSlides - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        e.preventDefault();
        setCurrentSlide(s => Math.max(s - 1, 0));
      } else if (e.key === 'Home') {
        setCurrentSlide(0);
      } else if (e.key === 'End') {
        setCurrentSlide(totalSlides - 1);
      }
    };

    let touchStartX = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      const diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) setCurrentSlide(s => Math.min(s + 1, totalSlides - 1));
        else setCurrentSlide(s => Math.max(s - 1, 0));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const slides = [
    // Slide 1: Title
    <div key="1" className="slide center">
      <h1 className="gradient">EmpowerTours</h1>
      <p className="subtitle">On-Chain Settlement Infrastructure for the Creator Economy</p>
      <div className="tags">
        <span className="tag tag-cyan">Monad Blockchain</span>
        <span className="tag tag-purple">15+ Live Contracts</span>
        <span className="tag tag-green">70% Creator Payouts</span>
      </div>
      <p className="prepared">Prepared for <strong>Faisal Al Hammadi</strong><br/>Further Asset Management</p>
      <p className="date">February 2026</p>
    </div>,

    // Slide 2: Executive Summary
    <div key="2" className="slide">
      <h2>Executive Summary</h2>
      <p className="intro">EmpowerTours is a <strong>blockchain settlement layer</strong> for the $150B creator economy. All revenue splits enforced on-chain via smart contracts.</p>
      <div className="grid-2">
        <div className="card card-accent">
          <h3>The Opportunity</h3>
          <ul>
            <li>Spotify pays artists 30% after 90 days</li>
            <li>We pay <span className="highlight">70% in the same transaction</span></li>
            <li>Zero counterparty risk - all on-chain</li>
            <li>DAO governance with real voting power</li>
          </ul>
        </div>
        <div className="stats-grid">
          <div className="card"><div className="stat">15+</div><div className="stat-label">Verified Contracts</div></div>
          <div className="card"><div className="stat">70%</div><div className="stat-label">Creator Payout</div></div>
          <div className="card"><div className="stat">68+</div><div className="stat-label">API Endpoints</div></div>
          <div className="card"><div className="stat">10K</div><div className="stat-label">TPS (Monad)</div></div>
        </div>
      </div>
    </div>,

    // Slide 3: Problem
    <div key="3" className="slide">
      <h2>The Problem: Broken Creator Economics</h2>
      <div className="grid-2">
        <div className="card">
          <h3 className="white">Platform Comparison</h3>
          <table>
            <thead><tr><th>Platform</th><th>Creator Cut</th><th>Settlement</th></tr></thead>
            <tbody>
              <tr><td>Spotify</td><td className="red">30%</td><td>30-90 days</td></tr>
              <tr><td>YouTube</td><td className="yellow">45%</td><td>Monthly</td></tr>
              <tr><td>Apple Music</td><td className="yellow">52%</td><td>Monthly</td></tr>
              <tr><td className="cyan bold">EmpowerTours</td><td className="highlight">70%</td><td className="highlight">Instant</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="card card-accent">
            <h3 className="red">$26B Lost Annually</h3>
            <ul>
              <li>Intermediaries capture majority of value</li>
              <li>No direct artist-fan relationship</li>
              <li>Opaque royalty calculations</li>
              <li>Minimum payout thresholds ($100+)</li>
            </ul>
          </div>
          <div className="callout-red">
            <strong>Result:</strong> 300 Spotify streams = $1 coffee
          </div>
        </div>
      </div>
    </div>,

    // Slide 4: Solution
    <div key="4" className="slide">
      <h2>Our Solution: On-Chain Settlement Layer</h2>
      <p className="intro">Every revenue split enforced by smart contracts. Instant settlement. Zero counterparty risk.</p>
      <div className="grid-3">
        <div className="card card-accent">
          <h3 className="green">Instant Settlement</h3>
          <p>Artist receives 70% in the same transaction as purchase. No delays, no minimums.</p>
          <div className="highlight-box green">Fan buys → Artist paid → Same block</div>
        </div>
        <div className="card card-accent">
          <h3 className="purple">DAO Governance</h3>
          <p>Creators vote on platform parameters, treasury allocation. Real governance, not advisory.</p>
          <div className="highlight-box purple">48h timelock • 4% quorum</div>
        </div>
        <div className="card card-accent">
          <h3>Account Abstraction</h3>
          <p>100% gasless transactions via ERC-4337. Users never see approve popups.</p>
          <div className="highlight-box cyan">Safe Accounts • Pimlico</div>
        </div>
      </div>
    </div>,

    // Slide 5: Product
    <div key="5" className="slide">
      <h2>Live Product: Farcaster Mini App</h2>
      <div className="grid-2 align-center">
        <div className="screenshot-container">
          <img src="/investor-deck/oracle-final.png" alt="EmpowerTours App" className="screenshot" />
        </div>
        <div>
          <h3 className="white">Features Live Today</h3>
          <ul>
            <li><strong>AI Oracle</strong> - Natural language interface</li>
            <li><strong>Music NFTs</strong> - Mint, license, trade on-chain</li>
            <li><strong>Live Radio</strong> - Decentralized jukebox + tips</li>
            <li><strong>Passport NFTs</strong> - GPS-verified collectibles</li>
            <li><strong>DAO Voting</strong> - Real governance with TOURS</li>
            <li><strong>EPK Registry</strong> - AI press kits + booking</li>
          </ul>
          <div className="tags" style={{marginTop: '20px'}}>
            <span className="tag tag-green">Production</span>
            <span className="tag tag-cyan">Farcaster Native</span>
            <span className="tag tag-purple">Gasless UX</span>
          </div>
        </div>
      </div>
    </div>,

    // Slide 6: Revenue
    <div key="6" className="slide">
      <h2>Revenue Model: 30% Platform Commission</h2>
      <div className="grid-2">
        <div className="card">
          <table>
            <thead><tr><th>Revenue Stream</th><th>Split</th><th>Settlement</th></tr></thead>
            <tbody>
              <tr><td>Music License Sales</td><td className="highlight">70/30</td><td>Same-tx</td></tr>
              <tr><td>Radio Queue Fees</td><td>70/15/15</td><td>Same-tx</td></tr>
              <tr><td>Subscriptions</td><td>70/20/10</td><td>Monthly pool</td></tr>
              <tr><td>EPK Bookings</td><td>Escrow</td><td>On completion</td></tr>
              <tr><td>Climbing Locations</td><td className="highlight">70/30</td><td>Same-tx</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card card-accent">
          <h3>Unit Economics</h3>
          <p className="small">10,000 Subscribers @ 300 WMON/mo</p>
          <div className="economics">
            <div className="econ-row"><span>Gross Revenue</span><span className="highlight">3,000,000 WMON</span></div>
            <div className="econ-row"><span>Artist Pool (70%)</span><span>2,100,000 WMON</span></div>
            <div className="econ-row"><span>DAO Reserve (20%)</span><span>600,000 WMON</span></div>
            <div className="econ-row last"><span>Treasury (10%)</span><span className="green">300,000 WMON</span></div>
          </div>
        </div>
      </div>
    </div>,

    // Slide 7: Contracts
    <div key="7" className="slide">
      <h2>Smart Contract Infrastructure</h2>
      <p className="intro">15+ verified contracts on Monad Mainnet. All open-source.</p>
      <div className="card">
        <table className="contracts-table">
          <thead><tr><th>Contract</th><th>Purpose</th><th>Address</th></tr></thead>
          <tbody>
            <tr><td><strong>EmpowerToursNFTV2</strong></td><td>Music license NFT sales (70/30)</td><td className="mono">0xB9B3...B73F</td></tr>
            <tr><td><strong>LiveRadioV3</strong></td><td>Radio queue, tips, voice notes</td><td className="mono">0x042E...00fd</td></tr>
            <tr><td><strong>MusicSubscriptionV5</strong></td><td>Monthly artist pool distribution</td><td className="mono">0x5372...5f19</td></tr>
            <tr><td><strong>EmpowerToursGovernor</strong></td><td>ERC-721 DAO governance + timelock</td><td className="mono">0x4d05...52Fa3</td></tr>
            <tr><td><strong>ToursTokenV2</strong></td><td>ERC-20 governance + reward token</td><td className="mono">0xf61F...f74f</td></tr>
            <tr><td><strong>EPKRegistryV2</strong></td><td>EPK metadata + booking escrow</td><td className="mono">0x232D...621D</td></tr>
          </tbody>
        </table>
      </div>
      <div className="tags">
        <span className="tag tag-cyan">OpenZeppelin Standards</span>
        <span className="tag tag-purple">Verified on MonadScan</span>
        <span className="tag tag-green">Pyth Entropy VRF</span>
      </div>
    </div>,

    // Slide 8: Agent World
    <div key="8" className="slide">
      <h2>Agent World: AI Economic Participants</h2>
      <div className="grid-2 align-center">
        <div className="screenshot-container">
          <img src="/investor-deck/05-agent-world.png" alt="Agent World" className="screenshot" />
        </div>
        <div>
          <p>Autonomous AI agents can register, pay entry fees, and participate in the economy.</p>
          <div className="card" style={{marginTop: '16px'}}>
            <h3 className="white">Agent Capabilities</h3>
            <ul>
              <li>Purchase music NFTs autonomously</li>
              <li>Queue songs on Live Radio</li>
              <li>Vote on DAO proposals</li>
              <li>Tip artists based on AI preferences</li>
              <li>Compete on TOURS leaderboard</li>
            </ul>
          </div>
          <div className="highlight-box purple" style={{marginTop: '12px'}}>
            <strong>Entry:</strong> 1 MON | <strong>API:</strong> 7 endpoints
          </div>
        </div>
      </div>
    </div>,

    // Slide 9: Investment
    <div key="9" className="slide">
      <h2>Investment Opportunity</h2>
      <div className="grid-3">
        <div className="card card-accent">
          <h3 className="green">Treasury LP</h3>
          <p>Deposit into Platform Safe. Structured product exposure to platform revenue.</p>
          <ul className="small-list">
            <li>Direct treasury participation</li>
            <li>Transparent on-chain allocation</li>
            <li>DAO voting rights included</li>
          </ul>
        </div>
        <div className="card card-accent">
          <h3 className="purple">Revenue Share</h3>
          <p>Direct participation in platform&apos;s 30% commission across all streams.</p>
          <ul className="small-list">
            <li>Cash-flow positive investment</li>
            <li>Multiple revenue streams</li>
            <li>Instant on-chain settlement</li>
          </ul>
        </div>
        <div className="card card-accent">
          <h3>Token Allocation</h3>
          <p>TOURS governance tokens with vesting. Real voting power over platform.</p>
          <ul className="small-list">
            <li>12-24 month vesting</li>
            <li>Governance + utility</li>
            <li>Bitcoin-style halving</li>
          </ul>
        </div>
      </div>
      <div className="cta-box">
        <strong>Why Further Asset Management?</strong> Pioneering financial infrastructure + Digital assets + Structured products = Perfect alignment
      </div>
    </div>,

    // Slide 10: Roadmap
    <div key="10" className="slide">
      <h2>Roadmap & Revenue Projections</h2>
      <div className="grid-3">
        <div className="card">
          <h3 className="muted">Year 1 (2026)</h3>
          <div className="stat">$100K</div>
          <div className="stat-label">Platform Revenue</div>
          <ul className="small-list">
            <li>500 active users</li>
            <li>50 artists onboarded</li>
            <li>100 music NFTs</li>
          </ul>
        </div>
        <div className="card card-accent">
          <h3>Year 2 (2027)</h3>
          <div className="stat">$1M</div>
          <div className="stat-label">Platform Revenue</div>
          <ul className="small-list">
            <li>5,000 active users</li>
            <li>500 artists</li>
            <li>1,000 NFT tx/month</li>
          </ul>
        </div>
        <div className="card">
          <h3 className="green">Year 3 (2028)</h3>
          <div className="stat">$10M</div>
          <div className="stat-label">Platform Revenue</div>
          <ul className="small-list">
            <li>50,000 active users</li>
            <li>5,000 artists</li>
            <li>Multi-chain expansion</li>
          </ul>
        </div>
      </div>
      <p className="footnote">Assumptions: 50% YoY growth | Avg WMON = $10 USD | 30% platform commission</p>
    </div>,

    // Slide 11: Contact
    <div key="11" className="slide center">
      <h2>Let&apos;s Connect</h2>
      <div className="grid-2 qr-grid">
        <div className="card card-accent">
          <h3>Live Demo</h3>
          <p>Scan to open in Warpcast</p>
          <div className="qr-row">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://farcaster.xyz/miniapps/83hgtZau7TNB/empowertours" alt="QR" className="qr" />
            <div>
              <p className="cyan">Farcaster Mini App</p>
              <p className="mono">farcaster.xyz/miniapps/...</p>
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Verify On-Chain</h3>
          <p>All contracts on MonadScan</p>
          <div className="qr-row">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://monadscan.com/address/0xB9B3acf33439360B55d12429301E946f34f3B73F" alt="QR" className="qr" />
            <div>
              <p className="cyan">NFT Contract</p>
              <p className="mono">monadscan.com/...</p>
            </div>
          </div>
        </div>
      </div>
      <div className="contact-footer">
        <p><strong>Monad Mainnet</strong> (Chain ID: 143)</p>
        <p className="mono">fcempowertours-production-6551.up.railway.app</p>
      </div>
    </div>,
  ];

  return (
    <>
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; overflow: hidden; font-family: 'Inter', -apple-system, sans-serif; background: #0a0a0f; color: white; }

        .progress { position: fixed; top: 0; left: 0; height: 3px; background: linear-gradient(90deg, #06b6d4, #8b5cf6, #10b981); transition: width 0.3s ease; z-index: 100; }
        .hint { position: fixed; top: 16px; right: 16px; font-size: 11px; color: rgba(255,255,255,0.3); z-index: 100; }
        .slide-counter { position: fixed; bottom: 32px; left: 24px; font-size: 13px; color: rgba(255,255,255,0.4); z-index: 100; }

        .nav { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 100; }
        .nav-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.2); cursor: pointer; transition: all 0.3s ease; }
        .nav-dot.active { background: #06b6d4; width: 24px; border-radius: 4px; }

        .nav-arrows { position: fixed; bottom: 24px; right: 24px; display: flex; gap: 8px; z-index: 100; }
        .nav-btn { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: all 0.2s ease; }
        .nav-btn:hover { background: rgba(255,255,255,0.1); }
        .nav-btn:active { transform: scale(0.95); }

        .deck { height: 100%; display: flex; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        .slide { min-width: 100vw; height: 100vh; padding: 40px; display: flex; flex-direction: column; position: relative; overflow: hidden; }
        .slide::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 50% at 20% -20%, rgba(6, 182, 212, 0.12), transparent), radial-gradient(ellipse 60% 40% at 80% 120%, rgba(139, 92, 246, 0.08), transparent); pointer-events: none; }
        .slide > * { position: relative; z-index: 1; }
        .slide.center { align-items: center; justify-content: center; text-align: center; }

        h1 { font-size: clamp(36px, 8vw, 72px); font-weight: 800; line-height: 1.1; letter-spacing: -2px; }
        h2 { font-size: clamp(24px, 5vw, 42px); font-weight: 700; margin-bottom: 24px; letter-spacing: -1px; }
        h3 { font-size: 18px; font-weight: 600; color: #06b6d4; margin-bottom: 12px; }
        h3.white { color: white; }
        h3.red { color: #ef4444; }
        h3.green { color: #10b981; }
        h3.purple { color: #8b5cf6; }
        h3.muted { color: rgba(255,255,255,0.5); }
        p { font-size: 16px; color: rgba(255,255,255,0.7); line-height: 1.6; }

        .gradient { background: linear-gradient(135deg, #06b6d4, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .subtitle { font-size: clamp(16px, 3vw, 24px); color: rgba(255,255,255,0.5); margin-top: 12px; }
        .intro { max-width: 700px; margin-bottom: 24px; }
        .prepared { margin-top: 48px; font-size: 14px; color: rgba(255,255,255,0.4); }
        .prepared strong { color: rgba(255,255,255,0.6); }
        .date { margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.25); }

        .tags { margin-top: 32px; }
        .tag { display: inline-block; padding: 6px 12px; border-radius: 100px; font-size: 11px; font-weight: 600; margin: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .tag-cyan { background: rgba(6, 182, 212, 0.15); color: #06b6d4; }
        .tag-purple { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
        .tag-green { background: rgba(16, 185, 129, 0.15); color: #10b981; }

        .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; flex: 1; }
        .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .align-center { align-items: center; }
        @media (max-width: 768px) { .grid-2, .grid-3, .stats-grid { grid-template-columns: 1fr; } .slide { padding: 24px 20px 80px; } }

        .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; }
        .card-accent { border-color: rgba(6, 182, 212, 0.2); background: linear-gradient(135deg, rgba(6, 182, 212, 0.06), rgba(139, 92, 246, 0.04)); }

        .stat { font-size: 32px; font-weight: 800; color: #06b6d4; }
        .stat-label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }

        ul { list-style: none; }
        li { padding: 8px 0; font-size: 15px; color: rgba(255,255,255,0.75); padding-left: 20px; position: relative; }
        li::before { content: ''; position: absolute; left: 0; top: 14px; width: 6px; height: 6px; border-radius: 50%; background: #06b6d4; }
        .small-list li { font-size: 13px; padding: 6px 0; }

        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.08); }
        th { font-weight: 600; color: rgba(255,255,255,0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        .contracts-table { font-size: 13px; }

        .highlight { color: #10b981; font-weight: 600; }
        .red { color: #ef4444; }
        .yellow { color: #f59e0b; }
        .cyan { color: #06b6d4; }
        .green { color: #10b981; }
        .purple { color: #8b5cf6; }
        .bold { font-weight: 600; }
        .mono { font-family: monospace; font-size: 11px; color: rgba(255,255,255,0.4); }
        .small { font-size: 13px; margin-bottom: 12px; }

        .callout-red { margin-top: 16px; padding: 16px; background: rgba(239, 68, 68, 0.1); border-radius: 12px; }
        .callout-red p { font-size: 14px; color: #fca5a5; }

        .highlight-box { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 12px; }
        .highlight-box.green { background: rgba(16, 185, 129, 0.1); color: #10b981; }
        .highlight-box.purple { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
        .highlight-box.cyan { background: rgba(6, 182, 212, 0.1); color: #06b6d4; }

        .economics { display: grid; gap: 8px; font-size: 14px; }
        .econ-row { display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .econ-row.last { border-bottom: none; padding-bottom: 0; }

        .screenshot-container { display: flex; justify-content: center; }
        .screenshot { border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); max-height: 350px; object-fit: contain; }

        .cta-box { margin-top: 20px; padding: 16px; background: linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(139, 92, 246, 0.08)); border-radius: 12px; text-align: center; font-size: 15px; }

        .footnote { margin-top: 16px; font-size: 12px; color: rgba(255,255,255,0.4); text-align: center; }

        .qr-grid { max-width: 700px; gap: 24px; }
        .qr-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
        .qr { width: 80px; height: 80px; border-radius: 8px; background: white; padding: 4px; }
        .contact-footer { margin-top: 32px; text-align: center; }
        .contact-footer p { margin-top: 8px; }
      `}</style>

      <div className="progress" style={{ width: `${((currentSlide + 1) / totalSlides) * 100}%` }} />
      <div className="hint">← → or swipe</div>
      <div className="slide-counter">{currentSlide + 1} / {totalSlides}</div>

      <div className="nav">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            className={`nav-dot ${i === currentSlide ? 'active' : ''}`}
            onClick={() => setCurrentSlide(i)}
          />
        ))}
      </div>

      <div className="nav-arrows">
        <button className="nav-btn" onClick={() => setCurrentSlide(s => Math.max(s - 1, 0))}>←</button>
        <button className="nav-btn" onClick={() => setCurrentSlide(s => Math.min(s + 1, totalSlides - 1))}>→</button>
      </div>

      <div className="deck" style={{ transform: `translateX(-${currentSlide * 100}vw)` }}>
        {slides}
      </div>
    </>
  );
}
