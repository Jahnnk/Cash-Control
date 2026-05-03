import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Yayi's Cash Control",
  description: "Control de caja real para los 3 negocios de Yayi's",
};

/**
 * Root layout: SIN sidebar. Cada scope (/[negocio]/, /grupo/) tiene su
 * propio layout que monta el Sidebar. La pantalla raíz (selector de
 * negocio) tampoco tiene sidebar — vive solo y limpia.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
