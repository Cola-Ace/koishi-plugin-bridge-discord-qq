import { Logger } from 'koishi';

export const logger = new Logger("bridge");
export function convertMsTimestampToISO8601(msTimestamp: number): string {
  // 创建一个 Date 对象，传入毫秒级的时间戳
  const date = new Date(msTimestamp);

  // 使用 .toISOString() 方法转换为 ISO 8601 格式
  // 注意：此方法返回的是 UTC 时间
  return date.toISOString();
}

export function getDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export async function getBinary(url: string): Promise<[Blob, string, string]> {
  try {
    const headers = new Headers({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    });

    const response = await fetch(url, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status} | Response: ${response.text} | end`);
    }
    return [await response.blob(), response.headers.get("Content-Type"), null];
  } catch (error) {
    return [null, null, error];
  }
}

export class BlacklistDetector {
  private blacklist: string[];

  constructor(blacklist: string[]) {
    this.blacklist = blacklist;
  }

  public check(input: string): boolean {
    for (const word of this.blacklist) {
      if (input.toLowerCase().indexOf(word.toLowerCase()) !== -1) return true;
    }
    return false;
  }
}

// 步骤 1: 将 Blob 转换为 ArrayBuffer
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

// 步骤 2: 将 ArrayBuffer 转换为 Buffer
function arrayBufferToBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(arrayBuffer);
}

// 步骤 3: 将 Buffer 转换为 Base64
function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

export async function converter(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blobToArrayBuffer(blob);
    const buffer = arrayBufferToBuffer(arrayBuffer);
    const base64 = bufferToBase64(buffer);
    return base64;
  } catch (error) {
    console.error('转换过程中发生错误:', error);
    throw error;
  }
}
