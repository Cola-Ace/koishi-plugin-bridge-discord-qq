import { Context, Schema, Logger, h } from 'koishi';
import { DiscordBot } from '@koishijs/plugin-adapter-discord';
import {} from 'koishi-plugin-adapter-onebot';
import { v4 as uuidv4 } from 'uuid';
// import { emit } from 'process';

// h.file 用法:
// h.file(ArrayBuffer, type)
// blobToArrayBuffer需使用try catch

export const name = 'bridge-qq-discord';

export const inject = ["database"]

export interface Constant {
    enable: boolean,
    note: string,
    from: Array<BasicType>,
    to: Array<BasicType>
}

export interface BasicType {
    platform: string,
    channel_id: string,
    self_id: string
}

export interface Config {
    words_blacklist: Array<string>,
    file_transform: any,
    constant?: Array<Constant>
};

declare module "koishi" {
    interface Tables {
        bridge_message: BridgeMessage
    }
}

export interface BridgeMessage {
    id: number,
    timestamp: bigint,
    from_message_id: string,
    from_platform: string,
    from_channel_id: string,
    from_guild_id: string,
    from_sender_id: string,
    from_sender_name: string,
    to_message_id: string,
    to_platform: string,
    to_channel_id: string,
    to_guild_id: string,
    onebot_real_message_id: string
}

const logger = new Logger("debug");

