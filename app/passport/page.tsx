"use client";
import React, { useState, useEffect } from "react";
import { useWriteContract } from "wagmi";
import PassportNFT from "@/lib/abis/PassportNFT.json";
import { countryData } from "@/lib/countries";

export default function PassportPage() {
  const [casts, setCasts] = useState<any[]>([]);
  const [loadingCasts, setLoadingCasts] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [command, setCommand] = useState("");
  const { writeContractAsync } = useWriteContract();

  // Fetch Farcaster casts with Neynar
  useEffect(() => {
    const fetchCasts = async () => {
      setLoadingCasts(true);
      try {
        const res = await fetch(
          "https://api.neynar.com/v2/farcaster/casts?fid=1&limit=10",
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.NEXT_PUBLIC_NEYNAR_API_KEY}`,
            },
          }
        );
        const data = await res.json();
        setCasts(data.result?.casts || []);
      } catch (err) {
        console.error("Failed to fetch casts:", err);
      } finally {
        setLoadingCasts(false);
      }
    };
    fetchCasts();
  }, []);

  // Handle mint
  const handleMint = async () => {
    if (!selectedCountry) {
      alert("Please select a country first!");
      return;
    }
    try {
      await writeContractAsync({
        address: process.env.NEXT_PUBLIC_PASSPORTNFT_ADDRESS as `0x${string}`,
        abi: PassportNFT,
        functionName: "mint",
        args: [selectedCountry],
      });
      alert(`Mint requested for ${selectedCountry}. Approve in wallet.`);
    } catch (err) {
      console.error("Mint failed:", err);
      alert("Mint failed, see console for details.");
    }
  };

  return (
    <div className="flex flex-col items-center p-6 space-y-6">
      <h1 className="text-3xl font-bold">EmpowerTours Passport</h1>
      {/* Country Select */}
      <div className="w-full max-w-md space-y-2">
        <label className="block text-sm font-medium">Select your country:</label>
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="w-full border rounded-lg p-2 bg-white text-black"
        >
          <option value="">-- Choose a country --</option>
          {Object.entries(countryData).map(([code, { name }]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <button
          onClick={handleMint}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg shadow"
        >
          Mint One
        </button>
      </div>
      {/* Cast Feed */}
      <div className="w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mb-4">Latest Casts</h2>
        {loadingCasts ? (
          <p>Loading casts…</p>
        ) : casts.length === 0 ? (
          <p>No casts found.</p>
        ) : (
          <div className="space-y-4">
            {casts.map((cast: any, i: number) => (
              <div
                key={i}
                className="p-4 border rounded-lg bg-gray-50 shadow-sm"
              >
                <p className="font-medium">{cast.author?.username}</p>
                <p>{cast.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Command Prompt BELOW cast frame */}
      <div className="w-full max-w-2xl mt-6">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Type a command..."
          className="w-full border p-2 rounded-lg shadow"
        />
      </div>
    </div>
  );
}
