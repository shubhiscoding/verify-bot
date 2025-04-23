import { 
    CommandInteraction, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits,
    Role,
    Guild
  } from 'discord.js';
  import { CLIENT_URL, pendingVerifications , supabase } from '../config';
  import { 
    formatBalanceNumber, 
    getServerConfig, 
    createOrUpdateServerConfig,
    updateServerConfig
  } from '../utils';
  import { PublicKey } from '@solana/web3.js';
  import crypto from 'crypto';
  

  export async function handleSetupCommand(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }
  
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "You need Administrator permissions to use this command.",
        ephemeral: true,
      });
      return;
    }
    const guild = interaction.guild!;
  
    try {
      await interaction.deferReply({ ephemeral: true });
  
      const tokenAddress = interaction.options.getString("token_address", true);
      const requiredBalanceInput = interaction.options.getString(
        "required_balance",
        true
      );
      const roleToGrant = interaction.options.getRole("role_to_grant", true);
      const rpcUrl =
        interaction.options.getString("rpc_url") ||
        "https://api.mainnet-beta.solana.com";
      const tokenSymbol = interaction.options.getString("token_symbol");
      const tokenDecimalsInput = interaction.options.getInteger("token_decimals");
  
      try {
        new PublicKey(tokenAddress);
      } catch (e) {
        await interaction.editReply("Invalid Solana token address format.");
        return;
      }
      try {
        new URL(rpcUrl);
      } catch (e) {
        await interaction.editReply("Invalid RPC URL format.");
        return;
      }
      if (!(roleToGrant instanceof Role)) {
        await interaction.editReply("Invalid role selected.");
        return;
      }
      if (!guild.members.me) {
        console.error(
          "[Setup Command] Cannot check bot permissions: guild.members.me is null."
        );
        await interaction.editReply(
          "Internal error: Could not verify bot permissions."
        );
        return;
      }
      if (roleToGrant.managed || roleToGrant.id === guild.roles.everyone.id) {
        await interaction.editReply(
          "Cannot assign a managed or the @everyone role."
        );
        return;
      }
      if (
        !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
        (roleToGrant.position >= guild.members.me.roles.highest.position &&
          guild.ownerId !== interaction.client.user?.id)
      ) {
        await interaction.editReply(
          `The bot lacks permissions or has insufficient hierarchy to assign the role \`${roleToGrant.name}\`. Ensure the bot's role is higher than this role and has 'Manage Roles' permission.`
        );
        return;
      }
  
      let requiredBalanceNumber: number;
      try {
        requiredBalanceNumber = Number(requiredBalanceInput.replace(/,/g, ""));
        if (isNaN(requiredBalanceNumber) || requiredBalanceNumber < 0)
          throw new Error("Balance must be a non-negative number");
        if (requiredBalanceNumber > Number.MAX_SAFE_INTEGER)
          console.warn(
            `[Setup Command] [Precision Warning] Input required balance ${requiredBalanceNumber} exceeds MAX_SAFE_INTEGER.`
          );
      } catch (e) {
        await interaction.editReply(
          "Invalid required balance format. Please provide the raw token amount (e.g., 1000000)."
        );
        return;
      }
  
      const tokenDecimals =
        tokenDecimalsInput !== null && tokenDecimalsInput >= 0
          ? tokenDecimalsInput
          : null;
  
      const serverConfig = {
        server_id: guild.id,
        server_name: guild.name,
        token_address: tokenAddress,
        required_balance: requiredBalanceNumber.toString(),
        role_id: roleToGrant.id,
        rpc_url: rpcUrl,
        admin_user_id: interaction.user.id,
        token_symbol: tokenSymbol,
        token_decimals: tokenDecimals,
        setup_complete: true
      };
  
      const success = await createOrUpdateServerConfig(serverConfig);
  
      if (!success) {
        console.error(
          `[Setup Command] Database error saving config for guild ${guild.id}`
        );
        await interaction.editReply(
          "Failed to save server configuration to the database. Please try again later."
        );
        return;
      }
  
      const balanceDisplay = formatBalanceNumber(
        requiredBalanceNumber,
        tokenDecimals
      );
      const symbolDisplay = tokenSymbol ? ` ${tokenSymbol}` : " tokens";
      const decimalsDisplay =
        tokenDecimals !== null ? `\n- Token Decimals: ${tokenDecimals}` : "";
      await interaction.editReply(
        `✅ **Configuration updated successfully!**\n` +
        `- Token Address: \`${tokenAddress}\`\n` +
        `- Required Balance: \`${balanceDisplay}${symbolDisplay}\` (Raw: ${requiredBalanceNumber})\n` +
        `- Role Granted: ${roleToGrant} (\`${roleToGrant.name}\`)\n` +
        `- Solana RPC URL: \`${rpcUrl}\`${decimalsDisplay}\n\n` +
        `Members can now run \`/verify\` to get the role.`
      );
    } catch (setupError) {
      console.error(
        `[Setup Command] Unexpected error during setup for guild ${
          guild?.id || "unknown"
        }:`,
        setupError
      );
      if (interaction.isRepliable()) {
        try {
          const errorReplyOptions = {
            content:
              "An unexpected error occurred during setup. Please check the bot logs or contact support.",
            ephemeral: true,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply(errorReplyOptions);
          } else {
            await interaction.reply(errorReplyOptions);
          }
        } catch (replyError) {
          console.error(
            "[Setup Command] Failed to send error reply to interaction:",
            replyError
          );
        }
      }
    }
  }

  export async function handleEditConfigCommand(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) {
      console.warn(
        "handleEditConfigCommand called with non-chat input command interaction"
      );
      if (interaction.isRepliable())
        await interaction
          .reply({ content: "Invalid command type received.", ephemeral: true })
          .catch(() => {});
      return;
    }
  
    if (!interaction.guild) {
      console.error("[Edit Command] Guild is null in handleEditConfigCommand");
      await interaction.reply({
        content: "Error: Guild context is missing.",
        ephemeral: true,
      });
      return;
    }
    const guild: Guild = interaction.guild;
  
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: "You need Administrator permissions to use this command.",
        ephemeral: true,
      });
      return;
    }
  
    try {
      await interaction.deferReply({ ephemeral: true });
  
      const currentConfig = await getServerConfig(guild.id);
      if (!currentConfig) {
        const setupCmd = interaction.client.application?.commands.cache.find(
          (cmd) => cmd.name === "server-setup"
        );
        const cmdMention = setupCmd
          ? `</server-setup:${setupCmd.id}>`
          : "`server-setup`";
        await interaction.editReply(
          `No configuration found for this server. Please run ${cmdMention} first.`
        );
        return;
      }
      const newTokenAddress = interaction.options.getString("token_address");
      const newRequiredBalanceInput =
        interaction.options.getString("required_balance");
      const newRole = interaction.options.getRole("role_to_grant");
      const newRpcUrl = interaction.options.getString("rpc_url");
      const newTokenSymbolInput = interaction.options.getString("token_symbol");
      const newTokenDecimalsInput =
        interaction.options.getInteger("token_decimals");
  
      const updateData: any = {};
  
      const changes: string[] = [];
      let validationError = false;
  
      if (newTokenAddress !== null) {
        try {
          new PublicKey(newTokenAddress);
          updateData.token_address = newTokenAddress;
          changes.push(`- Token Address: \`${newTokenAddress}\``);
        } catch (e) {
          await interaction.editReply(
            "Invalid Solana token address format provided."
          );
          validationError = true;
        }
      }
  
      if (newRequiredBalanceInput !== null && !validationError) {
        try {
          const balanceNum = Number(newRequiredBalanceInput.replace(/,/g, ""));
          if (isNaN(balanceNum) || balanceNum < 0)
            throw new Error("Balance must be a non-negative number");
          if (balanceNum > Number.MAX_SAFE_INTEGER)
            console.warn(
              `[Edit Command] [Precision Warning] Input required balance ${balanceNum} exceeds MAX_SAFE_INTEGER.`
            );
          updateData.required_balance = balanceNum.toString();
          const decimalsForFormat =
            newTokenDecimalsInput !== null
              ? newTokenDecimalsInput
              : currentConfig.token_decimals ?? undefined;
          changes.push(
            `- Required Balance: \`${formatBalanceNumber(
              balanceNum,
              decimalsForFormat
            )}\` (Raw: ${balanceNum})`
          );
        } catch (e) {
          await interaction.editReply(
            "Invalid required balance format. Please provide the raw token amount (e.g., `1000000`)."
          );
          validationError = true;
        }
      }
  
      if (newRole !== null && !validationError) {
        if (!(newRole instanceof Role)) {
          await interaction.editReply("Invalid role selected.");
          validationError = true;
        } else if (!guild.members.me) {
          console.error(
            "[Edit Command] Cannot check bot permissions: guild.members.me is null."
          );
          await interaction.editReply(
            "Internal error: Could not verify bot permissions."
          );
          validationError = true;
        } else if (newRole.managed || newRole.id === guild.roles.everyone.id) {
          await interaction.editReply(
            "Cannot assign a managed role or the `@everyone` role."
          );
          validationError = true;
        } else if (
          !guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) ||
          (newRole.position >= guild.members.me.roles.highest.position &&
            guild.ownerId !== interaction.client.user?.id)
        ) {
          await interaction.editReply(
            `The bot lacks permissions or has insufficient hierarchy to assign the role \`${newRole.name}\`. Ensure the bot's role is higher than this role and has 'Manage Roles' permission.`
          );
          validationError = true;
        } else {
          updateData.role_id = newRole.id;
          changes.push(`- Role Granted: ${newRole} (\`${newRole.name}\`)`);
        }
      }
  
      if (newRpcUrl !== null && !validationError) {
        try {
          new URL(newRpcUrl);
          updateData.rpc_url = newRpcUrl;
          changes.push(`- Solana RPC URL: \`${newRpcUrl}\``);
        } catch (e) {
          await interaction.editReply("Invalid RPC URL format provided.");
          validationError = true;
        }
      }
  
      if (newTokenSymbolInput !== null && !validationError) {
        if (newTokenSymbolInput.toLowerCase() === "remove") {
          updateData.token_symbol = null;
          changes.push(`- Token Symbol: *(Removed)*`);
        } else {
          updateData.token_symbol = newTokenSymbolInput;
          changes.push(`- Token Symbol: ${newTokenSymbolInput}`);
        }
      }
  
      if (newTokenDecimalsInput !== null && !validationError) {
        if (newTokenDecimalsInput >= 0 && newTokenDecimalsInput <= 18) {
          updateData.token_decimals = newTokenDecimalsInput;
          changes.push(`- Token Decimals: ${newTokenDecimalsInput}`);
        } else {
          await interaction.editReply("Token decimals must be between 0 and 18.");
          validationError = true;
        }
      }
  
      if (validationError) {
        return;
      }
  
      if (changes.length === 0) {
        await interaction.editReply(
          "No valid changes specified. Please provide at least one option to modify the configuration."
        );
        return;
      }
  
      const success = await updateServerConfig(guild.id, updateData);
  
      if (!success) {
        console.error(
          `[Edit Command] Database error updating config for guild ${guild.id}`
        );
        await interaction.editReply(
          "Failed to update server configuration in the database. Please try again later."
        );
        return;
      }
  
      await interaction.editReply(
        `✅ **Configuration updated successfully!**\n\n**Changes:**\n${changes.join(
          "\n"
        )}\n\n*Note: Role assignments may take up to a minute to update based on the next balance check cycle.*`
      );
  
    } catch (editError) {
      console.error(
        `[Edit Command] Unexpected error during edit for guild ${
          guild?.id ?? "unknown"
        }:`,
        editError
      );
      if (interaction.isRepliable()) {
        try {
          const errorReplyOptions = {
            content:
              "An unexpected error occurred while editing the configuration. Please check the bot logs or contact support.",
            ephemeral: true,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply(errorReplyOptions);
          } else {
            await interaction.reply(errorReplyOptions);
          }
        } catch (replyError) {
          console.error(
            "[Edit Command] Failed to send error reply to interaction:",
            replyError
          );
        }
      }
    }
  }

  export async function handleVerifyCommand(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;
    const guild = interaction.guild!;
    const guildId = interaction.guildId!;
  
    await interaction.deferReply({ ephemeral: true });
  
    const serverConfig = await getServerConfig(guildId);
    if (!serverConfig) {
      const setupCmd = interaction.client.application?.commands.cache.find(
        (cmd) => cmd.name === "server-setup"
      );
      const cmdMention = setupCmd
        ? `</server-setup:${setupCmd.id}>`
        : "`/server-setup`";
      await interaction.editReply(
        `Verification has not been configured for this server yet. An administrator needs to run the ${cmdMention} command.`
      );
      return;
    }
  
    const { data: existingUser, error: userFetchError } = await supabase
      .from("holders")
      .select("addresses, active")
      .eq("discord_user_id", interaction.user.id)
      .eq("server_id", guildId)
      .maybeSingle();
  
    if (userFetchError) {
      console.error(
        `Error fetching holder data for ${interaction.user.id} in guild ${guildId}:`,
        userFetchError
      );
      await interaction.editReply(
        "There was a database error while checking your verification status. Please try again later."
      );
      return;
    }
  
    const row = new ActionRowBuilder<ButtonBuilder>();
    let requiredBalanceNum: number;
    try {
      requiredBalanceNum = Number(serverConfig.required_balance);
      if (isNaN(requiredBalanceNum))
        throw new Error("Invalid balance format in config");
    } catch (e) {
      console.error(
        `[Verify Command] Invalid required_balance in config for guild ${guildId}: ${serverConfig.required_balance}`
      );
      await interaction.editReply(
        "Server configuration error (invalid balance). Please contact an admin."
      );
      return;
    }
  
    const requiredBalanceFormatted = formatBalanceNumber(
      requiredBalanceNum,
      serverConfig.token_decimals
    );
    const tokenSymbolDisplay = serverConfig.token_symbol
      ? ` ${serverConfig.token_symbol}`
      : " tokens";
  
    const hasWallets = existingUser && existingUser.addresses?.length > 0;
  
    if (
      !existingUser ||
      !existingUser.addresses ||
      existingUser.addresses.length === 0
    ) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel("Connect Wallet")
          .setStyle(ButtonStyle.Primary)
          .setCustomId(`new_wallet:${interaction.user.id}:${guildId}`)
      );
    } else {
      row.addComponents(
        new ButtonBuilder()
          .setLabel("Add Another Wallet")
          .setStyle(ButtonStyle.Success)
          .setCustomId(`add_wallet:${interaction.user.id}:${guildId}`)
      );
    }
  
    if (CLIENT_URL) {
      const params = new URLSearchParams({
        tokenMint: serverConfig.token_address,
        requiredRawAmount: serverConfig.required_balance,
        guildId: guildId,
        guildName: guild.name,
      });
      if (serverConfig.token_symbol) {
        params.set("tokenSymbol", serverConfig.token_symbol);
      }
      if (
        serverConfig.token_decimals !== null &&
        serverConfig.token_decimals !== undefined
      ) {
        params.set("tokenDecimals", serverConfig.token_decimals.toString());
      }
      const buyLink = `${CLIENT_URL}/buy?${params.toString()}`;
  
      row.addComponents(
        new ButtonBuilder()
          .setLabel(`Get ${requiredBalanceFormatted}${tokenSymbolDisplay}`)
          .setStyle(ButtonStyle.Link)
          .setURL(buyLink)
      );
    }
  
    const messageContent =
      `**Token Verification for ${guild.name}**\n` +
      `You need at least \`${requiredBalanceFormatted}${tokenSymbolDisplay}\` of the token (\`${serverConfig.token_address}\`) in a connected Solana wallet to get the <@&${serverConfig.role_id}> role.\n\n` +
      `${
        hasWallets
          ? `You currently have ${
              existingUser?.addresses?.length || 0
            } wallet(s) linked.`
          : "You haven't connected any wallets for this server yet."
      }\n\n` +
      `Please choose an option:`;
  
    await interaction.editReply({
      content: messageContent,
      components: row.components.length > 0 ? [row] : [],
      allowedMentions: { roles: [] },
    });
  }
  
  export async function handleTipCommand(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }
  
    const mentionedUser = interaction.options.getUser("user", true);
    const amount = interaction.options.getNumber("amount", true);
  
    if (mentionedUser.bot) {
      await interaction.reply({
        content: "You cannot tip bots.",
        ephemeral: true,
      });
      return;
    }
    if (mentionedUser.id === interaction.user.id) {
      await interaction.reply({
        content: "You cannot tip yourself.",
        ephemeral: true,
      });
      return;
    }
  
    const receiverUsername = mentionedUser.globalName || mentionedUser.username;
    const displayUsername = mentionedUser.globalName
      ? `@${mentionedUser.globalName}`
      : mentionedUser.username;
    const encodedReceiverUsername = encodeURIComponent(receiverUsername);
    const tipLink = `${CLIENT_URL}/tip?receiver_user_id=${mentionedUser.id}&receiver_username=${encodedReceiverUsername}&amount=${amount}`;
  
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`Continue Tip (${amount} USDC)`)
        .setStyle(ButtonStyle.Link)
        .setURL(tipLink)
    );
  
    await interaction.reply({
      content: `**You're about to tip ${displayUsername} with ${amount} USDC**\nClick the button below to complete the transaction on our secure website:`,
      components: [row],
      ephemeral: true,
      allowedMentions: { users: [] },
    });
  }

  export async function handleButtonInteraction(interaction: any) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "Error: Missing server context for this action.",
        ephemeral: true,
      });
      return;
    }
  
    const [action, userId, buttonGuildId] = interaction.customId.split(":");
  
    if (userId !== interaction.user.id) {
      await interaction.reply({
        content: "This button wasn't meant for you.",
        ephemeral: true,
      });
      return;
    }
    if (buttonGuildId !== interaction.guildId) {
      await interaction.reply({
        content: "This button belongs to a different server configuration.",
        ephemeral: true,
      });
      return;
    }
  
    if (action === "new_wallet" || action === "add_wallet") {
      await interaction.deferReply({ ephemeral: true });
  
      const serverConfig = await getServerConfig(interaction.guildId);
      if (!serverConfig) {
        await interaction.editReply(
          "Verification setup is missing or incomplete for this server."
        );
        return;
      }
  
      const verificationCode = crypto.randomBytes(32).toString("hex");
      const actionType = (action === "new_wallet" ? "new" : "add") as
        | "new"
        | "add";
  
      pendingVerifications.set(verificationCode, {
        userId,
        action: actionType,
        guildId: buttonGuildId,
      });
  
      const verificationLink = `${CLIENT_URL}/?code=${verificationCode}`;
  
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Connect Solana Wallet")
          .setStyle(ButtonStyle.Link)
          .setURL(verificationLink)
      );
  
      const actionText =
        actionType === "new" ? "Connect New Wallet" : "Add Another Wallet";
      await interaction.editReply({
        content: `**${actionText}**\nClick the button below to connect your Solana wallet via our secure site.\n\n⚠️ **This link is unique to you and will expire in 5 minutes.** Do not share it.`,
        components: [row],
      });
  
      setTimeout(() => {
        if (pendingVerifications.delete(verificationCode)) {
          console.log(
            `Verification code ${verificationCode.substring(
              0,
              6
            )}... expired for user ${userId}.`
          );
        }
      }, 5 * 60 * 1000);
    } else {
      console.warn(`Unknown button action received: ${action}`);
      await interaction.reply({
        content: "Unknown button action.",
        ephemeral: true,
      });
    }
  }
  
  export async function handleCommandInteraction(interaction: any) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }
    if (!interaction.isChatInputCommand()) {
      return;
    }
  
    switch (interaction.commandName) {
      case "server-setup":
        await handleSetupCommand(interaction);
        break;
      case "edit-config":
        await handleEditConfigCommand(interaction);
        break;
      case "verify":
        await handleVerifyCommand(interaction);
        break;
      case "tip":
        await handleTipCommand(interaction);
        break;
      default:
        console.warn(`Received unknown command: ${interaction.commandName}`);
        await interaction.reply({ content: "Unknown command.", ephemeral: true });
    }
}