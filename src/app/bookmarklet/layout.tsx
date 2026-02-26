export const metadata = {
  title: "Save to xMomentsLater",
};

export default function BookmarkletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <style>{`
          :root {
            --background: 20 14.3% 4.1%;
            --foreground: 60 9.1% 97.8%;
            --muted-foreground: 24 5.4% 63.9%;
            --primary: 20.5 90.2% 48.2%;
            --primary-foreground: 60 9.1% 97.8%;
            --secondary: 12 6.5% 15.1%;
            --secondary-foreground: 60 9.1% 97.8%;
            --destructive: 0 72.2% 50.6%;
            --accent: 12 6.5% 15.1%;
            --accent-foreground: 60 9.1% 97.8%;
            --border: 12 6.5% 15.1%;
            --ring: 20.5 90.2% 48.2%;
            --popover: 20 14.3% 4.1%;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: hsl(var(--background));
            color: hsl(var(--foreground));
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
