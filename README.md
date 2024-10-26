# koishi-plugin-bridge-discord-qq
[![npm](https://img.shields.io/npm/v/koishi-plugin-bridge-qq-discord?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-bridge-qq-discord)

让discord和qq的消息互通  
目前为自用插件，现有功能应该能正常使用，如果你需要了解使用这个插件的方法可以联系我  

# 注意事项
该程序在discord上使用webhook发送消息以营造尽可能沉浸的对话，根据 2024.8.20 的 Discord 官方回复，目前webhook存在如下限制：

- 每个Webhook最多可以每2秒发送5个请求
- 每2秒最多创建或删除5次Webhook
- 每个频道每分钟最多发送30次请求

如果你的消息量超过了官方的限制，那么你很有可能会触发`rate limit`限制，从而导致无法正常发送消息
以下为官方回复原文：  

> I just heard back from the team and the rate limit on webhooks is 5 requests every two seconds per webhook ID. This limit is also applied to webhook creation and deletion. Moreover, there is a limit of 30 requests per minute per channel.

# 更新日志
wait

# 功能列表
1. QQ
    - [x] 消息同步
    - [x] 回复消息同步
    - [x] @消息同步
    - [x] 图片,gif同步
    - [x] 表情同步
    - [x] 文件同步
    - [x] 视频同步
    - [x] 合并转发消息同步 
2. Discord
    - [x] 消息同步
    - [x] 回复消息同步
    - [x] 图片,gif同步
    - [x] 表情同步
    - [x] 文件同步
    - [x] 视频同步
