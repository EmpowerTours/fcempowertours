"use client";

import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wallet } from "lucide-react";

interface ConnectWalletButtonProps {
  className?: string;
}

export default function ConnectWalletButton({
  className,
}: ConnectWalletButtonProps) {
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
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none" as const,
                userSelect: "none" as const,
              },
            })}
            className={className}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="flex items-center gap-2 px-4 py-2.5 bg-foil hover:bg-foil-bright text-ink font-semibold tracking-wide transition-colors text-sm"
                  >
                    <Wallet className="w-4 h-4" />
                    Connect Wallet
                  </button>
                );
              }

              if (!chain.hasIcon) {
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
                  className="flex items-center gap-2 px-3 py-2 bg-ink-raised hover:border-foil-dim text-paper doc-mono text-xs transition-colors border border-rule"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-good" />
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
