import { cva, type VariantProps } from "class-variance-authority";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function NavigationMenu({
  className,
  viewport = false,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean;
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn("relative flex max-w-max flex-1 items-center justify-center", className)}
      {...props}
    />
  );
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn("group flex flex-1 list-none items-center justify-center gap-1", className)}
      {...props}
    />
  );
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

const navigationMenuLinkVariants = cva(
  "group inline-flex h-9 w-max cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed data-[active=true]:bg-accent data-[active=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "text-muted-foreground",
        subtle: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function NavigationMenuLink({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link> &
  VariantProps<typeof navigationMenuLinkVariants>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(navigationMenuLinkVariants({ variant }), className)}
      {...props}
    />
  );
}

export {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuLinkVariants,
};
