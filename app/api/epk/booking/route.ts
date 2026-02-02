import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { encodeFunctionData, parseEther, type Address } from 'viem';
import { sendUserSafeTransaction } from '@/lib/user-safe';
import { EPK_INQUIRY_PREFIX, EPK_REGISTRY_ADDRESS } from '@/lib/epk/constants';
import type { BookingInquiry } from '@/lib/epk/types';
import EPKRegistryABI from '@/lib/abis/EPKRegistry.json';
import ERC20ABI from '@/lib/abis/ERC20.json';

const redis = Redis.fromEnv();

const PINATA_JWT = process.env.PINATA_JWT;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;

/**
 * POST /api/epk/booking - Create a booking with WMON deposit
 * Body: { inquiry: BookingInquiry, userAddress: string, depositAmount: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { inquiry, userAddress, depositAmount } = await req.json();

    if (!inquiry || !userAddress || !inquiry.artistAddress) {
      return NextResponse.json({ error: 'inquiry, userAddress, and artistAddress required' }, { status: 400 });
    }

    const inquiryId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bookingInquiry: BookingInquiry = {
      ...inquiry,
      id: inquiryId,
      status: 'inquiry',
      createdAt: Date.now(),
    };

    // If deposit amount provided, process on-chain booking
    let txHash: string | null = null;
    let bookingId: number | null = null;

    if (depositAmount && parseFloat(depositAmount) > 0 && EPK_REGISTRY_ADDRESS && WMON_ADDRESS) {
      try {
        const depositWei = parseEther(depositAmount);

        // Upload event details to IPFS
        const eventDetailsCid = await uploadEventDetailsToIPFS({
          name: inquiry.name,
          company: inquiry.company,
          eventName: inquiry.eventName,
          eventDate: inquiry.eventDate,
          location: inquiry.location,
          eventType: inquiry.eventType,
          expectedAttendance: inquiry.expectedAttendance,
          message: inquiry.message,
        });

        // Approve WMON spending + create booking in one batch
        const approveData = encodeFunctionData({
          abi: ERC20ABI,
          functionName: 'approve',
          args: [EPK_REGISTRY_ADDRESS as Address, depositWei],
        });

        const bookingData = encodeFunctionData({
          abi: EPKRegistryABI,
          functionName: 'createBooking',
          args: [inquiry.artistAddress as Address, depositWei, eventDetailsCid || ''],
        });

        const result = await sendUserSafeTransaction(userAddress, [
          { to: WMON_ADDRESS, value: 0n, data: approveData },
          { to: EPK_REGISTRY_ADDRESS as Address, value: 0n, data: bookingData },
        ]);

        txHash = result.txHash;
        bookingInquiry.status = 'deposited';
        bookingInquiry.depositAmount = depositAmount;
        bookingInquiry.txHash = txHash;

        console.log('[EPK Booking] On-chain booking created:', txHash);
      } catch (chainError: any) {
        console.error('[EPK Booking] On-chain booking failed:', chainError.message);
        // Still save the inquiry
      }
    }

    // Store inquiry in Redis (private data, not on-chain)
    await redis.set(
      `${EPK_INQUIRY_PREFIX}${inquiry.artistAddress}:${inquiryId}`,
      JSON.stringify(bookingInquiry),
      { ex: 60 * 60 * 24 * 90 } // 90 days TTL
    );

    return NextResponse.json({
      success: true,
      inquiryId,
      txHash,
      bookingId,
      status: bookingInquiry.status,
    });
  } catch (error: any) {
    console.error('[EPK Booking] Error:', error);
    return NextResponse.json({ error: error.message || 'Booking failed' }, { status: 500 });
  }
}

/**
 * GET /api/epk/booking?artist=0x... - List bookings for an artist
 */
export async function GET(req: NextRequest) {
  try {
    const artistAddress = req.nextUrl.searchParams.get('artist');
    if (!artistAddress) {
      return NextResponse.json({ error: 'artist address required' }, { status: 400 });
    }

    // Get all inquiries for this artist from Redis
    const keys = await redis.keys(`${EPK_INQUIRY_PREFIX}${artistAddress}:*`);
    const inquiries: BookingInquiry[] = [];

    for (const key of keys) {
      const data = await redis.get<string>(key);
      if (data) {
        try {
          inquiries.push(typeof data === 'string' ? JSON.parse(data) : data);
        } catch {
          // Skip malformed entries
        }
      }
    }

    // Sort by creation date descending
    inquiries.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ success: true, inquiries });
  } catch (error: any) {
    console.error('[EPK Booking] List error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function uploadEventDetailsToIPFS(details: Record<string, any>): Promise<string | null> {
  if (!PINATA_JWT) return null;

  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: { ...details, timestamp: Date.now() },
        pinataMetadata: { name: `booking-details-${Date.now()}` },
      }),
    });

    const data = await response.json();
    return data.IpfsHash || null;
  } catch {
    return null;
  }
}
