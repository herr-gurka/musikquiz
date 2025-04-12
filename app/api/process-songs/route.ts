import { NextResponse, NextRequest } from 'next/server';
import { Redis } from "@upstash/redis"; // Import Upstash Redis client
import { v4 as uuidv4 } from 'uuid'; // Import uuid for job IDs
import { Client } from "@upstash/qstash"; // Add QStash Client import
import { 
  Song, 
  ProcessedSong, 
  fallbackToSpotify, 
  getReleaseData 
} from '@/app/utils/processing';

const JOB_EXPIRATION = 3600; // 1 hour in seconds

// Initialize Redis client using environment variables
const redisClient = new Redis({
  url: process.env.KV_REST_API_URL || '', // Use Vercel's standard env var names
  token: process.env.KV_REST_API_TOKEN || '',
});

// --- API Endpoint --- 
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { firstSong, remainingSongs }: { firstSong: Song, remainingSongs: Song[] } = payload;

    if (!firstSong || !Array.isArray(remainingSongs)) {
      return NextResponse.json({ error: 'Invalid payload structure.' }, { status: 400 });
    }

    console.log(`Received request: Process 1 song now, ${remainingSongs.length} in background.`);

    // --- Process First Song --- (Keep this logic as before)
    console.log(`Processing first song synchronously: "${firstSong.title}"`);
    let processedFirstSong: ProcessedSong;
    try {
        processedFirstSong = await getReleaseData(firstSong);
    } catch (error) {
        console.error(`Critical error processing first song ${firstSong.title}:`, error);
        processedFirstSong = fallbackToSpotify(firstSong);
    }
    if (!processedFirstSong.releaseYear || processedFirstSong.releaseYear === 'N/A') {
        console.warn(`First song "${firstSong.title}" could not be processed with a valid year. Using fallback data.`);
    }

    // --- Enqueue Background Job via QStash --- (NEW LOGIC)
    const jobId = uuidv4();
    const statusKey = `job:${jobId}:status`;

    // 1. Set initial status in Redis
    try {
      await redisClient.set(statusKey, 'queued', { ex: JOB_EXPIRATION });
      console.log(`[Job ${jobId}] Initial status set to 'queued' in Redis.`);
    } catch (redisError) {
      console.error(`[Job ${jobId}] Failed to set initial 'queued' status:`, redisError);
      // Consider returning error
    }

    // 2. Publish job to QStash worker
    if (remainingSongs.length > 0) {
      try {
        const qstashClient = new Client({ token: process.env.QSTASH_TOKEN! });
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const workerUrl = `${baseUrl}/api/process-job-worker`;
        console.log(`[Job ${jobId}] Publishing job to QStash worker: ${workerUrl}`);
        await qstashClient.publishJSON({
          url: workerUrl,
          body: {
            jobId: jobId,
            songsToProcess: remainingSongs
          },
        });
        console.log(`[Job ${jobId}] Successfully published job for ${remainingSongs.length} songs to QStash.`);
      } catch (qstashError) {
        console.error(`[Job ${jobId}] Failed to publish job to QStash:`, qstashError);
        await redisClient.set(statusKey, 'publish_failed', { ex: JOB_EXPIRATION });
        // Consider returning error
      }
    } else {
        console.log(`[Job ${jobId}] No remaining songs, setting status directly to 'complete'.`);
        await redisClient.set(statusKey, 'complete', { ex: JOB_EXPIRATION });
    }

    // --- Return Initial Response --- (Keep as before)
    return NextResponse.json({
        processedSong: processedFirstSong,
        jobId: jobId
    });

  } catch (error) {
    console.error('Error in POST /api/process-songs:', error);
    return NextResponse.json({ error: 'Failed to process songs request' }, { status: 500 });
  }
} 