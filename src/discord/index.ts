import { h } from 'koishi';

export default class ProcessorDiscord {
  static processTweetshift(msgDetail: object, elements: Array<object>, blacklists: string[]): [boolean, string] {
    let message = "";
    for (const element of elements) {
      if (element["type"] === "text") {
        message += `${element["attrs"]["content"]}\n`;
      }
    }
    message += `===== 以下为推文内容 =====\n${"description" in msgDetail["embeds"][0] ? msgDetail["embeds"][0]["description"] : ""}`;

    for (const word of blacklists) {
      if (message.toLowerCase().indexOf(word.toLowerCase()) !== -1) return [true, ""]; // 发现黑名单
    }

    // 处理链接中的日文
    message = message.replace("/リゼロ", "/%E3%83%AA%E3%82%BC%E3%83%AD").replace("/りゼロ", "/%E3%82%8A%E3%82%BC%E3%83%AD ");

    for (const embed of msgDetail["embeds"]) {
      if ("image" in embed) message += h.image(embed["image"]["url"]);
    }

    message = `${h.image(msgDetail["embeds"][0]["author"]["icon_url"].replace(".jpg", "_200x200.jpg"))}[Discord·TweetShift] ${msgDetail["embeds"][0]["author"]["name"]}:\n${message}`;

    return [false, message];
  }
}
