import type { Metadata } from "next";
import { JetBrains_Mono, Manrope, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Finish Line — crown preparation check",
    template: "%s · Finish Line",
  },
  description:
    "Chairside check of crown-prep taper, wall height, undercuts, and reduction for dentists and dental students. STL geometry plus calibrated phone photos. Nothing is uploaded.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${manrope.variable} ${jetbrains.variable} antialiased`}>
        <SiteHeader />
        <main>{children}</main>
        <footer className="no-print border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6">
            Finish Line runs in this browser. Photographs and STL files stay on the device. It is a teaching aid, not a medical device, and it does not replace a calibrated scanner or your program’s rubric.
          </div>
        </footer>
      </body>
    </html>
  );
}
