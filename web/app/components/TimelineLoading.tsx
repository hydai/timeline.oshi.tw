export default function TimelineLoading({ name }: { name?: string }) {
  return (
    <div role="status" className="glass mx-auto mt-6 max-w-2xl rounded-2xl p-6 text-center text-text-secondary">
      {name ? `正在載入 ${name} 的直播時間軸…` : "載入中…"}
    </div>
  );
}
