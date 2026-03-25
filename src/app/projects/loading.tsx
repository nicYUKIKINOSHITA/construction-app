export default function ProjectsLoading() {
  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-blue-600 text-white px-3 py-2 z-40">
        <h1 className="text-base font-bold">案件一覧</h1>
      </header>
      <div className="p-2 space-y-1.5">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 px-3 py-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="h-4 bg-gray-200 rounded flex-1" />
              <div className="h-3 bg-gray-200 rounded w-10" />
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5" />
              <div className="h-3 bg-gray-200 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
