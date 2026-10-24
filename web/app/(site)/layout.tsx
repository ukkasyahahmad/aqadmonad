import { Header } from "@/components/header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[1312px] flex-1 px-4 pb-40 pt-6 sm:px-8 md:pb-12">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Unaudited. Testnet only. Do not use with real assets.
      </footer>
    </>
  );
}
