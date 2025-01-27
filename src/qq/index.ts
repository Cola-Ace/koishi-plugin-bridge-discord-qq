import { Bot, Context, Dict, h, Session } from "koishi";
import { getBinary, logger, getDate } from "../utils";
import { MessageBody, Config, BasicType } from "../config";
import { v4 as uuidv4 } from 'uuid';

// return stop = false 相当于 break

export default class ProcessorQQ {
  static async process(elements: h[], session: Session, config: Config, from: BasicType, to: BasicType, ctx: Context, dc_bot: Bot, message_body: MessageBody): Promise<[boolean, string]> { // stop, reason
    for (let element of elements) {
      switch (element.type) {
        case "at":{
          // https://github.com/Cola-Ace/koishi-plugin-bridge-discord-qq/issues/4
          if (element.attrs.type === "all"){
            message_body.text += "@全体成员";
            message_body.validElement = true;
            return [false, ""];
          }

          const [stop, reason] = await this.at(element.attrs.id, from.channel_id, session, message_body);
          if (stop) return [true, reason];

          break;
        }

        case "face": {
          const [stop, reason] = await this.face(element.children[0].attrs.src, message_body);
          if (stop) return [true, reason];

          break;
        }
        case "mface": {
          const [stop, reason] = await this.face(element.attrs.url, message_body);
          if (stop) return [true, reason];

          break;
        }
        case "file": {
          const [stop, reason] = await this.file(element.attrs, config.discord_file_limit, session, message_body, from.channel_id);
          if (stop) return [true, reason];

          break;
        }
        case "forward": {
          await this.forward(config.words_blacklist, to.channel_id, element.attrs.content, dc_bot, from, to, ctx);
          return [true, "done"];
        }
        case "img": {
          const [stop, reason] = await this.image(element.attrs.src, message_body);
          if (stop) return [true, reason];

          break;
        }
        case "json": {
          const [stop, reason] = this.json(element.attrs.data, message_body);
          if (stop) return [true, reason];

          break;
        }
        case "text": {
          const [stop, reason] = this.text(config.words_blacklist, element.attrs.content, message_body)
          if (stop) return [true, reason];

          break;
        }
        case "video": {
          const [stop, reason] = await this.video(element.attrs, config.discord_file_limit, message_body);
          if (stop) return [true, reason];

          break;
        }
        default: {
          break;
        }
      }
    }

    return [false, ""];
  }

  static async at(uid: string, group_id: string, session: Session, message_body: MessageBody): Promise<[boolean, string]> {
    const member = await session.onebot.getGroupMemberInfo(group_id, uid, true)

    // https://github.com/Cola-Ace/koishi-plugin-bridge-discord-qq/issues/6
    const name = member.card === "" ? member.nickname : member.card;
    message_body.text += `\`@${name}\``;
    message_body.validElement = true;

    return [false, ""];
  }

  static async face(url: string, message_body: MessageBody): Promise<[boolean, string]> {
    if (url === "") return [false, ""];
    const [blob, type] = await getBinary(url);
    message_body.form.append(`files[${message_body.n}]`, blob, `${uuidv4()}.${type.split("/")[1]}`);
    message_body.n++;
    message_body.validElement = true;

    return [false, ""];
  }

