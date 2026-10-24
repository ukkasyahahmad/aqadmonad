import { Suspense } from "react";
import { ScreenView } from "./screen-view";

type Params = { params: Promise<{ id: string }> };

async function Resolved({ params }: Params) {
  const { id } = await params;
  return <ScreenView raw={id} />;
}

export default function ScreenPage({ params }: Params) {
  return (
    <Suspense fallback={<div className="h-screen bg-[#101311]" />}>
      <Resolved params={params} />
    </Suspense>
  );
}
