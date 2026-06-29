import type { Metadata } from "next";
import { Host_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@mysten/dapp-kit/dist/index.css";
import { VaultProvider } from "@/components/vault-context";
import { SuiProvider } from "@/components/sui-provider";

const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VaultKey",
  description: "Web3 Dev Credential Vault",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hostGrotesk.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sans bg-vault-floor text-mercury">
        <SuiProvider>
          <VaultProvider>
            {children}
          </VaultProvider>
        </SuiProvider>
      </body>
    </html>
  );
}
