import React, { useEffect, useState } from 'react';
import HomeScreen from './pages/HomeScreen';
import LiveTranslationScreen from './pages/LiveTranslationScreen';
import { ApplicationStatus } from '@shared/index';
import './styles/App.css';

export default function App() {
  const [isTranslating, setIsTranslating] = useState(false);
  const [status, setStatus] = useState<ApplicationStatus>('idle');
  const [urduText, setUrduText] = useState('');
  const [englishText, setEnglishText] = useState('');
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electron
      ?.getAppStatus()
      .then(setStatus)
      .catch(() => setError('Failed to reach the main process.'));
  }, []);

  const handleStart = () => {
    setStatus('starting');
    setIsTranslating(true);
    setUrduText('Waiting for speech...');
    setEnglishText('Waiting for translation...');
  };

  const handleStop = () => {
    setIsTranslating(false);
    setStatus('idle');
    setUrduText('');
    setEnglishText('');
    setLatency(null);
  };

  if (isTranslating) {
    return (
      <LiveTranslationScreen
        urduText={urduText}
        englishText={englishText}
        status={status}
        latency={latency}
        onStop={handleStop}
      />
    );
  }

  return <HomeScreen onStart={handleStart} error={error} />;
}
