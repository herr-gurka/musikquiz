// app/api/process-job-worker/route.ts
import { NextRequest, NextResponse } from 'next/server';
// Import the correct verifySignature for App Router
// import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"; 
// import { Redis } from "@upstash/redis";
// Update import path for shared types/functions
// import { 
//   Song, 
//   ProcessedSong, 
//   fallbackToSpotify, 
//   getReleaseData 
// } from '@/app/utils/processing'; 

const JOB_EXPIRATION = 3600; // 1 hour

// Initialize Redis client (same as in process-songs)
// const redisClient = new Redis({
//   url: process.env.KV_REST_API_URL || '',
//   token: process.env.KV_REST_API_TOKEN || '',
// });

// Main handler for the worker route
async function handler(request: NextRequest) {
  console.log('[Worker - DEBUG] Function Invoked!'); // Log immediately

  try {
    // Try parsing, but don't rely on it yet
    const rawBody = await request.text();
    console.log('[Worker - DEBUG] Received Raw Body:', rawBody);
    // const body = JSON.parse(rawBody);
    // console.log('[Worker - DEBUG] Parsed Body:', body);

    // Don't interact with Redis or process songs for now

    console.log('[Worker - DEBUG] Returning Success');
    return NextResponse.json({ success: true, message: "Debug response" });

  } catch (error) {
    console.error('[Worker - DEBUG] Error in simplified handler:', error);
    return NextResponse.json({ error: 'Simplified worker failed' }, { status: 500 });
  }
}

// --- Wrap the handler with QStash signature verification ---
// Temporarily commenting out verification for debugging
// export const POST = verifySignatureAppRouter(handler); 

// Export the raw handler directly for testing
export const POST = handler;

// --- Optional: Configure Edge Runtime ---
// export const runtime = 'edge'; // Now more likely to work

// --- Optional: Set max duration ---
// export const maxDuration = 300; // Vercel Pro plan needed for longer durations