export default function ProjectDetailLoading() {
  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-blue-600 text-white px-4 py-3 z-40 flex items-center gap-3">
        <span className="text-xl">←</span>
        <div className="h-5 bg-blue-400 rounded w-48 animate-pulse" />
      </header>
      <div className="px-4 py-3 space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
          <div className="h-2 bg-gray-200 rounded-full" />
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
            <div className="h-1.5 bg-gray-200 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
