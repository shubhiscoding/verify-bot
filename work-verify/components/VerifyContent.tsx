'use client';

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useSearchParams } from 'next/navigation';

const SPECIFIC_TOKEN_MINT = "F7Hwf8ib5DVCoiuyGr618Y3gon429Rnd1r5F9R5upump";
const REQUIRED_BALANCE = 100;
const VERIFY_API_ENDPOINT = process.env.NEXT_PUBLIC_VERIFY_API_ENDPOINT || 'http://localhost:3001/api/verify-wallet';

type TokenBalance = {
  mint: string;
  amount: number;
  decimals: number;
};

export default function VerifyContent() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [tokenBalance, setTokenBalance] = useState<TokenBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; message: string } | null>(null);
  const isFetchingRef = useRef(false);
  const searchParams = useSearchParams();

  const verificationCode = searchParams.get('code');

  const formatWalletAddress = (address: string): string => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const fetchTokenBalance = useCallback(async () => {
    if (isFetchingRef.current || !publicKey || !connected || !connection) return;
    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      const accounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const specificTokenAccount = accounts.value.find(
        (account) => account.account.data.parsed.info.mint === SPECIFIC_TOKEN_MINT
      );

      if (specificTokenAccount) {
        const parsedInfo = specificTokenAccount.account.data.parsed.info;
        setTokenBalance({
          mint: parsedInfo.mint,
          amount: parsedInfo.tokenAmount.uiAmount,
          decimals: parsedInfo.tokenAmount.decimals,
        });
      } else {
        setTokenBalance(null);
        setError("Required token not found in wallet.");
      }
    }
    catch (err) {
      setError("Error fetching token balance");
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [publicKey, connected, connection]);

  useEffect(() => {
    fetchTokenBalance();
  }, [fetchTokenBalance]);

  const verifyWallet = async () => {
    if (!verificationCode || !publicKey || !tokenBalance) return;

    try {
      setVerifying(true);
      setError(null);

      const response = await fetch(VERIFY_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationCode,
          walletAddress: publicKey.toString(),
          tokenBalance: tokenBalance.amount,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Verification failed");

      setVerificationResult(result);
    } 
    catch (err) {
      setError( "Verification error");
      setVerificationResult(null);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (
      tokenBalance &&
      tokenBalance.amount >= REQUIRED_BALANCE &&
      !verifying &&
      !verificationResult &&
      verificationCode
    ) {
      verifyWallet();
    }
  }, [tokenBalance, verifying, verificationResult, verificationCode]);

  if (!verificationCode) {
    return (
      <div className="w-full max-w-md bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        <p className="font-bold">Invalid Verification Link</p>
        <p>Missing verification code. Please use the link provided by the Discord bot.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Discord Role Verification</h1>
        <p className="mt-2 text-gray-600">
          Connect your Solana wallet to verify your token holdings
        </p>
      </div>

      {!connected ? (
        <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Connect Your Wallet</h2>
          <p className="mb-6 text-gray-500">
            Use the wallet button in the top right to connect your Solana wallet.
          </p>
          <p className="text-sm text-gray-500">
            We will check your balance of the required token.
          </p>
        </div>
      ) : (
        <>
          {verificationResult ? (
            <div className={`p-6 rounded-lg ${verificationResult.success ? 'bg-green-100 border border-green-400 text-green-700' : 'bg-red-100 border border-red-400 text-red-700'}`}>
              <h2 className="text-xl font-bold mb-2">
                {verificationResult.success ? 'Verification Successful! 🎉' : 'Verification Failed'}
              </h2>
              <p>{verificationResult.message}</p>
              {verificationResult.success && (
                <p className="mt-4 text-sm">You can now close this window and return to Discord.</p>
              )}
              {!verificationResult.success && tokenBalance && tokenBalance.amount < REQUIRED_BALANCE && (
                <div className="mt-4">
                  <p className="text-sm text-black">You need at least {REQUIRED_BALANCE} tokens to qualify.</p>
                  <p className="text-sm text-black">Your current balance: {tokenBalance.amount}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-100 p-6 rounded-lg shadow mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg text-black">Wallet Connected</h2>
                <span className="text-sm text-gray-500">
                  {formatWalletAddress(publicKey!.toString())}
                </span>
              </div>

              <div className="text-sm mb-4 text-black">
                <p>Checking balance for token:</p>
                <p className="text-xs text-gray-500 break-all mt-1">
                  {SPECIFIC_TOKEN_MINT}
                </p>
              </div>

              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded my-4">
                  {error}
                </div>
              )}

              <div className="mt-4">
                {loading ? (
                  <div className="text-center py-4">
                    <p>Loading token balance...</p>
                  </div>
                ) : tokenBalance ? (
                  <div>
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-black">Current Balance:</h3>
                      <span className="text-xl font-semibold text-black">
                        {tokenBalance.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: tokenBalance.decimals || 6,
                        })}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-200">
                      <div className="flex justify-between items-center text-black">
                        <span>Required Balance:</span>
                        <span>{REQUIRED_BALANCE}</span>
                      </div>

                      <div className="mt-3">
                        {tokenBalance.amount >= REQUIRED_BALANCE ? (
                          <div className="bg-green-100 text-green-700 p-2 rounded text-center">
                            {verifying ? (
                              <p>Verifying your wallet...</p>
                            ) : (
                              <p>Your balance meets the requirements!</p>
                            )}
                          </div>
                        ) : (
                          <div className="bg-orange-100 text-orange-700 p-2 rounded text-center">
                            <p>Insufficient balance. You need at least {REQUIRED_BALANCE} tokens.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-600">
                      This token was not found in your wallet
                    </p>
                  </div>
                )}
              </div>

              {tokenBalance && tokenBalance.amount >= REQUIRED_BALANCE && !verifying && (
                <button
                  onClick={verifyWallet}
                  className="w-full mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Verify Wallet
                </button>
              )}

              {verifying && (
                <div className="text-center mt-4 text-black">
                  <p>Processing verification...</p>
                </div>
              )}
            </div>
          )}

          <div className="text-sm text-black text-center">
            <p>After successful verification, you will be granted the required role in Discord.</p>
          </div>
        </>
      )}
    </div>
  );
}
