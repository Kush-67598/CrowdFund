import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crowdfund | Sepolia',
  description: 'An all-or-nothing crowdfunding campaign on Ethereum Sepolia.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
