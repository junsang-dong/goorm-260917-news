import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from '../../../server/api-plugin.ts';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await handleApi(req, res);
}
