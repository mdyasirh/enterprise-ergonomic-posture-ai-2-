'use client';

import { useState, useRef } from 'react';
import Screen1Guide from '@/components/Screen1Guide';
import Screen2Capture from '@/components/Screen2Capture';
import Screen3Results from '@/components/Screen3Results';
import { Camera, Upload } from 'lucide-react';

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<0 | 1 | 2 | 3>(0);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLiveCapture = () => {
    setCurrentScreen(1);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCapturedImages([event.target.result as string]);
          setCurrentScreen(3);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNextToCapture = () => {
    setCurrentScreen(2);
  };

  const handleBackToGuide = () => {
    setCurrentScreen(1);
  };

  const handleCapture = (imageSrcs: string[]) => {
    setCapturedImages(imageSrcs);
    setCurrentScreen(3);
  };

  const handleBackToHome = () => {
    setCapturedImages([]);
    setCurrentScreen(0);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {currentScreen === 0 && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">ErgoVision AI</h1>
              <p className="mt-3 text-slate-500">Enterprise Posture Assessment</p>
            </div>

            <div className="space-y-4 mt-12">
              <button
                onClick={handleLiveCapture}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-xl shadow-sm transition-all active:scale-[0.98]"
              >
                <Camera className="w-5 h-5" />
                Live Guided Capture
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-4 px-6 rounded-xl border border-slate-200 shadow-sm transition-all active:scale-[0.98]"
              >
                <Upload className="w-5 h-5" />
                Upload Static Image
              </button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
            </div>
          </div>
        </div>
      )}
      {currentScreen === 1 && <Screen1Guide onNext={handleNextToCapture} onBack={handleBackToHome} />}
      {currentScreen === 2 && (
        <Screen2Capture 
          onBack={handleBackToGuide} 
          onCapture={(src) => handleCapture([src])} 
        />
      )}
      {currentScreen === 3 && capturedImages.length > 0 && (
        <Screen3Results 
          imageSrcs={capturedImages} 
          onAnalyzeAnother={handleBackToHome} 
        />
      )}
    </div>
  );
}