export const Config: Schema<Config> = Schema.object({
    words_blacklist: Schema.array(String),
    file_transform: Schema.union([
        Schema.const(null).description("不发送文件"),
        Schema.object({
            url: Schema.string().required().description("远程url"),
            token: Schema.string().required().description("用于验证的token")
        }).description("转换文件")
    ]),
    constant: Schema.array(Schema.object({
        enable: Schema.boolean().description("是否启用").default(true),
        note: Schema.string().description("备注"),
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


async function getBinary(url: string): Promise<[Blob, String] | null> {
    try {
        const headers = new Headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        });

        const response = await fetch(url, {
            method: "GET",
            headers: headers,
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} | Response: ${response.text}`);
        }
        return [await response.blob(), response.headers.get("Content-Type")];
    } catch (error) {
        logger.error('Error fetching:', error);
        return null;
    }
}

// function generateSnowflake(): string{
//     let timestamp = BigInt(Date.now());
//     timestamp -= 1420070400000n;
//     return (timestamp << 22n).toString();
// }

function convertMsTimestampToISO8601(msTimestamp: number): string {
    // 创建一个 Date 对象，传入毫秒级的时间戳
    const date = new Date(msTimestamp);
  
    // 使用 .toISOString() 方法转换为 ISO 8601 格式
    // 注意：此方法返回的是 UTC 时间
    return date.toISOString();
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

    ctx.on("message", async (session) => {
        const sender = session.event.user;
        if (sender.id == session.bot.selfId) return; // 避免回环

        const pattern = /\[QQ:\d+\]/;
        if (pattern.test(sender.name)) return; // 不转发自己消息

        const platform = session.event.platform;
        const self_id = session.event.selfId;
        const channel_id = session.event.channel.id;
        const message_data = session.event.message;

        // 测试用
        logger.info("-------Message-------");
        logger.info(message_data);
        logger.info("-------Sender-------");
        logger.info(sender);
        logger.info("-------End--------");

        // 检测是否为QQ文件发送
        let is_qq_file = true;
        if ("id" in message_data) is_qq_file = false;
        if (is_qq_file) return;

        // 测试用代码
        // if (sender.id == "2591668626" && message_data.content == ".test"){
        //     let message = h("file", { src: "https://raw.githubusercontent.com/koishijs/koishi-plugin-adapter-onebot/main/.npmignore", title: ".npmignore" });
        //     const message_id = await session.bot.sendMessage("698656243", message);
        //     logger.info(message_id);
        //     await session.bot.sendMessage("698656243", "test");
        //     logger.info("finish");

        //     return;
        // }
        
        let nickname = sender.isBot ? sender.name : "member" in session.event ? session.event.member.nick : sender.name; // 判断是否为 bot

        const elements = message_data.elements.filter(element => element.type !== "at"); // 确保没有@格式

        if (elements.length <= 0) return;
        
        for (let element of config.constant){
            if (!element.enable) continue;
            
            for (let from of element.from){
                if (from.platform == platform && from.self_id == self_id && from.channel_id == channel_id){
                    for (let to of element.to){
                        try {
                            if (to.platform === "discord"){
                                // QQ -> Discord
                                let message = ""
                                let form = new FormData();
                                let n = 0;
                                let embed = null;

                                if (nickname === null) nickname = sender.name; // 如果群昵称为空则使用用户名

                                let valid_element = false;
                                for (let element of elements){
                                    switch (element.type){
                                        case "text":{
                                            for (let word of config.words_blacklist){
                                                if (element.attrs.content.toLowerCase().indexOf(word.toLowerCase()) != -1) return; // 发现黑名单
                                            }

                                            message += element.attrs.content;
                                            valid_element = true;
                                            
                                            break;
                                        }
                                        case "img":{
                                            const [blob, type] = await getBinary(element.attrs.src);
                                            form.append(`files[${n}]`, blob, `${uuidv4()}.${type.split("/")[1]}`);
                                            n++;
                                            valid_element = true;

                                            break;
                                        }
                                        case "face":{
                                            const file_url = element.children[0].attrs.src;
                                            if (file_url === "") break;

                                            const url_array = file_url.split("/");
                                            const [blob, type] = await getBinary(file_url);
                                            form.append(`files[${n}]`, blob, url_array[url_array.length - 1]);
                                            n++;
                                            valid_element = true;

                                            break;
                                        }
                                        case "mface":{
                                            const file_url = element.attrs.url;
                                            if (file_url === "") break;

                                            const [blob, type] = await getBinary(file_url);
                                            form.append(`files[${n}]`, blob, `${uuidv4()}.${type.split("/")[1]}`);
                                            n++;
                                            valid_element = true;

                                            break;
                                        }
                                        case "forward":{
                                            // const data = await session.onebot.getForwardMsg(message_data.id);
                                            // logger.info(data);
                                            message += "【检测到合并转发，请前往qq查看】";
                                            valid_element = true;

                                            break;
                                        }
                                        case "json":{
                                            // 处理 QQ 卡片类链接
                                            const data = JSON.parse(element.attrs.data);
                                            if (data["app"] != "com.tencent.structmsg") break;

                                            let image = {};

                                            if ("preview" in data["meta"]["news"]) image = { url: data["meta"]["news"]["preview"] };

                                            embed = [{
                                                author: {
                                                    name: data["meta"]["news"]["title"],
                                                },
                                                description: `${data["meta"]["news"]["desc"]}\n[点我跳转](${data["meta"]["news"]["jumpUrl"]})`,
                                                footer: {
                                                    text: data["meta"]["news"]["tag"],
                                                    icon_url: data["meta"]["news"]["source_icon"]
                                                },
                                                color: 2605017,
                                                image: image
                                            }];
                                            valid_element = true;

                                            break;
                                        }
                                        case "file":{
                                            if (parseInt(element.attrs.fileSize) > 20971520){ // 20MB
                                                message += "【检测到大小大于20MB的文件，请到QQ下载】";
                                                valid_element = true;

                                                break;
                                            }

                                            if (config.file_transform === undefined){
                                                message += "【检测到文件，请到QQ下载】";
                                                valid_element = true;

                                                break;
                                            }
                                            try {
                                                const res = await session.onebot.getImage(element.attrs.fileId);
                                                const filename = res["file"].split("/");
                                                const [file, type] = await getBinary(`${config.file_transform.url}/${config.file_transform.token}/${filename[filename.length - 1]}`);
                                                if (file === null){
                                                    message += "文件传输失败，请联系管理员";
                                                    valid_element = true;

                                                    break;
                                                }

                                                form.append(`files[0]`, file, res["file_name"]);
                                                valid_element = true;
                                            } catch (error){
                                                logger.info(error);
                                                message += "文件传输失败，请联系管理员";
                                                valid_element = true;
                                            }

                                            break;
                                        }
                                        case "video":{
                                            if (parseInt(element.attrs.fileSize) > 20971520){ // 20MB
                                                message += "【检测到大小大于20MB的视频，请到QQ下载】";
                                                valid_element = true;

                                                break;
                                            }

                                            const [file, type] = await getBinary(element.attrs.url);
                                            form.append("files[0]", file, element.attrs.file);
                                            valid_element = true;

                                            break;
                                        }
                                        default:{
                                            break;
                                        }
                                    }
                                }

                                if (!valid_element) return;

                                const bot = ctx.bots[`discord:${to.self_id}`];
                                
                                if ("quote" in message_data){
                                    // 不同平台之间回复 & 同平台之间回复
                                    const diff_platform_quote_message = await ctx.database.get("bridge_message", {
                                        to_message_id: message_data.quote.id,
                                        to_channel_id: message_data.quote.channel.id
                                    })
                                    const same_platform_quote_message = await ctx.database.get("bridge_message", {
                                        from_message_id: message_data.quote.id,
                                        from_channel_id: message_data.quote.channel.id
                                    });

                                    let quote_message = { type: diff_platform_quote_message.length != 0 ? "diff":"same", data: diff_platform_quote_message.length != 0 ? diff_platform_quote_message:same_platform_quote_message };

                                    if (quote_message.data.length != 0){
                                        let message = "";
                                        let image = {};
                                        let dc_message = null;
                                        let source = "";

                                        switch (quote_message["type"]){
                                            case "same":{ // 同平台之间回复
                                                dc_message = await bot.getMessage(quote_message["data"][0]["to_channel_id"], quote_message["data"][0]["to_message_id"]);
                                                source = "to";
                                                break;
                                            }
                                            case "diff":{ // 不同平台之间回复
                                                dc_message = await bot.getMessage(quote_message["data"][0]["from_channel_id"], quote_message["data"][0]["from_message_id"]);
                                                source = "from"
                                                break;
                                            }
                                        }

                                        if (source == "") return;
                                        
                                        for (let element of dc_message.elements){
                                            switch (element.type){
                                                case "text":{
                                                    message += element.attrs.content;
                                                    break;
                                                }
                                                case "img":{
                                                    image = {
                                                        url: element.attrs.src
                                                    }
                                                    break;
                                                }
                                                case "face":{
                                                    message += h.image(element.children[0].attrs.src);
                                                    break;
                                                }
                                            }
                                        }
                                        for (let word of config.words_blacklist){
                                            if (message.toLowerCase().indexOf(word.toLowerCase()) != -1) return; // 发现黑名单
                                        }
                                        embed = [{
                                            author: {
                                                name: dc_message["user"]["name"],
                                                icon_url: dc_message["user"]["avatar"]
                                            },
                                            timestamp: convertMsTimestampToISO8601(Number(quote_message["data"][0]["timestamp"])),
                                            description: `${message}\n\n[[ ↑ ]](https://discord.com/channels/${quote_message["data"][0][`${source}_guild_id`]}/${quote_message["data"][0][`${source}_channel_id`]}/${dc_message.id})`,
                                            color: 2605017,
                                            image: image
                                        }]
                                    }
                                }
                                
                                // 实现发送消息功能
                                if (nickname === null || nickname === "") nickname = sender.name;
                                const webhook = await (bot as unknown as DiscordBot).internal.createWebhook(to.channel_id, {name: "Bridge"});
                                const payload_json = JSON.stringify({
                                    content: message,
                                    username: `[QQ:${sender.id}] ${nickname}`,
                                    avatar_url: sender.avatar,
                                    embeds: embed
                                });
                                form.append("payload_json", payload_json);

                                try {
                                    const res = await ctx.http.post(`${webhook.url}?wait=true`, form);
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
                                } catch (error){
                                    logger.error(error);
                                } finally {
                                    await (bot as unknown as DiscordBot).internal.deleteWebhook(webhook.id);
                                }

                                continue;
                            }

                            // Discord -> QQ
                            const bot = ctx.bots[`${to.platform}:${to.self_id}`];
                            const dc_bot = ctx.bots[`discord:${from.self_id}`];

                            if (nickname != null && nickname.indexOf("TweetShift") != -1){ // 判断是否为 tweetshift
                                const msg = await dc_bot.internal.getChannelMessage(session.event.channel.id, message_data.id);
                                logger.info(msg);
                                
                                let message = "";
                                message += `${msg["content"]}\n${"description" in msg["embeds"][0] ? msg["embeds"][0]["description"]:""}`;
                                
                                for (let word of config.words_blacklist){
                                    if (message.toLowerCase().indexOf(word.toLowerCase()) != -1) return; // 发现黑名单
                                }

                                for (let embed of msg["embeds"]){
                                    if ("image" in embed) message += h.image(embed["image"]["url"]);
                                }

                                const message_id = await bot.sendMessage(to.channel_id, `${ h.image(msg["embeds"][0]["author"]["icon_url"].replace(".jpg", "_200x200.jpg")) }[Discord·TweetShift] ${msg["embeds"][0]["author"]["name"]}:\n${message}`);
                                const from_guild_id = await ctx.database.get("channel", {
                                    id: channel_id
                                });
                                const to_guild_id = await ctx.database.get("channel", {
                                    id: to.channel_id
                                });
                                await ctx.database.create("bridge_message", {
                                    timestamp: BigInt(Date.now()),
                                    from_message_id: message_data.id,
                                    from_platform: platform,
                                    from_channel_id: channel_id,
                                    from_guild_id: from_guild_id[0]["guildId"],
                                    from_sender_id: sender.id,
                                    from_sender_name: nickname,
                                    to_message_id: message_id[0],
                                    to_platform: "discord",
                                    to_channel_id: to.channel_id,
                                    to_guild_id: to_guild_id[0]["guildId"],
                                    onebot_real_message_id: message_id[0]
                                })

                                return;
                            }

                            let message = "";
                            let quoted_message_id = null;

                            if ("quote" in message_data){
                                // 不同平台之间回复 & 同平台之间回复
                                const diff_platform_quote_message = await ctx.database.get("bridge_message", {
                                    to_message_id: message_data.quote.id,
                                    to_channel_id: message_data.quote.channel.id
                                })
                                const same_platform_quote_message = await ctx.database.get("bridge_message", {
                                    from_message_id: message_data.quote.id,
                                    from_channel_id: message_data.quote.channel.id
                                });

                                let quote_message = diff_platform_quote_message.length != 0 ? diff_platform_quote_message:same_platform_quote_message;

                                if (quote_message.length != 0){
                                    quoted_message_id = quote_message[0]["onebot_real_message_id"];
                                }
                            }

                            for (let element of elements){
                                switch (element.type){
                                    case "text":{
                                        for (let word of config.words_blacklist){
                                            if (element.attrs.content.toLowerCase().indexOf(word.toLowerCase()) != -1) return; // 发现黑名单
                                        }
                                        
                                        message += element.attrs.content;
                                        break;
                                    }

                                    case "img":{
                                        message += h.image(element.attrs.src);
                                        break;
                                    }

                                    case "face":{
                                        message += h.image(element.children[0].attrs.src);
                                        break;
                                    }

                                    case "video":{
                                        if (parseInt(element.attrs.size) > 20971520){ // 20MB
                                            message += "【检测到大小超过20MB的视频，请到discord查看】"
                                            break;
                                        }
                                        message += h("video", { src: element.attrs.src });
                                        break;
                                    }

                                    default:{
                                        break;
                                    }
                                }
                            }

                            if (!sender.isBot && message.indexOf("vxtwitter.com") == -1 && (message.indexOf("twitter.com") != -1 || message.indexOf("x.com") != -1)) return; // 避免与机器人转写重复

                            // 获取 discord 昵称
                            let dc_nick = sender.isBot ? nickname:await dc_bot.internal.getUser(sender.id);

                            nickname = nickname === null ? dc_nick["global_name"]:nickname
                            let retry_count = 0;
                            while (1){
                                try {
                                    const message_id = await bot.sendMessage(to.channel_id, `${quoted_message_id == null ? "":h.quote(quoted_message_id)}${h.image(`${sender.avatar}?size=64`)}[Discord] ${nickname}:\n${message}`);
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
                                            to_platform: "discord",
                                            to_channel_id: to.channel_id,
                                            to_guild_id: to_guild_id[0]["guildId"],
                                            onebot_real_message_id: message_id[0]
                                        })
                                    } catch (error){
                                        logger.error(error);
                                    }
                                    
                                    break;
                                } catch (error){
                                    retry_count++;
                                    if (retry_count >= 3){
                                        logger.error(error);
                                        break;
                                    }

                                    logger.info(`发送消息失败，正在重试... (${retry_count}/3)`);
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                }
                            }
                        } catch (error){
                            logger.error(error);
                        }
                    }
                }
            }
        }
    })
}