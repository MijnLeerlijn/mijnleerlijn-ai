"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function isToegestaan<T extends string>(waarde: string | null, toegestaan: readonly T[]): waarde is T {
  return waarde !== null && toegestaan.some((item) => item === waarde);
}

/**
 * Queryparameter wint. Zonder parameter geldt localStorage, anders de standaard.
 * `bekend` blijft false tot de opgeslagen keuze is gelezen, zodat een reload
 * niet eerst het standaarddashboard toont.
 */
export function useQueryKeuze<T extends string>(opties: {
  param: string;
  opslagSleutel: string;
  toegestaan: readonly T[];
  standaard: T;
  /** Alleen het dashboard zelf schrijft de opgeslagen keuze meteen in de URL. */
  schrijfUrlBijHerstel?: boolean;
}): { waarde: T; bekend: boolean; kies: (volgende: T) => void } {
  const { param, opslagSleutel, toegestaan, standaard, schrijfUrlBijHerstel = false } = opties;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = searchParams.get(param);
  const uitQuery = isToegestaan(query, toegestaan) ? query : null;
  const [opgeslagen, setOpgeslagen] = useState<T | null>(null);
  const [bekend, setBekend] = useState(uitQuery !== null);

  useEffect(() => {
    const uitOpslag = localStorage.getItem(opslagSleutel);
    const geldig = isToegestaan(uitOpslag, toegestaan) ? uitOpslag : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpgeslagen(geldig);
    setBekend(true);
    if (uitQuery) {
      localStorage.setItem(opslagSleutel, uitQuery);
      return;
    }
    if (!schrijfUrlBijHerstel || !geldig || geldig === standaard) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, geldig);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [uitQuery, param, opslagSleutel, standaard, schrijfUrlBijHerstel, toegestaan, pathname, router, searchParams]);

  function kies(volgende: T) {
    localStorage.setItem(opslagSleutel, volgende);
    setOpgeslagen(volgende);
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, volgende);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return { waarde: uitQuery ?? opgeslagen ?? standaard, bekend, kies };
}
