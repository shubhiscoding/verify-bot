"use server";

import { DISCORD_API_URL } from "@/utils/config";

export const sendDiscordTipAnnounce = async ({
  receiverId,
  senderId,
  amount,
}: {
  senderId: string;
  receiverId: string;
  amount: number;
}) => {
  await fetch(`${DISCORD_API_URL}/send-channel-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `<@${senderId}> just sent **${amount} USDC** to <@${receiverId}>!`,
      channelId: process.env.ANNOUNCE_CHANNEL_ID,
    }),
  });
};
