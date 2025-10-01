"use client";

import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

export default function MusicPage() {
  const { connect, connectors, status, error } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (isConnected) {
      // Automatically switch to Monad testnet (10143) if connected
      switchChain({ chainId: 10143 }).catch(() => {
        console.warn("Could not switch chain automatically. Please switch manually in your wallet.");
      });
    }
  }, [isConnected, switchChain]);

  return (
    <div style={{ padding: "20px" }}>
      <h1>🎵 Music Page</h1>

      {isConnected ? (
        <div>
          <p>✅ Connected: {address}</p>
          <button
            onClick={() => disconnect()}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              background: "#E53935",
              color: "#fff",
              cursor: "pointer",
              marginTop: "10px",
            }}
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <div>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              disabled={!connector.ready}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                background: "#4CAF50",
                color: "#fff",
                cursor: "pointer",
                margin: "5px 0",
              }}
            >
              Connect with {connector.name}
            </button>
          ))}
          {status === "connecting" && <p>🔄 Connecting...</p>}
          {error && <p style={{ color: "red" }}>⚠️ {error.message}</p>}
        </div>
      )}

      <p style={{ marginTop: "20px" }}>
        Mint NFTs to treasury: <b>0x5fE8373C839948bFCB707A8a8A75A16E2634A725</b>
      </p>
    </div>
  );
}
