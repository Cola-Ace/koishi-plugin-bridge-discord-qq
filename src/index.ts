import { Context, h, Session } from 'koishi';
import { } from 'koishi-plugin-adapter-onebot';
import { Config } from './config';
import sharp from 'sharp';

export * from "./config";
import { MessageBody } from './types';
import { convertMsTimestampToISO8601, logger, BlacklistDetector, getBinary } from './utils';
import ProcessorQQ from './qq';
// import ProcessorDiscord from './discord';

export const name = 'bridge-qq-discord';

export const inject = ["database"]

const main = async (ctx: Context, config: Config, session: Session) => {
  const sender = session.event.user;
  if (sender.id === session.bot.selfId) return; // 避免回环

  const pattern = /\[QQ:\d+\]/;
  if (pattern.test(sender.name)) return; // 不转发自己消息

  const platform = session.event.platform;
  const self_id = session.event.selfId;
  const channel_id = session.event.channel.id;
  const message_data = session.event.message;

  const Blacklist = new BlacklistDetector(config.words_blacklist);

  // 测试用
  if (config.debug) {
    logger.info("-------Message-------");
    logger.info(message_data);
    logger.info("-------Sender-------");
    logger.info(sender);
    logger.info("-------End--------");
  }

  // 检测是否为QQ文件发送
  let is_qq_file = true;
  if ("id" in message_data) is_qq_file = false;
  if (is_qq_file) return;

  let nickname = sender.isBot ? sender.name : ("member" in session.event ? session.event.member.nick : sender.name); // 判断是否为 bot

  // const elements = message_data.elements.filter(element => element.type !== "at"); // 确保没有@格式
  const elements = message_data.elements;

  if (elements.length <= 0 && !Object.keys(message_data).includes("quote")) return;

  for (const constant of config.constant) {
    if (!constant.enable) continue;

    for (const from of constant.from) {
      if (from.platform === platform && from.self_id === self_id && from.channel_id === channel_id) {
        for (const to of constant.to) {
          try {
            if (to.platform === "discord") {
              // QQ -> Discord
              if (nickname === null) nickname = sender.name; // 如果群昵称为空则使用用户名

              const dc_bot = ctx.bots[`discord:${to.self_id}`];

              const message_body: MessageBody = { text: "", form: new FormData(), n: 0, embed: null, validElement: false, hasFile: false };

              if ("quote" in message_data) {
                // 不同平台之间回复 & 同平台之间回复
                const diff_platform_quote_message = await ctx.database.get("bridge_message", {
                  to_message_id: message_data.quote.id,
                  to_channel_id: channel_id
                })
                const same_platform_quote_message = await ctx.database.get("bridge_message", {
                  from_message_id: message_data.quote.id,
                  from_channel_id: channel_id
                });

                const quote_message = { type: diff_platform_quote_message.length !== 0 ? "diff" : "same", data: diff_platform_quote_message.length !== 0 ? diff_platform_quote_message : same_platform_quote_message };

                if (quote_message.data.length !== 0) {
                  let message = "";
                  let image = {};
                  let source = "";

                  switch (quote_message["type"]) {
                    case "same": { // 同平台之间回复
                      source = "to";
                      break;
                    }
                    case "diff": { // 不同平台之间回复
                      source = "from"
                      // 删除 QQ 回复时自动带上的 @
                      if (elements[0].type === "at" && elements[0].attrs.id === self_id) {
                        elements.shift();
                      }
                      break;
                    }
                    default: {
                      break;
                    }
                  }
                  if (source === "") return;

                  const dc_message = await dc_bot.getMessage(quote_message["data"][0][`${source}_channel_id`], quote_message["data"][0][`${source}_message_id`]);
                  if (source === "from"){
                    message_body.text += `<@${dc_message.user.id}>`;
                    message_body.validElement = true;
                  }

                  for (const element of dc_message.elements) {
                    switch (element.type) {
                      case "text": {
                        message += element.attrs.content;
                        break;
                      }
                      case "img": {
                        image = {
                          url: element.attrs.src
                        }
                        break;
                      }
                      case "face": {
                        message += h.image(element.children[0].attrs.src);
                        break;
                      }
                      default: {
                        break;
                      }
                    }
                  }
                  if (Blacklist.check(message)) return; // 黑名单检测
                  message_body.embed = [{
                    author: {
                      name: (dc_message["user"]["nick"] === null ? dc_message["user"]["name"] : dc_message["user"]["nick"]),
                      icon_url: dc_message["user"]["avatar"]
                    },
                    timestamp: convertMsTimestampToISO8601(Number(quote_message["data"][0]["timestamp"])),
                    description: `${message}\n\n[[ ↑ ]](https://discord.com/channels/${quote_message["data"][0][`${source}_guild_id`]}/${quote_message["data"][0][`${source}_channel_id`]}/${dc_message.id})`,
                    color: 2605017,
                    image
                  }]
                }
              }

              const [stop, _] = await ProcessorQQ.process(elements, session, config, [from, to], ctx, message_body, Blacklist);
              if (stop || !message_body.validElement) return;

              // 实现发送消息功能
              if (nickname === null || nickname === "") nickname = sender.name;

              let webhook_url = "";
              let webhook_id = "";
              let hasWebhook = false;
              const webhooks_list = await dc_bot.internal.getChannelWebhooks(to.channel_id);

              for (const webhook of webhooks_list) {
                if (webhook["user"]["id"] === to.self_id && "url" in webhook) {
                  webhook_url = webhook["url"];
                  webhook_id = webhook["id"];
                  hasWebhook = true;
                }
              }

              if (!hasWebhook) {
                const webhook = await dc_bot.internal.createWebhook(to.channel_id, { name: "Bridge" });
                webhook_url = webhook["url"];
                webhook_id = webhook["id"];
              }

              const payload_json = JSON.stringify({
                content: message_body.text,
                username: `[QQ:${sender.id}] ${nickname}`,
                avatar_url: sender.avatar,
                embeds: message_body.embed
              });
              message_body.form.append("payload_json", payload_json);

              try {
                const res = await ctx.http.post(`${webhook_url}?wait=true`, message_body.form);
                const from_guild_id = await ctx.database.get("channel", {
                  id: channel_id
                });
                const to_guild_id = await ctx.database.get("channel", {
                  id: to.channel_id
                });

                // 消息发送成功后才记录
                await ctx.database.create("bridge_message", {
                  timestamp: BigInt(Date.now()),
                  from_message_id: message_data.id,
                  from_platform: platform,
                  from_channel_id: channel_id,
                  from_guild_id: from_guild_id[0]["guildId"],
                  from_sender_id: sender.id,
                  from_sender_name: nickname,
                  to_message_id: res.id,
                  to_platform: "discord",
                  to_channel_id: to.channel_id,
                  to_guild_id: to_guild_id[0]["guildId"],
                  onebot_real_message_id: message_data.id
                })
              } catch (error) {
                logger.error(error);

                // 确保文件传输失败时能发送通知
                if (message_body.hasFile) {
                  for (let i = 0; i < message_body.n; i++) {
                    message_body.form.delete(`files[${i}]`);
                  }

                  await ctx.http.post(`${webhook_url}?wait=true`, message_body.form);
                }
              }

              if (!hasWebhook) {
                await dc_bot.internal.deleteWebhook(webhook_id);
              }

              continue;
            }

            // Discord -> QQ
            const qqbot = ctx.bots[`${to.platform}:${to.self_id}`];
            const dc_bot = ctx.bots[`discord:${from.self_id}`];

            // 屏蔽 TweetShift
            // if (nickname !== null && nickname.indexOf("TweetShift") !== -1) return;

            // 处理 Tweetshift
            /*
             * @deprecated because TweetShift are using IFTTT now (maybe?)
             *
            if (nickname !== null && nickname.indexOf("TweetShift") !== -1) {
              const [stop, message] = ProcessorDiscord.processTweetshift(
                await dc_bot.internal.getChannelMessage(session.event.channel.id, message_data.id),
                elements,
                config.words_blacklist
              );

              if (stop) return;

              // const messageId = await qqbot.sendMessage(to.channel_id, `${h.image(msg["embeds"][0]["author"]["icon_url"].replace(".jpg", "_200x200.jpg"))}[Discord·TweetShift] ${msg["embeds"][0]["author"]["name"]}:\n${message}`);
              const messageId = await qqbot.sendMessage(to.channel_id, message);
              const fromGuildId = await ctx.database.get("channel", {
                id: channel_id
              });
              const toGuildId = await ctx.database.get("channel", {
                id: to.channel_id
              });
              await ctx.database.create("bridge_message", {
                timestamp: BigInt(Date.now()),
                from_message_id: message_data.id,
                from_platform: platform,
                from_channel_id: channel_id,
                from_guild_id: fromGuildId[0]["guildId"],
                from_sender_id: sender.id,
                from_sender_name: nickname,
                to_message_id: messageId[0],
                to_platform: "discord",
                to_channel_id: to.channel_id,
                to_guild_id: toGuildId[0]["guildId"],
                onebot_real_message_id: messageId[0]
              });

              return;
            }
            */

            let message = "";
            let quoted_message_id = null;

            if ("quote" in message_data && message_data.content === "") { // 处理转发消息事件和标注消息事件
              const data = await dc_bot.internal.getChannelMessage(channel_id, message_data.id);

              if (data.type === 6) return; // 标注消息事件

              const guild_id = await dc_bot.internal.getChannel(message_data.quote.channel.id);
              const quoted_nick = message_data.quote.user.nick === null ? message_data.quote.user.name : message_data.quote.user.nick;

              message += `===== 转发消息 =====\nhttps://discord.com/channels/${guild_id["guild_id"]}/${message_data.quote.channel.id}/${message_data.quote.id}\n===== 以下为转发内容 =====\n${h.image(`${message_data.quote.user.avatar}?size=64`)}\n${quoted_nick.indexOf("[QQ:") !== -1 ? "" : "[Discord] "}${quoted_nick}:\n`;
            }

            if ("quote" in message_data && elements.length !== 0) {
              // 不同平台之间回复 & 同平台之间回复
              const diff_platform_quote_message = await ctx.database.get("bridge_message", {
                to_message_id: message_data.quote.id,
                to_channel_id: message_data.quote.channel.id
              })
              const same_platform_quote_message = await ctx.database.get("bridge_message", {
                from_message_id: message_data.quote.id,
                from_channel_id: message_data.quote.channel.id
              });

              const quote_message = diff_platform_quote_message.length !== 0 ? diff_platform_quote_message : same_platform_quote_message;

              if (quote_message.length !== 0) {
                quoted_message_id = quote_message[0]["onebot_real_message_id"];
              }
            }

            for (const element of elements.length === 0 ? message_data.quote.elements : elements) {
              switch (element.type) {
                case "text": {
                  if (Blacklist.check(element.attrs.content)) return; // 黑名单检测

                  message += element.attrs.content;

                  break;
                }

                case "at": {
                  // https://github.com/Cola-Ace/koishi-plugin-bridge-discord-qq/issues/4
                  if (element.attrs.type === "all") {
                    message += "@everyone ";
                    break;
                  }

                  // https://github.com/Cola-Ace/koishi-plugin-bridge-discord-qq/issues/5
                  if (element.attrs.type === "here") {
                    message += "@here ";
                    break;
                  }

                  const user_info = await dc_bot.internal.getUser(element.attrs.id);
                  message += `@${user_info["global_name"] === null ? element.attrs.name : user_info["global_name"]}`;

                  break;
                }

                case "https:": {
                  message += `https:${Object.keys(element.attrs)[0]}`;

                  break;
                }

                case "img": {
                  if (config.file_processor === "Koishi") {
                    const [img_blob, img_type, img_error] = await getBinary(element.attrs.src, ctx.http);
                    if (img_error) {
                      logger.error(img_error);
                      break;
                    }
                    const img_arrayBuffer = await img_blob.arrayBuffer();
                    message += h.image(img_arrayBuffer, element.attrs.type);
                  } else {
                    message += h.image(element.attrs.src);
                  }

                  break;
                }

                case "face": {
                  const src = element.children[0].attrs.src;
                  message += h.image(`${src}${src.indexOf("?quality=lossless") !== -1 ? "&size=44" : ""}`);

                  break;
                }

                case "record":
                case "file": {
                  if (parseInt(element.attrs.size) > config.qq_file_limit) {
                    message += "【检测到大小超过设置上限的文件，请到 Discord 查看】"
                    break;
                  }
                  const path = await qqbot.internal.downloadFile(element.attrs.src);

                  await qqbot.internal.uploadGroupFile(to.channel_id, path, element.attrs.file);

                  break;
                }

                case "video": {
                  if (parseInt(element.attrs.size) > config.qq_file_limit) {
                    message += "【检测到大小超过设置上限的视频，请到 Discord 查看】"
                    break;
                  }

                  if (element.attrs.src.indexOf("youtube.com") !== -1) break;

                  if (config.file_processor === "Koishi") {
                    const [video_blob, video_type, video_error] = await getBinary(element.attrs.src, ctx.http);
                    if (video_error) {
                      logger.error(video_error);
                      break;
                    }
                    const video_arrayBuffer = await video_blob.arrayBuffer();
                    message += h.video(video_arrayBuffer, element.attrs.type);
                  } else {
                    message += h.video(element.attrs.src);
                  }

                  break;
                }

                default: {
                  break;
                }
              }
            }

            // https://github.com/Cola-Ace/koishi-plugin-bridge-discord-qq/issues/6
            if (!sender.isBot) {
              const member = await dc_bot.internal.getGuildMember(session.guildId, sender.id);
              // nickname = sender.nick === null ? sender.name : sender.nick;
              nickname = member.nick === null ? member.user.global_name : member.nick;
            }

            // 处理 Discord 默认头像颜色
            let avatar_color = "";
            let avatar = `${sender.avatar}?size=64`;
            if (sender.avatar === null) {
              avatar_color = config.discord_default_avatar_color.toString();
              if (config.discord_default_avatar_color === 99){
                avatar_color = Math.floor(Math.random() * 5).toString();
              }
              avatar = `https://cdn.discordapp.com/embed/avatars/${avatar_color}.png`;
            }

            // https://github.com/Cola-Ace/koishi-plugin-bridge-discord-qq/issues/7
            // const avatar = sender.avatar === null ? "https://cdn.discordapp.com/embed/avatars/0.png" : `${sender.avatar}?size=64`;

            let message_content = `${quoted_message_id === null ? "" : h.quote(quoted_message_id)}${h.image(avatar)}[Discord] ${nickname}:\n${message}`;
            if (config.file_processor === "Koishi") {
              const [avatar_blob, avatar_type, avatar_error] = await getBinary(avatar, ctx.http);
              if (avatar_error) {
                logger.error(avatar_error);
                return;
              }
              const avatar_arrayBuffer = await avatar_blob.arrayBuffer();
              const avatar_resize_arrayBuffer = await sharp(avatar_arrayBuffer).resize(64, 64).toBuffer();
              message_content = `${quoted_message_id === null ? "" : h.quote(quoted_message_id)}${h.image(avatar_resize_arrayBuffer, avatar_type)}[Discord] ${nickname}:\n${message}`;
            }

            let retry_count = 0;
            while (retry_count < 4){
              try {
                const message_id = await qqbot.sendMessage(to.channel_id, message_content);
                const from_guild_id = await ctx.database.get("channel", {
                  id: channel_id
                });
                const to_guild_id = await ctx.database.get("channel", {
                  id: to.channel_id
                });
                // 消息发送成功后才记录
                try {
                  await ctx.database.create("bridge_message", {
                    timestamp: BigInt(Date.now()),
                    from_message_id: message_data.id,
                    from_platform: platform,
                    from_channel_id: channel_id,
                    from_guild_id: from_guild_id[0]["guildId"],
                    from_sender_id: sender.id,
                    from_sender_name: nickname,
                    to_message_id: message_id[0],
                    to_platform: "onebot",
                    to_channel_id: to.channel_id,
                    to_guild_id: to_guild_id[0]["guildId"],
                    onebot_real_message_id: message_id[0]
                  })
                } catch (error) {
                  logger.error(error);
                }

                break;
              } catch (error) {
                retry_count++;
                if (retry_count >= 3) {
                  logger.error(error);
                  break;
                }

                logger.info(`发送消息失败，正在重试... (${retry_count}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          } catch (error) {
            logger.error(error);
          }
        }
      }
    }
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend("bridge_message", {
    id: "unsigned",
    timestamp: "bigint",
    from_message_id: "string",
    from_platform: "string",
    from_channel_id: "string",
    from_guild_id: "string",
    from_sender_id: "string",
    from_sender_name: "string",
    to_message_id: "string",
    to_platform: "string",
    to_channel_id: "string",
    to_guild_id: "string",
    onebot_real_message_id: "string"
  }, {
    primary: "id",
    autoInc: true
  })

  ctx.on("message", async (session) => await main(ctx, config, session));
}
