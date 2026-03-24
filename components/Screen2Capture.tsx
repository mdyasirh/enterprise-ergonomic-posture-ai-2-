import { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { ArrowLeft, Image as ImageIcon, Sun, Smartphone, Activity, Camera, AlertTriangle } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

export default function Screen2Capture({
  onBack,
  onCapture,
  onBatchUpload,
}: {
  onBack: () => void;
  onCapture: (imageSrc: string) => void;
  onBatchUpload: (imageSrcs: string[]) => void;
}) {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  const orientationRef = useRef({ alpha: 0, beta: 90, gamma: 0 });
  
  const [step1Sagittal, setStep1Sagittal] = useState(false);
  const [step2LensHeight, setStep2LensHeight] = useState(false);
  const [step3Pitch, setStep3Pitch] = useState(false);
  const [step4Roll, setStep4Roll] = useState(false);
  const [step5Distance, setStep5Distance] = useState(false);
  const [step6Illuminance, setStep6Illuminance] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState(0);
  const [timeoutError, setTimeoutError] = useState(false);
  const [flash, setFlash] = useState(false);

  const detectorRef = useRef<poseDetection.PoseDetector | null>(null);
  const requestRef = useRef<number | null>(null);
  const stabilityStartTimeRef = useRef<number | null>(null);
  const sessionStartTimeRef = useRef<number>(Date.now());
  const previousTrunkAnglesRef = useRef<number[]>([]);

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      orientationRef.current = {
        alpha: event.alpha || 0,
        beta: event.beta || 90,
        gamma: event.gamma || 0,
      };
    };

    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission()
        .then((permissionState: string) => {
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        })
        .catch(console.error);
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        
        if (isMounted) setHasCamera(true);

        await tf.setBackend('webgl');
        await tf.ready();

        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
          runtime: 'tfjs',
          enableSmoothing: true,
          modelType: 'full'
        };
        detectorRef.current = await poseDetection.createDetector(model, detectorConfig as any);
        if (isMounted) setIsModelLoaded(true);
      } catch (err: any) {
        if (isMounted) {
          setHasCamera(false);
          setCameraError("Camera hardware not detected or permission denied.");
        }
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);

  const captureFrame = useCallback(() => {
    setFlash(true);
    if (navigator.vibrate) navigator.vibrate(200);
    setTimeout(() => {
      const imageSrc = webcamRef.current?.getScreenshot();
      if (imageSrc) {
        onCapture(imageSrc);
      }
    }, 100);
  }, [onCapture]);

  const detectPose = useCallback(async () => {
    if (!detectorRef.current || !webcamRef.current || !webcamRef.current.video || !canvasRef.current) {
      requestRef.current = requestAnimationFrame(detectPose);
      return;
    }

    const video = webcamRef.current.video;
    if (video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(detectPose);
      return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;

    const poses = await detectorRef.current.estimatePoses(video);
    
    const ctx = canvasRef.current.getContext('2d');
    let brightness = 0;
    if (ctx) {
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
      const data = imageData.data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 16) {
        sum += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      }
      brightness = sum / (data.length / 16);
    }

    const isIlluminanceGood = brightness > 40;
    setStep6Illuminance(isIlluminanceGood);

    const currentPitch = Math.abs(orientationRef.current.beta - 90);
    const currentRoll = Math.abs(orientationRef.current.gamma);
    const currentYaw = Math.abs(orientationRef.current.alpha % 360);

    const isPitchGood = currentPitch <= 5;
    const isRollGood = currentRoll <= 3;
    const isYawGood = currentYaw <= 7 || currentYaw >= 353;

    setStep3Pitch(isPitchGood);
    setStep4Roll(isRollGood);

    let isSagittalGood = false;
    let isLensHeightGood = false;
    let isDistanceGood = false;

    if (poses.length > 0) {
      const keypoints = poses[0].keypoints;
      
      const leftEar = keypoints.find(k => k.name === 'left_ear');
      const rightEar = keypoints.find(k => k.name === 'right_ear');
      const leftShoulder = keypoints.find(k => k.name === 'left_shoulder');
      const rightShoulder = keypoints.find(k => k.name === 'right_shoulder');
      const leftHip = keypoints.find(k => k.name === 'left_hip');
      const rightHip = keypoints.find(k => k.name === 'right_hip');
      const leftKnee = keypoints.find(k => k.name === 'left_knee');
      const rightKnee = keypoints.find(k => k.name === 'right_knee');

      const leftConf = (leftEar?.score||0) + (leftShoulder?.score||0) + (leftHip?.score||0);
      const rightConf = (rightEar?.score||0) + (rightShoulder?.score||0) + (rightHip?.score||0);
      const isLeft = leftConf > rightConf;

      const ear = isLeft ? leftEar : rightEar;
      const shoulder = isLeft ? leftShoulder : rightShoulder;
      const hip = isLeft ? leftHip : rightHip;
      const knee = isLeft ? leftKnee : rightKnee;

      if (ear && shoulder && hip && knee) {
        const centerX = videoWidth / 2;
        const marginX = videoWidth * 0.05;
        if (Math.abs(shoulder.x - centerX) <= marginX && Math.abs(hip.x - centerX) <= marginX && isYawGood) {
          isSagittalGood = true;
        }

        const topThirdY = videoHeight / 3;
        const marginY = videoHeight * 0.05;
        if (Math.abs(ear.y - topThirdY) <= marginY) {
          isLensHeightGood = true;
        }

        if ((ear.score||0) > 0.8 && (hip.score||0) > 0.8 && (knee.score||0) > 0.8) {
          const bodyHeight = Math.abs(hip.y - ear.y);
          if (bodyHeight > videoHeight * 0.2 && bodyHeight < videoHeight * 0.8) {
            isDistanceGood = true;
          }
        }
        
        // Calculate trunk angle for variance
        const dx = shoulder.x - hip.x;
        const dy = hip.y - shoulder.y; // Inverted Y
        let trunkAngle = Math.atan2(dx, dy) * (180 / Math.PI);
        if (!isLeft) trunkAngle = -trunkAngle;
        
        previousTrunkAnglesRef.current.push(trunkAngle);
        if (previousTrunkAnglesRef.current.length > 30) {
          previousTrunkAnglesRef.current.shift();
        }
      }
    }

    setStep1Sagittal(isSagittalGood);
    setStep2LensHeight(isLensHeightGood);
    setStep5Distance(isDistanceGood);

    let trunkVariance = 0;
    if (previousTrunkAnglesRef.current.length > 5) {
      const mean = previousTrunkAnglesRef.current.reduce((a, b) => a + b, 0) / previousTrunkAnglesRef.current.length;
      trunkVariance = previousTrunkAnglesRef.current.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / previousTrunkAnglesRef.current.length;
    }

    const allGreen = isSagittalGood && isLensHeightGood && isPitchGood && isRollGood && isDistanceGood && isIlluminanceGood;

    if (allGreen && trunkVariance < 2) {
      if (!stabilityStartTimeRef.current) {
        stabilityStartTimeRef.current = Date.now();
      } else {
        const elapsed = Date.now() - stabilityStartTimeRef.current;
        setStabilityProgress(Math.min(elapsed / 1500, 1));
        if (elapsed >= 1500) {
          captureFrame();
          return;
        }
      }
    } else {
      stabilityStartTimeRef.current = null;
      setStabilityProgress(0);
    }

    if (Date.now() - sessionStartTimeRef.current > 45000 && !allGreen) {
      setTimeoutError(true);
    }

    requestRef.current = requestAnimationFrame(detectPose);
  }, [captureFrame]);

  useEffect(() => {
    if (isModelLoaded && !timeoutError) {
      sessionStartTimeRef.current = Date.now();
      requestRef.current = requestAnimationFrame(detectPose);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isModelLoaded, detectPose, timeoutError]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        onBatchUpload(newSrcs);
      });
    }
  };

  if (hasCamera === false) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Camera Error</h1>
        <p className="text-zinc-400 mb-8">{cameraError || "Camera hardware not detected."}</p>
        <button onClick={onBack} className="bg-white text-black px-6 py-3 rounded-lg font-medium">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden">
      <header className="absolute top-0 left-0 right-0 z-50 flex flex-col items-center p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="w-full flex justify-between items-center mb-4">
          <button onClick={onBack} className="p-2 -ml-2 text-white/80 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="text-sm font-medium text-zinc-300">
            {isModelLoaded ? "AI Active" : "Initializing Engine..."}
          </div>
          <div className="w-10" />
        </div>
        <div className="text-center max-w-md">
          <p className="text-sm font-medium text-white/90 bg-black/40 px-4 py-2 rounded-full backdrop-blur-md border border-white/10">
            Position phone perpendicular to the worker's side (90°). Stand approx 2 meters away.
          </p>
        </div>
      </header>

      <main className="flex-1 relative flex items-center justify-center">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: 'environment' }}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Flash Overlay */}
        <div className={`absolute inset-0 bg-green-500 z-50 transition-opacity duration-200 ${flash ? 'opacity-50' : 'opacity-0 pointer-events-none'}`} />

        {/* Timeout Error */}
        {timeoutError && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 p-6 rounded-2xl max-w-sm text-center border border-zinc-800">
              <AlertTriangle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
              <h2 className="text-lg font-bold mb-2">Timeout</h2>
              <p className="text-zinc-400 mb-6">Unable to capture a perfectly stable frame.</p>
              <button 
                onClick={() => { 
                  setTimeoutError(false); 
                  sessionStartTimeRef.current = Date.now(); 
                  requestRef.current = requestAnimationFrame(detectPose); 
                }} 
                className="w-full bg-white text-black py-3 rounded-xl font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Overlays */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {/* Center Vertical Line (Sagittal) */}
          <div className={`absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 transition-colors ${step1Sagittal ? 'bg-green-500' : 'bg-gray-400/50'}`} />
          
          {/* Top Third Horizontal Line (Lens Height) */}
          <div className={`absolute top-1/3 left-0 right-0 h-0.5 -translate-y-1/2 transition-colors ${step2LensHeight ? 'bg-green-500' : 'bg-gray-400/50'}`} />
          
          {/* Frame Box (Distance & Framing) */}
          <div className={`absolute inset-12 border-2 rounded-3xl transition-colors ${step5Distance ? 'border-green-500' : 'border-gray-400/30'}`} />

          {/* Indicators Panel */}
          <div className="absolute top-32 left-4 flex flex-col gap-4 bg-black/40 p-3 rounded-2xl backdrop-blur-md border border-white/10">
            <div className={`flex items-center gap-3 transition-colors ${step3Pitch ? 'text-green-500' : 'text-gray-400'}`}>
              <Smartphone className="w-5 h-5" /> <span className="text-xs font-bold tracking-wider">PITCH</span>
            </div>
            <div className={`flex items-center gap-3 transition-colors ${step4Roll ? 'text-green-500' : 'text-gray-400'}`}>
              <Activity className="w-5 h-5" /> <span className="text-xs font-bold tracking-wider">ROLL</span>
            </div>
            <div className={`flex items-center gap-3 transition-colors ${step6Illuminance ? 'text-green-500' : 'text-gray-400'}`}>
              <Sun className="w-5 h-5" /> <span className="text-xs font-bold tracking-wider">LIGHT</span>
            </div>
          </div>

          {/* Stability Ring */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-400/20" />
              <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="6" fill="transparent" 
                strokeDasharray={351.8} 
                strokeDashoffset={351.8 - (351.8 * stabilityProgress)} 
                className="text-green-500 transition-all duration-75 ease-linear" 
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-4 h-4 rounded-full transition-colors ${stabilityProgress > 0 ? 'bg-green-500' : 'bg-gray-400/50'}`} />
            </div>
          </div>
        </div>
      </main>

      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-between z-30">
        <div className="w-12" />
        
        <button
          disabled
          className="w-20 h-20 rounded-full border-4 border-zinc-600 flex items-center justify-center opacity-50 cursor-not-allowed"
        >
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center">
            <Camera className="w-8 h-8 text-zinc-500" />
          </div>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors backdrop-blur-md"
        >
          <ImageIcon className="w-6 h-6 text-white" />
        </button>
        <input
          type="file"
          accept="image/jpeg, image/png, image/heic"
          multiple
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}
