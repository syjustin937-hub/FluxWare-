require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  PermissionsBitField,
  ActivityType,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { detect } = require("./src/services");
const { runBypass } = require("./src/backend");
const { warmup, PLATFORMS } = require("./src/apis");
const { getLogChannelId, setLogChannelId } = require("./src/logs");

const TOKEN = process.env.DISCORD_TOKEN;
const BRAND = process.env.BOT_NAME || "Zentra";

const SUPPORT_SERVER_URL = process.env.SUPPORT_SERVER_URL || "https://discord.gg/qXUENfzHVH";

const INVITE_BOT_URL =
  process.env.INVITE_BOT_URL ||
  "https://discord.com/oauth2/authorize?client_id=1537831595787030598&permissions=8&integration_type=0&scope=bot%20applications.commands";

const BANNER_URL = String(process.env.BANNER_URL || "").trim();

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

function cleanResult(value) {
  return String(value ?? "").trim() || "No result returned.";
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Bypass request timed out.")), ms)),
  ]);
}

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(1);
}

function v2Options(container, ephemeral = false) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

async function editV2(interaction, container) {
  await interaction.editReply(v2Options(container));
}

function buildMainPanel() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(`## **${BRAND.toUpperCase()} BYPASS KEY**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        "> **1** Click **Bypass**\n> **2** Paste your **link in the** url bypass **field.**\n> **3** Then **press Submit.**\n\n-# **Enter your link carefully and wait while your request is being processed.**\n-# **Your result will appear once the bypass is complete.**"
      )
    )
    .addSeparatorComponents(separator());

  if (BANNER_URL) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL))
    );
    container.addSeparatorComponents(separator());
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Success)
        .setEmoji({ name: "Linkv2", id: "1541753997445300325" })
        .setLabel("Bypass")
        .setCustomId("zentra:bypass"),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Support info")
        .setCustomId("zentra:support"),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Invite Bot").setURL(INVITE_BOT_URL),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support Server").setURL(SUPPORT_SERVER_URL)
    )
  );

  return container;
}

function panelPostComponents() {
  return new ContainerBuilder()
    .addTextDisplayComponents(text(`## **${BRAND} Bypass Panel**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`Press **Post Panel** to send the ${BRAND} Bypass panel in this channel.`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Success).setLabel("Post Panel").setCustomId("zentra:post-panel")
      )
    );
}

function supportInfoComponents() {
  const services = PLATFORMS.map((p) => `• ${p.name}`).join("\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(text(`## **${BRAND} Support Info**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`-# Currently listed services:\n${services || "• No services listed."}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`-# Supported service information is provided by the ${BRAND} backend.`));
}

function bypassModal() {
  const urlInput = new TextInputBuilder()
    .setCustomId("url")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Paste your link here...")
    .setRequired(true)
    .setMaxLength(2000);

  const urlLabel = new LabelBuilder().setLabel("URL Bypass").setTextInputComponent(urlInput);

  return new ModalBuilder()
    .setCustomId("zentra:bypass-modal")
    .setTitle(`${BRAND} Bypass`)
    .addLabelComponents(urlLabel);
}

function buildSuccess(result, seconds, user, id) {
  const value = cleanResult(result);

  const mobile = value.replace(/``/g, "").replace(/`/g, "").replace(/\n/g, " ").slice(0, 1000);
  const pc = value.replace(/```/g, "").replace(/`/g, "").slice(0, 3900);

  return new ContainerBuilder()
    .setAccentColor(5763719)
    .addTextDisplayComponents(text(`${CHECK_EMOJI}  **Bypass Success**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`${MOBILE_EMOJI} **Mobile Copy**\n\`${mobile}\``))
    .addTextDisplayComponents(text(`${COMPUTER_EMOJI} **PC Copy**\n\`\`\`\n${pc}\n\`\`\``))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`-# Processed in ${seconds}s`))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Secondary).setLabel("View Result").setCustomId("view_result:" + id),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Invite Bot").setURL(INVITE_BOT_URL),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support Server").setURL(SUPPORT_SERVER_URL)
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

async function sendBypassLog(interaction, { user, service, status, seconds, source, url }) {
  try {
    const channelId = getLogChannelId(interaction.guildId);

    if (!channelId || !interaction.guild) {
      return;
    }

    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

    if (!channel?.isTextBased()) {
      return;
    }

    const profileUrl = user.displayAvatarURL({ extension: "png", size: 128 });
    const container = new ContainerBuilder()
      .setAccentColor(status === "Success" ? 5763719 : 15548997)
      .addTextDisplayComponents(text(`## Bypass Log`))
      .addSeparatorComponents(separator())
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            text(
              `**User:** ${user.username}\n**User ID:** \`${user.id}\`\n**Service:** ${service || "Unknown"}\n**Status:** ${status}\n**Time:** <t:${Math.floor(Date.now() / 1000)}:F>\n**Duration:** ${seconds ? `${seconds}s` : "N/A"}`
            )
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(profileUrl).setDescription(`${user.username} profile picture`)
          )
      )
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(text(`**Link:**\n${String(url || "Unknown").slice(0, 2000)}`));

    await channel.send(v2Options(container));
  } catch (error) {
    console.error("Bypass log error:", error);
  }
}

