import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle, Upload, Plus, Image as ImageIcon } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

interface Point {
  x: number;
  y: number;
}

interface Angles {
  neckFlexion: number;
  trunkLean: number;
}

interface AnalysisResult {
  originalSrc: string;
  annotatedSrc?: string;
  angles?: Angles;
  rosaScore?: number;
  error?: string;
}

export default function Screen3Results({
  imageSrcs: initialImageSrcs,
  onBack,
  onAnalyzeAnother,
}: {
  imageSrcs: string[];
  onBack: () => void;
  onAnalyzeAnother: () => void;
}) {
  const [imageSrcs, setImageSrcs] = useState<string[]>(initialImageSrcs);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let isMounted = true;

    const runAnalysis = async () => {
      try {
        setIsAnalyzing(true);
        setErrorMsg(null);

        await tf.setBackend('webgl');
        await tf.ready();

        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
          runtime: 'tfjs',
          enableSmoothing: true,
          modelType: 'full'
        };
        const detector = await poseDetection.createDetector(model, detectorConfig as any);

        const newResults: AnalysisResult[] = [];

        for (const src of imageSrcs) {
          if (results.find(r => r.originalSrc === src)) {
            newResults.push(results.find(r => r.originalSrc === src)!);
            continue;
          }

          const img = new Image();
          img.src = src;
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error("Failed to load image"));
          });

          if (!isMounted) return;

          const poses = await detector.estimatePoses(img);
          
          if (poses.length > 0) {
            const pose = poses[0];
            const keypoints = pose.keypoints;

            const leftEar = keypoints.find((k) => k.name === 'left_ear');
            const rightEar = keypoints.find((k) => k.name === 'right_ear');
            const leftShoulder = keypoints.find((k) => k.name === 'left_shoulder');
            const rightShoulder = keypoints.find((k) => k.name === 'right_shoulder');
            const leftHip = keypoints.find((k) => k.name === 'left_hip');
            const rightHip = keypoints.find((k) => k.name === 'right_hip');

            const leftConfidence = (leftEar?.score || 0) + (leftShoulder?.score || 0) + (leftHip?.score || 0);
            const rightConfidence = (rightEar?.score || 0) + (rightShoulder?.score || 0) + (rightHip?.score || 0);

            const isLeft = leftConfidence > rightConfidence;
            
            const ear = isLeft ? leftEar : rightEar;
            const shoulder = isLeft ? leftShoulder : rightShoulder;
            const hip = isLeft ? leftHip : rightHip;

            if (ear && shoulder && hip && (ear.score || 0) > 0.3 && (shoulder.score || 0) > 0.3 && (hip.score || 0) > 0.3) {
              const calculateAngle = (p1: Point, p2: Point) => {
                const dx = p1.x - p2.x;
                const dy = p2.y - p1.y; // Y is inverted to fix canvas axis
                let angle = Math.atan2(dx, dy) * (180 / Math.PI);
                if (!isLeft) {
                  angle = -angle;
                }
                return angle;
              };

              const neckFlexion = calculateAngle(ear, shoulder);
              const trunkLean = calculateAngle(shoulder, hip);

              let score = 1;
              if (trunkLean > 15 || trunkLean < -15) score += 2;
              if (neckFlexion > 20) score += 2;

              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              
              if (ctx) {
                ctx.drawImage(img, 0, 0);

                ctx.strokeStyle = '#10b981'; // emerald-500
                ctx.lineWidth = Math.max(2, img.naturalWidth / 200);
                ctx.fillStyle = '#10b981';

                const drawPoint = (p: Point) => {
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, Math.max(3, img.naturalWidth / 150), 0, 2 * Math.PI);
                  ctx.fill();
                };

                const drawLine = (p1: Point, p2: Point) => {
                  ctx.beginPath();
                  ctx.moveTo(p1.x, p1.y);
                  ctx.lineTo(p2.x, p2.y);
                  ctx.stroke();
                };

                const adjacentPairs = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.BlazePose);
                adjacentPairs.forEach(([i, j]) => {
                  const kp1 = keypoints[i];
                  const kp2 = keypoints[j];
                  if ((kp1.score || 0) > 0.5 && (kp2.score || 0) > 0.5) {
                    drawLine(kp1, kp2);
                  }
                });

                keypoints.forEach(kp => {
                  if ((kp.score || 0) > 0.5) {
                    drawPoint(kp);
                  }
                });

                ctx.font = `${Math.max(16, img.naturalWidth / 30)}px Arial`;
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#000000';
                ctx.shadowBlur = 4;
                ctx.fillText(`Neck: ${Math.round(neckFlexion)}°`, ear.x + 15, ear.y);
                ctx.fillText(`Trunk: ${Math.round(trunkLean)}°`, shoulder.x + 15, shoulder.y);

                const annotatedSrc = canvas.toDataURL('image/jpeg', 0.8);
                newResults.push({
                  originalSrc: src,
                  annotatedSrc,
                  angles: { neckFlexion, trunkLean },
                  rosaScore: score
                });
              }
            } else {
              newResults.push({ originalSrc: src, error: "Could not detect necessary body parts." });
            }
          } else {
            newResults.push({ originalSrc: src, error: "No person detected." });
          }
        }

        if (isMounted) {
          setResults(newResults);
          setIsAnalyzing(false);
        }
      } catch (error: any) {
        console.error('Error analyzing pose:', error);
        if (isMounted) {
          setErrorMsg(error.message || "An error occurred during analysis.");
          setIsAnalyzing(false);
        }
      }
    };

    runAnalysis();

    return () => {
      isMounted = false;
    };
  }, [imageSrcs]);

  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const readers = files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      Promise.all(readers).then(newSrcs => {
        setImageSrcs(prev => [...prev, ...newSrcs]);
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="flex items-center justify-between p-4 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold ml-2 text-slate-900">Results & Analysis</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onAnalyzeAnother} className="text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors">
            Analyze Another
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-sm font-medium bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors">
            <Upload className="w-4 h-4" /> Batch Upload
          </button>
          <input
            type="file"
            accept="image/jpeg, image/png, image/heic"
            multiple
            ref={fileInputRef}
            onChange={handleBatchUpload}
            className="hidden"
          />
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {isAnalyzing && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500 space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="font-medium">Analyzing Posture...</p>
          </div>
        ) : errorMsg && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-red-500 space-y-4 p-6 text-center">
            <AlertTriangle className="w-12 h-12" />
            <p className="font-medium">{errorMsg}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
            {results.map((result, index) => (
              <div key={index} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 flex flex-col">
                <div className="relative w-full bg-slate-900 aspect-video flex items-center justify-center overflow-hidden">
                  {result.annotatedSrc ? (
                    <img src={result.annotatedSrc} alt="Annotated" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <img src={result.originalSrc} alt="Original" className="max-w-full max-h-full object-contain opacity-50" />
                  )}
                  {result.error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white p-4 text-center">
                      <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
                      <p className="text-sm font-medium text-red-400">{result.error}</p>
                    </div>
                  )}
                  {isAnalyzing && !result.annotatedSrc && !result.error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                      <RefreshCw className="w-6 h-6 animate-spin text-white" />
                    </div>
                  )}
                </div>

                {result.angles && result.rosaScore !== undefined && (
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-baseline justify-between mb-6">
                      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">ROSA Score</h2>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-4xl font-bold text-slate-900">{result.rosaScore}</span>
                        <span className={`text-sm font-medium ${result.rosaScore <= 2 ? 'text-emerald-600' : result.rosaScore <= 4 ? 'text-amber-600' : 'text-red-600'}`}>
                          {result.rosaScore <= 2 ? 'IDEAL' : result.rosaScore <= 4 ? 'WARNING' : 'HIGH RISK'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 flex-1">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div>
                          <div className="font-medium text-slate-900 text-sm">Neck Flexion</div>
                          <div className="text-xs text-slate-500">Should be ≤ 20°</div>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${result.angles.neckFlexion <= 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {Math.round(result.angles.neckFlexion)}°
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <div>
                          <div className="font-medium text-slate-900 text-sm">Trunk Lean</div>
                          <div className="text-xs text-slate-500">Between -15° and 15°</div>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${result.angles.trunkLean >= -15 && result.angles.trunkLean <= 15 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {Math.round(result.angles.trunkLean)}°
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <details className="text-xs text-slate-500">
                        <summary className="cursor-pointer hover:text-slate-700 font-medium">View Raw JSON Payload</summary>
                        <pre className="mt-2 p-3 bg-slate-900 text-slate-300 rounded-lg overflow-x-auto">
{JSON.stringify({
  timestamp: new Date().toISOString(),
  angles: {
    neck_flexion_deg: Number(result.angles.neckFlexion.toFixed(2)),
    trunk_lean_deg: Number(result.angles.trunkLean.toFixed(2))
  },
  iso_9241_compliance: {
    neck_ok: result.angles.neckFlexion <= 20,
    trunk_ok: result.angles.trunkLean >= -15 && result.angles.trunkLean <= 15
  }
}, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
