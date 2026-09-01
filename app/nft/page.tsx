"use client";

import { useRouter } from "next/navigation";
import { CreateNFTModal } from "@/app/components/oracle/CreateNFTModal";

/**
 * /nft — create an NFT.
 *
 * This route previously held a SECOND, parallel implementation of the create
 * flow, 1,454 lines of it, created in the same initial commit as the Oracle's
 * CreateNFTModal and drifted from it. The page captured no rights declaration,
 * no ISRC, no instrumental producer and no licence reference, so a song minted
 * here carried none of the paperwork the modal records and pins to IPFS. It also
 * meant every bug in the flow had to be found and fixed twice.
 *
 * The route exists again because deleting it took away more than the duplicate:
 * swipe navigation reaches pages by path, and /oracle cannot stand in for it —
 * pageOrder matches on pathname alone, so a query string like
 * ?modal=create-nft never matches, and swipe is disabled on /oracle anyway, so
 * arriving there is a dead end you cannot swipe out of.
 *
 * So the ROUTE is back and the DUPLICATE is not. This is a wrapper over the one
 * implementation. Anything that belongs in the create flow belongs in
 * CreateNFTModal, never here.
 */
export default function CreateNFTPage() {
  const router = useRouter();
  return <CreateNFTModal onClose={() => router.push("/")} />;
}
