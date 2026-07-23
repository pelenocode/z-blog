import Link from "next/link";

export default function NotFound() {
  return (
    <section className="py-16 text-center">
      <h1 className="text-2xl font-semibold mb-2">页面不见了</h1>
      <p className="text-[hsl(var(--muted))]">
        你可以返回 <Link href="/">首页</Link> 继续浏览。
      </p>
    </section>
  );
}
