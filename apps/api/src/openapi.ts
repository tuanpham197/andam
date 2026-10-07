import 'dotenv/config';
import { resolve } from 'node:path';
import { exportOpenApi } from './openapi/openapi-document.js';

await exportOpenApi(resolve('openapi.json'));
