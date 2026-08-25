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
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { detect } = require("./src/services");
const { runBypass } = require("./src/backend");
const { warmup } = require("./src/apis");

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || "a!";
const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || "https://discord.gg/qXUENfzHVH";
const INVITE_BOT_URL = process.env.INVITE_BOT_URL || "https://discord.com/oauth2/authorize?client_id=1537831595787030598&permissions=8&integration_type=0&scope=bot%20applications.commands";
const AUTO_BYPASS_FILE = path.join(__dirname, "autobypass.json");
const AUTO_DELETE_MS = 5000;
const BANNER_PATH = path.join(__dirname, "assets", "fluxwave-banner.png");
const EMBED_CONFIG_FILE = path.join(__dirname, "embed-bypass.json");
const LOADING_EMOJI = "<a:Loading:1537866256022118421>";
const CHECK_EMOJI = "<:Check:1537866209301762158>";
const MOBILE_EMOJI = "<:Mobile:1541756625155788951>";
const COMPUTER_EMOJI = "<:Computer:1541756573964050452>";

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

let embedBypassChannels = {};
try {
  if (fs.existsSync(EMBED_CONFIG_FILE)) {
    embedBypassChannels = JSON.parse(fs.readFileSync(EMBED_CONFIG_FILE, "utf8")) || {};
  }
} catch {
  embedBypassChannels = {};
}

function saveEmbedBypass() {
  fs.writeFileSync(EMBED_CONFIG_FILE, JSON.stringify(embedBypassChannels, null, 2));
}

function savedEveryoneSendState(channel) {
  const ow = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  if (!ow) return null;
  return {
    allow: ow.allow.has(PermissionFlagsBits.SendMessages),
    deny: ow.deny.has(PermissionFlagsBits.SendMessages),
  };
}

async function lockEmbedChannel(channel) {
  const saved = savedEveryoneSendState(channel);
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
  if (channel.guild.members.me) {
    await channel.permissionOverwrites.edit(channel.guild.members.me, {
      SendMessages: true,
      ViewChannel: true,
    });
  }
  return saved;
}

async function restoreEmbedChannel(channel, saved) {
  if (!saved) {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: null });
    return;
  }
  const state = saved.deny ? false : (saved.allow ? true : null);
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: state });
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
    ),
  ];
}

function buildMainPanel() {
  const media = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL("attachment://fluxwave-banner.png")
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(text("## **FLUXWAVE BYPASS LINK**"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("**Click** Bypass, **paste your link in the** url bypass **field, then press** Submit.\\n\\n-# Enter your link and submit it to continue.\\n-# Please wait a moment while your request is being processed.\\n-# Your result will appear once the process is complete.")
    )
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(media)
    .addTextDisplayComponents(text("-# Made by FluxWave"))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("<:Linkv2:1541753997445300325> Bypass").setCustomId("fluxwave:bypass"),
        new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("Support Info").setCustomId("fluxwave:support"),
      )
    );
}

function supportInfoComponents() {
  const services = apis.PLATFORMS.map((p) => `• ${p.name}`).join("\\n");
  return new ContainerBuilder()
    .addTextDisplayComponents(text("## **FluxWave Support Info**"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`-# Currently listed services:\\n${services}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text("-# Supported service information is provided by the FluxWave backend."));
}

function bypassModal() {
  return new ModalBuilder()
    .setCustomId("fluxwave:bypass-modal")
    .setTitle("FluxWave Bypass")
    .addLabelComponents(
      // Components V2 modal labels are supported by current discord.js builders.
      new TextInputBuilder()
        .setCustomId("url")
        .setLabel("URL Bypass")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Paste your link here...")
        .setRequired(true)
        .setMaxLength(2000)
    );
}

function buildSuccess(result, seconds, user, id) {
  const value = cleanResult(result);
  const mobile = value.replace(/`/g, "\\`").slice(0, 1000);
  const pc = value.replace(/```/g, "\\`\\`\\`").slice(0, 3900);

  return new ContainerBuilder()
    .setAccentColor(5763719)
    .addTextDisplayComponents(
      text(CHECK_EMOJI + "  **Bypass Success** • @user")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(MOBILE_EMOJI + " **Mobile Copy**\n```" + mobile + "```")
    )
    .addTextDisplayComponents(
      text(COMPUTER_EMOJI + " **PC Copy**\n```\n" + pc + "\n```")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("-# Processed in " + seconds + "s • Requested by " + user.username)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setLabel("View Result")
          .setCustomId("view_result:" + id)
      )
    );
}

function errorComponents(result) {
  return new ContainerBuilder()
    .addTextDisplayComponents(text("## Bypass Failed"))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(cleanResult(result).slice(0, 3900)));
}

