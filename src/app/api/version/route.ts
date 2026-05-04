import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return NextResponse.json({ version: packageJson.version });
  } catch {
    return NextResponse.json({ version: 'unknown' });
  }
}
