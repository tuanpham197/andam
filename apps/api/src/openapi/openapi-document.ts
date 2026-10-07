import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { writeFile } from 'node:fs/promises';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('App thực đơn ăn dặm API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Writes the OpenAPI document consumed by orval (packages/api-client). */
export async function exportOpenApi(filePath: string): Promise<void> {
  const { createApp } = await import('../bootstrap.js');
  const app = await createApp();
  await app.init();
  try {
    await writeFile(filePath, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
  } finally {
    await app.close();
  }
}
