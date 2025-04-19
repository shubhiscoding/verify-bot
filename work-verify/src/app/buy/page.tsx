'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation'; // Import useSearchParams
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import axios, { AxiosResponse } from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { QuoteResponse ,SwapResponse } from '@/utils/types';
import { SOL_MINT , JUPITER_QUOTE_API , JUPITER_SWAP_API  } from '@/utils/config';


export default function SwapPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const searchParams = useSearchParams(); // Get search params

  // --- State for dynamic data ---
  const [tokenMint, setTokenMint] = useState<string | null>(null);
  const [requiredRawAmount, setRequiredRawAmount] = useState<number | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>('Token'); // Default symbol
  const [tokenDecimals, setTokenDecimals] = useState<number>(0); // Default decimals
  const [guildName, setGuildName] = useState<string>('the server'); // Default name
  const [paramsLoaded, setParamsLoaded] = useState<boolean>(false);
  const [paramsError, setParamsError] = useState<string | null>(null);

  // --- Existing state ---
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [txId, setTxId] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false); // Start false, load after params
  const [quoteData, setQuoteData] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);


  // --- Effect to parse URL parameters ---
  useEffect(() => {
    const mint = searchParams.get('tokenMint');
    const rawAmountStr = searchParams.get('requiredRawAmount');
    const symbol = searchParams.get('tokenSymbol');
    const decimalsStr = searchParams.get('tokenDecimals');
    const gName = searchParams.get('guildName');

    let errorMsg = null;

    if (!mint) {
        errorMsg = "Required token information (tokenMint) is missing in the URL.";
    }
    if (!rawAmountStr) {
        errorMsg = errorMsg ? errorMsg + " Required amount (requiredRawAmount) is also missing." : "Required amount information (requiredRawAmount) is missing in the URL.";
    }

    if (errorMsg) {
        setParamsError(errorMsg);
        toast.error(errorMsg);
        setParamsLoaded(true); // Mark as loaded even on error to stop loading indicator
        return;
    }

    setTokenMint(mint);
    if(gName) setGuildName(gName);
    if(symbol) setTokenSymbol(symbol);

    try {
        const rawAmountNum = parseInt(rawAmountStr!, 10);
        if (isNaN(rawAmountNum) || rawAmountNum <= 0) {
            throw new Error("Invalid required amount value.");
        }
        setRequiredRawAmount(rawAmountNum);
    } catch (e) {
        setParamsError("Invalid required amount format in URL.");
        toast.error("Invalid required amount format in URL.");
        setParamsLoaded(true);
        return;
    }

    try {
        const decimalsNum = parseInt(decimalsStr || '0', 10); // Default to 0 if missing
        if (isNaN(decimalsNum) || decimalsNum < 0) {
           console.warn("Invalid token decimals value in URL, defaulting to 0.");
           setTokenDecimals(0);
        } else {
            setTokenDecimals(decimalsNum);
        }
    } catch (e) {
         console.warn("Error parsing token decimals from URL, defaulting to 0.");
         setTokenDecimals(0);
    }

    setParamsError(null);
    setParamsLoaded(true);

  }, [searchParams]); // Re-run if searchParams change


  // --- Function to get quote (now uses state) ---
  const getQuote = async (): Promise<QuoteResponse | null> => {
     if (!paramsLoaded || paramsError || !tokenMint || !requiredRawAmount) {
        console.error("Cannot get quote: Parameters not loaded or invalid.");
        setQuoteError("Cannot fetch quote due to missing or invalid configuration from the previous step.");
        return null;
     }
    try {
      setQuoteLoading(true);
      setQuoteError(null); // Clear previous error
      const platformFee = process.env.NEXT_PUBLIC_PLATFORM_FEES || 0; // Default fee if not set

      const response: AxiosResponse<QuoteResponse> = await axios.get(
        JUPITER_QUOTE_API,
        {
          params: {
            inputMint: SOL_MINT,
            outputMint: tokenMint, // Use state variable
            amount: requiredRawAmount, // Use state variable (raw amount)
            swapMode: 'ExactOut',
            platformFeeBps: platformFee,
          },
        }
      );
      setQuoteData(response.data); // Set quote data state
      return response.data;
    } catch (err: unknown) {
      console.error('Error getting quote:', err);
      const errorText = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setQuoteError(`Failed to fetch quote: ${errorText}`);
      toast.error(`Failed to fetch quote: ${errorText}`);
      setQuoteData(null); // Clear quote data on error
      return null; // Return null on error
    } finally {
      setQuoteLoading(false);
    }
  };

  // --- Effect to fetch initial quote after params are loaded ---
  useEffect(() => {
    if (paramsLoaded && !paramsError) {
      getQuote(); // Fetch initial quote
      const intervalId = setInterval(getQuote, 15000); // Refresh quote periodically (e.g., 15s)
      return () => clearInterval(intervalId); // Cleanup interval
    }
     // Intentionally not including getQuote in deps to avoid loop,
     // it depends on paramsLoaded and paramsError which are in deps.
  }, [paramsLoaded, paramsError, tokenMint, requiredRawAmount]); // Re-fetch if essential params change


  // --- Function to get swap transaction (uses state) ---
  const getSwapTransaction = async (
    quoteResponse: QuoteResponse
  ): Promise<SwapResponse | null> => {
     if (!publicKey) {
       toast.error('Wallet not connected');
       return null;
     }
    try {
      const feeReciver = process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIVER;
      const response: AxiosResponse<SwapResponse> = await axios.post(
        JUPITER_SWAP_API,
        {
          userPublicKey: publicKey.toString(),
          quoteResponse: quoteResponse,
          dynamicComputeUnitLimit: true,
          ...(feeReciver && { feeAccount: feeReciver }), // Conditionally add feeAccount
        }
      );
      return response.data;
    } catch (err: unknown) {
      console.error('Error getting swap transaction:', err);
       const errorText = err instanceof Error ? err.message : 'An unexpected error occurred.';
      toast.error(`Failed to create swap transaction: ${errorText}. Please try again.`);
      throw err; // Re-throw to be caught by executeSwap
    }
  };

  // --- Execute Swap Function (modified for dynamic data) ---
  const executeSwap = async () => {
    if (!publicKey || !sendTransaction) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!quoteData && !quoteLoading) {
        // Attempt to fetch quote again if it's missing and not currently loading
        toast.info("Quote data missing, attempting to refresh...");
        const freshQuote = await getQuote();
        if (!freshQuote) {
             toast.error('Could not retrieve a valid quote. Please try again later.');
             return;
        }
        // Use the fresh quote for the swap
        // Note: This replaces the global quoteData state, which might trigger UI updates
    } else if (!quoteData) {
         toast.error('Quote not available. Please wait or refresh the page.');
         return;
    }


    setLoading(true);
    setSuccess(false); // Reset success state
    setTxId(null); // Reset txId
    try {
      let currentQuote = quoteData!; // Start with existing quote

      // Optionally get a fresh quote right before swapping if desired, or rely on interval
      // if (quoteLoading || quoteError) { // Or based on time since last quote
      //  toast.info('Getting fresh quote for swap...');
      //  const freshQuote = await getQuote();
      //  if (!freshQuote) {
      //    toast.error("Failed to get fresh quote before swapping.");
      //    setLoading(false);
      //    return;
      //  }
      //  currentQuote = freshQuote;
      // }

      toast.info('Preparing transaction...');
      const swapData = await getSwapTransaction(currentQuote);

      if (!swapData) {
        setLoading(false);
        return;
      }

        // Check for simulation errors BEFORE trying to deserialize
      if (swapData.simulationError) {
        console.error('Simulation error:', swapData.simulationError);
        // Try to provide a more specific error message if possible
        let simErrorMsg = `Transaction simulation failed.`;
        if (swapData.simulationError) {
            simErrorMsg += ` Message: ${swapData.simulationError}`;
        }
        toast.error(simErrorMsg);
        setLoading(false);
        return;
      }

      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');

      let transaction: Transaction | VersionedTransaction;
      try {
        // Deserialize the transaction
        transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        console.log("Transaction Deserialized:", transaction);
      } catch (deserializeError: unknown) {
        console.error('Failed to deserialize transaction:', deserializeError);
        const errorText = deserializeError instanceof Error ? deserializeError.message : 'Unknown deserialization error.';
        toast.error(`Failed to process transaction data: ${errorText}. Please try again.`);
        setLoading(false);
        return;
      }

      toast.info('Please approve the transaction in your wallet...');
      const signature = await sendTransaction(transaction, connection);
      setTxId(signature);

      console.log('Transaction sent:', signature);
      toast.success('Transaction sent! Waiting for confirmation...');

      // --- Confirmation Logic (improved robustness) ---
       const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
       let confirmationStatus;
       let attempts = 0;
       const maxAttempts = 30; // ~60 seconds

       while (attempts < maxAttempts) {
           try {
               const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
               confirmationStatus = status.value?.confirmationStatus;

               if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
                   console.log(`Transaction confirmed with status: ${confirmationStatus}`);
                   setSuccess(true);
                   toast.success(`Successfully swapped for ${displayAmount} ${tokenSymbol}!`);
                   break; // Exit loop on success
               }

               // Check if the transaction blockhash is still valid
               const currentBlockHeight = await connection.getBlockHeight();
               if (currentBlockHeight > lastValidBlockHeight) {
                   console.warn(`Transaction timed out (blockhash expired). Signature: ${signature}`);
                   toast.warn('Transaction confirmation timed out as the network moved past its validity window. Please check your wallet and Solscan for the final status.');
                   // Consider the transaction potentially failed or needs manual checking
                   // setSuccess(false); // Or keep loading/neutral state
                   break;
               }

           } catch (e) {
                console.error("Error checking signature status:", e);
                // Avoid spamming errors, maybe break after a few attempts
                if (attempts > 5) {
                    toast.error("Error checking transaction status. Please check Solscan manually.");
                    break;
                }
           }

           await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
           attempts++;
       }

        if (!success && attempts >= maxAttempts) {
             console.warn(`Transaction confirmation timed out after ${maxAttempts} attempts. Signature: ${signature}`);
             toast.warn('Transaction submitted but confirmation timed out. Please check your wallet and Solscan for the final status.');
        }


    } catch (err: unknown) {
      console.error('Error executing swap:', err);
       // Handle wallet rejection errors specifically
       if (err instanceof Error && (err.name === 'WalletSignTransactionError' || err.message?.includes('User rejected'))) {
             toast.error('Transaction cancelled: Wallet request rejected.');
       } else {
            const errorText = err instanceof Error ? err.message : 'An unexpected error occurred.';
            toast.error(`Failed to execute swap: ${errorText}`);
       }
      // Ensure loading is stopped even if confirmation fails/errors
       setLoading(false);
    } finally {
      // Ensure loading is always set to false eventually
       if (!success) {
            setLoading(false);
       }
      // If successful, loading might already be false, or we might want a brief pause
    }
  };

  // --- Helper function to format SOL ---
  const formatSolAmount = (lamports: string | number | undefined): string => {
     if (lamports === undefined || lamports === null) return '...';
    const amount = typeof lamports === 'string' ? parseFloat(lamports) : lamports;
    if (isNaN(amount)) return 'Error';
    return (amount / 1_000_000_000).toFixed(5); // Increased precision slightly
  };

    // --- Calculate display amount ---
    const displayAmount = requiredRawAmount !== null
        ? (requiredRawAmount / Math.pow(10, tokenDecimals)).toLocaleString(undefined, {maximumFractionDigits: tokenDecimals})
        : '...';


  // --- Render logic ---
  if (!paramsLoaded) {
      return <div className="max-w-lg mt-48 mx-auto p-4 text-white text-center">Loading configuration...</div>;
  }

  if (paramsError) {
       return <div className="max-w-lg mt-48 mx-auto p-4 text-red-500 bg-red-100 border border-red-400 rounded text-center">{paramsError} Please go back to Discord and try the link again.</div>;
  }


  return (
    <div className="max-w-lg mt-24 md:mt-48 mx-auto p-4 text-black"> {/* Adjusted top margin */}
      <ToastContainer position="top-left" autoClose={4000} />

      <h1 className="text-2xl md:text-3xl font-bold mb-6 md:mb-8 text-white text-center">
        Buy {tokenSymbol} for {guildName}
      </h1>

      <div className="bg-gray-100 p-4 md:p-6 rounded-lg shadow-lg mb-8">
        <div className="mt-4">
          <h2 className="text-lg md:text-xl font-semibold mb-4 text-center">Swap Details</h2>

          {(quoteLoading && !quoteData) && (
            <div className="bg-white p-4 rounded-lg mb-6 text-center">
              <p>Loading best price...</p>
            </div>
          )}

          {quoteError && !quoteLoading && ( // Show error only if not loading
            <div className="bg-red-100 border border-red-300 text-red-700 p-4 rounded-lg mb-6 text-center">
              <p>{quoteError}</p>
              <button
                onClick={() => getQuote()} // Retry fetching
                className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Try Again
              </button>
            </div>
          )}

          {quoteData && (
            <div className="bg-white p-4 rounded-lg mb-6 text-sm md:text-base">
              <div className="flex justify-between mb-2">
                <span>You Pay (approx):</span>
                <span className="font-medium text-right">
                  ~{formatSolAmount(quoteData.inAmount)} SOL
                  {quoteLoading && <span className="ml-1 text-xs text-gray-500">(refreshing...)</span>}
                </span>
              </div>
              <div className="flex justify-between">
                <span>You Receive:</span>
                <span className="font-medium">{displayAmount} {tokenSymbol}</span>
              </div>
               <div className="text-xs text-gray-500 mt-1 text-right">
                   Price based on current market conditions.
               </div>
            </div>
          )}

          <button
            onClick={executeSwap}
            disabled={loading || success || !publicKey || !quoteData || quoteLoading || !!quoteError || !!paramsError}
            className={`w-full py-3 rounded-lg font-medium text-base md:text-lg ${
              !publicKey
                ? 'bg-gray-400 cursor-not-allowed'
                : !quoteData || quoteLoading || !!quoteError || !!paramsError
                  ? 'bg-gray-400 cursor-not-allowed'
                  : loading
                    ? 'bg-yellow-500 cursor-wait' // Indicate processing
                    : success
                      ? 'bg-green-500 hover:bg-green-600 cursor-default' // Indicate success
                      : 'bg-[#8151fd] hover:bg-blue-600' // Default action color
            } text-white font-bold transition duration-200 flex items-center justify-center space-x-2`}
          >
             {/* Loading spinner */}
            {loading && (
                 <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )}
            <span>
                {!publicKey ? 'Connect Wallet First'
                : !quoteData && quoteLoading ? 'Finding Best Price...'
                : !quoteData || !!quoteError ? 'Quote Unavailable'
                : loading ? 'Processing Swap...'
                : success ? 'Purchase Successful!'
                : `Buy ${displayAmount} ${tokenSymbol}`}
            </span>
          </button>

          {success && (
            <div className="mt-6 p-4 bg-green-100 border border-green-300 rounded-lg text-sm md:text-base">
              <p className="font-medium mb-2 text-green-800">
                🎉 Congratulations! You've successfully purchased {displayAmount} {tokenSymbol}.
              </p>
              {txId && (
                <a
                  href={`https://solscan.io/tx/${txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all" // Allow long tx hash to wrap
                >
                  View transaction on Solscan
                </a>
              )}
            </div>
          )}
           {!success && txId && !loading && ( // Show Tx link if sent but not confirmed/failed
                <div className="mt-4 text-center text-xs md:text-sm">
                    <p>Transaction sent. Waiting for confirmation...</p>
                     <a
                        href={`https://solscan.io/tx/${txId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline break-all"
                    >
                        View on Solscan: {txId.substring(0, 6)}...{txId.substring(txId.length - 6)}
                    </a>
                </div>
           )}
        </div>
      </div>
    </div>
  );
}