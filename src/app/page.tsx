export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Săn Vé</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Theo dõi giá vé máy bay nội địa và nhận thông báo khi có vé rẻ. Đang xây dựng — Phase 1: nền móng.
      </p>
      <a className="text-sm underline underline-offset-4" href="/api/health">
        Kiểm tra trạng thái hệ thống
      </a>
    </main>
  );
}
