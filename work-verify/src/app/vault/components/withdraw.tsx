"use client";

import { execute } from "@//actions/execute";
import { withdraw, withdrawFromDatabase } from "@//actions/vault";
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { useState } from "react";
import { toast } from "sonner";

type WithdrawFromVaultProps = {
  amount: number;
  vaultId: string;
};

export function WithdrawFromVault({ amount, vaultId }: WithdrawFromVaultProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { publicKey, signTransaction } = useWallet();

  async function handleWithdraw() {
    try {
      setIsLoading(true);
      if (!publicKey || !signTransaction) {
        toast.error("Connect your wallet first!");
        return;
      }

      const withdrawRes = await withdraw({
        payer: publicKey.toString(),
        network: "mainnet",
        strategy: "blockhash",
        vaultId,
        amount,
        token: {
          amount,
          mintAddress: process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS!,
        },
      });

      const transaction = Transaction.from(
        Buffer.from(withdrawRes.serializedTransaction, "base64")
      );
      const signedTransaction = await signTransaction(transaction);

      const { txHash } = await execute({
        vaultId: vaultId,
        transactionId: withdrawRes.transactionId,
        signedTransaction: signedTransaction.serialize().toString("base64"),
      });

      await withdrawFromDatabase({ amount, vaultId: withdrawRes.vaultId });

      toast(
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">Transaction Confirmed</span>
          <span>Successfully withdraw</span>
          <a
            href={`https://solscan.io/tx/${txHash}`}
            target="_blank"
            className="underline"
            rel="noreferrer"
          >
            View transaction
          </a>
        </div>,
        { duration: 10000 }
      );
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.log(error);
      toast.error("Failed to withdraw");
    }
  }

  return (
    <button
      className="w-full mt-6 px-2 py-2 bg-violet-500 text-white rounded hover:bg-violet-600 cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-500"
      onClick={handleWithdraw}
      disabled={amount <= 0 || isLoading}
    >
      {isLoading ? (
        "Loading..."
      ) : (
        <div className="flex items-center justify-center font-semibold ">
          <span>Withdraw</span>
          <span className="flex items-center gap-0.5 mx-1">
            <img
              src="https://wsrv.nl/?w=128&h=128&default=1&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
              className="size-4"
            />
            <span className="underline">{amount} USDC</span>
          </span>
        </div>
      )}
    </button>
  );
}
