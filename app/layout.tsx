import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProFin OS — Prototype",
  description: "Prototype cashier web cabinet for ProFin OS"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
