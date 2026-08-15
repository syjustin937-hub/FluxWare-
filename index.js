require("dotenv").config();

const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ActivityType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { detect } = require("./src/services");
const { runBypass } = require("./src/backend");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "a!";
const BOT_NAME = process.env.BOT_NAME || "Bypass Tools";
const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || "https://discord.gg/qXUENfzHVH";
const INVITE_BOT_URL = process.env.INVITE_BOT_URL || "https://discord.com/oauth2/authorize?client_id=1537831595787030598&permissions=8&integration_type=0&scope=bot%20applications.commands";
const CHECK_EMOJI = "<:Check:1537866209301762158>";
const LOADING_EMOJI = "<a:Loading:1537866256022118421>";
const AUTO_BYPASS_FILE = path.join(__dirname, "autobypass.json");
const AUTO_DELETE_MS = 10000;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const results = new Map();
let autoBypassChannels = {};

try {
  if (fs.existsSync(AUTO_BYPASS_FILE)) {
    autoBypassChannels = JSON.parse(fs.readFileSync(AUTO_BYPASS_FILE, "utf8")) || {};
  }
} catch {
  autoBypassChannels = {};
}

function saveAutoBypass() {
  fs.writeFileSync(AUTO_BYPASS_FILE, JSON.stringify(autoBypassChannels, null, 2));
}

function memberHasRole(member, roleId) {
  if (!roleId) return true;
  return member.roles.cache.has(roleId);
}

function cleanResult(value) {
  return String(value ?? "").trim() || "No result returned.";
}

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(1);
}

function linkButton(label, url) {
  return new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url);
}

function makeButtons(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`view_result:${id}`).setLabel("View Result").setStyle(ButtonStyle.Secondary),
      linkButton("Invite Bot", INVITE_BOT_URL)
    ),
    new ActionRowBuilder().addComponents(
      linkButton("Support Server", SUPPORT_SERVER_URL)
    ),
  ];
}

function baseContainer() {
  return new ContainerBuilder();
}

function buildSuccess(result, seconds, user, id) {
  const value = cleanResult(result);
  const mobile = value.replace(/`/g, "\\`").slice(0, 1000);
  const pc = value.replace(/```/g, "\\`\\`\\`").slice(0, 3900);

  return baseContainer()
    .addTextDisplayComponents(text(`## Bypass Success ${CHECK_EMOJI}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**Mobile Version**:\n\`${mobile}\``))
    .addTextDisplayComponents(text(`**PC Version**:\n\`\`\`\n${pc}\n\`\`\``))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`Processed in ${seconds}s • Requested by ${user}`))
    .addActionRowComponents(...makeButtons(id));
}

function errorComponents(result) {
  return baseContainer()
    .addTextDisplayComponents(text("## Bypass Failed"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(cleanResult(result).slice(0, 3900)));
}

function lootResultPrompt(originalUrl) {
  return baseContainer()
    .addTextDisplayComponents(text("## Manual Step Required"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      "loot-link requires a checkpoint that can't be automated.\n\n" +
      "**Steps:**\n" +
      "1. Open the loot-link URL in your browser\n" +
      "2. Complete the first step — copy the `ticket2` URL from the address bar\n" +
      `3. Run: \`${PREFIX}bypass ${originalUrl} lootResult:<paste_ticket2_url_here>\``
    ));
}

function noPermissionComponents() {
  return baseContainer()
    .addTextDisplayComponents(text("## No Permission"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text("You don't have the required role to use this channel."));
}

function loadingComponents() {
  return baseContainer().addTextDisplayComponents(text(`${LOADING_EMOJI} **Bypassing...**`));
}

function v2Options(container, ephemeral = false) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

function scheduleDelete(message, delayMs = AUTO_DELETE_MS) {
  setTimeout(async () => {
    try {
      await message.delete();
    } catch {}
  }, delayMs);
}

async function processBypass({ url, user, reply, lootResult = null, originalMessage = null, autoChannel = false }) {
  const detected = detect(url);

  if (!detected.url) {
    await reply.edit({ components: [errorComponents("Invalid URL.")] });
    return false;
  }

  if (!detected.service) {
    await reply.edit({ components: [errorComponents("This URL is not supported.")] });
    return false;
  }

  const started = Date.now();

  try {
    const outcome = await runBypass(detected.service, detected.url.href, () => {}, lootResult);
    const seconds = ((Date.now() - started) / 1000).toFixed(3);

    if (!outcome.success) {
      if (outcome.needsLootResult) {
        await reply.edit({ components: [lootResultPrompt(url)] });
        return false;
      }
      await reply.edit({ components: [errorComponents(outcome.result)] });
      return false;
    }

    const result = cleanResult(outcome.result);
    const id = `${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    results.set(id, { userId: user.id, result });

    if (results.size > 1000) {
      results.delete(results.keys().next().value);
    }

    await reply.edit({ components: [buildSuccess(result, seconds, user, id)] });

    if (autoChannel) {
      if (originalMessage) {
        try { await originalMessage.delete(); } catch {}
      }
      scheduleDelete(reply, AUTO_DELETE_MS);
    }

    return true;
  } catch (error) {
    await reply.edit({ components: [errorComponents(error?.message || "Bypass failed.")] });
    return false;
  }
}

function parseLootResult(args) {
  const idx = args.findIndex((a) => a.startsWith("lootResult:"));
  if (idx === -1) return { url: args[0], lootResult: null };
  const lootResult = args[idx].slice("lootResult:".length);
  const remaining = args.filter((_, i) => i !== idx);
  return { url: remaining[0], lootResult };
}

async function startBypass(message, args) {
  if (!args || !args.length) {
    await message.reply(
      v2Options(
        baseContainer().addTextDisplayComponents(text(`## Usage\n\`${PREFIX}bypass <url>\`\n\`${PREFIX}bypass <url> lootResult:<ticket2_url>\``))
      )
    );
    return;
  }

  const { url, lootResult } = parseLootResult(args);

  if (!url) {
    await message.reply(
      v2Options(
        baseContainer().addTextDisplayComponents(text(`## Usage\n\`${PREFIX}bypass <url>\``))
      )
    );
    return;
  }

  const reply = await message.reply(v2Options(loadingComponents()));

  await processBypass({
    url,
    user: message.author,
    reply,
    lootResult,
  });
}

