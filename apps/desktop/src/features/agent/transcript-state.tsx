import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";

const TranscriptStateContext = createContext<Map<string, unknown> | null>(null);

export function TranscriptStateProvider({ children }: { children: ReactNode }) {
  const [values] = useState(() => new Map<string, unknown>());
  return (
    <TranscriptStateContext value={values}>{children}</TranscriptStateContext>
  );
}

export function useTranscriptState<T>(key: string, initialValue: T) {
  const values = useContext(TranscriptStateContext);
  const [value, setValue] = useState<T>(() =>
    values?.has(key) ? (values.get(key) as T) : initialValue,
  );
  const update = useCallback(
    (next: T) => {
      values?.set(key, next);
      setValue(next);
    },
    [key, values],
  );
  return [value, update] as const;
}
