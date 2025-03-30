import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Music Quiz Generator',
  description: 'Test your music knowledge across different eras',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.ENV = { SPOTIFY_CLIENT_ID: "${process.env.SPOTIFY_CLIENT_ID}", SPOTIFY_CLIENT_SECRET: "${process.env.SPOTIFY_CLIENT_SECRET}" };`
            }}
          />
        )}
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
