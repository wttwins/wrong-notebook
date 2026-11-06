/** Small inline PNG fixtures; files are only written beneath mkdtemp scratch. */
export const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=',
    'base64',
);
export const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
