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

export interface MessageBody {
    text: string,
    form: FormData,
    n: number,
    embed: any,
    valid_element: boolean,
}

export const Config: Schema<Config> = Schema.object({
    words_blacklist: Schema.array(String).description("屏蔽词"),
    debug: Schema.boolean().description("是否开启debug模式").default(false),
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