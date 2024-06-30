import { Context, Schema, Logger, h } from 'koishi';
import type { Discord, DiscordBot,  } from '@koishijs/plugin-adapter-discord';

export const name = 'bridge-discord-qq';

export interface Constant {
    from: Array<BasicType>,
    to: Array<BasicType>
}

export interface BasicType {
    platform: string,
    channel_id: string,
    self_id: string
}

export interface Config {
    converter_url: string,
    constant?: Array<Constant>
};

const logger = new Logger("debug");

export const Config: Schema<Config> = Schema.object({
    converter_url: Schema.string().description("图片转换器地址（应以?url=结尾）").required(),
    constant: Schema.array(Schema.object({
        from: Schema.array(Schema.object({
            platform: Schema.string().description("来源平台"),
            channel_id: Schema.string().description("频道ID"),
            self_id: Schema.string().description("自身ID")
        })),
        to: Schema.array(Schema.object({
            platform: Schema.string().description("目标平台"),
            channel_id: Schema.string().description("频道ID"),
            self_id: Schema.string().description("自身ID")
        }))
    }))
});

function converterUrl(base_url: string, url: string){
    return `${base_url}${encodeURIComponent(url)}`
}

export function apply(ctx: Context, config: Config) {
    ctx.on("message", async (session) => {
        const sender = session.event.user;
        if (sender.id == session.bot.selfId) return; // 避免回环
        if ("isBot" in sender && sender.isBot) return; // 避免bot回环（注：isBot参数仅在discord消息中存在）

        const platform = session.event.platform;
        const self_id = session.event.selfId;
        const channel_id = session.event.channel.id;

        const elements = session.event.message.elements.filter(element => element.type !== "at"); // 确保没有@格式

        if (elements.length <= 0) return;

        logger.info(elements);
        
        for (let element of config.constant){
            for (let from of element.from){
                if (from.platform == platform && from.self_id == self_id && from.channel_id == channel_id){
                    logger.info("Match");
                    for (let to of element.to){
                        try {
                            if (to.platform === "discord"){
                                // Discord
                                let message = "";
                                for (let element of elements){
                                    switch (element.type){
                                        case "text":{
                                            message += element.attrs.content;
                                            break;
                                        }
                                        case "img":{
                                            message += ` ${converterUrl(config.converter_url, element.attrs.src)} `;
                                            break;
                                        }

                                        default:{
                                            break;
                                        }
                                    }
                                }

                                const bot = ctx.bots[`discord:${to.self_id}`];
                                logger.info("Send to Discord");
                                
                                const body: Discord.Webhook.ExecuteBody = {
                                    // content: session.event.message.content,
                                    content: message.length > 0 ? message : "发送图片",
                                    username: `[QQ] ${sender.name}`,
                                    avatar_url: sender.avatar,
                                    // unnessary
                                    files: undefined,
                                    embeds: [],
                                    tts: false,
                                    allowed_mentions: {
                                        parse: [],
                                        roles: [],
                                        users: [],
                                        replied_user: false,
                                    },
                                    components: [],
                                    payload_json: "",
                                    attachments: [],
                                    flags: 0,
                                    thread_name: undefined
                                };

                                const params: Discord.Webhook.ExecuteParams = {
                                    wait: false,
                                    thread_id: undefined,
                                };
                                
                                const webhook = await (bot as unknown as DiscordBot).internal.createWebhook(to.channel_id, {name: "Bridge"});
                                try {
                                    await (bot as unknown as DiscordBot).internal.executeWebhook(webhook.id, webhook.token, body, params);
                                } catch (error){
                                    logger.error(error);
                                } finally {
                                    await (bot as unknown as DiscordBot).internal.deleteWebhook(webhook.id);
                                }

                                continue;
                            }

                            // QQ
                            logger.info("Send to QQ");
                            const bot = ctx.bots[`${to.platform}:${to.self_id}`];

                            let message = "";
                            for (let element of elements){
                                switch (element.type){
                                    case "text":{
                                        message += element.attrs.content;
                                        break;
                                    }
                                    case "img":{
                                        message += `<img src="${converterUrl(config.converter_url, element.attrs.src)}" />`
                                        
                                        break;
                                    }

                                    default:{
                                        break;
                                    }
                                }
                            }

                            /*
                            获取图片内容（目前暂时不需要）
                            const buffer = await getImageBinary(`${sender.avatar}?size=64`);
                            if (buffer === null){
                                await bot.sendMessage(to.channel_id, `[Discord] ${sender.name}:${session.event.message.content}`)
                                continue;
                            }

                            await bot.sendMessage(to.channel_id, `${h.image(buffer, "image/png")}[Discord] ${sender.name}:${session.event.message.content}`);
                            */
                           
                            await bot.sendMessage(to.channel_id, `<img src="${converterUrl(config.converter_url, `${sender.avatar}?size=64`)}" />[Discord] ${sender.name}:${message}`);
                        } catch (error){
                            logger.error(error);
                        }
                    }
                }
            }
        }
    })
}