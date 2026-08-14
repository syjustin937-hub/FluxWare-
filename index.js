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

const SUPPORT_SERVER_URL =
  process.env.SUPPORT_SERVER_URL ||
  "https://discord.gg/qXUENfzHVH";

const INVITE_BOT_URL =
  process.env.INVITE_BOT_URL ||
  "https://discord.com/oauth2/authorize?client_id=1537831595787030598&permissions=8&integration_type=0&scope=bot%20applications.commands";

const CHECK_EMOJI = "<:Check:1537866209301762158>";
const LOADING_EMOJI = "<a:Loading:1537866256022118421>";

const AUTO_BYPASS_FILE = path.join(
  __dirname,
  "autobypass.json"
);

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
const autoSelections = new Map();

let autoBypassChannels = {};

try {
  if (fs.existsSync(AUTO_BYPASS_FILE)) {
    autoBypassChannels =
      JSON.parse(
        fs.readFileSync(
          AUTO_BYPASS_FILE,
          "utf8"
        )
      ) || {};
  }
} catch {
  autoBypassChannels = {};
}

function saveAutoBypass() {
  fs.writeFileSync(
    AUTO_BYPASS_FILE,
    JSON.stringify(
      autoBypassChannels,
      null,
      2
    )
  );
}

function cleanResult(value) {
  return (
    String(value ?? "").trim() ||
    "No result returned."
  );
}

function text(content) {
  return new TextDisplayBuilder()
    .setContent(content);
}

function separator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(1);
}

function linkButton(label, url) {
  return new ButtonBuilder()
    .setLabel(label)
    .setStyle(ButtonStyle.Link)
    .setURL(url);
}

function makeButtons(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `view_result:${id}`
        )
        .setLabel("View Result")
        .setStyle(
          ButtonStyle.Secondary
        ),
      linkButton(
        "Invite Bot",
        INVITE_BOT_URL
      )
    ),
    new ActionRowBuilder().addComponents(
      linkButton(
        "Support Server",
        SUPPORT_SERVER_URL
      )
    ),
  ];
}

function baseContainer() {
  return new ContainerBuilder();
}

function buildSuccess(
  result,
  seconds,
  user,
  id
) {
  const value =
    cleanResult(result);

  const mobile = value
    .replace(/`/g, "\\`")
    .slice(0, 1000);

  const pc = value
    .replace(
      /```/g,
      "\\`\\`\\`"
    )
    .slice(0, 3900);

  return baseContainer()
    .addTextDisplayComponents(
      text(
        `## Bypass Success ${CHECK_EMOJI}`
      )
    )
    .addSeparatorComponents(
      separator()
    )
    .addTextDisplayComponents(
      text(
        `**Mobile Version**:\n\`${mobile}\``
      )
    )
    .addTextDisplayComponents(
      text(
        `**PC Version**:\n\`\`\`\n${pc}\n\`\`\``
      )
    )
    .addSeparatorComponents(
      separator()
    )
    .addTextDisplayComponents(
      text(
        `Processed in ${seconds}s • Requested by ${user}`
      )
    )
    .addActionRowComponents(
      ...makeButtons(id)
    );
}

function errorComponents(result) {
  return baseContainer()
    .addTextDisplayComponents(
      text("## Bypass Failed")
    )
    .addSeparatorComponents(
      separator()
    )
    .addTextDisplayComponents(
      text(
        cleanResult(result)
          .slice(0, 3900)
      )
    );
}

function loadingComponents() {
  return baseContainer()
    .addTextDisplayComponents(
      text(
        `${LOADING_EMOJI} **Bypassing...**`
      )
    );
}

function v2Options(
  container,
  ephemeral = false
) {
  return {
    components: [container],
    flags:
      MessageFlags.IsComponentsV2 |
      (ephemeral
        ? MessageFlags.Ephemeral
        : 0),
  };
}

async function processBypass({
  url,
  user,
  reply,
}) {
  const detected =
    detect(url);

  if (!detected.url) {
    await reply.edit({
      components: [
        errorComponents(
          "Invalid URL."
        ),
      ],
    });
    return null;
  }

  if (!detected.service) {
    await reply.edit({
      components: [
        errorComponents(
          "This URL is not supported."
        ),
      ],
    });
    return null;
  }

  const started =
    Date.now();

  try {
    const outcome =
      await runBypass(
        detected.service,
        detected.url.href
      );

    const seconds = (
      (Date.now() -
        started) /
      1000
    ).toFixed(3);

    if (!outcome.success) {
      await reply.edit({
        components: [
          errorComponents(
            outcome.result
          ),
        ],
      });
      return null;
    }

    const result =
      cleanResult(
        outcome.result
      );

    const id =
      `${user.id}:${Date.now()}:${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    results.set(id, {
      userId: user.id,
      result,
    });

    if (results.size > 1000) {
      results.delete(
        results.keys()
          .next()
          .value
      );
    }

    await reply.edit({
      components: [
        buildSuccess(
          result,
          seconds,
          user,
          id
        ),
      ],
    });

    return {
      result,
      seconds,
    };
  } catch (error) {
    await reply.edit({
      components: [
        errorComponents(
          error?.message ||
            "Bypass failed."
        ),
      ],
    });

    return null;
  }
}

async function startBypass(
  message,
  url
) {
  if (!url) {
    await message.reply(
      v2Options(
        baseContainer()
          .addTextDisplayComponents(
            text(
              `## Usage\n\`${PREFIX}bypass <url>\``
            )
          )
      )
    );

    return;
  }

  const reply =
    await message.reply(
      v2Options(
        loadingComponents()
      )
    );

  await processBypass({
    url,
    user: message.author,
    reply,
  });
}

