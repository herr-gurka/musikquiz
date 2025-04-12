import { NextRequest } from 'next/server';
// import { kv } from "@vercel/kv";
import { Redis } from "@upstash/redis"; // Import Upstash Redis client
import { ProcessedSong } from '../process-songs/route'; // Import the type

// Initialize Redis client using environment variables
const redis = new Redis({
  url: process.env.KV_REST_API_URL || '', // Use Vercel's standard env var names
  token: process.env.KV_REST_API_TOKEN || '',
});

// Set timeout for the SSE connection (e.g., 60 seconds) - adjust as needed
// Vercel Hobby plan might have shorter timeouts for Edge Functions
export const maxDuration = 60; 

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return new Response('Missing jobId parameter', { status: 400 });
  }

  console.log(`[SSE ${jobId}] Client connected.`);

  const stream = new ReadableStream({
    async start(controller) {
      let intervalId: NodeJS.Timeout | null = null;
      let lastSentIndex = 0; // Track index of the last result sent
      const resultsKey = `${jobId}:results`;
      const statusKey = `${jobId}:status`;

      // Function to send SSE messages
      const sendEvent = (event: string, data: string) => {
        try {
            // Check if controller is still active before enqueueing
            if (controller.desiredSize === null || controller.desiredSize > 0) {
                 controller.enqueue(`event: ${event}\ndata: ${data}\n\n`);
            } else {
                 console.warn(`[SSE ${jobId}] Controller closed, cannot enqueue event: ${event}`);
                 if (intervalId) clearInterval(intervalId);
            }
        } catch (e) {
            console.error(`[SSE ${jobId}] Error enqueueing event ${event}:`, e);
            if (intervalId) clearInterval(intervalId);
        }
      };

      // Function to check for updates and send them
      const checkUpdates = async () => {
        let resultsSentInThisCheck = false;
        let currentResultsLength = 0;
        let status: string | null = null;
        try {
          // 1. Fetch results
          const results = await redis.lrange<ProcessedSong>(resultsKey, 0, -1); 
          const currentResults: ProcessedSong[] = results
              .filter((song): song is ProcessedSong => song !== null && typeof song === 'object' && song.title !== undefined)
              .reverse(); 
          currentResultsLength = currentResults.length; // Use length of *parsed* results
              
          console.log(`[SSE ${jobId}] Parsed ${currentResultsLength} results from Redis.`);

          // 2. Send any new results
          let resultsSentNow = 0;
          if (currentResultsLength > lastSentIndex) {
            console.log(`[SSE ${jobId}] Parsed results length ${currentResultsLength} > lastSentIndex ${lastSentIndex}. Sending new ones.`);
            const newResults = currentResults.slice(lastSentIndex);
            resultsSentNow = newResults.length;
            newResults.forEach(song => {
              sendEvent('song', JSON.stringify(song)); 
              console.log(`[SSE ${jobId}] Sent song: ${song.title}`);
            });
            lastSentIndex = currentResultsLength;
          } else {
              console.log(`[SSE ${jobId}] No new valid results found. Parsed count=${currentResultsLength}, lastSentIndex=${lastSentIndex}`);
          }

          // 3. Fetch the status
          const statusResult = await redis.get(statusKey);
          status = typeof statusResult === 'string' ? statusResult : null;
          console.log(`[SSE ${jobId}] Fetched status: ${status}`);

          // 4. Check if job is finished (using the correctly typed status variable)
          // Only consider explicit terminal states as 'finished' for closing logic initially
          const isJobFinished = (status === 'complete' || status === 'failed' || status === 'init_failed');
          // Note: status === null now means the job hasn't started writing status yet, so keep polling.
          console.log(`[SSE ${jobId}] isJobFinished=${isJobFinished}, status=${status}, resultsSentNow=${resultsSentNow}, lastSentIndex=${lastSentIndex}, currentResultsLength=${currentResultsLength}`);

          // 5. Close ONLY if job is finished AND all results stored have been sent
          if (isJobFinished && lastSentIndex === currentResultsLength) {
             // Use the actual status found for the 'done' event, or 'unknown' if somehow null slips through?
             const finalStatus = status || 'finished_unexpected_null'; 
             console.log(`[SSE ${jobId}] Condition met: Job finished (${finalStatus}) and all ${currentResultsLength} results sent. Closing connection.`);
             sendEvent('done', finalStatus);
             if (intervalId) clearInterval(intervalId);
             try { controller.close(); } catch (e) { /* Ignore */ }
             return; // Stop the interval checks
          } else if (isJobFinished && lastSentIndex < currentResultsLength) {
              console.log(`[SSE ${jobId}] Condition NOT met: Job finished (${status}) BUT more results to send (${lastSentIndex}/${currentResultsLength}). Continuing poll.`);
          } else if (status === null) {
              console.log(`[SSE ${jobId}] Condition NOT met: Job status is null (likely not started/initialized yet). Continuing poll.`);
          } else {
              console.log(`[SSE ${jobId}] Condition NOT met: Job status is ${status}. Continuing poll.`);
          }

        } catch (error) {
           console.error(`[SSE ${jobId}] Error checking updates:`, error);
           sendEvent('error', JSON.stringify({ message: 'Error checking job status' }));
           if (intervalId) clearInterval(intervalId);
           try { controller.close(); } catch (e) { /* Ignore */ }
        }
      };

      // Start the interval checks
      intervalId = setInterval(checkUpdates, 1000); // Check every second

      // Cleanup on stream close
      controller.close = async () => {
        if (intervalId) clearInterval(intervalId);
        try { await redis.del(resultsKey, statusKey); } catch (e) { /* Ignore */ }
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}