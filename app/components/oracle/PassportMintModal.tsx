"use client";

import { delegationCovers } from "@/lib/delegation-covered";
import { ensureSafeRegistered } from "@/lib/ensure-safe-registered";
import { describeMintFailure } from "@/lib/mint-failure";
import { authHeaders } from "@/lib/quick-auth-client";
import { walletAuthHeaders } from "@/lib/wallet-auth-client";
import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, MapPin, Check } from "lucide-react";
import { useSignMessage } from "wagmi";
import { useWalletContext } from "@/app/hooks/useWalletContext";
import { useGeolocation } from "@/lib/useGeolocation";
import { getCountryByCode } from "@/lib/passport/countries";

interface PassportMintModalProps {
  onClose: () => void;
  isDarkMode?: boolean;
}

export function PassportMintModal({
  onClose,
  isDarkMode = true,
}: PassportMintModalProps) {
  // Was useFarcasterContext, which only ever resolves an address inside a Farcaster client.
  // In a browser wallet it returned null, so this modal showed "Connect Wallet First" to people
  // who were already connected, and its Mint button stayed disabled.
  const { user, fid, walletAddress, isFarcaster, requestWallet } =
    useWalletContext();
  const { location, loading: geoLoading } = useGeolocation();
  const { signMessageAsync } = useSignMessage();

  /**
   * `mint_passport` is a fund-moving action: execute-delegated refuses it unless the caller has
   * PROVEN it owns userAddress, and ignores ENFORCE_QUICK_AUTH when doing so. This modal only
   * ever sent authHeaders() — a Farcaster Quick Auth token — which does not exist in a browser,
   * so every browser mint came back 401 "This action requires proof you own this address."
   *
   * Outside Farcaster the proof is a wallet signature instead. The signed message is bound to
   * the server's `context` string, so each route needs its own signature; Quick Auth is not even
   * attempted there, since sdk.quickAuth.getToken() has no host to answer it and only resolves
   * on its 3s timeout.
   */
  const authFor = useCallback(
    async (context: string): Promise<Record<string, string>> => {
      if (isFarcaster) return authHeaders();
      if (!walletAddress) return {};
      // A proven delegation already authorises these, so prompting again is the
      // friction the delegation was created to remove. The server accepts the
      // delegation as proof; if it is missing or unproven the caller recreates
      // it, which is the one signature the user actually owes.
      if (delegationCovers(context)) return {};
      return walletAuthHeaders({
        address: walletAddress,
        signMessage: signMessageAsync,
        context,
      });
    },
    [isFarcaster, walletAddress, signMessageAsync],
  );

  const [mounted, setMounted] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    tokenId: number;
    txHash: string;
    country: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-select country once geolocation loads
  useEffect(() => {
    if (location && location.country && !selectedCountryCode) {
      setSelectedCountryCode(location.country);
    }
  }, [location, selectedCountryCode]);

  const handleMint = async () => {
    if (!walletAddress || !selectedCountryCode) {
      setError("Please select a country and connect wallet");
      return;
    }

    const selectedCountry = getCountryByCode(selectedCountryCode);
    if (!selectedCountry) {
      setError("Invalid country selected");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Register the Safe as a minter first, in its own request. Bundling it
      // into the mint made a first-time mint two chain operations deep and it
      // timed out. Throws rather than warns: proceeding unregistered is the
      // failure we are fixing.
      await ensureSafeRegistered(walletAddress, authFor);

      // Check for existing delegation
      const delegationRes = await fetch(
        `/api/delegation-status?address=${walletAddress}`,
      );
      const delegationData = await delegationRes.json();

      const hasValidDelegation =
        delegationData.success &&
        delegationData.delegation &&
        Array.isArray(delegationData.delegation.permissions) &&
        delegationData.delegation.permissions.includes("mint_passport") &&
        delegationData.delegation.ownershipProven === true;

      if (!hasValidDelegation) {
        const createRes = await fetch("/api/create-delegation", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authFor("create-delegation")),
          },
          body: JSON.stringify({
            userAddress: walletAddress,
            authMethod: "farcaster",
            fid,
            durationHours: 24,
            maxTransactions: 100,
            permissions: [
              "mint_passport",
              "wrap_mon",
              "mint_music",
              "swap_mon_for_tours",
              "send_tours",
              "buy_music",
            ],
          }),
        });

        const createData = await createRes.json();
        if (!createData.success) {
          throw new Error("Failed to create delegation: " + createData.error);
        }
      }

      // Try to mint - if WMON insufficient, wrap first
      let response = await fetch("/api/execute-delegated", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authFor("execute-delegated:mint_passport")),
        },
        body: JSON.stringify({
          userAddress: walletAddress,
          action: "mint_passport",
          params: {
            countryCode: selectedCountry.code,
            countryName: selectedCountry.name,
            region: selectedCountry.region,
            continent: selectedCountry.continent,
            fid,
          },
        }),
      });

      let responseData = await response.json();

      // If needs WMON wrap, do that first then retry mint
      if (!response.ok && responseData.needsWrap) {
        console.log(
          "🔄 Need to wrap MON first, amount:",
          responseData.wmonNeeded,
        );
        setError("Wrapping MON to WMON...");

        const wrapRes = await fetch("/api/execute-delegated", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authFor("execute-delegated:wrap_mon")),
          },
          body: JSON.stringify({
            userAddress: walletAddress,
            action: "wrap_mon",
            params: { amount: responseData.wmonNeeded },
          }),
        });

        const wrapData = await wrapRes.json();
        if (!wrapRes.ok || !wrapData.success) {
          throw new Error(wrapData.error || "Failed to wrap MON");
        }

        console.log("✅ Wrapped MON, now minting...");
        setError("Minting passport...");

        // Retry mint
        response = await fetch("/api/execute-delegated", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await authFor("execute-delegated:mint_passport")),
          },
          body: JSON.stringify({
            userAddress: walletAddress,
            action: "mint_passport",
            params: {
              countryCode: selectedCountry.code,
              countryName: selectedCountry.name,
              region: selectedCountry.region,
              continent: selectedCountry.continent,
              fid,
            },
          }),
        });

        responseData = await response.json();
      }

      if (!response.ok) {
        throw new Error(responseData.error || "Mint failed");
      }

      const { txHash, tokenId } = responseData;

      setSuccess({
        tokenId: tokenId || 0,
        txHash: txHash || "",
        country: `${selectedCountry.flag} ${selectedCountry.name}`,
      });
    } catch (err: any) {
      console.error("Passport mint error:", err);
      setError(describeMintFailure(err));
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 modal-backdrop flex items-center justify-center p-4 overflow-y-auto`}
      style={{
        zIndex: 9999,
        backgroundColor: isDarkMode
          ? "rgba(0, 0, 0, 0.95)"
          : "rgba(0, 0, 0, 0.6)",
      }}
    >
      <div
        className={`w-full max-w-lg rounded-3xl shadow-2xl border-2 ${isDarkMode ? "border-cyan-500/50 shadow-cyan-500/20" : "border-purple-300 shadow-purple-200/50"}`}
        style={{ backgroundColor: isDarkMode ? "#0a0a0f" : "#ffffff" }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1
                className={`text-2xl font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                Mint Passport NFT
              </h1>
              <p
                className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                Free gasless minting
              </p>
            </div>
            <button
              onClick={onClose}
              className={`transition-colors ${isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"}`}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Success State */}
          {success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-10 h-10 text-green-400" />
              </div>
              <h2
                className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                Passport Minted!
              </h2>
              <p className="text-3xl mb-4">{success.country}</p>
              <p
                className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                Token #{success.tokenId}
              </p>
              {success.txHash && (
                <a
                  href={`https://monadscan.com/tx/${success.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 font-medium"
                >
                  View Transaction
                </a>
              )}
              <button
                onClick={onClose}
                className={`w-full mt-6 px-6 py-3 rounded-xl font-bold transition-all ${isDarkMode ? "bg-gray-800 text-white hover:bg-gray-700" : "bg-gray-200 text-gray-900 hover:bg-gray-300"}`}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Free Mint Badge */}
              <div className="mb-6 p-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-lg border border-green-500/30">
                <p className="text-sm font-bold text-green-400 text-center">
                  FREE Mint - We pay all gas fees
                </p>
              </div>

              {/* User Info */}
              {(walletAddress || user) && (
                <div className="mb-4 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
                  {isFarcaster && user && (
                    <p className="text-sm text-cyan-400">
                      <strong>Farcaster:</strong> @{user.username || "User"}
                    </p>
                  )}
                  {walletAddress && (
                    <p className="text-sm text-cyan-400 mt-1 font-mono text-xs">
                      <strong>Wallet:</strong> {walletAddress.slice(0, 6)}...
                      {walletAddress.slice(-4)}
                    </p>
                  )}
                </div>
              )}

              {/* Location Detection */}
              {geoLoading ? (
                <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <p className="text-sm text-blue-400">
                    Detecting your location...
                  </p>
                </div>
              ) : location ? (
                <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  <p className="text-sm text-blue-400">
                    Detected: {getCountryByCode(location.country)?.flag}{" "}
                    {location.countryName}{" "}
                    {location.city ? `(${location.city})` : ""}
                  </p>
                </div>
              ) : null}

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Detected Country */}
              {selectedCountryCode ? (
                <div
                  className={`mb-6 p-4 rounded-lg text-center border ${isDarkMode ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-200"}`}
                >
                  <p
                    className={`text-xs mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                  >
                    Minting passport for
                  </p>
                  <p
                    className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {getCountryByCode(selectedCountryCode)?.flag}{" "}
                    {getCountryByCode(selectedCountryCode)?.name}
                  </p>
                </div>
              ) : !geoLoading ? (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                  <p className="text-sm text-red-400">
                    Could not detect your location. Please enable location
                    services and try again.
                  </p>
                </div>
              ) : null}

              {/* Connect Wallet if needed */}
              {!walletAddress && (
                <button
                  onClick={requestWallet}
                  className="w-full mb-4 px-6 py-3 bg-yellow-500 text-black rounded-xl font-bold hover:bg-yellow-400 transition-all"
                >
                  Connect Wallet First
                </button>
              )}

              {/* Mint Button */}
              <button
                onClick={handleMint}
                disabled={isLoading || !selectedCountryCode || !walletAddress}
                className="w-full px-6 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-cyan-400 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Minting...
                  </>
                ) : (
                  "Mint Passport (FREE)"
                )}
              </button>

              <p
                className={`text-xs text-center mt-4 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
              >
                Each wallet can mint one passport per country
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
