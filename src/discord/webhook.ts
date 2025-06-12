import { Bot } from "koishi";

export async function getWebhook(dc_bot: Bot, self_id: string, channel_id: string): Promise<[string, string, boolean]> {
	let webhook_url = "";
	let webhook_id = "";
	let hasWebhook = false;
	const webhooks_list = await dc_bot.internal.getChannelWebhooks(channel_id);

	for (const webhook of webhooks_list) {
		if (webhook["user"]["id"] === self_id && "url" in webhook) {
			webhook_url = webhook["url"];
			webhook_id = webhook["id"];
			hasWebhook = true;
		}
	}

	if (!hasWebhook) {
		const webhook = await dc_bot.internal.createWebhook(channel_id, { name: "Bridge" });
		webhook_url = webhook["url"];
		webhook_id = webhook["id"];
	}

  return [webhook_url, webhook_id, hasWebhook];
}
