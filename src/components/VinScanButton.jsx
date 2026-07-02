import { useEffect, useRef, useState } from 'react';
import { normalizeVin } from '../lib/assets.js';
import Icon from './Icon.jsx';

// Camera VIN scan via the BarcodeDetector API (door-jamb Code 39 barcodes).
// Renders nothing where the API is unavailable (e.g. iOS Safari) — the VIN
// input stays manual everywhere.
export default function VinScanButton({ onScan }) {
  const [open, setOpen] = useState(false);
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(true)}>
        <Icon name="camera" size={16} /> Scan
      </button>
      {open && (
        <ScanOverlay
          onScan={(raw) => {
            onScan(normalizeVin(raw));
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ScanOverlay({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream;
    let raf;
    let cancelled = false;
    const detector = new window.BarcodeDetector({ formats: ['code_39'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            if (raw) return onScan(raw);
          } catch {
            /* keep scanning */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Camera unavailable — enter the VIN manually.');
      }
    })();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
      role="dialog"
      aria-label="Scan VIN barcode"
    >
      <video ref={videoRef} playsInline muted style={{ flex: 1, width: '100%', objectFit: 'cover' }} />
      <div style={{ padding: 16, textAlign: 'center' }}>
        <p style={{ color: '#fff', margin: '0 0 12px' }}>
          {error || 'Point the camera at the door-jamb VIN barcode'}
        </p>
        <button type="button" className="btn btn--ghost" style={{ color: '#fff' }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