function isUrlOnly(content) {
  const value =
    String(
      content || ""
    ).trim();

  if (
    !value ||
    /\s/.test(value)
  ) {
    return false;
  }

  try {
    const url =
      new URL(value);

    return (
      url.protocol ===
        "http:" ||
      url.protocol ===
        "https:"
    );
  } catch {
    return false;
  }
}

async function registerSlashCommands() {
  const bypassCommand =
    new SlashCommandBuilder()
      .setName("bypass")
      .setDescription(
        "Bypass a URL"
      )
      .addStringOption(
        option =>
          option
            .setName("url")
            .setDescription(
              "URL to bypass"
            )
            .setRequired(true)
      );

  const autoBypassCommand =
    new SlashCommandBuilder()
      .setName("auto-bypass")
      .setDescription(
        "Configure automatic bypass"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageGuild
      )
      .addSubcommand(
        subcommand =>
          subcommand
            .setName("set")
            .setDescription(
              "Set automatic bypass channel"
            )
            .addChannelOption(
              option =>
                option
                  .setName(
                    "channel"
                  )
                  .setDescription(
                    "Automatic bypass channel"
                  )
                  .addChannelTypes(
                    ChannelType.GuildText
                  )
                  .setRequired(true)
            )
      )
      .addSubcommand(
        subcommand =>
          subcommand
            .setName("off")
            .setDescription(
              "Disable automatic bypass"
            )
      );

  const sayCommand =
    new SlashCommandBuilder()
      .setName("say")
      .setDescription(
        "Send a message as the bot"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageGuild
      )
      .addStringOption(
        option =>
          option
            .setName("message")
            .setDescription(
              "Message to send"
            )
            .setRequired(true)
      );

  await client.application.commands.set([
    bypassCommand,
    autoBypassCommand,
    sayCommand,
  ]);
}

