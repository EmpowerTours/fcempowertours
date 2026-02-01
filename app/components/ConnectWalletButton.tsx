'use client';

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet } from 'lucide-react';

interface ConnectWalletButtonProps {
  className?: string;
}

export default function ConnectWalletButton({ className }: ConnectWalletButtonProps) {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none' as const, userSelect: 'none' as const },
            })}
            className={className}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#836EF9] hover:bg-[#6d5ae0] text-white font-semibold rounded-xl transition-colors text-sm"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors text-sm"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-colors text-sm border border-white/10"
                >
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="font-mono text-xs">
                    {account.displayName}
                  </span>
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
