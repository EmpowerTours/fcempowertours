'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, RefreshCw, ArrowLeft, Code, Rocket, Eye, Plus,
  Shield, Coins, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';
import { SecurityBadge } from './SecurityBadge';
import { PipelineTracker, type PipelineStep } from './PipelineTracker';

interface DevStudioModalProps {
  userAddress?: string;
  onClose: () => void;
  isDarkMode?: boolean;
}

type StudioView = 'proposals' | 'create' | 'pipeline';

const CONTRACT_TYPES = ['Custom', 'Token', 'NFT', 'DeFi', 'VRF Game', 'DAO', 'Vesting', 'SAFT', 'Bonding Curve'] as const;
const PROPOSAL_FEE = 100; // 100 MON

export const DevStudioModal: React.FC<DevStudioModalProps> = ({
  userAddress,
  onClose,
  isDarkMode = true,
}) => {
  const [mounted, setMounted] = useState(false);
  const [studioView, setStudioView] = useState<StudioView>('proposals');

  // Proposals list state
  const [proposals, setProposals] = useState<any[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);

  // Create proposal state
  const [prompt, setPrompt] = useState('');
  const [contractType, setContractType] = useState<string>('Custom');
  const [treasuryBps, setTreasuryBps] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [securityExpanded, setSecurityExpanded] = useState(false);

  // Pipeline view state
  const [selectedProposal, setSelectedProposal] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchProposals = useCallback(async () => {
    setProposalsLoading(true);
    try {
      const res = await fetch('/api/dev-studio/proposals');
      const data = await res.json();
      if (data.success) {
        setProposals(data.proposals || []);
      }
    } catch (err) {
      console.error('[DevStudio] Failed to fetch proposals:', err);
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleCreateProposal = async () => {
    if (!userAddress || !prompt || prompt.trim().length < 10) return;
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/execute-delegated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dao_create_deployment_proposal',
          userAddress,
          params: {
            prompt,
            contractType,
            treasuryAllocation: treasuryBps,
          },
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create proposal');
      }

      setSuccess(data.message || 'Proposal created! 100 MON fee paid. TOURS reward pending.');
      setPrompt('');
      setTreasuryBps(0);
      setTimeout(() => {
        fetchProposals();
        setStudioView('proposals');
      }, 3000);
    } catch (err: any) {
      console.error('[DevStudio] Create proposal failed:', err);
      setError(err.message || 'Failed to create proposal');
    } finally {
      setCreating(false);
    }
  };

  const openPipeline = (proposal: any) => {
    setSelectedProposal(proposal);
    setStudioView('pipeline');
  };

  const getPipelineSteps = (p: any): PipelineStep[] => {
    const idx = p.statusIndex ?? 0;
    return [
      { label: 'Proposed', status: idx >= 0 ? 'completed' : 'pending', detail: '100 MON' },
      { label: 'Voted', status: idx >= 1 ? 'completed' : idx === 0 ? 'active' : 'pending' },
      { label: 'Generated', status: idx >= 2 ? 'completed' : idx === 1 ? 'active' : 'pending' },
      { label: 'Compiled', status: idx >= 3 ? 'completed' : idx === 2 ? 'active' : 'pending' },
      { label: 'Deployed', status: idx >= 4 ? 'completed' : idx === 3 ? 'active' : 'pending' },
    ];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Deployed': return 'bg-green-900/50 text-green-400 border-green-500/30';
      case 'Compiled': return 'bg-blue-900/50 text-blue-400 border-blue-500/30';
      case 'CodeGenerated': return 'bg-cyan-900/50 text-cyan-400 border-cyan-500/30';
      case 'Approved': return 'bg-purple-900/50 text-purple-400 border-purple-500/30';
      default: return 'bg-gray-800 text-gray-400 border-gray-600';
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999, backgroundColor: isDarkMode ? '#000000' : '#ffffff' }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col ${
          isDarkMode
            ? 'bg-gradient-to-br from-gray-900 via-cyan-900/10 to-gray-900 border border-cyan-500/30'
            : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cyan-500/20 shrink-0">
          <div className="flex items-center gap-3">
            {studioView !== 'proposals' && (
              <button
                onClick={() => setStudioView('proposals')}
                className="text-gray-400 hover:text-cyan-400 transition-colors mr-1"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">EmpowerTours Dev Studio</h2>
              <p className="text-xs text-gray-400">
                {studioView === 'proposals' && 'DAO Contract Factory'}
                {studioView === 'create' && 'New Proposal'}
                {studioView === 'pipeline' && `Proposal #${selectedProposal?.id ?? ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {studioView === 'proposals' && (
              <button
                onClick={fetchProposals}
                disabled={proposalsLoading}
                className="text-gray-400 hover:text-cyan-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${proposalsLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Error / Success messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
              <p className="text-xs text-green-400">{success}</p>
            </div>
          )}

          {/* ==================== PROPOSALS LIST ==================== */}
          {studioView === 'proposals' && (
            <div className="space-y-4">
              {/* Create button */}
              <button
                onClick={() => { setStudioView('create'); setError(null); setSuccess(null); }}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Proposal
              </button>

              {/* Proposals */}
              {proposalsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                </div>
              ) : proposals.length === 0 ? (
                <div className="text-center py-8">
                  <Code className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No proposals yet. Create the first one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {proposals.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => openPipeline(p)}
                      className="w-full text-left bg-gray-800/40 hover:bg-gray-800/60 rounded-xl p-4 border border-gray-700/50 hover:border-cyan-500/30 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">#{p.id}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(p.status)}`}>
                            {p.status}
                          </span>
                        </div>
                        {p.securityScore > 0 && (
                          <SecurityBadge score={p.securityScore} passed={p.securityScore >= 50} compact />
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mb-2 line-clamp-2">{p.prompt}</p>
                      <PipelineTracker steps={getPipelineSteps(p)} compact />
                      <div className="flex items-center gap-3 mt-2">
                        {p.deployedContract && p.deployedContract !== '0x0000000000000000000000000000000000000000' && (
                          <span className="text-xs text-cyan-400 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Deployed
                          </span>
                        )}
                        {p.ipfsCodeHash && (
                          <span className="text-xs text-purple-400 flex items-center gap-1">
                            <Code className="w-3 h-3" /> Code
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== CREATE PROPOSAL ==================== */}
          {studioView === 'create' && (
            <div className="space-y-4">
              {/* Prompt */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">
                  Describe the smart contract you want to build
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A token with vesting schedule and multi-sig governance..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none text-sm"
                />
              </div>

              {/* Contract type pills */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Contract Type</label>
                <div className="flex flex-wrap gap-2">
                  {CONTRACT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setContractType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        contractType === type
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                          : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Treasury allocation slider */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">
                  Treasury Allocation: {(treasuryBps / 100).toFixed(1)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="50"
                  value={treasuryBps}
                  onChange={(e) => setTreasuryBps(Number(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>0%</span>
                  <span>5% max</span>
                </div>
              </div>

              {/* Fee display card */}
              <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                <div className="flex items-center gap-2 mb-2">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-bold text-white">Cost: {PROPOSAL_FEE} MON</span>
                </div>
                <div className="space-y-1 text-xs text-gray-400">
                  <p>50 MON → DAO Treasury | 50 MON → Platform</p>
                  <p className="text-cyan-400">Earn 10-100 random TOURS on submission</p>
                </div>
              </div>

              {/* Security info (collapsible) */}
              <button
                onClick={() => setSecurityExpanded(!securityExpanded)}
                className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-gray-300 transition-colors"
              >
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Security Information
                </span>
                {securityExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {securityExpanded && (
                <div className="bg-gray-800/30 rounded-xl p-3 text-xs text-gray-400 space-y-1">
                  <p>All generated code is scanned for forbidden patterns (selfdestruct, delegatecall, proxy patterns).</p>
                  <p>Bytecode is verified against SHA-256 hashes before deployment.</p>
                  <p>Contracts cannot be modified after governance approval.</p>
                </div>
              )}

              {/* Create button */}
              <button
                onClick={handleCreateProposal}
                disabled={creating || !prompt || prompt.trim().length < 10 || !userAddress}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-all flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Proposal...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    Create Proposal — {PROPOSAL_FEE} MON
                  </>
                )}
              </button>

              {!userAddress && (
                <p className="text-xs text-yellow-400 text-center">Connect your wallet to create proposals</p>
              )}
            </div>
          )}

          {/* ==================== PIPELINE VIEW ==================== */}
          {studioView === 'pipeline' && selectedProposal && (
            <div className="space-y-4">
              {/* Proposal info */}
              <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(selectedProposal.status)}`}>
                    {selectedProposal.status}
                  </span>
                  {selectedProposal.securityScore > 0 && (
                    <SecurityBadge
                      score={selectedProposal.securityScore}
                      passed={selectedProposal.securityScore >= 50}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-300 mt-2">{selectedProposal.prompt}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Proposer: {selectedProposal.proposer?.slice(0, 6)}...{selectedProposal.proposer?.slice(-4)}
                </p>
              </div>

              {/* Pipeline tracker */}
              <div className="bg-gray-800/30 rounded-xl p-4">
                <PipelineTracker steps={getPipelineSteps(selectedProposal)} isDarkMode={isDarkMode} />
              </div>

              {/* Step details */}
              <div className="space-y-3">
                {/* Step 1: Proposed */}
                <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                  <h4 className="text-xs font-medium text-cyan-400 mb-1 flex items-center gap-1">
                    <Coins className="w-3 h-3" /> Fee & Reward
                  </h4>
                  <div className="text-xs text-gray-400 space-y-0.5">
                    <p>100 MON fee paid (50 treasury + 50 platform)</p>
                    <p>TOURS reward: pending Pyth Entropy callback</p>
                    <p>Treasury allocation: {(selectedProposal.treasuryAllocation / 100).toFixed(1)}%</p>
                  </div>
                </div>

                {/* Source code link */}
                {selectedProposal.ipfsCodeHash && (
                  <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                    <h4 className="text-xs font-medium text-purple-400 mb-1 flex items-center gap-1">
                      <Code className="w-3 h-3" /> Generated Code
                    </h4>
                    <a
                      href={`https://gateway.pinata.cloud/ipfs/${selectedProposal.ipfsCodeHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      View on IPFS <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Security hashes */}
                {selectedProposal.sourceCodeHash && selectedProposal.sourceCodeHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
                  <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/30">
                    <h4 className="text-xs font-medium text-green-400 mb-1 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> Integrity Hashes
                    </h4>
                    <div className="text-[10px] text-gray-500 font-mono space-y-0.5 break-all">
                      <p>Source: {selectedProposal.sourceCodeHash}</p>
                      <p>Bytecode: {selectedProposal.bytecodeHash}</p>
                    </div>
                  </div>
                )}

                {/* Deployed contract link */}
                {selectedProposal.deployedContract &&
                  selectedProposal.deployedContract !== '0x0000000000000000000000000000000000000000' && (
                  <div className="bg-gray-800/30 rounded-xl p-3 border border-green-500/30">
                    <h4 className="text-xs font-medium text-green-400 mb-1 flex items-center gap-1">
                      <Rocket className="w-3 h-3" /> Deployed Contract
                    </h4>
                    <a
                      href={`https://monadscan.com/address/${selectedProposal.deployedContract}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 font-mono"
                    >
                      {selectedProposal.deployedContract.slice(0, 10)}...{selectedProposal.deployedContract.slice(-8)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
