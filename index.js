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
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { detect } = require("./src/services");
const { runBypass } = require("./src/backend");
const { warmup, PLATFORMS } = require("./src/apis");

const TOKEN = process.env.DISCORD_TOKEN;

const SUPPORT_SERVER_URL =
  process.env.SUPPORT_SERVER_URL ||
  "https://discord.gg/qXUENfzHVH";

const INVITE_BOT_URL =
  process.env.INVITE_BOT_URL ||
  "https://discord.com/oauth2/authorize?client_id=1537831595787030598&permissions=8&integration_type=0&scope=bot%20applications.commands";

const BANNER_URL = String(
  process.env.BANNER_URL ||
    "https://cdn.discordapp.com/attachments/1535097987905228923/1541773763434254420/Fluxwave-banner.png?ex=6a8ed035&is=6a8d7eb5&hm=a2daec647788ffd47a37a654a574b16c95087d0104636710563b0d352a2f06b0&"
).trim();

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

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(1);
}

function buildMainPanel() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text("## **FLUXWAVE BYPASS LINK**")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        "**Click** Bypass, **paste your link in the** url bypass **field, then press** Submit.\n\n-# Enter your link and submit it to continue.\n-# Please wait a moment while your request is being processed.\n-# Your result will appear once the process is complete."
      )
    )
    .addSeparatorComponents(separator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_URL)
      )
    )
    .addTextDisplayComponents(
      text("-# Made by FluxWave")
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Success)
          .setEmoji({
            name: "Linkv2",
            id: "1541753997445300325",
          })
          .setLabel("Bypass")
          .setCustomId("fluxwave:bypass"),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setLabel("Support info")
          .setCustomId("fluxwave:support"),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Invite Bot")
          .setURL(INVITE_BOT_URL),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Support Server")
          .setURL(SUPPORT_SERVER_URL)
      )
    );

  return container;
}

function supportInfoComponents() {
  const services = PLATFORMS
    .map((p) => `• ${p.name}`)
    .join("\n");

  return new ContainerBuilder()
    .addTextDisplayComponents(
      text("## **FluxWave Support Info**")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        `-# Currently listed services:\n${
          services || "• No services listed."
        }`
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        "-# Supported service information is provided by the FluxWave backend."
      )
    );
}

function bypassModal() {
  return new ModalBuilder()
    .setCustomId("fluxwave:bypass-modal")
    .setTitle("FluxWave Bypass")
    .addLabelComponents(
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

  const mobile = value
    .replace(/``/g, "")
    .replace(/`/g, "")
    .slice(0, 1000);

  const pc = value
    .replace(/```/g, "")
    .replace(/`/g, "")
    .slice(0, 3900);

  return new ContainerBuilder()
    .setAccentColor(5763719)
    .addTextDisplayComponents(
      text(
        CHECK_EMOJI +
          `  **Bypass Success** • <@${user.id}>`
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        MOBILE_EMOJI +
          " **Mobile Copy**\n```\n" +
          mobile +
          "\n```"
      )
    )
    .addTextDisplayComponents(
      text(
        COMPUTER_EMOJI +
          " **PC Copy**\n```\n" +
          pc +
          "\n```"
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        "-# Processed in " +
          seconds +
          "s • Requested by " +
          user.username
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setLabel("View Result")
          .setCustomId("view_result:" + id),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Invite Bot")
          .setURL(INVITE_BOT_URL),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel("Support Server")
          .setURL(SUPPORT_SERVER_URL)
      )
    );
}

function errorComponents(result) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      text("## Bypass Failed")
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(cleanResult(result).slice(0, 3900))
    );
}

function loadingComponents() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      text(`${LOADING_EMOJI} **Processing Bypass**`)
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text("-# Processing the submitted URL...")
    );
}

