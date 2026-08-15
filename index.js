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
const { warmup } = require("./src/apis");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "a!";
const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || "https://discord.gg/qXUENfzHVH";
const INVITE_BOT_URL = process.env.INVITE_BOT_URL || "https://discord.com/oauth2/authorize?client_id=1537831595787030598&permissions=8&integration_type=0&scope=bot%20applications.commands";
const CHECK_EMOJI = "<:Check:1537866209301762158>";
const LOADING_EMOJI = "<a:Loading:1537866256022118421>";
const AUTO_BYPASS_FILE = path.join(__dirname, "autobypass.json");
const AUTO_DELETE_MS = 5000;

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
    new ActionRowBuilder().addComponents(linkButton("Support Server", SUPPORT_SERVER_URL)),
  ];
}

function buildSuccess(result, seconds, user, id) {
  const value = cleanResult(result);
  const mobile = value.replace(/`/g, "\\`").slice(0, 1000);
  const pc = value.replace(/```/g, "\\`\\`\\`").slice(0, 3900);

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`## Bypass Success ${CHECK_EMOJI}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**Mobile Version**:\n\`${mobile}\``))
    .addTextDisplayComponents(text(`**PC Version**:\n\`\`\`\n${pc}\n\`\`\``))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`Processed in ${seconds}s • Requested by ${user}`))
    .addActionRowComponents(...makeButtons(id));
}

function errorComponents(result) {
  return new ContainerBuilder()
    .addTextDisplayComponents(text("## Bypass Failed"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(cleanResult(result).slice(0, 3900)));
}

function loadingComponents() {
  return new ContainerBuilder().addTextDisplayComponents(text(`${LOADING_EMOJI} **Bypassing...**`));
}

function v2Options(container, ephemeral = false) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

function deleteAfter(message, delay = AUTO_DELETE_MS) {
  setTimeout(async () => {
    try {
      await message.delete();
    } catch {}
  }, delay);
}

async function processBypass({ url, user, reply, originalMessage = null, autoChannel = false }) {
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
    const outcome = await runBypass(detected.service, detected.url.href, () => {});
    const seconds = ((Date.now() - started) / 1000).toFixed(3);

    if (!outcome.success) {
      await reply.edit({ components: [errorComponents(outcome.result || "Bypass failed.")] });
      return false;
    }

    const result = cleanResult(outcome.result);
    const id = `${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    results.set(id, { userId: user.id, result });

    if (results.size > 1000) {
      results.delete(results.keys().next().value);
    }

    await reply.edit({ components: [buildSuccess(result, seconds, user, id)] });

    if (autoChannel && originalMessage) {
      deleteAfter(originalMessage, AUTO_DELETE_MS);
    }

    return true;
  } catch (error) {
    await reply.edit({ components: [errorComponents(error?.message || "Bypass failed.")] });
    return false;
  }
}

async function startBypass(message, args) {
  if (!args || !args.length) {
    await message.reply(v2Options(new ContainerBuilder().addTextDisplayComponents(text(`## Usage\n\`${PREFIX}bypass <url>\``))));
    return;
  }

  const reply = await message.reply(v2Options(loadingComponents()));

  await processBypass({
    url: args[0],
    user: message.author,
    reply,
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
    .addStringOption((option) =>
      option.setName("url").setDescription("URL to bypass").setRequired(true)
    );

  const autoBypassCommand = new SlashCommandBuilder()
    .setName("auto-bypass")
    .setDescription("Configure automatic bypass for a channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set the automatic bypass channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where URLs will be automatically bypassed")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("off").setDescription("Disable automatic bypass")
    );

  await client.application.commands.set([bypassCommand, autoBypassCommand]);
}

client.once("ready", async () => {
  await registerSlashCommands();
  warmup().catch(() => {});

  client.user.setPresence({
    status: "dnd",
    activities: [{ name: "Bypassing links", type: ActivityType.Watching }],
  });

  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildConfig = autoBypassChannels[message.guild.id];
  const autoChannelId = typeof guildConfig === "string" ? guildConfig : guildConfig?.channelId;

  if (autoChannelId === message.channel.id) {
    if (!isUrlOnly(message.content)) {
      try {
        await message.delete();
      } catch {}
      return;
    }

    const reply = await message.reply(v2Options(loadingComponents()));

    await processBypass({
      url: message.content.trim(),
      user: message.author,
      reply,
      originalMessage: message,
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

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "bypass") {
      const url = interaction.options.getString("url", true);
      const reply = await interaction.reply({
        ...v2Options(loadingComponents()),
        withResponse: true,
      });

      const message = reply.resource?.message || await interaction.fetchReply();

      await processBypass({
        url,
        user: interaction.user,
        reply: message,
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

        autoBypassChannels[interaction.guildId] = {
          channelId: channel.id,
        };

        saveAutoBypass();

        await interaction.reply({
          content: `Auto Bypass is now enabled in ${channel}.`,
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
      }

      return;
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
