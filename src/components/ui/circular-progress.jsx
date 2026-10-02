import React, { createContext, useContext, useId } from "react";
import { cn } from "../../lib/utils";
const ProgressContext = createContext(null);
function useProgress() {
  const context = useContext(ProgressContext);
  if (!context)
    throw Error("CircularProgressIndicator doit être dans CircularProgress.");
  return context;
}
export function CircularProgress({
  value = null,
  min = 0,
  max = 100,
  size = 48,
  thickness = 4,
  label,
  getValueText,
  className,
  children,
  ...props
}) {
  max = Number.isFinite(max) && max > min ? max : min + 100;
  value = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : null;
  const percentage = value === null ? null : (value - min) / (max - min),
    radius = Math.max(0, (size - thickness) / 2),
    id = useId();
  const valueText =
    value === null
      ? undefined
      : getValueText?.(value, min, max) || `${Math.round(percentage * 100)}%`;
  const context = {
    value,
    size,
    thickness,
    radius,
    center: size / 2,
    circumference: 2 * Math.PI * radius,
    percentage,
    state:
      value === null ? "indeterminate" : value === max ? "complete" : "loading",
    valueText,
    id,
  };
  return (
    <ProgressContext.Provider value={context}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={valueText}
        data-state={context.state}
        className={cn("circular-progress", className)}
        {...props}
      >
        {children}
      </div>
    </ProgressContext.Provider>
  );
}
export function CircularProgressIndicator({ className, ...props }) {
  const c = useProgress();
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${c.size} ${c.size}`}
      width={c.size}
      height={c.size}
      className={cn("circular-progress-indicator", className)}
      data-state={c.state}
      {...props}
    />
  );
}
export function CircularProgressTrack(props) {
  const c = useProgress();
  return (
    <circle
      cx={c.center}
      cy={c.center}
      r={c.radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={c.thickness}
      className="circular-progress-track"
      {...props}
    />
  );
}
export function CircularProgressRange(props) {
  const c = useProgress();
  return (
    <circle
      cx={c.center}
      cy={c.center}
      r={c.radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={c.thickness}
      strokeLinecap="round"
      strokeDasharray={c.circumference}
      strokeDashoffset={
        c.circumference * (c.percentage === null ? 0.75 : 1 - c.percentage)
      }
      data-state={c.state}
      className="circular-progress-range"
      {...props}
    />
  );
}
export function CircularProgressValueText({ children, ...props }) {
  const c = useProgress();
  return (
    <span className="circular-progress-value" id={c.id} {...props}>
      {children ?? c.valueText}
    </span>
  );
}
export function CircularProgressCombined(props) {
  return (
    <CircularProgress {...props}>
      <CircularProgressIndicator>
        <CircularProgressTrack />
        <CircularProgressRange />
      </CircularProgressIndicator>
      <CircularProgressValueText />
    </CircularProgress>
  );
}
export default CircularProgress;
