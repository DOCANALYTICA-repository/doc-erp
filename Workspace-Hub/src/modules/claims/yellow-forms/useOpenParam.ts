import { useSearchParams } from 'react-router-dom';

/**
 * The yellow form showing in the drawer, as `?open=<id>`. Kept in the URL so
 * inbox, pipeline and notification links land with the form already open.
 */
export function useOpenParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');

  const update = (id: string | null) =>
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        if (id) next.set('open', id);
        else next.delete('open');
        return next;
      },
      { replace: true },
    );

  return {
    openId,
    open: (id: string) => update(id),
    close: () => update(null),
  };
}
