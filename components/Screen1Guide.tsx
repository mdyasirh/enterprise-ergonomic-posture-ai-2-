import { ArrowLeft } from 'lucide-react';

export default function Screen1Guide({ onNext, onBack }: { onNext: () => void, onBack: () => void }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <header className="flex items-center p-4 border-b border-slate-200">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold ml-2">Photo Capture Guide</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="relative rounded-xl overflow-hidden bg-slate-100 aspect-video flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
          {/* Placeholder for hero image */}
          <div className="text-slate-400 font-medium">Office Scene Placeholder</div>
          <div className="absolute bottom-4 left-4 right-4 z-20 text-white text-sm font-medium">
            You need 2 people for this step: Accurate posture assessment requires a side-view photo.
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <h2 className="font-semibold text-slate-800 mb-3">Person A - You</h2>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 text-sm">
              <li>Sit exactly as you normally work.</li>
              <li>Place hands on keyboard/mouse.</li>
              <li>Look at screen naturally.</li>
              <li>Maintain your natural posture.</li>
            </ol>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <h2 className="font-semibold text-slate-800 mb-3">Person B - Photo Taker</h2>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 text-sm">
              <li>Hold phone at worker&apos;s eye level.</li>
              <li>Stand at worker&apos;s side (90° angle).</li>
              <li>Ensure full body visible in frame.</li>
              <li>Wait for validation.</li>
            </ol>
          </div>
        </div>
      </main>

      <div className="p-4 border-t border-slate-100 bg-white">
        <button
          onClick={onNext}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-colors"
        >
          I Understand
        </button>
      </div>
    </div>
  );
}
