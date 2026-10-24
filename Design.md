# Universal Live Auction — Design Spec (UI-First Prototype)

> **Phase: UI/UX prototype only.** No smart contracts, wallet, backend, API, database, or Monad read/write operations.
>
> Visual source of truth: `untitled.pen` (numbered frames 01–11 + `Design System / Components`).
>
> UI labels in this document must match the design exactly (English).

---

## 1. Product principles

1. **Universal, not vehicle-specific.** One shared auction shell + category-specific detail modules.
2. **Bidding only when settlement is defined.** In this phase, only **NFT ERC-721 (Monad, bids in MON)** can be bid on—and even that is **simulated**. All other categories are **Preview only**.
3. **Be honest about data.** Every fact has a provenance label (Verified / Seller-provided / Unknown / Not provided / Example). Never claim verification, authenticity, legal rights, or escrow without evidence.
4. **The demo must always look like a demo.** Show a `PROTOTYPE` banner and `DEMO DATA` / `DEMO BIDDING` / `MOCK WALLET` tags on every surface that could be mistaken for real functionality.
5. **No dead controls.** Every important action must navigate to a designed frame/state or appear disabled (greyed out + lock icon + explanatory text).

---

## 2. Design tokens

### Colors

| Token                      | Value                 | Usage                                                              |
| -------------------------- | --------------------- | ------------------------------------------------------------------ |
| `bg`                       | `#EEF0ED`             | Page background                                                    |
| `surface`                  | `#FFFFFF`             | Cards, panels                                                      |
| `surface-muted`            | `#F5F6F4`             | Stat boxes, disabled controls, skeletons                           |
| `surface-sage`             | `#DFE7E1`             | Prototype banner, informational notices, typographic previews      |
| `text`                     | `#171A18`             | Primary text, Dark buttons, selected chips                         |
| `text-secondary`           | `#5B635F`             | Labels and supporting text (passes AA on white)                    |
| `text-muted`               | `#737B77`             | Non-essential metadata, placeholders, disabled labels              |
| `border`                   | `#E4E8E4`             | Card borders, dividers                                             |
| `border-strong`            | `#C9D0CB`             | Input borders, chips, Secondary buttons                            |
| `accent`                   | `#E4ED72`             | Primary buttons, bid amount box — **always paired with dark text** |
| `accent-hover`             | `#D7E45B`             | Primary hover/pressed state                                        |
| `success` / `success-soft` | `#207A50` / `#E2F1E8` | Live, leading, ERC-721 escrow                                      |
| `warning` / `warning-soft` | `#8A5A00` / `#FBF0D4` | Ending soon, pending, stale, Unknown                               |
| `danger` / `danger-soft`   | `#C93434` / `#FBE9E7` | Validation errors, Cancelled, disconnect                           |

> Note: `#737B77` (the initial suggestion for secondary text) has approximately 4.4:1 contrast on white and lower contrast on `bg`, so essential labels must use `text-secondary` (`#5B635F`).

### Typography

| Role                                           | Font             | Size / weight                                               |
| ---------------------------------------------- | ---------------- | ----------------------------------------------------------- |
| UI                                             | `Inter`          | 11–17 px; 400/500/600                                       |
| Page headline                                  | `Inter`          | Desktop 52 px / Mobile 32 px, 600, letter spacing −1.8 / −1 |
| Asset title                                    | `Inter`          | Desktop 36 · Tablet 30 · Mobile 26, 600                     |
| Numbers (bid, countdown, ID, mileage, address) | `JetBrains Mono` | 12–40 px, 600 — monospace provides tabular numerals         |
| Eyebrow / category                             | `Inter`          | 11–12 px, 600, uppercase, letter spacing 0.6–1              |

### Shape, spacing, effects

- **Radius:** cards `24` (`radius-card`), controls `12` (`radius-control`), media inside cards `16`, pills `999`.
- **Spacing:** 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48 (+ 56/64 for desktop page padding).
- **Card shadow:** `0 1px 2px #1018140A`. Dialogs/menus: `0 8–12px 24–32px` at 12–20% alpha.
- **Touch target:** ≥ 44 × 44 px on mobile (icon buttons, chips, quick amounts, 48–52 px buttons).
- **Desktop grid:** 1312 px content width (64 px padding), 4-column card grid, 24 px gap.

---

## 3. Reusable components

