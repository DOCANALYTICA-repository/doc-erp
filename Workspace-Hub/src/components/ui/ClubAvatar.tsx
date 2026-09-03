import { useState } from 'react';

/**
 * A club's mark, with initials as the DEFAULT state rather than an error state.
 *
 * `logo` is legitimately nullable — most clubs simply do not have one — so a
 * bare <img src={club.logo}> rendered a broken-image icon as the normal case
 * on the most prominent element of the page. It sits above the tab switch, so
 * it was visible on every single tab.
 */
export function ClubAvatar({
  name,
  logo,
  size = 64,
}: {
  name: string;
  logo?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const box = {
    width: size,
    height: size,
    borderRadius: size / 4,
  } as const;

  if (!logo || failed) {
    return (
      <div
        style={box}
        role="img"
        aria-label={`${name} logo`}
        className="shrink-0 grid place-items-center border border-slate-200 bg-sky-50 text-sky-700 font-semibold select-none"
      >
        <span style={{ fontSize: size * 0.34 }}>{initials || '?'}</span>
      </div>
    );
  }

  return (
    <div style={box} className="shrink-0 overflow-hidden border border-slate-200">
      <img
        src={logo}
        alt={`${name} logo`}
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