function v2Options(container, ephemeral = false) {
  return {
    components: [container],
    flags:
      MessageFlags.IsComponentsV2 |
      (ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

async function editV2(interaction, container, ephemeral = false) {
  await interaction.editReply({
    components: [container],
    flags:
      MessageFlags.IsComponentsV2 |
      (ephemeral ? MessageFlags.Ephemeral : 0),
  });
}

async function processBypass({
  url,
  user,
  interaction,
  ephemeral = false,
}) {
  const detected = detect(url);

  if (!detected.url) {
    await editV2(
      interaction,
      errorComponents("Invalid URL."),
      ephemeral
    );
    return false;
  }

  if (!detected.service) {
    await editV2(
      interaction,
      errorComponents("This link could not be processed."),
      ephemeral
    );
    return false;
  }

  const started = Date.now();

  try {
    const outcome = await runBypass(
      detected.service,
      detected.url.href,
      () => {}
    );

    const seconds = (
      (Date.now() - started) /
      1000
    ).toFixed(3);

    if (!outcome.success) {
      await editV2(
        interaction,
        errorComponents(
          outcome.result || "Bypass failed."
        ),
        ephemeral
      );
      return false;
    }

    const result = cleanResult(outcome.result);

    const id =
      `${user.id}:${Date.now()}:` +
      Math.random().toString(36).slice(2, 8);

    results.set(id, {
      userId: user.id,
      result,
    });

    if (results.size > 1000) {
      results.delete(
        results.keys().next().value
      );
    }

    await editV2(
      interaction,
      buildSuccess(
        result,
        seconds,
        user,
        id
      ),
      ephemeral
    );

    return true;
  } catch (error) {
    await editV2(
      interaction,
      errorComponents(
        error?.message ||
          "Bypass failed."
      ),
      ephemeral
    );

    return false;
  }
}

async function registerSlashCommands() {
  const bypassCommand =
    new SlashCommandBuilder()
      .setName("bypass")
      .setDescription("Bypass a URL")
      .addStringOption((option) =>
        option
          .setName("url")
          .setDescription("URL to bypass")
          .setRequired(true)
      );

  const fluxwaveBypassCommand =
    new SlashCommandBuilder()
      .setName("fluxwavebypass")
      .setDescription(
        "Post the FluxWave Bypass panel"
      )
      .setDefaultMemberPermissions(
        PermissionsBitField.Flags.Administrator
      );

  await client.application.commands.set([
    bypassCommand,
    fluxwaveBypassCommand,
  ]);
}

client.once("clientReady", async () => {
  try {
    await registerSlashCommands();
  } catch (error) {
    console.error(
      "Command registration error:",
      error
    );
  }

  warmup().catch(() => {});

  client.user.setPresence({
    status: "online",
    activities: [
      {
        name: "Bypassing links",
        type: ActivityType.Watching,
      },
    ],
  });

  console.log(
    `Logged in as ${client.user.tag}`
  );
});

client.on(
  "interactionCreate",
  async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (
          interaction.commandName ===
          "fluxwavebypass"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionsBitField.Flags.Administrator
            )
          ) {
            await interaction.reply({
              content:
                "You need Administrator permission to use this command.",
              ephemeral: true,
            });

            return;
          }

          await interaction.reply(
            v2Options(buildMainPanel())
          );

          return;
        }

        if (
          interaction.commandName ===
          "bypass"
        ) {
          const url =
            interaction.options.getString(
              "url",
              true
            );

          await interaction.deferReply();

          await interaction.editReply(
            v2Options(
              loadingComponents()
            )
          );

          await processBypass({
            url,
            user: interaction.user,
            interaction,
          });

          return;
        }

        return;
      }

      if (interaction.isButton()) {
        if (
          interaction.customId ===
          "fluxwave:bypass"
        ) {
          await interaction.showModal(
            bypassModal()
          );

          return;
        }

        if (
          interaction.customId ===
          "fluxwave:support"
        ) {
          await interaction.reply(
            v2Options(
              supportInfoComponents(),
              true
            )
          );

          return;
        }

        if (
          interaction.customId.startsWith(
            "view_result:"
          )
        ) {
          const id =
            interaction.customId.slice(
              "view_result:".length
            );

          const data = results.get(id);

          if (!data) {
            await interaction.reply({
              content:
                "This result is no longer available.",
              ephemeral: true,
            });

            return;
          }

          if (
            interaction.user.id !==
            data.userId
          ) {
            await interaction.reply({
              content:
                "Only the user who requested this bypass can view the result.",
              ephemeral: true,
            });

            return;
          }

          await interaction.reply({
            content:
              data.result.slice(0, 2000),
            ephemeral: true,
          });

          return;
        }

        return;
      }

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          "fluxwave:bypass-modal"
      ) {
        const url =
          interaction.fields
            .getTextInputValue("url")
            .trim();

        await interaction.deferReply({
          flags:
            MessageFlags.IsComponentsV2 |
            MessageFlags.Ephemeral,
        });

        await interaction.editReply({
          components: [
            loadingComponents(),
          ],
          flags:
            MessageFlags.IsComponentsV2 |
            MessageFlags.Ephemeral,
        });

        await processBypass({
          url,
          user: interaction.user,
          interaction,
          ephemeral: true,
        });

        return;
      }
    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      try {
        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction.editReply({
            components: [
              errorComponents(
                "Something went wrong while processing the request."
              ),
            ],
            flags:
              MessageFlags.IsComponentsV2 |
              (interaction.isModalSubmit()
                ? MessageFlags.Ephemeral
                : 0),
          });
        } else {
          await interaction.reply({
            content:
              "Something went wrong while processing the request.",
            ephemeral: true,
          });
        }
      } catch {}
    }
  }
);

client.on("error", (error) => {
  console.error("Client error:", error);
});

client.login(TOKEN);
