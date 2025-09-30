"use client";

import { useEffect } from "react";
import { useSwitchChain, useConnect, useAccount } from "wagmi";
import { InjectedConnector } from "wagmi/connectors/injected";

export default function MusicPage() {
  const { connect } = useConnect({ connector: new InjectedConnector() });
  const { isConnected, address } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (isConnected) {
      switchChain({ chainId: 10143 }); // Monad testnet
    }
  }, [isConnected, switchChain]);

  return (
    <div>
      <h1>Music Page</h1>
      {isConnected ? (
        <p>Connected: {address}</p>
      ) : (
        <button
          onClick={() => connect()}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            background: "#4CAF50",
            color: "#fff",
            cursor: "pointer",
            marginTop: "10px"
          }}
        >
          Connect Wallet
        </button>
      )}
      <p>Mint NFTs to treasury: 0x5fE8373C839948bFCB707A8a8A75A16E2634A725</p>
    </div>
  );
}
