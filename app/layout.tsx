import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Enterprise Ergonomic Posture AI',
  description: 'Enterprise Healthcare/Ergonomics software using Next.js, React, Tailwind CSS, and TensorFlow.js/MediaPipe Pose Detection.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
