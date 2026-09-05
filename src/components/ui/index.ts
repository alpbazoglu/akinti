import dynamic from "next/dynamic";

export { Avatar, type AvatarProps, type AvatarSize } from "./Avatar";
export {
  Badge,
  CountBadge,
  type BadgeProps,
  type BadgeSize,
  type BadgeTone,
  type CountBadgeProps,
} from "./Badge";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button";
export { Chip, type ChipProps } from "./Chip";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export { Field, type FieldProps } from "./Field";
export {
  IconButton,
  type IconButtonProps,
  type IconButtonShape,
  type IconButtonSize,
  type IconButtonVariant,
} from "./IconButton";
export { Input, type InputProps } from "./Input";
export { Kbd, type KbdProps } from "./Kbd";
export { Menu, type MenuItem, type MenuProps, type MenuTriggerProps } from "./Menu";
export {
  RecordKey,
  type RecordKeyProps,
  type RecordKeySize,
  type RecordKeyState,
} from "./RecordKey";
export { Select, type SelectOption, type SelectProps } from "./Select";
/**
 * `vaul` (the sheet's drag/focus-trap engine) is a ~90KB dependency that,
 * imported statically here, lands in every route that imports anything else
 * from this barrel (`docs/qa/waveE-perf/ANALYSIS.md`) — including routes
 * that never render a Sheet, since Turbopack co-locates it with the rest of
 * this shared module graph. `next/dynamic` gives it its own chunk, fetched
 * only once a Sheet-rendering component actually mounts. `ssr: false` would
 * be preferable (every real Sheet is closed until a user gesture opens it,
 * so there is nothing to lose server-rendering it) but this barrel is also
 * reachable from Server Components, and Next 16 rejects `ssr: false` there;
 * the default `ssr: true` still gets the client-side code-split this is for.
 */
export const Sheet = dynamic(() => import("./Sheet").then((mod) => mod.Sheet));
export type { SheetProps } from "./Sheet";
export { Skeleton, type SkeletonProps, type SkeletonShape } from "./Skeleton";
export { Spinner, type SpinnerProps, type SpinnerSize } from "./Spinner";
export { Switch, type SwitchProps } from "./Switch";
export {
  TabPanel,
  Tabs,
  tabId,
  tabPanelId,
  type TabItem,
  type TabPanelProps,
  type TabsProps,
} from "./Tabs";
export { Textarea, type TextareaProps } from "./Textarea";
export {
  ToastProvider,
  useToast,
  type Toast,
  type ToastApi,
  type ToastOptions,
  type ToastProviderProps,
  type ToastTone,
} from "./Toast";
export { VisuallyHidden, type VisuallyHiddenProps } from "./VisuallyHidden";
export { ICON_SIZE, type IconComponent, type IconSize } from "./icons";
