import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unidad de Gestión Integral · Colonia y COYFD C.C.B.A.",
  description:
    "Asistencia y gestión de listados de Colonia y COYFD · Club Ciudad de Buenos Aires",
  icons: {
    icon: "/escudo-ccba.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
