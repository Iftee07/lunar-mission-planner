import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// shadcn-style wrapper around react-day-picker (MIT). Styled with Tailwind theme tokens only;
// react-day-picker's own stylesheet is not imported (no remote assets, no extra CSS).
// Day-level modifiers (selected, today, ...) land on the cell; the inner button is styled via [&>button].
function Calendar({ className, classNames, components, ...props }) {
  return (
    <DayPicker
      showOutsideDays={false}
      className={cn("p-1", className)}
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "flex w-full flex-col gap-3",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "disabled:opacity-30"),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "disabled:opacity-30"),
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "font-heading text-sm font-semibold",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-xs font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md font-mono tabular-nums outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
        selected: "[&>button]:ring-2 [&>button]:ring-foreground [&>button]:font-semibold",
        today: "[&>button]:underline [&>button]:underline-offset-4",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", c)} aria-hidden="true" />
          ) : (
            <ChevronRight className={cn("size-4", c)} aria-hidden="true" />
          ),
        ...components,
      }}
      {...props}
    />
  )
}

export { Calendar }
