import { NextResponse } from 'next/server';
import { notFound } from '@/lib/api-errors';
import { readPrizeImage } from '@/lib/prize-image';

/** Shared strict serving for both mutable Prize and historical DrawRecord URLs. */
export async function prizeImageResponse(imagePath?: string | null): Promise<NextResponse> {
    const image = await readPrizeImage(imagePath);
    if (!image) return notFound('Image not found');
    return new NextResponse(new Uint8Array(image.data), {
        status: 200,
        headers: {
            'Content-Type': image.mime,
            'Content-Length': String(image.data.length),
            'Cache-Control': 'private, no-cache',
            'Vary': 'Cookie',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
