"use client";

import {
  ArrowRight,
  Car,
  Check,
  Cpu,
  Gem,
  Hexagon,
  ImagePlus,
  Loader2,
  Package,
  Palette,
  Shirt,
  Sofa,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { erc721Abi, isAddress, parseEventLogs } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { Btn, Card, Eyebrow, Field, Notice, TxLink, inputCls } from "@/components/kit";
import { NftArt } from "@/components/nft-art";
import { AuctionQr, QrFullscreenButton } from "@/components/qr";
import { WalletGate } from "@/components/wallet";
import { useTx } from "@/hooks/use-tx";
import { auctionHouse, demoNft } from "@/lib/contracts";
import { formatMon, parseMon } from "@/lib/format";
import { uploadImage } from "@/lib/image";
import { encodeMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { key: "Electronics", icon: Cpu },
  { key: "Vehicles", icon: Car },
  { key: "Art & collectibles", icon: Palette },
  { key: "Fashion", icon: Shirt },
  { key: "Watches & jewellery", icon: Gem },
  { key: "Home & furniture", icon: Sofa },
  { key: "Digital art", icon: Hexagon },
  { key: "Other", icon: Package },
] as const;

const STEPS = ["Category", "Details", "Media", "Pricing & duration", "Review", "Publish on-chain", "Confirmation"];
const MIN_MINUTES = 1;
const MAX_MINUTES = 7 * 24 * 60;

type Source = "mint" | "existing";

export default function CreatePage() {
  const { address } = useAccount();
  const client = usePublicClient();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<Source>("mint");
  const [category, setCategory] = useState<string>("Electronics");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("Used — good");
  const [nftAddress, setNftAddress] = useState<string>(demoNft?.address ?? "");
  const [tokenIdInput, setTokenIdInput] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [price, setPrice] = useState("0.05");
  const [minutes, setMinutes] = useState("5");
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // publish state
  const mintTx = useTx();
  const approveTx = useTx();
  const createTx = useTx();
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [approved, setApproved] = useState(false);
  const [auctionId, setAuctionId] = useState<bigint | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const priceParsed = parseMon(price);
  const mins = Number(minutes);

  function validate(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (source === "mint" && !name.trim()) e.name = "Give the item a name.";
      if (name.length > 80) e.name = "Keep the name under 80 characters.";
      if (description.length > 400) e.description = "Keep the description under 400 characters.";
      if (source === "existing") {
        if (!isAddress(nftAddress)) e.nft = "Enter a valid contract address (0x…).";
        if (!/^\d{1,30}$/.test(tokenIdInput)) e.token = "Enter a whole-number token ID.";
      }
    }
    if (s === 3) {
      if (!priceParsed.ok) e.price = priceParsed.error;
      if (!/^\d+$/.test(minutes) || mins < MIN_MINUTES || mins > MAX_MINUTES) {
        e.minutes = `Whole minutes between ${MIN_MINUTES} and ${MAX_MINUTES}.`;
      }
    }
    if (s === 4 && !declared) e.declared = "Please confirm before publishing.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => validate(step) && setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  function fillDemo() {
    setSource("mint");
    setCategory("Electronics");
    setName("Leica M6 rangefinder kit");
    setDescription("35mm film camera with 50mm Summicron lens. Light meter works, shutter tested at all speeds. Pickup in Jogja.");
    setCondition("Used — excellent");
    setPrice("0.05");
    setMinutes("3");
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      setImage(await uploadImage(file));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // --- on-chain publish: mint → approve → create ---------------------------------------
  const nft = (source === "mint" ? demoNft?.address : nftAddress) as `0x${string}` | undefined;

  async function doMint() {
    if (!demoNft || !address) return;
    const uri = encodeMetadata({ name, description, image: image ?? undefined, category, condition });
    const r = await mintTx.send({ address: demoNft.address, abi: demoNft.abi, functionName: "mintWithURI", args: [address, uri] });
    if (!r) return;
    const [t] = parseEventLogs({ abi: erc721Abi, eventName: "Transfer", logs: r.logs });
    if (t) setTokenId(t.args.tokenId);
  }

  /** Verifies ownership + current approval on-chain; skips approve when already approved. */
  async function checkExisting() {
    setCheckError(null);
    if (!client || !nft || !address || !auctionHouse) return;
    try {
      const id = BigInt(tokenIdInput);
      const owner = await client.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] });
      if (owner.toLowerCase() !== address.toLowerCase()) {
        setCheckError(`This wallet does not own token #${id}.`);
        return;
      }
      setTokenId(id);
      await refreshApproval(id);
    } catch {
      setCheckError("Could not read that token. Is it an ERC-721 contract on this network?");
    }
  }

  async function refreshApproval(id: bigint): Promise<boolean> {
    if (!client || !nft || !address || !auctionHouse) return false;
    const [one, all] = await Promise.all([
      client.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [id] }),
      client.readContract({ address: nft, abi: erc721Abi, functionName: "isApprovedForAll", args: [address, auctionHouse.address] }),
    ]);
    const ok = one.toLowerCase() === auctionHouse.address.toLowerCase() || all;
    setApproved(ok);
    return ok;
  }

  async function doApprove() {
    if (!nft || tokenId === null || !auctionHouse) return;
    const r = await approveTx.send({ address: nft, abi: erc721Abi, functionName: "approve", args: [auctionHouse.address, tokenId] });
    if (r) await refreshApproval(tokenId);
  }

  async function doCreate() {
    if (!nft || tokenId === null || !auctionHouse || !priceParsed.ok) return;
    const r = await createTx.send({
      address: auctionHouse.address,
      abi: auctionHouse.abi,
      functionName: "createAuction",
      args: [nft, tokenId, priceParsed.wei, BigInt(mins * 60)],
    });
    if (!r) return;
    // The real ID comes from the AuctionCreated event in this receipt.
    const [ev] = parseEventLogs({ abi: auctionHouse.abi, eventName: "AuctionCreated", logs: r.logs });
    if (ev) {
      setAuctionId(ev.args.id);
      setStep(6);
    }
  }

  const previewTitle = source === "mint" ? name || "Untitled item" : `Token #${tokenIdInput || "?"}`;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      {/* Step rail */}
      <aside className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">List an item</h1>
          <p className="text-sm text-muted-foreground">Mint it as an NFT, then auction it live.</p>
        </div>
        <ol className="hidden space-y-1 lg:block">
          {STEPS.map((label, i) => (
            <li key={label} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5", i === step && "bg-card")}>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border text-sm font-semibold",
                  i < step ? "border-success bg-success text-white" : i === step ? "border-foreground bg-foreground text-background" : "border-border-strong",
                )}
              >
                {i < step ? <Check className="size-4" /> : i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{i < step ? "Done" : i === step ? "In progress" : "Upcoming"}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="h-1.5 overflow-hidden rounded-full bg-border lg:hidden">
          <div className="h-full bg-foreground" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        {step < 5 && (
          <Btn variant="secondary" size="md" className="w-full" onClick={fillDemo}>Fill demo listing</Btn>
        )}
      </aside>

      {/* Form card */}
      <Card className="space-y-6 p-6 sm:p-10">
        <div className="space-y-2">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">
            {["What are you listing?", "Describe the item", "Add a photo", "Set price and duration", "Review your listing", "Publish on Monad", "Your auction is live"][step]}
          </h2>
        </div>

        {step === 0 && (
          <div className="space-y-6">
            <div className="flex rounded-xl bg-secondary p-1 text-sm font-semibold">
              {(["mint", "existing"] as const).map((s) => (
                <button key={s} onClick={() => setSource(s)} className={cn("h-10 flex-1 rounded-lg", source === s ? "bg-card shadow-sm" : "text-muted-foreground")}>
                  {s === "mint" ? "Mint a new item NFT" : "Use an NFT I own"}
                </button>
              ))}
            </div>
            {source === "mint" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CATEGORIES.map(({ key, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setCategory(key)}
                    aria-pressed={category === key}
                    className={cn(
                      "flex min-h-28 flex-col justify-between rounded-2xl border bg-card p-4 text-left",
                      category === key ? "border-2 border-foreground" : "border-border-strong",
                    )}
                  >
                    <span className="flex justify-between">
                      <Icon className="size-5" />
                      {category === key && <Check className="size-5 rounded-full bg-foreground p-0.5 text-background" />}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{key}</span>
                      <span className="block text-xs text-success">Live bidding · MON</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Notice title="Bring any ERC-721">You will enter the contract address and token ID next. We check ownership on-chain.</Notice>
            )}
            <Notice title="How items are listed">
              We mint an ERC-721 for your item and escrow it in the auction contract. For physical items the NFT is a
              listing record — handing over the item happens off-chain and is not enforced by the contract.
            </Notice>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            {source === "mint" ? (
              <>
                <Field label="Item name" error={errors.name} hint="Shown on the auction card. Max 80 characters.">
                  <input className={inputCls(!!errors.name)} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Description (optional)" error={errors.description} hint="Left blank, buyers see “Not provided”.">
                  <textarea className={cn(inputCls(!!errors.description), "h-28 py-3")} value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <Field label="Condition">
                  <select className={inputCls()} value={condition} onChange={(e) => setCondition(e.target.value)}>
                    {["New", "Used — excellent", "Used — good", "Used — fair", "For parts", "Not applicable"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="NFT contract address" error={errors.nft} hint={demoNft ? "Pre-filled with the Demo NFT contract on this network." : undefined}>
                  <input className={cn(inputCls(!!errors.nft), "font-mono")} value={nftAddress} onChange={(e) => setNftAddress(e.target.value.trim())} />
                </Field>
                <Field label="Token ID" error={errors.token}>
                  <input inputMode="numeric" className={cn(inputCls(!!errors.token), "font-mono")} value={tokenIdInput} onChange={(e) => setTokenIdInput(e.target.value.trim())} />
                </Field>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {source === "existing" ? (
              <Notice>Existing NFTs keep their own artwork. Continue.</Notice>
            ) : (
              <>
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-secondary text-sm text-muted-foreground">
                  {uploading ? (
                    <Loader2 className="size-6 animate-spin" />
                  ) : image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="Uploaded item" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    <>
                      <ImagePlus className="size-6" />
                      <span className="font-semibold text-foreground">Take or choose a photo</span>
                      <span>JPEG, PNG or WebP · resized in your browser</span>
                    </>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
                {uploadError && <Notice tone="danger">{uploadError}</Notice>}
                <p className="text-xs text-muted-foreground">
                  The photo is stored on Vercel Blob; its URL goes into the NFT&apos;s on-chain metadata. Skip it to use generated artwork.
                </p>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Starting price" error={errors.price} hint="The first bid must be at least this. Later bids +5%.">
              <div className="relative">
                <input inputMode="decimal" className={cn(inputCls(!!errors.price), "pr-16 font-mono")} value={price} onChange={(e) => setPrice(e.target.value)} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">MON</span>
              </div>
            </Field>
            <Field label="Duration" error={errors.minutes} hint="Bids in the final 60 s extend the end by 60 s.">
              <div className="relative">
                <input inputMode="numeric" className={cn(inputCls(!!errors.minutes), "pr-20 font-mono")} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">minutes</span>
              </div>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <dl className="divide-y divide-border rounded-2xl border border-border text-sm">
              {[
                ["Item", previewTitle],
                ["Category", source === "mint" ? category : "Existing NFT"],
                ["Condition", source === "mint" ? condition : "—"],
                ["Photo", source === "mint" ? (image ? "Uploaded" : "Generated artwork") : "From the NFT"],
                ["Starting price", priceParsed.ok ? `${formatMon(priceParsed.wei)} MON` : "—"],
                ["Duration", `${mins} min (end time set by the block that creates it)`],
                ["Fees", "None defined by the contract · network gas only"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 p-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-4" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
              <span>I understand the NFT is escrowed until the auction settles, I cannot cancel after the first bid, and this runs on Monad Testnet with test MON.</span>
            </label>
            {errors.declared && <p className="text-xs text-destructive">{errors.declared}</p>}
          </div>
        )}

        {step === 5 && (
          <WalletGate action="publish">
            <ol className="space-y-3">
              {source === "mint" ? (
                <TxStep
                  n={1}
                  title="Mint the item NFT"
                  detail={tokenId !== null ? `Minted token #${tokenId}` : "Writes name, photo URL and details on-chain."}
                  done={tokenId !== null}
                  active={tokenId === null}
                  tx={mintTx}
                  action="Mint NFT"
                  onClick={doMint}
                />
              ) : (
                <TxStep
                  n={1}
                  title="Check ownership & approval"
                  detail={tokenId !== null ? `You own token #${tokenId}${approved ? " · already approved" : ""}` : "Reads the token on-chain."}
                  done={tokenId !== null}
                  active={tokenId === null}
                  action="Check token"
                  onClick={checkExisting}
                  extraError={checkError}
                />
              )}
              <TxStep
                n={2}
                title="Approve the auction house"
                detail={approved ? "Approved" : "Lets the contract move this one token into escrow."}
                done={approved}
                active={tokenId !== null && !approved}
                tx={approveTx}
                action="Approve"
                onClick={async () => {
                  // Skip the approval transaction if the token is already approved on-chain.
                  if (tokenId !== null && !(await refreshApproval(tokenId))) await doApprove();
                }}
              />
              <TxStep
                n={3}
                title="Create the auction"
                detail={`Escrows the NFT. Starting price ${priceParsed.ok ? formatMon(priceParsed.wei) : "?"} MON, ${mins} min.`}
                done={auctionId !== null}
                active={approved && auctionId === null}
                tx={createTx}
                action="Create auction"
                onClick={doCreate}
              />
            </ol>
          </WalletGate>
        )}

        {step === 6 && auctionId !== null && (
          <div className="space-y-6">
            <Notice tone="success" title={`Auction #${auctionId} is live on-chain`}>
              The NFT is in escrow and the countdown has started. {createTx.hash && <TxLink hash={createTx.hash} />}
            </Notice>
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <AuctionQr id={auctionId} className="w-44 shrink-0" />
              <div className="min-w-0 space-y-3">
                <p className="text-sm text-muted-foreground">Bidders scan this QR to open the auction on their phones.</p>
                <div className="flex flex-wrap gap-3">
                  <Link href={`/auction/${auctionId}`}><Btn>Open auction <ArrowRight className="size-4" /></Btn></Link>
                  <Link href={`/screen/${auctionId}`} target="_blank"><Btn variant="secondary">Audience screen</Btn></Link>
                  <QrFullscreenButton id={auctionId} title={previewTitle} className="h-[52px]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {step < 5 && (
          <div className="flex items-center justify-between border-t border-border pt-6">
            <Btn variant="secondary" size="md" onClick={back} disabled={step === 0}>Back</Btn>
            <div className="flex items-center gap-4">
              <span className="hidden font-mono text-sm text-muted-foreground sm:inline">{step + 1} of {STEPS.length}</span>
              <Btn onClick={next}>
                {step === 4 ? "Continue to publish" : "Continue"} <ArrowRight className="size-4" />
              </Btn>
            </div>
          </div>
        )}
        {step === 5 && auctionId === null && (
          <Btn variant="secondary" size="md" onClick={back} disabled={mintTx.busy || approveTx.busy || createTx.busy}>Back to review</Btn>
        )}
      </Card>

      {/* Preview */}
      <aside className="w-full max-w-sm space-y-3 lg:col-start-2 xl:col-start-auto xl:max-w-none">
        <p className="text-sm font-semibold text-muted-foreground">Listing preview</p>
        <div className="rounded-3xl border border-border bg-card p-3">
          <NftArt tokenId={tokenId ?? 0n} image={image ?? undefined} alt={previewTitle} />
          <div className="px-1 pt-3">
            <Eyebrow>{source === "mint" ? category : "NFT"} · ERC-721</Eyebrow>
            <p className="mt-1 text-lg font-semibold">{previewTitle}</p>
            <p className="mt-2 font-mono text-sm">{priceParsed.ok ? `${formatMon(priceParsed.wei)} MON` : "— MON"} · {Number.isFinite(mins) ? mins : "?"} min</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function TxStep({
  n,
  title,
  detail,
  done,
  active,
  tx,
  action,
  onClick,
  extraError,
}: {
  n: number;
  title: string;
  detail: string;
  done: boolean;
  active: boolean;
  tx?: ReturnType<typeof useTx>;
  action: string;
  onClick: () => void;
  extraError?: string | null;
}) {
  return (
    <li className={cn("rounded-2xl border p-4", active ? "border-foreground" : "border-border", !active && !done && "opacity-60")}>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold", done ? "border-success bg-success text-white" : "border-border-strong")}>
          {done ? <Check className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        {active && (
          <Btn size="md" loading={tx?.busy} disabled={tx?.busy} onClick={onClick}>
            {tx?.phase === "signing" ? "Confirm in wallet…" : tx?.phase === "confirming" ? "Confirming…" : action}
          </Btn>
        )}
      </div>
      {tx?.hash && <p className="mt-2 pl-11 text-xs"><TxLink hash={tx.hash} /></p>}
      {(tx?.error || extraError) && <p className="mt-2 pl-11 text-sm text-destructive">{tx?.error ?? extraError}</p>}
    </li>
  );
}
