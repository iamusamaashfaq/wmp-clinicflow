import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WMP ClinicFlow · Care without the wait",
  description: "Book your clinic visit online, follow your token and accept an earlier slot.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