  static async file(attrs: Dict, discord_file_limit: number, session: Session, message_body: MessageBody, group_id: string): Promise<[boolean, string]> {
    if (parseInt(attrs.fileSize) > discord_file_limit) {
      message_body.text += "【检测到大小大于设置上限的文件，请到 QQ 下载】";
      message_body.validElement = true;

      return [false, ""];
    }

    // if (file_transform === undefined) {
    //   message_body.text += "【检测到文件，请到 QQ 下载】";
    //   message_body.valid_element = true;

    //   return [false, ""];
    // }
    try {
      /* with file-transform service
      const res = await session.onebot.getImage(attrs.fileId);
      const filename = res["file"].split("/").pop();
      const [file, type] = await getBinary(`${file_transform.url}/${file_transform.token}/${filename}`);
      if (file === null) {
        message_body.text += "【文件传输失败，请联系管理员】";
        message_body.valid_element = true;

        return [false, ""];
      }

      message_body.form.append(`files[${message_body.n}]`, file, res["file_name"]);
      message_body.n++;
      message_body.valid_element = true;
      */

      const url = await session.onebot.getGroupFileUrl(group_id, attrs.fileId, 102);
      const filename = attrs.file;

      const [file, type, error] = await getBinary(`${url}${filename}`);
      if (error !== null){
        message_body.text += "【文件传输失败，请联系管理员】";
        message_body.validElement = true;

        return [false, ""];
      }

      message_body.form.append(`files[${message_body.n}]`, file, filename);
      message_body.n++;
      message_body.validElement = true;
      message_body.hasFile = true;
      message_body.text += "【检测到文件，若没有收到请前往q群查看】";
    } catch (error) {
      logger.info(error);
      message_body.text += "【文件传输失败，请联系管理员】";
      message_body.validElement = true;
    }

    return [false, ""];
  }

  static async forward(blacklist: Array<string>, channel_id: string, contents: Array<object>, dc_bot: Bot, from: BasicType, to: BasicType, ctx: Context): Promise<void> {
    const thread = await dc_bot.internal.startThreadWithoutMessage(channel_id, { name: `转发消息 ${getDate()}`, type: 11 });
    await dc_bot.internal.modifyChannel(thread.id, { locked: true });

    for (let content of contents) { // 单条消息
      let message_body: MessageBody = { text: "", form: new FormData(), n: 0, embed: null, validElement: false, hasFile: false };
      let bridge_message = false;
      let avatar = "";
      let nickname = "";
      if (content["sender"]["user_id"] === from.self_id) bridge_message = true;

      for (let element of content["message"]) {
        switch (element.type) {
          // face 和 mface 在转发消息中都为表情名称 (text)
          case "forward": {
            message_body.text += "【检测到嵌套合并转发消息，请前往 QQ 查看】";
            message_body.validElement = true;

            break;
          }
          case "image": {
            if (bridge_message && avatar === "") {
              avatar = element["data"]["url"];

              break;
            }
            await this.image(element["data"]["url"], message_body);

            break;
          }
          case "json": {
            this.json(element["data"]["data"], message_body);

            break;
          }
          case "text": {
            if (bridge_message && nickname === "") {
              const temp = element["data"]["text"].split(`[Discord${element["data"]["text"].indexOf("[Discord·TweetShift]") !== -1 ? "·TweetShift" : ""}] `)[1].split(":");
              nickname = temp[0];
              temp.splice(0, 1)
              this.text(blacklist, temp.join(""), message_body);

              break;
            }
            this.text(blacklist, element["data"]["text"], message_body)

            break;
          }
        }
      }

      if (!message_body.validElement) continue;

      // 实现发送消息功能
      let webhook_url = "";
      let webhook_id = "";
      let has_webhook = false;
      const webhooks_list = await dc_bot.internal.getChannelWebhooks(channel_id);

      for (let webhook of webhooks_list) {
        if (webhook["user"]["id"] === to.self_id && "url" in webhook) {
          webhook_url = webhook["url"];
          webhook_id = webhook["id"];
          has_webhook = true;
        }
      }

      if (!has_webhook) {
        const webhook = await dc_bot.internal.createWebhook(channel_id, { name: "Bridge" });
        webhook_url = webhook["url"];
        webhook_id = webhook["id"];
      }

      const payload_json = JSON.stringify({
        content: message_body.text,
        username: nickname === "" ? `[QQ:${content["sender"]["user_id"]}] ${content["sender"]["nickname"]}` : nickname,
        avatar_url: avatar === "" ? `https://q.qlogo.cn/headimg_dl?dst_uin=${content["sender"]["user_id"]}&spec=640` : avatar,
        embeds: message_body.embed
      });
      message_body.form.append("payload_json", payload_json);

      try {
        await ctx.http.post(`${webhook_url}?wait=true&thread_id=${thread.id}`, message_body.form);
      } catch (error) {
        logger.error(error);
      }

      if (!has_webhook) {
        await dc_bot.internal.deleteWebhook(webhook_id);
      }
    }
  }

