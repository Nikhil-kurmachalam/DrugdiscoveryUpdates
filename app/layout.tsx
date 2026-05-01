export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Arial, sans-serif', background: '#0b1020', color: '#e6ecff', margin: 0 }}>
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
