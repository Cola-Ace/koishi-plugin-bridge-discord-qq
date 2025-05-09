export interface MessageBody {
  // 消息正文
  text: string,

  // 存放图片等文件的表单数据
  form: FormData,

  // 当前表单数据内的文件数量
  n: number,

  // 存放 Discord 的 Embed 消息
  embed: Array<object>,

  // 当前消息体是否存在可发送的元素
  validElement: boolean,

  // 当前消息体是否存在文件
  hasFile: boolean
}
