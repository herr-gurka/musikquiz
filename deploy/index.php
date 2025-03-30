<?php
// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Debug information
$debug = array(
    'REQUEST_URI' => $_SERVER['REQUEST_URI'],
    'SCRIPT_NAME' => $_SERVER['SCRIPT_NAME'],
    'DOCUMENT_ROOT' => $_SERVER['DOCUMENT_ROOT'],
    '__DIR__' => __DIR__,
    'files_in_dir' => scandir(__DIR__)
);

// Get the request URI
$uri = $_SERVER['REQUEST_URI'];
$debug['original_uri'] = $uri;

// Check if this is a static file request
if (strpos($uri, '_next/') !== false) {
    // Get the path relative to this directory
    $relativePath = str_replace('/musikquiz/', '', $uri);
    $filePath = __DIR__ . '/' . ltrim($relativePath, '/');
    
    $debug['static_file_request'] = array(
        'uri' => $uri,
        'relative_path' => $relativePath,
        'file_path' => $filePath,
        'file_exists' => file_exists($filePath),
        'directory_exists' => is_dir(dirname($filePath))
    );
    
    if (file_exists($filePath)) {
        $ext = pathinfo($filePath, PATHINFO_EXTENSION);
        switch ($ext) {
            case 'js':
                header('Content-Type: application/javascript');
                break;
            case 'css':
                header('Content-Type: text/css');
                break;
            case 'woff2':
                header('Content-Type: font/woff2');
                break;
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
                header('Content-Type: image/' . $ext);
                break;
        }
        readfile($filePath);
        exit;
    }
    
    // If we get here, the file wasn't found
    header("HTTP/1.0 404 Not Found");
    echo "<!-- Debug information for static file:\n";
    echo print_r($debug, true);
    echo "\n-->";
    exit;
}

// Load configuration
require_once __DIR__ . '/config.php';

// Find the correct path to index.html
$indexPath = __DIR__ . '/index.html';

if (!file_exists($indexPath)) {
    die('Error: Cannot find index.html at ' . $indexPath . "\nDebug info:\n" . print_r($debug, true));
}

// Read and output the HTML content
$html = file_get_contents($indexPath);

// Add debug info as HTML comment
echo "<!-- Debug info:\n" . print_r($debug, true) . "\n-->\n";

// Inject Spotify credentials into the HTML
$spotifyScript = sprintf(
    '<script>window.ENV = { SPOTIFY_CLIENT_ID: "%s", SPOTIFY_CLIENT_SECRET: "%s" };</script>',
    htmlspecialchars($spotify_client_id, ENT_QUOTES),
    htmlspecialchars($spotify_client_secret, ENT_QUOTES)
);

// Insert the script just before </head>
$html = str_replace('</head>', $spotifyScript . '</head>', $html);

// Output the modified HTML
echo $html; 