async function processBypass({ url, user, interaction, source }) {
  const detected = detect(url);

  if (!detected.url) {
    await sendBypassLog(interaction, { user, service: "Unknown", status: "Invalid URL", source, url });
    await editV2(interaction, errorComponents("Invalid URL."));
    return false;
  }

  if (!detected.service) {
    await sendBypassLog(interaction, { user, service: "Unknown", status: "Unsupported", source, url });
    await editV2(interaction, errorComponents("This link could not be processed."));
    return false;
  }

  const started = Date.now();

  try {
    const outcome = await withTimeout(runBypass(detected.service, detected.url.href, () => {}), 45000);
    const seconds = ((Date.now() - started) / 1000).toFixed(3);

    if (!outcome.success) {
      await sendBypassLog(interaction, { user, service: detected.service.name || detected.service, status: "Failed", seconds, source, url: detected.url.href });
      await editV2(interaction, errorComponents(outcome.result || "Bypass failed."));
      return false;
    }

    const result = cleanResult(outcome.result);
    const id = `${user.id}:${Date.now()}:` + Math.random().toString(36).slice(2, 8);

    results.set(id, { userId: user.id, result });

    if (results.size > 1000) {
      results.delete(results.keys().next().value);
    }

    await sendBypassLog(interaction, { user, service: detected.service.name || detected.service, status: "Success", seconds, source, url: detected.url.href });
    await editV2(interaction, buildSuccess(result, seconds, user, id));
    return true;
  } catch (error) {
    const seconds = ((Date.now() - started) / 1000).toFixed(3);
    console.error("Bypass processing error:", error);
    await sendBypassLog(interaction, { user, service: detected.service.name || detected.service, status: "Error", seconds, source, url: detected.url.href });
    await editV2(interaction, errorComponents(error?.message || "Bypass failed."));
    return false;
  }
}

async function registerSlashCommands() {
  const bypassCommand = new SlashCommandBuilder()
    .setName("bypass")
    .setDescription("Bypass a URL")
    .addStringOption((option) => option.setName("url").setDescription("URL to bypass").setRequired(true));

  const panelCommand = new SlashCommandBuilder()
    .setName("zentrabypass")
    .setDescription(`Post the ${BRAND} Bypass panel`)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

  const logsCommand = new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configure bypass logs")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Set the channel where bypass logs will be sent")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel for bypass logs")
            .setRequired(true)
            .addChannelTypes(0)
        )
    );

  await client.application.commands.set([bypassCommand, panelCommand, logsCommand]);
}

client.once("clientReady", async () => {
  try {
    await registerSlashCommands();
  } catch (error) {
    console.error("Command registration error:", error);
  }

  warmup().catch(() => {});

  client.user.setPresence({
    status: "online",
    activities: [{ name: "Bypassing links", type: ActivityType.Watching }],
  });

  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "zentrabypass") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({
            content: "You need Administrator permission to use this command.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply(v2Options(panelPostComponents(), true));
        return;
      }

      if (interaction.commandName === "bypass") {
        const url = interaction.options.getString("url", true);

        await interaction.deferReply();
        await interaction.editReply(v2Options(loadingComponents()));
        await processBypass({ url, user: interaction.user, interaction, source: "Slash Command" });
        return;
      }

      if (interaction.commandName === "logs") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({
            content: "You need Administrator permission to use this command.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (interaction.options.getSubcommand() === "setup") {
          const channel = interaction.options.getChannel("channel", true);

          if (!channel.isTextBased()) {
            await interaction.reply({
              content: "Please select a text channel.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          setLogChannelId(interaction.guildId, channel.id);

          await interaction.reply({
            content: `Bypass logs are now set to ${channel}.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        return;
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === "zentra:post-panel") {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({
            content: "You need Administrator permission to post the panel.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.channel.send(v2Options(buildMainPanel()));
        await interaction.update({
          content: "Panel posted successfully.",
          components: [],
          embeds: [],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.customId === "zentra:bypass") {
        await interaction.showModal(bypassModal());
        return;
      }

      if (interaction.customId === "zentra:support") {
        await interaction.reply(v2Options(supportInfoComponents(), true));
        return;
      }

      if (interaction.customId.startsWith("view_result:")) {
        const id = interaction.customId.slice("view_result:".length);
        const data = results.get(id);

        if (!data) {
          await interaction.reply({ content: "This result is no longer available.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (interaction.user.id !== data.userId) {
          await interaction.reply({
            content: "Only the user who requested this bypass can view the result.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({ content: data.result.slice(0, 2000), flags: MessageFlags.Ephemeral });
        return;
      }

      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === "zentra:bypass-modal") {
      const url = interaction.fields.getTextInputValue("url").trim();

      await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      await interaction.editReply(v2Options(loadingComponents()));
      await processBypass({ url, user: interaction.user, interaction, source: "Components V2" });
      return;
    }
  } catch (error) {
    console.error("Interaction error:", error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(v2Options(errorComponents("Something went wrong while processing the request.")));
      } else {
        await interaction.reply({
          content: "Something went wrong while processing the request.",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {}
  }
});

client.on("error", (error) => {
  console.error("Client error:", error);
});

client.login(TOKEN);
