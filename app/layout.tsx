import type { Metadata } from 'next';
import { Barlow_Condensed, Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  weight: ['500','600','700'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Touchline • DTR Esports & Vortex EC',
  description: 'Análise e gestão privada de EA Sports FC Clubs para DTR Esports e Vortex EC.',
  robots: {index:false,follow:false},
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${manrope.variable} ${barlowCondensed.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
