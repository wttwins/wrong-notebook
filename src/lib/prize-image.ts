/**
 * 奖品图片存取
 *
 * 为什么不用 base64 直接存数据库：
 *   现有错题图是 `data:image/png;base64,...` 存在 ErrorItem.originalImageUrl 里，
 *   但奖品图会出现在「奖品墙」列表页，一张 500KB 的 base64 会被反复读进内存、
 *   塞进响应体。因此奖品图写入数据卷，数据库只存相对路径。
 *
 * 安全要求：
 *   1. 只接受 png / jpeg / webp
 *   2. 大小上限 2MB（base64 解码后）
 *   3. 校验文件头魔数，不能只信 data URL 里声明的类型
 *      （否则可以把任意文件改名成 .png 存进来）
 *   4. 文件名由服务端生成，绝不使用调用方提供的名字
 */
import fs, { type FileHandle } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const SUB_DIR = path.join('uploads', 'prizes');

type Ext = 'png' | 'jpg' | 'webp';

/** 通过文件头判断真实类型 */
function detectImageType(buf: Buffer): Ext | null {
    if (buf.length < 12) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    ) {
        return 'png';
    }

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return 'jpg';
    }

    // WEBP: "RIFF" .... "WEBP"
    if (
        buf.toString('ascii', 0, 4) === 'RIFF' &&
        buf.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return 'webp';
    }

    return null;
}

export class PrizeImageError extends Error {}

/**
 * 保存 base64 data URL 为文件。
 * @returns 相对数据卷的路径，如 `uploads/prizes/abc123.png`
 */
export async function savePrizeImageFromDataUrl(dataUrl: string): Promise<string> {
    const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
    if (!m) {
        throw new PrizeImageError('图片格式不正确（需要 base64 data URL）');
    }

    let buf: Buffer;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch {
        throw new PrizeImageError('图片数据无法解码');
    }

    if (buf.length === 0) {
        throw new PrizeImageError('图片内容为空');
    }
    if (buf.length > MAX_BYTES) {
        throw new PrizeImageError(`图片太大（${(buf.length / 1024 / 1024).toFixed(1)}MB），上限 2MB`);
    }

    const ext = detectImageType(buf);
    if (!ext) {
        throw new PrizeImageError('只支持 PNG / JPEG / WebP 图片');
    }

    const dir = path.join(process.cwd(), 'data', SUB_DIR);
    await fs.mkdir(dir, { recursive: true });

    const fileName = `${crypto.randomBytes(10).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(dir, fileName), buf, { flag: 'wx' });

    return path.posix.join('uploads', 'prizes', fileName);
}

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
};

/** Validate the entire relative path, never silently repair it with basename(). */
function imageLocation(relPath?: string | null) {
    if (typeof relPath !== 'string') return null;
    const match = /^uploads\/prizes\/([A-Za-z0-9_-]+\.(png|jpg|jpeg|webp))$/.exec(relPath);
    if (!match) return null;
    return {
        absolutePath: path.join(process.cwd(), 'data', SUB_DIR, match[1]),
        ext: match[2],
        mime: MIME_BY_EXT[match[2]],
    };
}

/** Read only supported regular image files whose extension agrees with magic bytes. */
export async function readPrizeImage(relPath?: string | null): Promise<{ data: Buffer; mime: string } | null> {
    const location = imageLocation(relPath);
    if (!location) return null;
    let file: FileHandle | undefined;
    try {
        file = await fs.open(location.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > MAX_BYTES) return null;
        const data = await file.readFile();
        const expectedType = location.ext === 'jpeg' ? 'jpg' : location.ext;
        if (data.length > MAX_BYTES || detectImageType(data) !== expectedType) return null;
        return { data, mime: location.mime };
    } catch {
        return null;
    } finally {
        await file?.close();
    }
}

/** Low-level removal. Database-backed callers must use the reference-safe wrapper. */
export async function deletePrizeImage(relPath?: string | null): Promise<void> {
    const location = imageLocation(relPath);
    if (!location) return;
    try {
        await fs.unlink(location.absolutePath);
    } catch {
        // 文件已不存在等情况忽略。
    }
}

type ImageReferenceReader = Pick<Prisma.TransactionClient, 'prize' | 'drawRecord'>;

/** Preserve files referenced by any Prize or any DrawRecord (not just this prize). */
export async function deletePrizeImageIfUnreferenced(relPath: string | null | undefined, db: ImageReferenceReader): Promise<void> {
    if (!relPath || !imageLocation(relPath)) return;
    const [prize, record] = await Promise.all([
        db.prize.findFirst({ where: { imagePath: relPath }, select: { id: true } }),
        db.drawRecord.findFirst({ where: { prizeImagePath: relPath }, select: { id: true } }),
    ]);
    if (!prize && !record) await deletePrizeImage(relPath);
}
