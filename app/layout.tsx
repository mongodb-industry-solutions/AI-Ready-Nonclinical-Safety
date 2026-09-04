import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nonclinical Safety Intelligence',
  description: 'AI-ready SEND safety signal investigation on MongoDB, Kehrnel and Magenta.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