| Component                               | Contents / slots                                                                                                                                   | Variants (via override)                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Logo**                                | Accent mark + gavel icon + wordmark                                                                                                                | Mobile: "ULA"                                                                                                   |
| **Button / Primary · Secondary · Dark** | Label + optional trailing icon, height 44 (48–52 in forms)                                                                                         | Hover, 2 px focus ring `text`, disabled (muted + lock)                                                          |
| **Status Pill**                         | Icon + text (must not rely on color alone)                                                                                                         | Live, Ending soon, Scheduled, Preview only, Ended, Cancelled, Settled (demo), Paused, Live · bid pending (demo) |
| **Demo Tag**                            | Flask icon + monospace text                                                                                                                        | DEMO DATA, PROTOTYPE, DEMO BIDDING, MOCK WALLET, EXAMPLE VALUES                                                 |
| **Provenance Tag**                      | Icon + text                                                                                                                                        | Verified, Seller-provided, Unknown, Not provided, Example value                                                 |
| **Chip**                                | Optional icon + text, height 36 (44 on mobile)                                                                                                     | Default, Selected (dark + check), Disabled                                                                      |
| **Field**                               | Persistent label, 48–56 px box, suffix (MON/km/▾), helper text                                                                                     | Focus (2 px `text` border), Error (2 px `danger` border + red helper text)                                      |
| **Auction Card**                        | Media (image or typographic preview) + status + watch toggle, category, fixed two-line title, seller, price, time, settlement row, CTA             | Live / Ending soon / Preview only; CTA "View auction" vs "View listing"                                         |
| **Header / Desktop**                    | Logo, nav (Explore, Physical, Digital, Sell an asset), search, Watchlist (+count), Wallet                                                          | Disconnected, Connected (mock), tablet version (nav hidden)                                                     |
| **Header / Mobile**                     | Compact logo + four 44 px icon buttons (search, watchlist, wallet, menu)                                                                           | —                                                                                                               |
| **Spec Row**                            | Label · value · Provenance Tag                                                                                                                     | Label width 96–168 depending on breakpoint                                                                      |
| **Bid Row**                             | Avatar, address (monospace), time, amount, status (Leading/Outbid)                                                                                 | —                                                                                                               |
| **Bid Panel**                           | Status + demo tag, current bid, stats (minimum next bid, ends), optional notice, bid form + quick amounts, primary button, cost note, "If you win" | All states in §6                                                                                                |
| **Step Item**                           | Dot (number/check), label, sublabel                                                                                                                | Upcoming, Current, Done                                                                                         |

---

## 4. Pages

### 01 · Home — Desktop 1440

Header → Prototype banner → Hero (headline, value proposition, search pill with scope "All assets" + example query) beside a **Featured auction** (ERC-721, current bid / minimum next bid / end time) → Category navigation (**Physical** and **Digital** rows, each with an eligibility note) → Filter row (status chips · Price range · Condition · Settlement · More filters | Sort: Ending soon) → 4×2 Auction Card grid → "How settlement works" (three columns) → Footer.

### 01b · Home states

- **Loading:** skeleton cards that keep the grid stable, with no fake numbers.
- **No results:** keep the query and active filters visible and allow each to be removed individually; "Remove 'Live now'" / "Clear search & filters".
- **Category unavailable:** Tokenized assets — explanation + "Browse NFTs instead".

### 02 · Home — Mobile 390 / 02b · Filter drawer

Compact header, short banner, headline, search, segmented **All / Physical / Digital**, horizontal category scroller (scroll within the scroller, not the page), featured card, **Filters** and **Sort** buttons, single-column cards, settlement explainer. Drawer: status, asset type, price range (MON), settlement checkboxes, footer "Clear all" / "Show N results".

### 03 · Auction Detail — Desktop 1440 (ERC-721)

Breadcrumbs → **Primary row:** gallery (720 px main media + four thumbnails, selected thumbnail has a 2 px border) | 460 px decision column (asset identity directly above Bid Panel, then Watch / Copy link) → **Lower row:** About (+ provenance legend), Token & ownership, Rights & limitations | Bid history, Seller, Terms & disclaimers.

### 04 · Asset Detail — Tablet 834 (Vehicle, preview-only)

Full-width gallery with 96×72 thumbnails, asset identity, then **Key facts (2×2)** row + **disabled Bid Panel (340)**, Vehicle details (one column), Known defects. Photo caption: "Demo photo, not of the listed vehicle".

