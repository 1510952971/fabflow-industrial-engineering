import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "Facility Construction Management Software",
    description: "面向半导体厂务工程师的流体选型、算量、合规校验与 BOM 平台",
    openGraph: { title: "Facility Construction Management Software", description: "现代化厂务流体选型、算量、校验与 BOM 工作台", images: [{ url: imageUrl, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "Facility Construction Management Software", description: "现代化厂务流体选型、算量、校验与 BOM 工作台", images: [imageUrl] },
  };
}
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body>{children}</body></html>; }
