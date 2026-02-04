import { NextRequest, NextResponse } from 'next/server';
import { handleX402Payment, X402_PRICES, isX402Configured } from '@/lib/x402';
import { redis } from '@/lib/redis';

/**
 * Agent-to-Agent Payment Endpoint
 *
 * Enables agents to pay each other for services via x402.
 * The receiving agent registers their service, paying agents call it.
 *
 * Flow:
 * 1. Agent A registers a service with a price
 * 2. Agent B calls the service endpoint with x402 payment
 * 3. Payment settles to Agent A's wallet
 * 4. Service response returned to Agent B
 *
 * This enables an agent economy where agents can:
 * - Sell data/analytics to other agents
 * - Offer AI processing services
 * - Trade information about the world
 */

const REDIS_AGENT_SERVICES = 'world:agent-services';

interface AgentService {
  agentAddress: string;
  serviceName: string;
  description: string;
  price: string;
  endpoint?: string;
  createdAt: number;
}

/**
 * GET /api/world/agent-pay
 *
 * List all registered agent services
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentFilter = searchParams.get('agent');

    // Get all registered services
    const servicesRaw = await redis.hgetall(REDIS_AGENT_SERVICES);
    const services: AgentService[] = [];

    if (servicesRaw) {
      for (const [key, value] of Object.entries(servicesRaw)) {
        try {
          const service = JSON.parse(value as string) as AgentService;
          if (!agentFilter || service.agentAddress.toLowerCase() === agentFilter.toLowerCase()) {
            services.push(service);
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    return NextResponse.json({
      success: true,
      services,
      totalServices: services.length,
      x402Configured: isX402Configured(),
      info: {
        description: 'Agent-to-agent payment services via x402',
        register: 'POST with { action: "register", ... }',
        call: 'POST with { action: "call", serviceId: "..." }',
      },
    });

  } catch (err: any) {
    console.error('[AgentPay] Error:', err);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch services',
    }, { status: 500 });
  }
}

/**
 * POST /api/world/agent-pay
 *
 * Actions:
 * - register: Register a new agent service
 * - call: Call an agent's service (requires x402 payment)
 * - unregister: Remove a service
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'register':
        return handleRegister(body);
      case 'call':
        return handleCall(req, body);
      case 'unregister':
        return handleUnregister(body);
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: register, call, or unregister',
        }, { status: 400 });
    }

  } catch (err: any) {
    console.error('[AgentPay] Error:', err);
    return NextResponse.json({
      success: false,
      error: 'Agent payment error: ' + (err.message || 'Unknown'),
    }, { status: 500 });
  }
}

async function handleRegister(body: any) {
  const { agentAddress, serviceName, description, price, endpoint } = body;

  if (!agentAddress || !serviceName || !description || !price) {
    return NextResponse.json({
      success: false,
      error: 'Missing required fields: agentAddress, serviceName, description, price',
    }, { status: 400 });
  }

  // Validate price format
  if (!price.startsWith('$') || isNaN(parseFloat(price.slice(1)))) {
    return NextResponse.json({
      success: false,
      error: 'Price must be in format: $0.001',
    }, { status: 400 });
  }

  // Verify agent is registered in world
  const isAgent = await redis.sismember('world:agents', agentAddress.toLowerCase());
  if (!isAgent) {
    return NextResponse.json({
      success: false,
      error: 'Only registered world agents can offer services. Enter the world first.',
    }, { status: 403 });
  }

  const serviceId = `${agentAddress.toLowerCase()}-${serviceName.toLowerCase().replace(/\s+/g, '-')}`;

  const service: AgentService = {
    agentAddress: agentAddress.toLowerCase(),
    serviceName,
    description,
    price,
    endpoint,
    createdAt: Date.now(),
  };

  await redis.hset(REDIS_AGENT_SERVICES, { [serviceId]: JSON.stringify(service) });

  console.log(`[AgentPay] Service registered: ${serviceName} by ${agentAddress} at ${price}`);

  return NextResponse.json({
    success: true,
    message: `Service "${serviceName}" registered successfully`,
    serviceId,
    service,
    callEndpoint: `/api/world/agent-pay?serviceId=${serviceId}`,
  });
}

async function handleCall(req: NextRequest, body: any) {
  const { serviceId, callerAddress, payload } = body;

  if (!serviceId) {
    return NextResponse.json({
      success: false,
      error: 'Missing serviceId',
    }, { status: 400 });
  }

  // Get service details
  const serviceRaw = await redis.hget(REDIS_AGENT_SERVICES, serviceId);
  if (!serviceRaw) {
    return NextResponse.json({
      success: false,
      error: 'Service not found',
    }, { status: 404 });
  }

  const service = JSON.parse(serviceRaw as string) as AgentService;

  // Check x402 configuration
  if (!isX402Configured()) {
    return NextResponse.json({
      success: false,
      error: 'x402 payments not configured',
      service,
    }, { status: 503 });
  }

  // Handle x402 payment
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://fcempowertours-production-6551.up.railway.app';
  const resourceUrl = `${BASE_URL}/api/world/agent-pay?serviceId=${serviceId}`;

  const result = await handleX402Payment(
    req,
    resourceUrl,
    service.price,
    'POST'
  );

  // If payment not settled, return 402
  if (result.status !== 200) {
    return new NextResponse(
      JSON.stringify({
        ...result.responseBody,
        service: {
          name: service.serviceName,
          description: service.description,
          price: service.price,
          provider: service.agentAddress,
        },
      }),
      {
        status: result.status,
        headers: {
          'Content-Type': 'application/json',
          ...(result.responseHeaders || {}),
        },
      }
    );
  }

  // Payment successful - log the transaction
  console.log(`[AgentPay] Service called: ${service.serviceName}`);
  console.log(`[AgentPay] Caller: ${callerAddress || 'unknown'}, Provider: ${service.agentAddress}`);
  console.log(`[AgentPay] Payment: ${service.price}, Receipt: ${result.paymentReceipt}`);

  // Record the transaction
  const transaction = {
    serviceId,
    serviceName: service.serviceName,
    caller: callerAddress,
    provider: service.agentAddress,
    price: service.price,
    paymentReceipt: result.paymentReceipt,
    timestamp: Date.now(),
    payload,
  };

  await redis.lpush('world:agent-payments', JSON.stringify(transaction));
  await redis.ltrim('world:agent-payments', 0, 999); // Keep last 1000

  // If service has an endpoint, forward the request
  if (service.endpoint) {
    try {
      const forwardRes = await fetch(service.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: callerAddress, payload, paid: true }),
      });
      const forwardData = await forwardRes.json();
      return NextResponse.json({
        success: true,
        paid: true,
        price: service.price,
        paymentReceipt: result.paymentReceipt,
        serviceResponse: forwardData,
      });
    } catch (err) {
      // Endpoint failed but payment succeeded
      return NextResponse.json({
        success: true,
        paid: true,
        warning: 'Service endpoint unreachable, but payment was successful',
        price: service.price,
        paymentReceipt: result.paymentReceipt,
      });
    }
  }

  // No endpoint - just confirm payment
  return NextResponse.json({
    success: true,
    message: `Service "${service.serviceName}" called successfully`,
    paid: true,
    price: service.price,
    paymentReceipt: result.paymentReceipt,
    provider: service.agentAddress,
  });
}

async function handleUnregister(body: any) {
  const { agentAddress, serviceId } = body;

  if (!agentAddress || !serviceId) {
    return NextResponse.json({
      success: false,
      error: 'Missing agentAddress or serviceId',
    }, { status: 400 });
  }

  // Get service to verify ownership
  const serviceRaw = await redis.hget(REDIS_AGENT_SERVICES, serviceId);
  if (!serviceRaw) {
    return NextResponse.json({
      success: false,
      error: 'Service not found',
    }, { status: 404 });
  }

  const service = JSON.parse(serviceRaw as string) as AgentService;

  if (service.agentAddress.toLowerCase() !== agentAddress.toLowerCase()) {
    return NextResponse.json({
      success: false,
      error: 'Only the service owner can unregister',
    }, { status: 403 });
  }

  await redis.hdel(REDIS_AGENT_SERVICES, serviceId);

  console.log(`[AgentPay] Service unregistered: ${serviceId}`);

  return NextResponse.json({
    success: true,
    message: `Service "${service.serviceName}" unregistered`,
  });
}