client.once(
  "ready",
  async () => {
    await registerSlashCommands();

    client.user.setPresence({
      status: "dnd",
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
  }
);

client.on(
  "messageCreate",
  async message => {
    if (
      message.author.bot ||
      !message.guild
    ) {
      return;
    }

    const autoChannelId =
      autoBypassChannels[
        message.guild.id
      ];

    if (
      autoChannelId ===
      message.channel.id
    ) {
      if (
        !isUrlOnly(
          message.content
        )
      ) {
        await message
          .delete()
          .catch(() => {});
        return;
      }

      const url =
        message.content.trim();

      await message
        .delete()
        .catch(() => {});

      const loading =
        await message.channel.send(
          `${LOADING_EMOJI} **Bypassing...**`
        );

      const detected =
        detect(url);

      if (
        !detected.url ||
        !detected.service
      ) {
        await loading
          .delete()
          .catch(() => {});
        return;
      }

      const started =
        Date.now();

      try {
        const outcome =
          await runBypass(
            detected.service,
            detected.url.href
          );

        const seconds = (
          (Date.now() -
            started) /
          1000
        ).toFixed(3);

        await loading
          .delete()
          .catch(() => {});

        if (
          !outcome.success
        ) {
          await message.author
            .send(
              `Bypass failed: ${cleanResult(
                outcome.result
              )}`
            )
            .catch(() => {});

          return;
        }

        const result =
          cleanResult(
            outcome.result
          );

        const selectionId =
          `${message.author.id}:${Date.now()}:${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        autoSelections.set(
          selectionId,
          {
            userId:
              message.author.id,
            channelId:
              message.channel.id,
            result,
            seconds,
          }
        );

        const choice =
          new ContainerBuilder()
            .addTextDisplayComponents(
              text(
                "## Bypass Success"
              )
            )
            .addSeparatorComponents(
              separator()
            )
            .addTextDisplayComponents(
              text(
                "Where do you want to receive the result?"
              )
            )
            .addActionRowComponents(
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      `auto_here:${selectionId}`
                    )
                    .setLabel(
                      "Send Here"
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),
                  new ButtonBuilder()
                    .setCustomId(
                      `auto_dm:${selectionId}`
                    )
                    .setLabel(
                      "Send to DM"
                    )
                    .setStyle(
                      ButtonStyle.Primary
                    )
                )
            );

        const choiceMessage =
          await message.channel.send({
            components: [
              choice,
            ],
            flags:
              MessageFlags.IsComponentsV2,
          });

        setTimeout(
          () => {
            autoSelections.delete(
              selectionId
            );

            choiceMessage
              .delete()
              .catch(() => {});
          },
          5000
        );
      } catch (error) {
        await loading
          .delete()
          .catch(() => {});

        await message.author
          .send(
            `Bypass failed: ${
              error?.message ||
              "Unknown error."
            }`
          )
          .catch(() => {});
      }

      return;
    }

    if (
      !message.content.startsWith(
        PREFIX
      )
    ) {
      return;
    }

    const args =
      message.content
        .slice(
          PREFIX.length
        )
        .trim()
        .split(/\s+/);

    const command =
      (
        args.shift() ||
        ""
      ).toLowerCase();

    if (
      command !== "bypass"
    ) {
      return;
    }

    await startBypass(
      message,
      args[0]
    );
  }
);

client.on(
  "interactionCreate",
  async interaction => {
    if (
      interaction.isChatInputCommand()
    ) {
      if (
        interaction.commandName ===
        "bypass"
      ) {
        const url =
          interaction.options.getString(
            "url",
            true
          );

        const reply =
          await interaction.reply({
            ...v2Options(
              loadingComponents()
            ),
            withResponse:
              true,
          });

        const message =
          reply.resource
            ?.message ||
          await interaction.fetchReply();

        await processBypass({
          url,
          user:
            interaction.user,
          reply: message,
        });

        return;
      }

      if (
        interaction.commandName ===
        "auto-bypass"
      ) {
        if (
          !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          await interaction.reply({
            content:
              "You need Manage Server permission to use this command.",
            ephemeral: true,
          });

          return;
        }

        const subcommand =
          interaction.options.getSubcommand();

        if (
          subcommand === "set"
        ) {
          const channel =
            interaction.options.getChannel(
              "channel",
              true
            );

          autoBypassChannels[
            interaction.guildId
          ] = channel.id;

          saveAutoBypass();

          await interaction.reply({
            content:
              `Auto Bypass enabled in ${channel}.`,
            ephemeral: true,
          });

          return;
        }

        if (
          subcommand === "off"
        ) {
          delete autoBypassChannels[
            interaction.guildId
          ];

          saveAutoBypass();

          await interaction.reply({
            content:
              "Auto Bypass disabled.",
            ephemeral: true,
          });

          return;
        }
      }

      if (
        interaction.commandName ===
        "say"
      ) {
        if (
          !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          await interaction.reply({
            content:
              "You need Manage Server permission to use this command.",
            ephemeral: true,
          });

          return;
        }

        const content =
          interaction.options.getString(
            "message",
            true
          );

        await interaction.channel.send({
          content,
          allowedMentions: {
            parse: [],
          },
        });

        await interaction.reply({
          content:
            "Message sent.",
          ephemeral: true,
        });

        return;
      }

      return;
    }

    if (
      !interaction.isButton()
    ) {
      return;
    }

    if (
      interaction.customId.startsWith(
        "auto_here:"
      ) ||
      interaction.customId.startsWith(
        "auto_dm:"
      )
    ) {
      const isHere =
        interaction.customId.startsWith(
          "auto_here:"
        );

      const id =
        interaction.customId.slice(
          isHere
            ? "auto_here:".length
            : "auto_dm:".length
        );

      const data =
        autoSelections.get(id);

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
            "Only the user who sent the URL can choose where to receive the result.",
          ephemeral: true,
        });

        return;
      }

      autoSelections.delete(id);

      if (!isHere) {
        const dmSent =
          await interaction.user
            .send({
              content:
                `## Bypass Success ${CHECK_EMOJI}\n\n` +
                `**Result:**\n` +
                `\`\`\`\n${data.result.slice(
                  0,
                  1900
                )}\n\`\`\`\n\n` +
                `Processed in ${data.seconds}s`,
            })
            .catch(
              () => null
            );

        await interaction.update({
          components: [
            new ContainerBuilder()
              .addTextDisplayComponents(
                text(
                  dmSent
                    ? "## Sent to your DM."
                    : "## I couldn't send you a DM. Please enable DMs from server members."
                )
              ),
          ],
          flags:
            MessageFlags.IsComponentsV2,
        });

        setTimeout(
          () => {
            interaction
              .deleteReply()
              .catch(() => {});
          },
          1500
        );

        return;
      }

      await interaction.deferUpdate();

      const resultMessage =
        await interaction.channel
          .send({
            content:
              `## Bypass Success ${CHECK_EMOJI}\n\n` +
              `**Result:**\n` +
              `\`\`\`\n${data.result.slice(
                0,
                1900
              )}\n\`\`\`\n\n` +
              `Processed in ${data.seconds}s`,
          })
          .catch(
            () => null
          );

      await interaction
        .deleteReply()
        .catch(() => {});

      if (resultMessage) {
        setTimeout(
          () => {
            resultMessage
              .delete()
              .catch(() => {});
          },
          10000
        );
      }

      return;
    }

    if (
      !interaction.customId.startsWith(
        "view_result:"
      )
    ) {
      return;
    }

    const id =
      interaction.customId.slice(
        "view_result:"
          .length
      );

    const data =
      results.get(id);

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
        data.result.slice(
          0,
          2000
        ),
      ephemeral: true,
    });
  }
);

client.login(TOKEN);
