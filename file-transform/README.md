# 使用说明
- `valid_token` 为 koishi 访问时需要在路径中添加的用于验证的值，建议随机生成一个
- `temp` 为 NapCat 的 temp 文件夹，里面存放着从 `go-cqhttp` 扩展API中的 `download_file` 下载的文件，一般路径为 `/path/to/QQ/NapCat/temp`

# 注意事项
1. 使用前记得打开 `index.js` 把第4行的 `valid_token `的值和第5行的 `temp_path` 的值替换了
2. 基于 `NapCat` 编写，理论上只要你的QQ机器人支持 `go-cqhttp` 的扩展API就可以使用
