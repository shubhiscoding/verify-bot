'use client'

import { formatWalletAddress } from "@//utils/wallet";
import { useWallet } from "@solana/wallet-adapter-react";
import { WithdrawFromVault } from './withdraw';
import { useSession } from "next-auth/react";

type WithdrawContentProps = {
  assetSymbol: string;
  withdrawAmount: number;
  vaultId: string;
};

export function WithdrawContent({
  assetSymbol,
  withdrawAmount,
  vaultId,
}: WithdrawContentProps) {
  const { data: session } = useSession()
  const { publicKey } = useWallet();

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">@{session?.user?.name} Vault</h1>
        <p className="mt-2 w-full block text-center text-gray-300">
          This is your {assetSymbol} vault.
        </p>
      </div>

      <div className="bg-gray-100 p-6 rounded-lg shadow mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg text-black">Wallet Connected</h2>
          <span className="text-sm text-gray-500">
            {formatWalletAddress(publicKey?.toString() || "")}
          </span>
        </div>
        <div>
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-black">Vault Balance:</h3>
            <div className="text-lg font-semibold text-black">
              <span className="flex items-center gap-0.5 mx-1">
                <img
                  src="https://wsrv.nl/?w=128&h=128&default=1&url=https%3A%2F%2Fraw.githubusercontent.com%2Fsolana-labs%2Ftoken-list%2Fmain%2Fassets%2Fmainnet%2FEPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v%2Flogo.png"
                  className="size-4"
                />
                <span>
                  {withdrawAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 6,
                  }) || 0}{" "}
                  USDC
                </span>
              </span>
            </div>
          </div>

          <WithdrawFromVault amount={withdrawAmount} vaultId={vaultId} />
        </div>
      </div>
      <div className="text-sm text-white/80 text-center">
        <p className="mt-2 text-xs text-gray-400">
          You&apos;ll need to sign a message to prove wallet ownership.
        </p>
      </div>
    </div>
  );
}