### 05 · Auction Detail — Mobile 390 / 05b · Sticky bar

Order: back link → gallery (scrollable thumbnail strip) → identity → Bid Panel → Watch → Token & ownership → Bid history → Rights. Sticky bid bar (current bid + countdown + "Place bid") **appears only after the Bid Panel has scrolled out of view**, is hidden while the keyboard/dialog is open, and sits above the safe area.

### 08 / 09 · Create listing

Seven steps: **Category → Core details → Category attributes → Media → Pricing & duration → Review → Confirmation.**

- **Desktop (vehicle flow):** left step rail, central form card, listing preview on the right. Step 1 = category tiles + eligibility labels; Step 3 = vehicle-specific fields, error summary at the top, inline errors (Mileage, Transmission); Step 6 = "Transaction & transfer limitations" block, section-by-section summary with "Edit (step n)", declaration checkbox, "Publish preview listing (demo)".
- **Mobile (NFT flow):** flow header + progress bar, bottom action bar. Step 1 lists Digital options; Step 5 includes minimum bid (error "must be greater than 0 MON"), increment, duration, and end-time preview (WIB + UTC); Step 7 shows "Demo listing created" — nothing is minted, approved, escrowed, or published.
- Optional fields left blank appear to buyers as **Not provided**; they must never be hidden or guessed.

---

## 5. Eligibility by category

| Category                                                                                                       | Prototype status  | Display currency             | Reason                                                                       |
| -------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| NFT (ERC-721)                                                                                                  | **Demo bidding**  | MON                          | Token escrow by the auction contract is planned                              |
| Vehicles, Electronics, Machinery, Home & furniture, Art & collectibles, Watches & jewellery, Tools & inventory | Preview only      | USD (indicative guide price) | No on-chain escrow; title, inspection, payment, and shipping are not handled |
| Domains                                                                                                        | Preview only      | USD (indicative)             | Off-chain registrar transfer is not supported yet                            |
| Software & creative, Digital licences                                                                          | Preview only      | USD (indicative)             | Transferability and usage rights have not been confirmed                     |
| Tokenized assets                                                                                               | Not available yet | —                            | Rights represented by the token cannot yet be verified                       |

> Non-MON currencies are a temporary display decision; the product must make a decision before they are used for settlement.

### Category-specific fields (frame 10)

- **Vehicles:** year/make/model, trim, mileage, powertrain, transmission, condition, inspection, VIN, title/registration, known defects.
- **Machinery & equipment:** manufacturer/model, operating hours, capacity, maintenance log, transport.
- **Electronics:** manufacturer/model, condition, accessories, compatibility, warranty.
- **Art, collectibles & jewellery:** materials, measurements, condition, provenance, authenticity documents.
- **Domains:** domain, extension, registrar transfer, expiry/renewal.
- **Software & licences:** product/version, platform, licence scope, transferability, redistribution, delivery.
- **NFT / tokenized:** network, token standard, token ID, contract address (only if it can be read reliably).

---

## 6. Auction & bid states (frame 06)

| ID  | State                    | Behavior                                                                                                                                                                                                          |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Ready                    | "Your bid" field + quick amounts (Min, +10, +25); "Review bid"                                                                                                                                                    |
| S2  | Confirmation dialog      | Exact amount entered, summary (current bid, minimum next bid, end time, network fee "Not estimated", other fees "None defined"), simulation notice; **Cancel** / **Confirm demo bid**; ✕ and Esc close the dialog |
| S3  | Pending (simulated)      | Input locked, "Pending…" button with loader, clearly labeled as **not** an on-chain transaction                                                                                                                   |
| S4  | Leading (demo)           | Success notice; current bid and minimum next bid updated                                                                                                                                                          |
| S5  | Rejected — price changed | Explain that another bid was submitted first, show new minimum, auto-fill the field, and show "Review bid at 200.00 MON"                                                                                          |
| S6  | Invalid / insufficient   | Preserve the value, explain the rule, disable the button with "Enter a valid bid"                                                                                                                                 |
| S7  | Ended                    | Winning bid, end time (WIB + UTC), remove the form, show "Settlement — pending (demo)"                                                                                                                            |
| S8  | Cancelled                | Reason + actor; remove the form and disable the button                                                                                                                                                            |
| S9  | Empty bid history        | Starting price = first valid bid; history says "No bids yet"                                                                                                                                                      |
| S10 | Unsupported path         | Guide price (not a bid), explanatory notice, "Bidding unavailable" + lock, prompt to add to watchlist                                                                                                             |

