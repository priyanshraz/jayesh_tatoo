import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Tattoo Studio — AI Automation Dashboard",
  description:
    "AI-powered advertising and marketing automation dashboard for tattoo and piercing studios. Manage competitor analysis, ad creation, campaigns, social posts, and reports — all connected to n8n automation.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body style={{ fontFamily: "var(--font-inter), system-ui, -apple-system, sans-serif" }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
