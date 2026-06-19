import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';

// A finger-signature canvas. Parent calls ref.getBlob() / ref.isEmpty() / ref.fromDataURL().
const SignaturePadField = forwardRef(function SignaturePadField(_props, ref) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const pad = new SignaturePad(canvas, { penColor: '#0b1220', backgroundColor: '#ffffff' });
    padRef.current = pad;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      pad.clear();
      if (data.length) pad.fromData(data);
      setEmpty(pad.isEmpty());
    };
    resize();
    window.addEventListener('resize', resize);

    const onEnd = () => setEmpty(pad.isEmpty());
    pad.addEventListener('endStroke', onEnd);

    return () => {
      window.removeEventListener('resize', resize);
      pad.removeEventListener('endStroke', onEnd);
      pad.off();
    };
  }, []);

  const clearPad = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: clearPad,
    fromDataURL: (url) =>
      new Promise((resolve) => {
        padRef.current?.fromDataURL(url, { ratio: 1 }).then(() => {
          setEmpty(false);
          resolve();
        });
      }),
    getBlob: () =>
      new Promise((resolve) => {
        if (!padRef.current || padRef.current.isEmpty()) return resolve(null);
        canvasRef.current.toBlob((b) => resolve(b), 'image/png');
      }),
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 180,
          background: '#fff',
          borderRadius: 12,
          border: '1px solid var(--border)',
          touchAction: 'none',
        }}
      />
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {empty ? 'Have the customer sign above' : 'Signed ✓'}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={clearPad}>
          Clear
        </button>
      </div>
    </div>
  );
});

export default SignaturePadField;
