import { Suspense } from "react";

import { getVaultByUser } from "@//actions/vault";
import { TipContent } from "@//app/tip/components/tip-content";

type TipPagerops = {
  searchParams: Promise<{
    receiver_user_id?: string;
  }>;
};

export default async function TipPage(params: TipPagerops) {
  const searchParams = await params.searchParams
  const receiverDiscordId = searchParams.receiver_user_id;
  const receiverVault = await getVaultByUser(receiverDiscordId || '');
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-24">
      <Suspense fallback={<div>Loading...</div>}>
        <TipContent receiverVault={receiverVault?.id} />
      </Suspense>
    </main>
  );
}
