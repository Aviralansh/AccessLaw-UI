"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  type BarProps,
  CartesianGrid,
  type CartesianGridProps,
  Line,
  LineChart,
  type LineProps,
  Pie,
  PieChart,
  type PieProps,
  XAxis,
  type XAxisProps,
  YAxis,
  type YAxisProps,
} from "recharts"

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  type ChartLegendProps,
  ChartTooltip,
  type ChartTooltipProps,
} from "@/components/ui/chart-components"
import { cn } from "@/lib/utils"

// Components
const Chart = ChartContainer

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipProps["content"]>(
  ({ hideLabel, hideIndicator, className, ...props }, ref) => {
    return (
      <ChartTooltip
        ref={ref}
        hideLabel={hideLabel}
        hideIndicator={hideIndicator}
        className={cn("grid grid-cols-1", className)}
        {...props}
      />
    )
  },
)
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendProps["content"]>(
  ({ className, ...props }, ref) => {
    return (
      <ChartLegend
        ref={ref}
        className={cn(
          "flex flex-wrap justify-center gap-2",
          "[&>div]:flex [&>div]:items-center [&>div]:gap-1.5",
          "[&>div>span]:h-3 [&>div>span]:w-3 [&>div>span]:rounded-full",
          "[&>div>p]:text-xs",
          className,
        )}
        {...props}
      />
    )
  },
)
ChartLegendContent.displayName = "ChartLegendContent"

// Chart Components
const ChartCrosshair = React.forwardRef<SVGSVGElement, CartesianGridProps["vertical"]>(
  ({ className, vertical, horizontal, ...props }, ref) => {
    return (
      <CartesianGrid
        ref={ref}
        className={cn("stroke-border stroke-1", className)}
        vertical={vertical}
        horizontal={horizontal}
        {...props}
      />
    )
  },
)
ChartCrosshair.displayName = "ChartCrosshair"

const ChartAxis = React.forwardRef<SVGSVGElement, XAxisProps | YAxisProps>(({ className, ...props }, ref) => {
  return (
    <XAxis
      ref={ref}
      className={cn(
        "fill-muted-foreground text-xs",
        "[&_.recharts-cartesian-axis-tick_line]:stroke-border",
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
        className,
      )}
      {...props}
    />
  )
})
ChartAxis.displayName = "ChartAxis"

const ChartBar = React.forwardRef<SVGSVGElement, BarProps>(
  ({ className, fill = "hsl(var(--chart-1))", ...props }, ref) => {
    return <Bar ref={ref} className={cn("stroke-primary", className)} fill={fill} {...props} />
  },
)
ChartBar.displayName = "ChartBar"

const ChartLine = React.forwardRef<SVGSVGElement, LineProps>(({ className, dataKey, activeDot, ...props }, ref) => {
  const { color } = Chart.useChart()

  return (
    <Line
      ref={ref}
      className={cn("stroke-primary", className)}
      dataKey={dataKey}
      activeDot={{
        r: 6,
        fill: "hsl(var(--background))",
        stroke: `hsl(var(--chart-${color}))`,
        strokeWidth: 2,
        className: "drop-shadow-xl",
        ...activeDot,
      }}
      {...props}
    />
  )
})
ChartLine.displayName = "ChartLine"

const ChartPie = React.forwardRef<SVGSVGElement, PieProps>(({ className, ...props }, ref) => {
  return <Pie ref={ref} className={cn("stroke-primary", className)} {...props} />
})
ChartPie.displayName = "ChartPie"

export {
  Chart,
  ChartTooltipContent,
  ChartLegendContent,
  ChartCrosshair,
  ChartAxis,
  ChartBar,
  ChartLine,
  ChartPie,
  BarChart,
  LineChart,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
}
export type { ChartConfig }
