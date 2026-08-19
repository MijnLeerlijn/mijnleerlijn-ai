"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PopoverPositie {
  top: number;
  left: number;
}

/**
 * Traineromgeving V1, Ronde 2 vervolg (2026-08-19) — gedeeld anker-popover-
 * gedrag voor StatusPopover/DatumPopover, vervangt de grote modal
 * (training-bewerken-dialog.tsx) als primaire interactie: "ik klik op het
 * gegeven dat ik wil aanpassen en wijzig precies dat gegeven", geen apart
 * formulier meer openen.
 *
 * Gebouwd op de native HTML popover-API (popover="auto") — zelfde filosofie
 * als de vorige <dialog>-gebaseerde modal: gratis top-layer-rendering,
 * light-dismiss (klik buiten sluit vanzelf) en Escape-to-close in elke
 * evergreen browser, geen eigen click-outside-/keydown-luisteraars nodig.
 * React 19 kent de popover-DOM-API rechtstreeks (geen polyfill nodig).
 *
 * Positionering blijft BEWUST gewone JS (getBoundingClientRect() van de
 * trigger, geclampt binnen de viewport) i.p.v. CSS-anchor-positioning — die
 * laatste heeft nog geen brede, betrouwbare browserdekking; dit patroon
 * werkt overal waar de popover-API zelf werkt, ook op mobiel.
 */
export function usePopover<TTrigger extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const [positie, setPositie] = useState<PopoverPositie | null>(null);
  const triggerRef = useRef<TTrigger>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (!panel) return;

    if (open) {
      panel.showPopover();
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const marge = 8;
        let left = rect.left;
        let top = rect.bottom + marge;
        if (left + panelRect.width > window.innerWidth - marge) left = Math.max(marge, window.innerWidth - panelRect.width - marge);
        if (left < marge) left = marge;
        if (top + panelRect.height > window.innerHeight - marge) {
          // Geen ruimte onder de trigger — klap naar boven i.p.v. afgesneden te worden.
          top = Math.max(marge, rect.top - panelRect.height - marge);
        }
        setPositie({ top, left });
      }
    } else {
      panel.hidePopover();
    }
  }, [open]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // 'toggle' vuurt ook bij native light-dismiss (klik buiten, Escape) —
    // dit is de enige plek die React se eigen open-state synchroniseert met
    // dat native gedrag, geen dubbele bron van waarheid.
    function handleToggle(event: ToggleEvent) {
      if (event.newState === "closed") setOpen(false);
    }
    panel.addEventListener("toggle", handleToggle);
    return () => panel.removeEventListener("toggle", handleToggle);
  }, []);

  return { open, toggle, close, triggerRef, panelRef, positie };
}
