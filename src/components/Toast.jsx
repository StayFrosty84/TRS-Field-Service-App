import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);

  const show = (text) => {
    setMsg(text);
    window.clearTimeout(show._t);
    show._t = window.setTimeout(() => setMsg(null), 2600);
  };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
