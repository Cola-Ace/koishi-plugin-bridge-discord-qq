import { Schema } from 'koishi';

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
  debug: boolean,
  download_threads: number,
  qq_file_limit: number,
  discord_file_limit: number,
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

export interface MessageBody {
  text: string,
  form: FormData,
  n: number,
  embed: Array<object>,
  validElement: boolean,
  hasFile: boolean
}

export const Config: Schema<Config> = Schema.object({
  words_blacklist: Schema.array(String).description("屏蔽词"),
  debug: Schema.boolean().description("是否开启debug模式").default(false),
  download_threads: Schema.number().description("下载文件时的默认线程数").default(4),
  qq_file_limit: Schema.number().description("QQ文件上传大小上限，单位为字节").default(20971520),
  discord_file_limit: Schema.number().description("Discord文件上传大小上限，单位为字节（该选项不应设置太高，避免超过 discord 本身的限制）").default(10485760).max(26214400),
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
