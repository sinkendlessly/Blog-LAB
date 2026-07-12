import * as React from "react";

/** Slot 组件：用于 Button asChild 时将 props 透传给子元素。 */
const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(
  ({ children, ...props }, ref) => {
    if (!React.isValidElement(children)) return null;
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      ...props,
      ref,
    });
  }
);
Slot.displayName = "Slot";

export { Slot };
