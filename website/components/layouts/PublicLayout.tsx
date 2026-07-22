import type { ReactNode } from "react";
import Header from "@/components/organisms/Header";
import Footer from "@/components/organisms/Footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
