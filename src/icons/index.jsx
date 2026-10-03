import { BellIcon } from "./vendor/bell";
import { XIcon } from "./vendor/x";
import { ArrowUpIcon } from "./vendor/arrow-up";
import { LockIcon } from "./vendor/lock";
import { ArrowRightIcon } from "./vendor/arrow-right";
import { ChevronDownIcon } from "./vendor/chevron-down";
import { ChevronRightIcon } from "./vendor/chevron-right";
import { ChevronLeftIcon } from "./vendor/chevron-left";
import { Link2Icon } from "./vendor/link-2";
import { ActivityIcon } from "./vendor/activity";
import { GitCommitHorizontalIcon } from "./vendor/git-commit-horizontal";
import { TicketIcon } from "./vendor/ticket";
import { FileTextIcon } from "./vendor/file-text";
import { GitPullRequestIcon } from "./vendor/git-pull-request";
import { RefreshCWIcon } from "./vendor/refresh-cw";
import { GithubIcon } from "./vendor/github";
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

import { CalendarDaysIcon } from "./vendor/calendar-days";
import { PlugZapIcon } from "./vendor/plug-zap";
import { PanelLeftCloseIcon } from "./vendor/panel-left-close";
import { PanelLeftOpenIcon } from "./vendor/panel-left-open";

// The entire control triggers the original 21st.dev animation, including keyboard focus.
// Animations run only while interacting; no ambient loops or extra focusable elements.
function interactiveIcon(Component) {
  function AnimatedIcon({ size = 16, className = "", ...props }) {
    const element = useRef(null);
    const animation = useRef(null);
    const reduced = useReducedMotion();
    useEffect(() => {
      const control = element.current?.closest(
        "button, a, label, [role=option], [data-kanban-card], .card",
      );
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

export const Planning = interactiveIcon(CalendarDaysIcon);
export const Integration = interactiveIcon(PlugZapIcon);
export const PanelClose = interactiveIcon(PanelLeftCloseIcon);
export const PanelOpen = interactiveIcon(PanelLeftOpenIcon);
export const Github = interactiveIcon(GithubIcon);
export const RefreshCw = interactiveIcon(RefreshCWIcon);
export const GitPullRequest = interactiveIcon(GitPullRequestIcon);
export const FileText = interactiveIcon(FileTextIcon);
export const Ticket = interactiveIcon(TicketIcon);
export const Commit = interactiveIcon(GitCommitHorizontalIcon);
export const Activity = interactiveIcon(ActivityIcon);
export const Link2 = interactiveIcon(Link2Icon);
export const ChevronLeft = interactiveIcon(ChevronLeftIcon);
export const ChevronRight = interactiveIcon(ChevronRightIcon);
export const ChevronDown = interactiveIcon(ChevronDownIcon);
export const ArrowRight = interactiveIcon(ArrowRightIcon);
export const Lock = interactiveIcon(LockIcon);
export const ArrowUp = interactiveIcon(ArrowUpIcon);

export const Close = interactiveIcon(XIcon);

export const Bell = interactiveIcon(BellIcon);
