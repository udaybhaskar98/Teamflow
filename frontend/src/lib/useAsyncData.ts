import { useEffect, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useAsyncData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    load()
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((cause: unknown) => {
        if (active) {
          setState({
            data: null,
            loading: false,
            error: cause instanceof Error ? cause.message : "Something went wrong"
          });
        }
      });
    return () => {
      active = false;
    };
    // The caller supplies the values that should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return {
    ...state,
    reload: () => setVersion((value) => value + 1)
  };
}
