"use client"
import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import * as dotenv from 'dotenv';
dotenv.config()


export default function AppWalletProvider({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const network = WalletAdapterNetwork.Mainnet;
    //const apikey = process.env.HELIUS_API_KEY!;
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
    const wallets = useMemo(
      () => [],
      [network]
    );
   
    return (
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <div style={{ position: 'absolute', top: 24, right: 30 }}>
              <WalletMultiButton />
            </div>
              {children}
            </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    );
  }