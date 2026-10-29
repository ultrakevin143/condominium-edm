import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Condo desk",
  description: "Fictional condominium EDM demonstration",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
