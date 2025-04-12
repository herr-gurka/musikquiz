// app/api/process-job-worker/route.ts
import { NextRequest, NextResponse } from 'next/server';
// Import the correct verifySignature for App Router
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs"; 
import { Redis } from "@upstash/redis";
// Update import path for shared types/functions
import { 
  Song, 
  ProcessedSong, 
  fallbackToSpotify, 
  getReleaseData 
} from '@/app/utils/processing'; 

const JOB_EXPIRATION = 3600; // 1 hour

// Initialize Redis client (same as in process-songs)
const redisClient = new Redis({
  url: process.env.KV_REST_API_URL || '',
  token: process.env.KV_REST_API_TOKEN || '',
});

// Main handler for the worker route
async function handler(request: NextRequest) {
  let jobId: string | null = null;
  let songsToProcess: Song[] = [];

  try {
    // QStash sends the original body as a string, parse it
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    jobId = body.jobId;
    songsToProcess = body.songsToProcess;

    if (!jobId || !Array.isArray(songsToProcess)) {
      console.error('[Worker] Invalid job payload:', body);
      return NextResponse.json({ error: 'Invalid job payload' }, { status: 400 });
    }

    console.log(`[Worker Job ${jobId}] Received job for ${songsToProcess.length} songs.`);

    const statusKey = `job:${jobId}:status`;
    const resultsKey = `job:${jobId}:results`;
    const totalSongs = songsToProcess.length;

    // --- Set status to processing ---
    try {
      await redisClient.set(statusKey, 'processing', { ex: JOB_EXPIRATION });
      console.log(`[Worker Job ${jobId}] Status set to 'processing'.`);
    } catch (redisError) {
      console.error(`[Worker Job ${jobId}] Failed to set 'processing' status:`, redisError);
      // Allow processing to continue, but log the error
    }

    // --- Process Songs ---
    for (let i = 0; i < songsToProcess.length; i++) {
      const song = songsToProcess[i];
      console.log(`[Worker Job ${jobId}] Processing song ${i + 1}/${totalSongs}: "${song.title}"`);
      try {
        const processedSong = await getReleaseData(song); // Process the song
        await redisClient.rpush(resultsKey, JSON.stringify(processedSong));
        console.log(`[Worker Job ${jobId}] Stored result for "${song.title}"`);
        // Optional: Add delay if needed (Discogs rate limit is handled within getReleaseData now)
        // await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (songError) {
        console.error(`[Worker Job ${jobId}] Error processing song "${song.title}":`, songError);
        const errorMessage = songError instanceof Error ? songError.message : 'Unknown error';
        const errorResult = { ...fallbackToSpotify(song), error: `Failed to process: ${errorMessage}` };
        await redisClient.rpush(resultsKey, JSON.stringify(errorResult));
      }
    }

    console.log(`[Worker Job ${jobId}] Finished processing loop.`);

    // --- Set status to complete ---
    try {
      await redisClient.set(statusKey, 'complete', { ex: JOB_EXPIRATION });
      console.log(`[Worker Job ${jobId}] Status set to 'complete'.`);
    } catch (redisError) {
      console.error(`[Worker Job ${jobId}] Failed to set 'complete' status:`, redisError);
    }

    // --- Return success response to QStash ---
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(`[Worker Job ${jobId || 'UNKNOWN'}] Unhandled error in worker:`, error);
    // Attempt to mark job as failed if possible
    if (jobId) {
      try {
        const statusKey = `job:${jobId}:status`;
        await redisClient.set(statusKey, 'worker_failed', { ex: JOB_EXPIRATION });
      } catch (redisError) {
        // Ignore error setting failure status
      }
    }
    return NextResponse.json({ error: 'Worker processing failed' }, { status: 500 });
  }
}

// --- Wrap the handler with QStash signature verification ---
// Use the App Router version of the wrapper
export const POST = verifySignatureAppRouter(handler);

// --- Optional: Configure Edge Runtime ---
// export const runtime = 'edge'; // Now more likely to work

// --- Optional: Set max duration ---
// export const maxDuration = 300; // Vercel Pro plan needed for longer durations