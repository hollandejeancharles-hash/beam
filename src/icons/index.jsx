import React, { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { SearchIcon } from "./vendor/search";
import { LayoutGridIcon } from "./vendor/layout-grid";
import { MessageSquareIcon } from "./vendor/message-square";
import { PlusIcon } from "./vendor/plus";
import { CopyIcon } from "./vendor/copy";
import { SlidersHorizontalIcon } from "./vendor/sliders-horizontal";
import { RadioIcon } from "./vendor/radio";
import { EarthIcon } from "./vendor/earth";
import { BlocksIcon } from "./vendor/blocks";
import { CheckCheckIcon } from "./vendor/check-check";
import { ArrowUpRightIcon } from "./vendor/arrow-up-right";
import { ExternalLinkIcon } from "./vendor/external-link";

// The entire control triggers the original 21st.dev animation, including keyboard focus.
// One finite animation per interaction; no ambient loops or extra focusable elements.
function interactiveIcon(Component) {
  function AnimatedIcon({ size = 16, className = "", ...props }) {
    const element = useRef(null);
    const animation = useRef(null);
    const reduced = useReducedMotion();
    useEffect(() => {
      const control = element.current?.closest("button, a, label, .card");
      if (!control || reduced) return;
      let focused = false;
      let hovered = false;
      const start = () => {
        if (
          control.disabled ||
          control.getAttribute("aria-disabled") === "true"
        )
          return;
        animation.current?.startAnimation();
      };
      const enter = () => {
        hovered = true;
        start();
      };
      const leave = () => {
        hovered = false;
        if (!focused) animation.current?.stopAnimation();
      };
      const focus = () => {
        focused = true;
        start();
      };
      const blur = (event) => {
        if (control.contains(event.relatedTarget)) return;
        focused = false;
        if (!hovered) animation.current?.stopAnimation();
      };
      control.addEventListener("pointerenter", enter);
      control.addEventListener("pointerleave", leave);
      control.addEventListener("focusin", focus);
      control.addEventListener("focusout", blur);
      control.addEventListener("click", start);
      return () => {
        control.removeEventListener("pointerenter", enter);
        control.removeEventListener("pointerleave", leave);
        control.removeEventListener("focusin", focus);
        control.removeEventListener("focusout", blur);
        control.removeEventListener("click", start);
        animation.current?.stopAnimation();
      };
    }, [reduced]);
    return (
      <span
        ref={element}
        className={"animated-icon " + className}
        aria-hidden="true"
        {...props}
      >
        <Component ref={animation} size={size} />
      </span>
    );
  }
  AnimatedIcon.displayName = `Animated${Component.displayName || "Icon"}`;
  return AnimatedIcon;
}
export const Search = interactiveIcon(SearchIcon);
export const LayoutGrid = interactiveIcon(LayoutGridIcon);
export const MessageSquare = interactiveIcon(MessageSquareIcon);
export const Plus = interactiveIcon(PlusIcon);
export const Copy = interactiveIcon(CopyIcon);
export const SlidersHorizontal = interactiveIcon(SlidersHorizontalIcon);
export const Radio = interactiveIcon(RadioIcon);
export const Globe = interactiveIcon(EarthIcon);
export const Map = interactiveIcon(BlocksIcon);
export const CheckCheck = interactiveIcon(CheckCheckIcon);
export const ArrowUpRight = interactiveIcon(ArrowUpRightIcon);
export const ExternalLink = interactiveIcon(ExternalLinkIcon);