function loadingComponents() {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`${LOADING_EMOJI} **Processing Bypass**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text("-# Processing the submitted URL..."));
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

async function sendEmbedBypassPanel(channel) {
  const message = await channel.send({
    components: [buildMainPanel()],
    files: [new AttachmentBuilder(BANNER_PATH, { name: "fluxwave-banner.png" })],
    flags: MessageFlags.IsComponentsV2,
  });
  return message;
}

async function processBypass({ url, user, reply, originalMessage = null, autoChannel = false }) {
  const detected = detect(url);

  if (!detected.url) {
    await reply.edit({ components: [errorComponents("Invalid URL.")] });
    return false;
  }

  if (!detected.service) {
    await reply.edit({ components: [errorComponents("This link could not be processed.")] });
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

  const enableCommand = new SlashCommandBuilder()
    .setName("enable")
    .setDescription("Enable a FluxWave feature")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embed-bypass")
        .setDescription("Enable the FluxWave bypass panel in a locked channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where the bypass panel will be posted")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    );

  const disableCommand = new SlashCommandBuilder()
    .setName("disable")
    .setDescription("Disable a FluxWave feature")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("embed-bypass")
        .setDescription("Disable the FluxWave bypass panel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to disable")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    );

  await client.application.commands.set([bypassCommand, enableCommand, disableCommand]);
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

    if (interaction.commandName === "enable" && interaction.options.getSubcommand() === "embed-bypass") {
      const channel = interaction.options.getChannel("channel", true);
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "You need Administrator permission.", ephemeral: true });
        return;
      }
      if (!channel.isTextBased() || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "Please select a text channel.", ephemeral: true });
        return;
      }
      try {
        const saved = savedEveryoneSendState(channel);
        await lockEmbedChannel(channel);
        embedBypassChannels[channel.id] = {
          guildId: interaction.guildId,
          savedEveryoneSendState: saved,
        };
        saveEmbedBypass();
        const panel = await sendEmbedBypassPanel(channel);
        embedBypassChannels[channel.id].panelMessageId = panel.id;
        saveEmbedBypass();
        await interaction.reply({ content: `FluxWave Embed Bypass enabled in ${channel}. The channel is locked for members.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `Could not enable Embed Bypass: ${error.message}`, ephemeral: true });
      }
      return;
    }

    if (interaction.commandName === "disable" && interaction.options.getSubcommand() === "embed-bypass") {
      const channel = interaction.options.getChannel("channel", true);
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "You need Administrator permission.", ephemeral: true });
        return;
      }
      const config = embedBypassChannels[channel.id];
      try {
        if (config) await restoreEmbedChannel(channel, config.savedEveryoneSendState);
        delete embedBypassChannels[channel.id];
        saveEmbedBypass();
        await interaction.reply({ content: `FluxWave Embed Bypass disabled in ${channel}.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `Could not disable Embed Bypass: ${error.message}`, ephemeral: true });
      }
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

  if (interaction.isButton()) {
    if (interaction.customId === "fluxwave:bypass") {
      await interaction.showModal(bypassModal());
      return;
    }

    if (interaction.customId === "fluxwave:support") {
      await interaction.reply(v2Options(supportInfoComponents(), true));
      return;
    }

    if (interaction.customId.startsWith("view_result:")) {
      const id = interaction.customId.slice("view_result:".length);
      const data = results.get(id);

      if (!data) {
        await interaction.reply({ content: "This result is no longer available.", ephemeral: true });
        return;
      }

      if (interaction.user.id !== data.userId) {
        await interaction.reply({ content: "Only the user who requested this bypass can view the result.", ephemeral: true });
        return;
      }

      await interaction.reply({ content: data.result.slice(0, 2000), ephemeral: true });
      return;
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "fluxwave:bypass-modal") {
    const url = interaction.fields.getTextInputValue("url").trim();
    await interaction.deferReply({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    const loading = await interaction.editReply({
      components: [loadingComponents()],
    });

    await processBypass({
      url,
      user: interaction.user,
      reply: loading,
    });
    return;
  }
});

client.login(TOKEN);
