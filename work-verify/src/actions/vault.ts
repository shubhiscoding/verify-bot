"use server";

import { auth } from "@//auth";
import { makeSupabase } from "@//lib/supabase";
import { makeXcrow } from "@//lib/xcrow";
import { DepositInput, DepositOutput, WithdrawInput } from "@xcrowdev/node";
import { revalidatePath } from "next/cache";

export const getVaultByUser = async (userDiscordId: string) => {
  try {
    const xcrow = await makeXcrow();
    const supabase = await makeSupabase();

    const { data } = await supabase
      .from("vaults")
      .select("vault_id, amount, decimals")
      .eq("discord_user_id", userDiscordId)
      .maybeSingle();

    if (!data) {
      return null;
    }

    const dbAmount = data.amount;
    const dbDecimals = data.decimals;
    const response = await xcrow.getVaultDetails(data.vault_id);

    return {
      ...response,
      asset: {
        ...response.asset,
        amount: dbAmount,
        amountParsed: dbAmount / Math.pow(10, dbDecimals),
      },
    };
  } catch (error) {
    console.log(error);
    return undefined
  }
};

export const deposit = async (
  params: DepositInput & { amount: number }
): Promise<DepositOutput> => {
  const xcrow = await makeXcrow();
  const session = await auth();

  if (!session) throw new Error("Session is required.");

  const response = await xcrow.deposit(params);
  return response;
};

export const depositInDatabase = async ({
  amount,
  vaultId,
  receiverId,
  txId,
}: {
  amount: number;
  vaultId: string;
  receiverId: string;
  txId?: string;
}) => {
  const supabase = await makeSupabase();
  const session = await auth();

  const senderId = session?.user?.id;

  const { data, error } = await supabase
    .from("vaults")
    .select("vault_id, amount, decimals")
    .eq("vault_id", vaultId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get the vault. ${error.message}`);

  let dbAmount = 0;
  let dbDecimals = 6;

  if (!data) {
    const { error: insertError } = await supabase.from("vaults").insert({
      discord_user_id: receiverId,
      vault_id: vaultId,
      amount: 0,
      decimals: dbDecimals,
    });

    if (insertError)
      throw new Error(`Error on vault creation: ${insertError.message}`);
  } else {
    dbAmount = data.amount ?? 0;
    dbDecimals = data.decimals ?? 6;
  }

  const rawAmount = Math.round(amount * Math.pow(10, dbDecimals));
  const newAmount = rawAmount + dbAmount;

  const { error: updateError } = await supabase
    .from("vaults")
    .update({ amount: newAmount })
    .eq("vault_id", vaultId);

  if (updateError)
    throw new Error(`Error om vault update: ${updateError.message}`);

  const { error: tipsError } = await supabase.from("tips").insert({
    sender: senderId,
    receiver: receiverId,
    amount: rawAmount,
    tax_id: txId,
    decimals: 6,
    status: "sent",
  });

  if (tipsError) throw new Error(`Error om vault update: ${tipsError.message}`);

  revalidatePath("/vault");
};

export const withdraw = async (params: WithdrawInput & { amount: number }) => {
  const xcrow = await makeXcrow();
  const supabase = await makeSupabase();
  const session = await auth();

  const userId = session?.user?.id;

  const { data } = await supabase
    .from("vaults")
    .select("vault_id, amount, decimals")
    .eq("discord_user_id", userId)
    .maybeSingle();

  if (params.vaultId !== data?.vault_id) {
    throw new Error("User is not vault owner!");
  }

  const response = await xcrow.withdraw(params);
  return response;
};

export const withdrawFromDatabase = async ({
  amount,
  vaultId,
}: {
  amount: number;
  vaultId: string;
}) => {
  const supabase = await makeSupabase();
  const session = await auth();

  const userId = session?.user?.id;

  const { data } = await supabase
    .from("vaults")
    .select("vault_id, amount, decimals")
    .eq("discord_user_id", userId)
    .maybeSingle();

  if (vaultId !== data?.vault_id) {
    throw new Error("User is not vault owner!");
  }

  const dbAmount = data.amount;
  const dbDecimals = data.decimals;
  const rawAmount = Math.round(amount * Math.pow(10, dbDecimals));
  const newAmount = rawAmount - dbAmount;

  await supabase
    .from("vaults")
    .update({ amount: newAmount })
    .eq("discord_user_id", userId)
    .maybeSingle();

  revalidatePath("/vault");
};