Supported auction status pills: scheduled, live, ending soon, paused, ended, cancelled, settled (demo), preview only.

**Price display rules:** current bid ≠ total cost; network fee is not estimated; do not invent buyer fees, taxes, shipping costs, or reserve prices. Always display time with its timezone (WIB) and UTC equivalent.

---

## 7. Wallet, account & watchlist (frame 07, mock)

- **W1** Disconnected → "Connect wallet".
- **W3** Connect dialog: only "Mock wallet (demo)" is active; Browser wallet and WalletConnect are labeled "Not available in prototype".
- **W2** Connected header (mock): address chip + "· mock", watchlist count.
- **W4** Account menu: address, "Mock wallet — not a real connection", Network "Not connected", Balance "Not read in prototype", My bids, My listings, Watchlist, Disconnect.
- **W5 / W6** Watchlist with items (thumbnail, status, metadata, 44 px remove control) and empty state.
- **W7** Bid Panel while disconnected: hide the form; "Connect wallet to bid" → W3.

---

## 8. Interaction map (frame 11)

pen.dev **does not support prototype hotspots/links**, so transitions are modeled as separate frames/states and documented in frame 11:

- **Discovery:** category/search → results; no results → 01b; Filters → 02b → "Show N results".
- **Open listing:** ERC-721 card → 03/05; other cards → 04; tapping a thumbnail changes the main media.
- **Demo bid:** S1 → S2 → S3 → S4 | S5; Cancel/✕/Esc → S1; amount below minimum → S6; S5 → S2 with the new minimum.
- **Terminal states:** countdown reaches 0 → S7; seller cancels → S8; category without settlement → S10.
- **Wallet:** W1 → W3 → W2 → W4 → Disconnect → W1; bid without wallet → W7 → W3.
- **Create:** Continue/Back between steps; errors block Continue; Publish (demo) → Confirmation.

---

## 9. Accessibility

- Field labels must always remain visible; placeholders are not a substitute for labels.
- Status must always use an icon + text, not color alone.
- 2 px `text` focus ring outside the element; design hover, pressed, selected, disabled, pending, success, and error states.
- Dialogs: one primary action + one safe secondary action, with a 44 px close button.
- Motion only for state changes; respect `prefers-reduced-motion` in implementation.
- Heading hierarchy: page title → section title → card title.

---

## 10. Demo data

Centralized fixtures (images are in `Design System / Components → Demo Fixtures / Media`):

| Key               | Listing                               | Status       | Price                                |
| ----------------- | ------------------------------------- | ------------ | ------------------------------------ |
| genesis           | Monad Genesis Pass #0412              | Live         | 182.50 MON · min next 187.50 · +5.00 |
| orbit             | Orbit Study No. 7 (1/1)               | Ending soon  | 46.00 MON                            |
| porsche           | 1990 Porsche 911 Carrera 2 Coupé      | Preview only | Guide 68,000 USD                     |
| excavator         | Compact Excavator 3.5 t, 2,140 h      | Preview only | Guide 27,500 USD                     |
| domain            | harbor.xyz                            | Preview only | Guide 1,800 USD                      |
| watch             | Steel Automatic Chronograph, 39 mm    | Preview only | Guide 4,200 USD                      |
| license           | Vector Studio Pro — Perpetual Seat    | Preview only | Guide 420 USD                        |
| chair             | Walnut Lounge Chair & Ottoman         | Preview only | Guide 3,100 USD                      |
| camera / painting | Rangefinder kit / Coastal Study No. 3 | Preview only | Guide 2,350 / 5,800 USD              |

Photos are sourced from Unsplash stock (not the assets being sold); the two NFT artworks are AI-generated. All addresses, bidders, and sellers are fictional.

---

## 11. Out of scope for this phase

Smart contracts (escrow, bidding, settlement, cancellation), real wallet integration and token approval, Monad read/write operations, real-time bid updates, backend/API/database, media upload storage, production authentication, network fee estimation, and settlement for physical goods and non-tokenized digital assets.

## 12. Known gaps

- Tablet designs exist only for detail pages (Home and Create do not yet have tablet versions).
- 320–375 px widths have not been tested separately.
- Interactions cannot yet be clicked in pen.dev; see §8.
