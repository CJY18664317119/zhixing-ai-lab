import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '智行 AI Lab · 小车教学工作台', description: '从第一张标注，到第一次智行。高中生本地 AI 实验室。' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN"><body>{children}</body></html>; }
