import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { AppError, errorMessage } from '@/data/errors';

/* ------------------------------- modal -------------------------------- */

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  labelledBy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    }
    return () => {
      if (dlg.open && typeof dlg.close === 'function') dlg.close();
    };
  }, []);
  const id = labelledBy ?? 'modal-title';
  return (
    <dialog
      ref={ref}
      className={`a-modal ${wide ? 'a-modal--wide' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="a-modal__panel">
        <h2 id={id} className="a-modal__title">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

/* ------------------------------- confirm ------------------------------ */

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise((resolve) => setPending({ ...opts, resolve })), []);
  const answer = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => answer(false)} labelledBy="confirm-title">
          <div className="a-modal__body">{pending.message}</div>
          <div className="a-modal__actions">
            <button type="button" className="a-btn" onClick={() => answer(false)} autoFocus>
              {pending.cancelLabel ?? 'Cancel'}
            </button>
            <button type="button" className={`a-btn ${pending.danger ? 'a-btn--danger' : 'a-btn--primary'}`} onClick={() => answer(true)}>
              {pending.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return c;
}

/* ------------------------------- toasts ------------------------------- */

interface Toast {
  id: number;
  kind: 'success' | 'error';
  text: string;
}
interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 3500);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t) }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="a-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`a-toast a-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const t = useContext(ToastContext);
  if (!t) throw new Error('useToast must be used inside <ToastProvider>');
  return t;
}

/* -------------------------------- draft ------------------------------- */

/** Editable copy of saved data with dirty tracking. `commit` is called only after the database confirmed a save. */
export function useDraft<T>(source: T) {
  const [saved, setSaved] = useState<T>(source);
  const [value, setValue] = useState<T>(source);
  const dirty = useMemo(() => JSON.stringify(value) !== JSON.stringify(saved), [value, saved]);
  const update = useCallback((patch: Partial<T>) => setValue((v) => ({ ...v, ...patch })), []);
  const commit = useCallback((next: T) => {
    setSaved(next);
    setValue(next);
  }, []);
  const discard = useCallback(() => setValue(saved), [saved]);
  return { value, setValue, update, dirty, commit, discard, saved };
}

/* -------------------------------- saver ------------------------------- */

export interface SaverState {
  saving: boolean;
  error: AppError | null;
  fields: Record<string, string>;
  savedAt: number | null;
}

/** Runs a save and reports success ONLY after the promise (i.e. the database) confirms. */
export function useSaver() {
  const toast = useToast();
  const [state, setState] = useState<SaverState>({ saving: false, error: null, fields: {}, savedAt: null });
  const busy = useRef(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>, success = 'Saved'): Promise<boolean> => {
      if (busy.current) return false; // ignore double submits
      busy.current = true;
      setState((s) => ({ ...s, saving: true, error: null, fields: {} }));
      try {
        await fn();
        setState({ saving: false, error: null, fields: {}, savedAt: Date.now() });
        toast.success(success);
        return true;
      } catch (e) {
        const err = e instanceof AppError ? e : new AppError('unknown', errorMessage(e));
        setState((s) => ({ ...s, saving: false, error: err, fields: err.fields }));
        toast.error(err.message);
        return false;
      } finally {
        busy.current = false;
      }
    },
    [toast],
  );

  const clearError = useCallback(() => setState((s) => ({ ...s, error: null, fields: {} })), []);
  return { ...state, run, clearError };
}

/* ---------------------------- field errors ---------------------------- */

const FieldErrorsContext = createContext<Record<string, string>>({});
export const FieldErrorsProvider = FieldErrorsContext.Provider;
export const useFieldErrors = () => useContext(FieldErrorsContext);

/* ------------------------- unsaved-change guard ----------------------- */

/** Warns before the tab closes and before in-app navigation while `dirty`. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const blockedRef = useRef(blocker);
  blockedRef.current = blocker;

  return blocker.state === 'blocked' ? (
    <Modal title="Leave without saving?" onClose={() => blockedRef.current.reset?.()} labelledBy="unsaved-title">
      <p className="a-modal__body">You have unsaved changes on this page. If you leave now they will be lost.</p>
      <div className="a-modal__actions">
        <button type="button" className="a-btn" onClick={() => blockedRef.current.reset?.()} autoFocus>
          Stay and keep editing
        </button>
        <button type="button" className="a-btn a-btn--danger" onClick={() => blockedRef.current.proceed?.()}>
          Discard changes
        </button>
      </div>
    </Modal>
  ) : null;
}
