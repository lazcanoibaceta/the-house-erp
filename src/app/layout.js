import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "The House ERP",
  description: "Sistema interno The House",
};

export default async function RootLayout({ children }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {user && <Navbar />}
        {children}
      </body>
    </html>
  )
}