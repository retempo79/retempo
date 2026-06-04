import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retempo",
  description: "Recurring USDC settlement orchestration for services and agents"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
