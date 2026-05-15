'use client';

import { useEffect, useState } from 'react';

const QUERY = '(max-width: 639px)';

/** Matches Tailwind `sm` breakpoint — updates on resize and hydration. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return isMobile;
}
