import type { Metadata } from 'next';
import { Lexend_Deca, Source_Code_Pro, Source_Serif_4 } from 'next/font/google';
import './globals.css';

// MongoDB's bespoke brand faces (Value Serif / Euclid Circular A) are licensed
// and not redistributable, so we use the Google fallbacks the brand book names.
const euclid = Lexend_Deca({ subsets: ['latin'], variable: '--font-euclid', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif', display: 'swap', weight: ['400', '500', '600'] });
const code = Source_Code_Pro({ subsets: ['latin'], variable: '--font-code', display: 'swap', weight: ['400', '600'] });

export const metadata: Metadata = {
  title: 'Nonclinical Safety Intelligence · MongoDB Solution Library',
  description: 'Self-contained AI-ready SEND safety signal investigation on MongoDB and Magenta.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${euclid.variable} ${serif.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        {/* Applied before first paint so a stored light preference does not flash dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nonclinical-safety-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
