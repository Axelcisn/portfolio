// app/api/ibkr/health/route.js
// Endpoint to check IBKR connection status
import { checkConnection } from '../../../../lib/services/ibkrService.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const status = await checkConnection();
  return Response.json(status, { status: 200 });
}
