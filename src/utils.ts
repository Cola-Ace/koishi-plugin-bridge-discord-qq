import { Logger } from 'koishi';

export const logger = new Logger("bridge");
export function convertMsTimestampToISO8601(msTimestamp: number): string {
    // 创建一个 Date 对象，传入毫秒级的时间戳
    const date = new Date(msTimestamp);
  
    // 使用 .toISOString() 方法转换为 ISO 8601 格式
    // 注意：此方法返回的是 UTC 时间
    return date.toISOString();
}

export async function getBinary(url: string): Promise<[Blob, String] | null> {
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

// export function generateSnowflake(): string {
//     let timestamp = BigInt(Date.now());
//     timestamp -= 1420070400000n;
//     return (timestamp << 22n).toString();
// }