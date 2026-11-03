/** Dense native inputs for table cells, where Astryx fields' floating status boxes would overlap. */
export function cellInputClass(isInvalid: boolean, extra = ''): string {
  return [
    'rounded-md border bg-card px-2 py-1.5 text-sm text-primary',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
    'disabled:cursor-not-allowed disabled:opacity-60',
    isInvalid ? 'border-error' : 'border-border',
    extra,
  ].join(' ');
}

export const CHECKBOX_CLASS = 'h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed';
