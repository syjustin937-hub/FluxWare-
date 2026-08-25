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
  EmbedBuilder,
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

function buildMainPanel() {
  const embed = new EmbedBuilder()
    .setTitle("FLUXWAVE BYPASS LINK")
    .setDescription(
      "**Click** Bypass, **paste your link in the** url bypass **field, then press** Submit.\n\n" +
        "Enter your link and submit it to continue.\n" +
        "Please wait a moment while your request is being processed.\n" +
        "Your result will appear once the process is complete."
    )
    .setImage(BANNER_URL)
    .setFooter({
      text: "Made by FluxWave",
    });

  const row = new ActionRowBuilder().addComponents(
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
      .setCustomId("fluxwave:support")
  );

  const links = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Invite Bot")
      .setURL(INVITE_BOT_URL),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Support Server")
      .setURL(SUPPORT_SERVER_URL)
  );

  return {
    embeds: [embed],
    components: [row, links],
  };
}

function supportInfoComponents() {
  const services = PLATFORMS.map((p) => `• ${p.name}`).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("FluxWave Support Info")
    .setDescription(
      `**Currently listed services:**\n${
        services || "• No services listed."
      }`
    )
    .setFooter({
      text: "Supported service information is provided by the FluxWave backend.",
    });

  return {
    embeds: [embed],
  };
}

function bypassModal() {
  const input = new TextInputBuilder()
    .setCustomId("url")
    .setLabel("url bypass")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://...")
    .setRequired(true)
    .setMaxLength(2000);

  const row = new ActionRowBuilder().addComponents(input);

  return new ModalBuilder()
    .setCustomId("fluxwave:bypass-modal")
    .setTitle("Bypass systems")
    .addComponents(row);
}

function buildLoading() {
  const embed = new EmbedBuilder()
    .setDescription(`${LOADING_EMOJI} **FluxWave Bypass is thinking...**`)
    .setColor(0x5865f2);

  return {
    embeds: [embed],
    components: [],
  };
}

function buildSuccess(result, seconds, id) {
  const value = cleanResult(result);

  const mobile = value
    .replace(/```/g, "")
    .replace(/`/g, "")
    .slice(0, 1000);

  const pc = value
    .replace(/```/g, "")
    .replace(/`/g, "")
    .slice(0, 3900);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${CHECK_EMOJI} Bypass Success`)
    .addFields(
      {
        name: `${MOBILE_EMOJI} Mobile Copy`,
        value: `\`\`\`\n${mobile}\n\`\`\``,
      },
      {
        name: `${COMPUTER_EMOJI} PC Copy`,
        value: `\`\`\`\n${pc}\n\`\`\``,
      }
    )
    .setFooter({
      text: `Processed in ${seconds}s • FluxWave`,
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setLabel("View Result")
      .setCustomId(`view_result:${id}`),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Invite Bot")
      .setURL(INVITE_BOT_URL),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Support Server")
      .setURL(SUPPORT_SERVER_URL)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

function buildError(message) {
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("Bypass Failed")
    .setDescription(cleanResult(message).slice(0, 4000))
    .setFooter({
      text: "FluxWave",
    });

  return {
    embeds: [embed],
    components: [],
  };
}

async function processBypass({ url, user, reply }) {
  const detected = detect(url);

  if (!detected.url) {
    await reply.edit(buildError("Invalid URL."));
    return false;
  }

  if (!detected.service) {
    await reply.edit(buildError("This link could not be processed."));
    return false;
  }

  const started = Date.now();

  try {
    const outcome = await runBypass(
      detected.service,
      detected.url.href,
      () => {}
    );

    const seconds = ((Date.now() - started) / 1000).toFixed(3);

    if (!outcome.success) {
      await reply.edit(
        buildError(outcome.result || "Bypass failed.")
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
      const firstKey = results.keys().next().value;
      if (firstKey) {
        results.delete(firstKey);
      }
    }

    await reply.edit(
      buildSuccess(result, seconds, id)
    );

    return true;
  } catch (error) {
    console.error("Bypass error:", error);

    await reply.edit(
      buildError(
        error?.message || "Bypass failed."
      )
    );

    return false;
  }
}

async function registerSlashCommands() {
  const bypassCommand = new SlashCommandBuilder()
    .setName("bypass")
    .setDescription("Bypass a URL")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL to bypass")
        .setRequired(true)
    );

  const fluxwaveBypassCommand = new SlashCommandBuilder()
    .setName("fluxwavebypass")
    .setDescription("Post the FluxWave Bypass panel")
    .setDefaultMemberPermissions(
      PermissionsBitField.Flags.Administrator
    );

  await client.application.commands.set([
    bypassCommand,
    fluxwaveBypassCommand,
  ]);
}

client.once("clientReady", async () => {
  await registerSlashCommands();

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

  console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "fluxwavebypass") {
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

        await interaction.reply(buildMainPanel());
        return;
      }

      if (interaction.commandName === "bypass") {
        const url = interaction.options.getString(
          "url",
          true
        );

        await interaction.deferReply({
          ephemeral: true,
        });

        const message = await interaction.editReply(
          buildLoading()
        );

        await processBypass({
          url,
          user: interaction.user,
          reply: message,
        });

        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "fluxwave:bypass") {
        await interaction.showModal(bypassModal());
        return;
      }

      if (interaction.customId === "fluxwave:support") {
        await interaction.reply({
          ...supportInfoComponents(),
          ephemeral: true,
        });

        return;
      }

      if (
        interaction.customId.startsWith("view_result:")
      ) {
        const id = interaction.customId.slice(
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

        if (interaction.user.id !== data.userId) {
          await interaction.reply({
            content:
              "Only the user who requested this bypass can view the result.",
            ephemeral: true,
          });

          return;
        }

        await interaction.reply({
          content: data.result.slice(0, 2000),
          ephemeral: true,
        });

        return;
      }
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId ===
        "fluxwave:bypass-modal"
    ) {
      const url = interaction.fields
        .getTextInputValue("url")
        .trim();

      await interaction.deferReply({
        ephemeral: true,
      });

      const loading = await interaction.editReply(
        buildLoading()
      );

      await processBypass({
        url,
        user: interaction.user,
        reply: loading,
      });

      return;
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content:
          "Something went wrong while processing the request.",
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction
        .editReply({
          content:
            "Something went wrong while processing the request.",
          embeds: [],
          components: [],
        })
        .catch(() => {});
    }
  }
});

client.login(TOKEN);
