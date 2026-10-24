"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract } from "wagmi";
import { auctionHouse } from "@/lib/contracts";
import { formatMon } from "@/lib/format";
import { useBurner } from "@/hooks/use-burner";
import { useTx } from "@/hooks/use-tx";
import { Btn, TxLink } from "./kit";
import { useMounted } from "./wallet";

/** Shows the active wallet's on-chain pendingReturns (MetaMask, else the quick-bid wallet) with a Withdraw button. */
export function RefundBanner() {
  const mounted = useMounted();
  const { address: walletAddress } = useAccount();
  const burner = useBurner();
  const address = walletAddress ?? burner.account?.address;
  const qc = useQueryClient();
  const tx = useTx(walletAddress ? null : burner.account);
  const { data: owed, refetch } = useReadContract({
    address: auctionHouse?.address,
    abi: auctionHouse?.abi,
    functionName: "pendingReturns",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && auctionHouse), refetchInterval: 3000 },
  });

  if (!mounted || !auctionHouse) return null;
  const amount = (owed as bigint | undefined) ?? 0n;
  if (amount === 0n && tx.phase !== "success") return null;

  return (
    <div className="mx-auto mt-4 max-w-[1312px] px-4 sm:px-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-success-soft p-4 text-sm text-success">
        {amount > 0n ? (
          <>
            <p className="flex-1">
              <span className="font-semibold">You were outbid.</span> {formatMon(amount)} MON is held for you in the
              auction contract.
            </p>
            <Btn
              size="md"
              variant="dark"
              loading={tx.busy}
              disabled={tx.busy}
              onClick={async () => {
                const r = await tx.send({ address: auctionHouse!.address, abi: auctionHouse!.abi, functionName: "withdraw", args: [] });
                if (r) {
                  await refetch();
                  qc.invalidateQueries();
                }
              }}
            >
              {tx.phase === "confirming" ? "Confirming…" : `Withdraw ${formatMon(amount)} MON`}
            </Btn>
          </>
        ) : (
          <p className="flex-1">Refund withdrawn to your wallet. {tx.hash && <TxLink hash={tx.hash} />}</p>
        )}
        {tx.error && <p className="w-full text-destructive">{tx.error}</p>}
      </div>
    </div>
  );
}