  static async image(url: string, message_body: MessageBody): Promise<[boolean, string]> {
    const [blob, type] = await getBinary(url);
    message_body.form.append(`files[${message_body.n}]`, blob, `${uuidv4()}.${type.split("/")[1]}`);
    message_body.n++;
    message_body.validElement = true;

    return [false, ""];
  }

  static json(raw: string, message_body: MessageBody): [boolean, string] {
    const data = JSON.parse(raw);
    switch (data["app"]) {
      case "com.tencent.structmsg": {
        let image = {};

        if ("preview" in data["meta"]["news"]) image = { url: data["meta"]["news"]["preview"] };

        message_body.embed = [{
          author: {
            name: data["meta"]["news"]["title"],
          },
          description: `${data["meta"]["news"]["desc"]}\n\n[点我跳转](${data["meta"]["news"]["jumpUrl"]})`,
          footer: {
            text: data["meta"]["news"]["tag"],
            icon_url: data["meta"]["news"]["source_icon"]
          },
          color: 2605017,
          image
        }];
        message_body.validElement = true;

        break;
      }
      case "com.tencent.miniapp_01": {
        let image = {
          url: `https://${data["meta"]["detail_1"]["preview"]}`
        };

        message_body.embed = [{
          description: `${data["meta"]["detail_1"]["desc"]}\n\n[点我跳转](${data["meta"]["detail_1"]["qqdocurl"]})`,
          author: {
            name: data["meta"]["detail_1"]["title"],
            icon_url: data["meta"]["detail_1"]["icon"]
          },
          color: 2605017,
          image
        }];
        message_body.validElement = true;

        break;
      }
      case "com.tencent.forum": {
        const detail = data["meta"]["detail"];
        const feed = detail["feed"];

        let image = {
          url: feed["images"][0]["pic_url"]
        }

        message_body.embed = [{
          description: `${feed["title"]["contents"][0]["text_content"]["text"]}\n\n*浏览 ${feed["view_count"]} | 赞 ${feed["prefer_count"]}*\n\n[点我跳转](${detail["jump_url"]})`,
          author: {
            name: detail["channel_info"]["guild_name"],
            icon_url: detail["channel_info"]["guild_icon"]
          },
          footer: {
            text: "腾讯频道"
          },
          color: 2605017,
          image
        }];
        message_body.validElement = true;

        break;
      }
    }
    return [false, ""];
  }

  static text(blacklist: Array<string>, message_content: string, message_body: MessageBody): [boolean, string] {
    for (let word of blacklist) {
      if (message_content.toLowerCase().indexOf(word.toLowerCase()) != -1) return [true, "found blacklist words"];
    }

    message_body.text += message_content;
    message_body.validElement = true;

    return [false, ""];
  }

  static async video(attrs: Dict, discord_file_limit: number, message_body: MessageBody): Promise<[boolean, string]> {
    if (parseInt(attrs.fileSize) > discord_file_limit) {
      message_body.text += "【检测到大小大于设置上限的视频，请到 QQ 下载】";
      message_body.validElement = true;

      return [false, ""];
    }

    const [file, type] = await getBinary(attrs.url);
    message_body.form.append(`files[${message_body.n}]`, file, attrs.file);
    message_body.n++;
    message_body.validElement = true;
    message_body.hasFile = true;
    message_body.text += "【检测到文件，若没有收到请前往 QQ 查看】";

    return [false, ""];
  }
}
