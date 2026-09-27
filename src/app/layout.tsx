import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "SeeGuide | Live Visual Troubleshooting",
    description: "Talk through a problem with live camera guidance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" dir="ltr">
            <body>{children}</body>
        </html>
    );
}
