import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Bank Heist — Logic Mystery',
  description:
    'Place the witnesses, identify the outlaws, and solve a spatial logic murder mystery.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