function isUrlOnly(content) {
  const value = String(content || "").trim();
  if (!value || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function registerSlashCommands() {
  const bypassCommand = new SlashCommandBuilder()
    .setName("bypass")
    .setDescription("Bypass a URL")
    .addStringOption(option =>
      option.setName("url").setDescription("URL to bypass").setRequired(true)
    )
    .addStringOption(option =>
      option.setName("lootresult").setDescription("ticket2 URL for loot-link manual step").setRequired(false)
    );

  const autoBypassCommand = new SlashCommandBuilder()
    .setName("auto-bypass")
    .setDescription("Configure automatic bypass for a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("Set the automatic bypass channel")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Channel where URLs will be automatically bypassed")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName("role")
            .setDescription("Role required to use the auto-bypass channel (leave empty = everyone)")
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand.setName("off").setDescription("Disable automatic bypass")
    );

  await client.application.commands.set([bypassCommand, autoBypassCommand]);
}

client.once("ready", async () => {
  await registerSlashCommands();

  client.user.setPresence({
    status: "dnd",
    activities: [{ name: "Bypassing links", type: ActivityType.Watching }],
  });

  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  const guildConfig = autoBypassChannels[message.guild.id];
  const autoChannelId = guildConfig?.channelId ?? guildConfig;
  const requiredRoleId = guildConfig?.roleId ?? null;

  if (autoChannelId === message.channel.id) {
    if (!isUrlOnly(message.content)) {
      try { await message.delete(); } catch {}
      return;
    }

    if (!memberHasRole(message.member, requiredRoleId)) {
      const notice = await message.reply(v2Options(noPermissionComponents()));
      try { await message.delete(); } catch {}
      scheduleDelete(notice, AUTO_DELETE_MS);
      return;
    }

    const originalMessage = message;
    const reply = await message.reply(v2Options(loadingComponents()));

    await processBypass({
      url: message.content.trim(),
      user: message.author,
      reply,
      originalMessage,
      autoChannel: true,
    });

    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();

  if (command !== "bypass") return;

  await startBypass(message, args);
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "bypass") {
      const url = interaction.options.getString("url", true);
      const lootResult = interaction.options.getString("lootresult") || null;

      const reply = await interaction.reply({
        ...v2Options(loadingComponents()),
        withResponse: true,
      });

      const message = reply.resource?.message || await interaction.fetchReply();

      await processBypass({
        url,
        user: interaction.user,
        reply: message,
        lootResult,
      });

      return;
    }

    if (interaction.commandName === "auto-bypass") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          content: "You need Administrator permission to configure Auto Bypass.",
          ephemeral: true,
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const role = interaction.options.getRole("role") || null;

        autoBypassChannels[interaction.guildId] = {
          channelId: channel.id,
          roleId: role ? role.id : null,
        };
        saveAutoBypass();

        const roleText = role ? ` Only members with the **${role.name}** role can use it.` : " Anyone can use it.";

        await interaction.reply({
          content: `Auto Bypass is now enabled in ${channel}.${roleText} Non-URL messages and unauthorized users will be removed.`,
          ephemeral: true,
        });
        return;
      }

      if (subcommand === "off") {
        delete autoBypassChannels[interaction.guildId];
        saveAutoBypass();

        await interaction.reply({
          content: "Auto Bypass has been disabled for this server.",
          ephemeral: true,
        });
        return;
      }
    }

    return;
  }

  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("view_result:")) return;

  const id = interaction.customId.slice("view_result:".length);
  const data = results.get(id);

  if (!data) {
    await interaction.reply({
      content: "This result is no longer available.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== data.userId) {
    await interaction.reply({
      content: "Only the user who requested this bypass can view the result.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: data.result.slice(0, 2000),
    ephemeral: true,
  });
});

client.login(TOKEN);
