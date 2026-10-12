import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'智竞 AI Arena · 数据标注 / 训练 / 运行 / 输出',description:'上传图片标注，浏览器内真实训练分类或检测模型，运行识别并把结果输出到 ESP32 小车。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
