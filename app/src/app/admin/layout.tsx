import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Amministrazione calendario — Antonio Scharmuller",
  description: "Area riservata per la gestione del calendario.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
