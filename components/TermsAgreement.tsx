'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

export default function TermsAgreement() {
  const { address, isConnected } = useAccount();
  const [accepted, setAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [understandsIP, setUnderstandsIP] = useState(false);
  const [understandsPermanence, setUnderstandsPermanence] = useState(false);
  const [understandsLiability, setUnderstandsLiability] = useState(false);

  // Check if user has already accepted terms
  useEffect(() => {
    if (!address) return;
    
    const storageKey = `terms-accepted-${address.toLowerCase()}`;
    const hasAccepted = localStorage.getItem(storageKey) === 'true';
    setAccepted(hasAccepted);
    
    if (!hasAccepted && isConnected) {
      setShowTerms(true);
    }
  }, [address, isConnected]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const scrollPercentage = 
      (element.scrollTop + element.clientHeight) / element.scrollHeight;
    
    if (scrollPercentage > 0.95) {
      setHasScrolled(true);
    }
  };

  const handleAccept = () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    if (!understandsIP || !understandsPermanence || !understandsLiability) {
      alert('You must check all boxes to continue');
      return;
    }

    if (!hasScrolled) {
      alert('Please scroll through and read the entire Terms of Service');
      return;
    }

    // Store acceptance
    const storageKey = `terms-accepted-${address.toLowerCase()}`;
    localStorage.setItem(storageKey, 'true');
    localStorage.setItem(`terms-accepted-date-${address.toLowerCase()}`, new Date().toISOString());
    
    // Record on backend (optional)
    fetch('/api/terms/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        timestamp: new Date().toISOString(),
        version: '1.0',
      }),
    }).catch(console.error);

    setAccepted(true);
    setShowTerms(false);
  };

  const handleReject = () => {
    alert('You must accept the Terms of Service to use EmpowerTours. Redirecting...');
    window.location.href = 'https://empowertours.xyz/goodbye';
  };

  // Block app usage until terms accepted
  if (isConnected && !accepted) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-t-2xl">
            <h1 className="text-3xl font-bold mb-2">⚠️ Terms of Service Agreement</h1>
            <p className="text-sm opacity-90">
              Required reading before using EmpowerTours
            </p>
          </div>

          {/* Terms Content - Scrollable */}
          <div
            className="flex-1 overflow-y-auto p-6 prose max-w-none"
            onScroll={handleScroll}
          >
            <div className="space-y-6">
              {/* Critical Warning Banner */}
              <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6 mb-6">
                <h2 className="text-2xl font-bold text-red-900 mb-3">
                  🚨 CRITICAL: READ CAREFULLY
                </h2>
                <div className="space-y-2 text-red-800">
                  <p className="font-bold">By using EmpowerTours, you agree to:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li><strong>Transfer ALL IP rights</strong> of your content to EmpowerTours</li>
                    <li><strong>Content CANNOT be deleted</strong> once uploaded (blockchain)</li>
                    <li><strong>No liability protection</strong> - You waive all claims</li>
                    <li><strong>No compensation</strong> for content use by anyone</li>
                    <li><strong>Content is public and permanent</strong> forever</li>
                  </ul>
                </div>
              </div>

              {/* Section 1: IP Rights Transfer */}
              <div className="border-l-4 border-purple-500 pl-4">
                <h2 className="text-xl font-bold text-gray-900 mb-3">
                  1. Intellectual Property Rights Transfer
                </h2>
                <div className="bg-purple-50 p-4 rounded-lg mb-4">
                  <p className="font-bold text-purple-900 mb-2">
                    ⚠️ YOU TRANSFER ALL IP RIGHTS TO EMPOWERTOURS
                  </p>
                  <p className="text-sm text-purple-800">
                    Any content you upload (audio, images, text) becomes the property of 
                    EmpowerTours. We can use, sell, modify, or distribute it without 
                    permission or compensation.
                  </p>
                </div>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>All audio recordings (music, voice, sounds)</li>
                  <li>All visual content (cover art, images)</li>
                  <li>All written content (descriptions, metadata)</li>
                  <li>Permission to create derivative works</li>
                  <li>Right to monetize your content without paying you</li>
                  <li>Right to transfer ownership to third parties</li>
                </ul>
              </div>

              {/* Section 2: Blockchain Permanence */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h2 className="text-xl font-bold text-gray-900 mb-3">
                  2. Blockchain Permanence & Immutability
                </h2>
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <p className="font-bold text-blue-900 mb-2">
                    ⚠️ CONTENT CANNOT BE DELETED - EVER
                  </p>
                  <p className="text-sm text-blue-800">
                    Blockchain technology means uploaded content is <strong>permanent, 
                    public, and immutable</strong>. You CANNOT request deletion.
                  </p>
                </div>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li><strong>Cannot be edited</strong> after upload</li>
                  <li><strong>Cannot be removed</strong> from blockchain</li>
                  <li><strong>Publicly accessible</strong> by anyone forever</li>
                  <li><strong>IPFS storage</strong> is permanent and distributed</li>
                  <li><strong>Transaction records</strong> are permanent</li>
                  <li><strong>No "right to be forgotten"</strong></li>
                </ul>
              </div>

              {/* Section 3: Liability & Voice Manipulation */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h2 className="text-xl font-bold text-gray-900 mb-3">
                  3. Limitation of Liability & Voice Manipulation
                </h2>
                <div className="bg-orange-50 p-4 rounded-lg mb-4">
                  <p className="font-bold text-orange-900 mb-2">
                    ⚠️ EMPOWERTOURS IS NOT LIABLE FOR ANY DAMAGES
                  </p>
                  <p className="text-sm text-orange-800">
                    Your voice and content may be used to train AI, create deepfakes, 
                    or be manipulated. <strong>We are NOT responsible.</strong>
                  </p>
                </div>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li><strong>AI voice cloning</strong> - Your voice may train AI models</li>
                  <li><strong>Deepfakes</strong> - Content may be manipulated</li>
                  <li><strong>Identity theft</strong> - Voice/image may be impersonated</li>
                  <li><strong>Unauthorized use</strong> - Third parties may use your content</li>
                  <li><strong>Copyright issues</strong> - You're responsible for claims</li>
                  <li><strong>Maximum liability: $0.00</strong></li>
                </ul>
              </div>

              {/* Section 4: Your Responsibilities */}
              <div className="border-l-4 border-green-500 pl-4">
                <h2 className="text-xl font-bold text-gray-900 mb-3">
                  4. Your Responsibilities
                </h2>
                <p className="text-gray-700 mb-3">You represent and warrant that:</p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700">
                  <li>You own or have rights to all content you upload</li>
                  <li>You are at least 18 years old</li>
                  <li>Content does not infringe on third-party rights</li>
                  <li>You will indemnify EmpowerTours from any claims</li>
                  <li>You understand and accept all risks</li>
                </ul>
              </div>

              {/* Prohibited Content */}
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                <h3 className="text-lg font-bold text-red-900 mb-2">
                  ❌ Prohibited Content
                </h3>
                <p className="text-sm text-red-800 mb-2">You may NOT upload:</p>
                <ul className="list-disc pl-6 space-y-1 text-red-700 text-sm">
                  <li>Content you don't own or have rights to</li>
                  <li>Copyrighted music without permission</li>
                  <li>Content containing minors</li>
                  <li>Illegal, harmful, or violent content</li>
                  <li>Hate speech or discriminatory content</li>
                  <li>Sexually explicit content</li>
                </ul>
              </div>

              {/* Contact */}
              <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Questions?</strong> Contact: legal@empowertours.xyz
                </p>
                <p className="text-xs text-gray-600 mt-2">
                  Effective Date: January 1, 2025 | Version 1.0
                </p>
              </div>

              {/* Scroll indicator */}
              {!hasScrolled && (
                <div className="fixed bottom-32 right-8 bg-yellow-500 text-white px-4 py-2 rounded-full shadow-lg animate-bounce">
                  ⬇️ Scroll to Continue
                </div>
              )}
            </div>
          </div>

          {/* Checkboxes */}
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="space-y-3 mb-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandsIP}
                  onChange={(e) => setUnderstandsIP(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-red-600"
                />
                <span className="text-sm text-gray-800">
                  <strong>I understand and agree</strong> that I am transferring ALL 
                  intellectual property rights of my content to EmpowerTours.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandsPermanence}
                  onChange={(e) => setUnderstandsPermanence(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-red-600"
                />
                <span className="text-sm text-gray-800">
                  <strong>I understand</strong> that content uploaded to the blockchain 
                  CANNOT be deleted, edited, or removed, and is permanent and public.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understandsLiability}
                  onChange={(e) => setUnderstandsLiability(e.target.checked)}
                  className="mt-1 w-5 h-5 accent-red-600"
                />
                <span className="text-sm text-gray-800">
                  <strong>I waive ALL claims</strong> against EmpowerTours for damages, 
                  voice manipulation, deepfakes, or any use of my content by third parties.
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleReject}
                className="flex-1 px-6 py-3 bg-gray-300 text-gray-800 rounded-lg font-bold hover:bg-gray-400 transition-colors"
              >
                I Reject - Exit App
              </button>
              <button
                onClick={handleAccept}
                disabled={!hasScrolled || !understandsIP || !understandsPermanence || !understandsLiability}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg font-bold hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {hasScrolled 
                  ? 'I Accept Terms of Service'
                  : 'Scroll to Enable Accept Button'
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null; // Don't render if terms already accepted
}
