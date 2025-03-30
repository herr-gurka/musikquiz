<?php
// Spotify API credentials
$spotify_client_id = 'ae5d015fdb8a489ea76abc35956b0d0f';
$spotify_client_secret = 'f84b1ba136d843af8c3dd2136db6d537';

// Make these available as environment variables
putenv("SPOTIFY_CLIENT_ID=" . $spotify_client_id);
putenv("SPOTIFY_CLIENT_SECRET=" . $spotify_client_secret); 