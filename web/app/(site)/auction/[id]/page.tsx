import { Suspense } from "react";
import { AuctionView } from "./auction-view";

type Params = { params: Promise<{ id: string }> };

async function Resolved({ params }: Params) {
  const { id } = await params;
  return <AuctionView rawId={id} />;
}

export default function AuctionPage({ params }: Params) {
  return (
    <Suspense fallback={<div className="h-[600px] animate-pulse rounded-3xl bg-secondary" />}>
      <Resolved params={params} />
    </Suspense>
  );
}
