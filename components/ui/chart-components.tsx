"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// From: https://github.com/recharts/recharts/blob/master/src/util/types.ts
type ContentType = React.ReactNode | ((props: any) => React.ReactNode)

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

type ChartContainerProps = React.ComponentProps<typeof ChartContainer> & ChartContextProps

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ config, className, children, ...props }, ref) => {
    const id = React.useId()
    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          className={cn("flex h-[350px] w-full flex-col items-center justify-center", className)}
          {...props}
        >
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  },
)
ChartContainer.displayName = "ChartContainer"

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartTooltipContent = React.forwardRef<HTMLDivElement, RechartsPrimitive.TooltipProps>(
  ({ active, payload, className, formatter, ...props }, ref) => {
    const { config } = useChart()

    if (active && payload && payload.length) {
      return (
        <div
          ref={ref}
          className={cn(
            "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-md dark:border-slate-800 dark:bg-slate-950",
            className,
          )}
          {...props}
        >
          {payload.map((item, index) => {
            const key = item.dataKey as keyof typeof config

            const name = config[key]?.label || item.name

            const value = formatter ? formatter(item.value, name, item, index) : item.value

            return (
              <div key={item.dataKey} className="flex items-center justify-between gap-4">
                {name && <span className="text-slate-500 dark:text-slate-400">{name}</span>}
                {value && <span className="font-mono font-medium text-slate-950 dark:text-slate-50">{value}</span>}
              </div>
            )
          })}
        </div>
      )
    }

    return null
  },
)
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<HTMLDivElement, RechartsPrimitive.LegendProps>(
  ({ className, ...props }, ref) => {
    const { config } = useChart()

    return (
      <div ref={ref} className={cn("flex flex-wrap items-center justify-center gap-4", className)} {...props}>
        {props.payload?.map((item) => {
          const key = item.dataKey as keyof typeof config
          return (
            <div key={item.value} className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: config[key]?.color,
                }}
              />
              {config[key]?.label}
            </div>
          )
        })}
      </div>
    )
  },
)
ChartLegendContent.displayName = "ChartLegendContent"

export type ChartConfig = {
  [k: string]: {
    label?: string
    color?: string
    icon?: React.ComponentType
    dataKey?: string
    tickFormatter?: (value: any) => string
  }
}

export { ChartContext, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, useChart }
